import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import {
  users,
  investorProfiles,
  documents,
  sessions,
  holdings,
  secondaryListings,
  transactions,
  deposits,
  withdrawals,
} from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const account = new Hono<AuthedEnv>();
account.use("*", requireAuth, requireRole("retail"));

account.get("/profile", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const [userRow] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const [profileRow] = await db
    .select()
    .from(investorProfiles)
    .where(eq(investorProfiles.userId, user.id))
    .limit(1);
  return c.json({
    displayName: userRow.displayName,
    email: userRow.email,
    ...profileRow,
  });
});

const updateSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  jobType: z.string().optional(),
  incomeRange: z.string().optional(),
  netWorth: z.string().optional(),
  sourceOfFunds: z.string().optional(),
  objective: z.string().optional(),
  riskAppetite: z.string().optional(),
  contactNumber: z.string().max(30).optional(),
  identificationType: z.enum(["NRIC", "Passport"]).optional(),
  identificationNumber: z.string().max(40).optional(),
  jobTitle: z.string().max(120).optional(),
  companyName: z.string().max(120).optional(),
  natureOfBusiness: z.string().max(120).optional(),
  bankName: z.string().max(120).optional(),
  bankAccountHolder: z.string().max(120).optional(),
  bankAccountNumber: z.string().max(40).optional(),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  postcode: z.string().max(20).optional(),
  declarationAccepted: z.boolean().optional(),
});

account.put("/profile", async (c) => {
  const user = c.get("user");
  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);

  const db = drizzle(c.env.DB);
  const { displayName, ...profileFields } = parsed.data;
  if (displayName) {
    await db.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, user.id));
  }
  if (Object.keys(profileFields).length > 0) {
    await db
      .update(investorProfiles)
      .set({ ...profileFields, profileUpdatedAt: new Date() })
      .where(eq(investorProfiles.userId, user.id));
  }
  return c.json({ ok: true });
});

account.get("/documents", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const rows = await db.select().from(documents).where(eq(documents.ownerId, user.id));
  return c.json({ documents: rows });
});

// Multipart: docType (form field), file (file, metadata only - no R2 yet)
const uploadDocTypes = ["IC/Passport (front)", "IC/Passport (back)", "Bank Statement"] as const;

account.post("/documents", async (c) => {
  const user = c.get("user");
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "invalid_input" }, 400);
  const docType = form.get("docType");
  const fileField = form.get("file");
  if (typeof docType !== "string" || !uploadDocTypes.includes(docType as (typeof uploadDocTypes)[number])) {
    return c.json({ error: "invalid_input" }, 400);
  }
  if (!fileField || typeof fileField === "string") return c.json({ error: "file_required" }, 400);
  const file = fileField as File;

  const db = drizzle(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(documents).values({
    id,
    ownerId: user.id,
    docType,
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    status: "Pending",
  });
  return c.json({ ok: true, documentId: id });
});

account.delete("/", async (c) => {
  const user = c.get("user");
  if (user.isDemoReviewer) return c.json({ error: "forbidden", message: "Demo accounts cannot be deleted." }, 403);

  const db = drizzle(c.env.DB);
  await db.delete(secondaryListings).where(eq(secondaryListings.sellerId, user.id));
  await db.delete(holdings).where(eq(holdings.investorId, user.id));
  await db.delete(transactions).where(eq(transactions.accountId, user.id));
  await db.delete(deposits).where(eq(deposits.investorId, user.id));
  await db.delete(withdrawals).where(eq(withdrawals.investorId, user.id));
  await db.delete(documents).where(eq(documents.ownerId, user.id));
  await db.delete(investorProfiles).where(eq(investorProfiles.userId, user.id));
  await db.delete(sessions).where(eq(sessions.userId, user.id));
  await db.delete(users).where(eq(users.id, user.id));

  c.header("Set-Cookie", "session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  return c.json({ ok: true });
});

export default account;
