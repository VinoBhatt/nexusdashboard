import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { corporateUsers, corporateAccounts } from "../db/schema";

export interface CorporateContext {
  corpUserId: string;
  corpRole: "maker" | "checker";
  corporateAccountId: string;
}

const DEMO_FALLBACK_USER_ID = "user-corporate-demo"; // seeded maker identity

/**
 * A real maker/checker login resolves directly. A demo/reviewer who
 * switched effectiveRole to "corporate" via the role switcher has no
 * corporate_users row of their own, so they fall back to viewing the
 * seeded demo account as its maker - mirrors the legacy prototype,
 * where switching persona always showed the same mock company
 * regardless of who was "logged in". Checker-only actions still
 * require a real checker login; the fallback never grants checker
 * rights, so self-approval stays blocked for demo-switched sessions.
 */
export async function resolveCorporateContext(db: D1Database, userId: string): Promise<CorporateContext | null> {
  const orm = drizzle(db);
  const direct = await orm.select().from(corporateUsers).where(eq(corporateUsers.userId, userId)).limit(1);
  if (direct[0]) {
    return { corpUserId: direct[0].id, corpRole: direct[0].corpRole, corporateAccountId: direct[0].corporateAccountId };
  }
  const fallback = await orm.select().from(corporateUsers).where(eq(corporateUsers.userId, DEMO_FALLBACK_USER_ID)).limit(1);
  if (!fallback[0]) return null;
  return { corpUserId: fallback[0].id, corpRole: fallback[0].corpRole, corporateAccountId: fallback[0].corporateAccountId };
}

export async function getCorporateAccount(db: D1Database, id: string) {
  const orm = drizzle(db);
  const rows = await orm.select().from(corporateAccounts).where(eq(corporateAccounts.id, id)).limit(1);
  return rows[0] ?? null;
}
