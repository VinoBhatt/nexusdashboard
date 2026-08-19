import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { sessions, users, type Role } from "../db/schema";

const SESSION_COOKIE = "session";
const SESSION_DAYS = 7;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes.buffer as ArrayBuffer);
}

export interface AuthedUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isDemoReviewer: boolean;
  effectiveRole: Role; // activeRole override if a demo reviewer switched roles
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const orm = drizzle(db);
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await orm.insert(sessions).values({ id: tokenHash, userId, expiresAt });
  return token;
}

export async function resolveSession(db: D1Database, token: string): Promise<AuthedUser | null> {
  const orm = drizzle(db);
  const tokenHash = await sha256Hex(token);
  const rows = await orm
    .select({
      sessionExpiresAt: sessions.expiresAt,
      activeRole: sessions.activeRole,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      isDemoReviewer: users.isDemoReviewer,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.sessionExpiresAt.getTime() < Date.now()) return null;
  return {
    id: row.userId,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    isDemoReviewer: row.isDemoReviewer,
    effectiveRole: (row.activeRole as Role | null) ?? row.role,
  };
}

export async function destroySession(db: D1Database, token: string): Promise<void> {
  const orm = drizzle(db);
  const tokenHash = await sha256Hex(token);
  await orm.delete(sessions).where(eq(sessions.id, tokenHash));
}

export async function setActiveRole(db: D1Database, token: string, role: Role): Promise<void> {
  const orm = drizzle(db);
  const tokenHash = await sha256Hex(token);
  await orm.update(sessions).set({ activeRole: role }).where(eq(sessions.id, tokenHash));
}

export function sessionCookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1];
}
