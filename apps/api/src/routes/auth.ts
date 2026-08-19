import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { users, investorProfiles, approvals, auditLog, roles, type Role } from "../db/schema";
import { hashPassword, verifyPassword } from "../auth/password";
import {
  createSession,
  destroySession,
  setActiveRole,
  sessionCookieHeader,
  clearSessionCookieHeader,
  readSessionCookie,
  resolveSession,
} from "../auth/session";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";

const auth = new Hono<AuthedEnv>();

// Admin is seed-only - never a public signup option (confirmed product decision).
const signupRoles = ["retail", "corporate", "issuer"] as const;

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(120),
  role: z.enum(signupRoles),
});

auth.post("/signup", async (c) => {
  const parsed = signupSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const { email, password, displayName, role } = parsed.data;

  // Phase 1 scope: only retail has a real dashboard behind it today.
  if (role !== "retail") {
    return c.json({ error: "role_not_available", message: `${role} signup lands in a later phase` }, 400);
  }

  const db = drizzle(c.env.DB);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return c.json({ error: "email_taken" }, 409);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await db.insert(users).values({ id, email, passwordHash, role, displayName });
  await db.insert(investorProfiles).values({ userId: id, kycStatus: "Pending" });
  await db.insert(approvals).values({
    id: crypto.randomUUID(),
    type: "Investor KYC",
    subjectType: "user",
    subjectId: id,
    applicantName: displayName,
    riskLevel: "Standard",
  });

  const token = await createSession(c.env.DB, id);
  c.header("Set-Cookie", sessionCookieHeader(token));
  const user = await resolveSession(c.env.DB, token);
  return c.json({ ok: true, user }, 201);
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

auth.post("/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const { email, password } = parsed.data;

  const db = drizzle(c.env.DB);
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const token = await createSession(c.env.DB, user.id);
  c.header("Set-Cookie", sessionCookieHeader(token));
  const authedUser = await resolveSession(c.env.DB, token);
  return c.json({ ok: true, user: authedUser });
});

auth.post("/logout", async (c) => {
  const token = readSessionCookie(c.req.header("cookie"));
  if (token) await destroySession(c.env.DB, token);
  c.header("Set-Cookie", clearSessionCookieHeader());
  return c.json({ ok: true });
});

auth.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ user });
});

const switchRoleSchema = z.object({ role: z.enum(roles) });

auth.post("/switch-role", requireAuth, async (c) => {
  const user = c.get("user");
  if (!user.isDemoReviewer) return c.json({ error: "forbidden" }, 403);
  const parsed = switchRoleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);

  const token = readSessionCookie(c.req.header("cookie"))!;
  await setActiveRole(c.env.DB, token, parsed.data.role as Role);
  await drizzle(c.env.DB)
    .insert(auditLog)
    .values({
      id: crypto.randomUUID(),
      actorId: user.id,
      action: "switch_role",
      subjectType: "session",
      subjectId: user.id,
      metadataJson: JSON.stringify({ from: user.effectiveRole, to: parsed.data.role }),
    });

  const refreshed = await resolveSession(c.env.DB, token);
  return c.json({ ok: true, user: refreshed });
});

export default auth;
