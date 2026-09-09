import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import { financingFacilities, holdings, investorProfiles, transactions } from "../db/schema";

type Db = ReturnType<typeof drizzle>;

/**
 * Recomputes `fundingProgressPct` from the actual subscribed pool
 * (SUM(holdings.amountInvested)), rather than leaving it as the stale,
 * seed-time-only value it's been until now. Called after every *primary*
 * investment (new capital into the facility) - never after a secondary-market
 * resale, which transfers existing ownership rather than adding new principal.
 */
export async function recomputeFundingProgress(db: Db, facilityId: string): Promise<void> {
  const [facilityRow] = await db.select({ principalAmount: financingFacilities.principalAmount }).from(financingFacilities).where(eq(financingFacilities.id, facilityId)).limit(1);
  if (!facilityRow || facilityRow.principalAmount <= 0) return;
  const [pool] = await db
    .select({ total: sql<number>`coalesce(sum(${holdings.amountInvested}), 0)` })
    .from(holdings)
    .where(eq(holdings.facilityId, facilityId));
  const fundingProgressPct = Math.min(100, +((pool.total / facilityRow.principalAmount) * 100).toFixed(2));
  await db.update(financingFacilities).set({ fundingProgressPct }).where(eq(financingFacilities.id, facilityId));
}

export async function investInFacility(
  db: Db,
  investorId: string,
  facility: { id: string; ratePct: number },
  amount: number,
  source: "manual" | "auto" = "manual"
): Promise<{ ok: true; holdingId: string } | { ok: false; error: "not_found" | "insufficient_balance" }> {
  const profileRows = await db.select().from(investorProfiles).where(eq(investorProfiles.userId, investorId)).limit(1);
  const profile = profileRows[0];
  if (!profile) return { ok: false, error: "not_found" };
  if (profile.cashBalance < amount) return { ok: false, error: "insufficient_balance" };

  const holdingId = crypto.randomUUID();
  const expectedReturn = +(amount * (1 + facility.ratePct / 100)).toFixed(2);

  await db.insert(holdings).values({
    id: holdingId,
    investorId,
    facilityId: facility.id,
    status: "Ongoing",
    amountInvested: amount,
    expectedReturn,
    actualReturn: 0,
    eligibleForSale: true,
    source,
  });
  await db
    .update(investorProfiles)
    .set({
      cashBalance: profile.cashBalance - amount,
      totalInvested: profile.totalInvested + amount,
      outstanding: profile.outstanding + amount,
    })
    .where(eq(investorProfiles.userId, investorId));
  await db.insert(transactions).values({
    id: crypto.randomUUID(),
    accountId: investorId,
    type: source === "auto" ? "Auto Investment" : "Investment",
    amount: -amount,
    status: "Confirmed",
    referenceJson: JSON.stringify({ facilityId: facility.id }),
  });
  await recomputeFundingProgress(db, facility.id);

  return { ok: true, holdingId };
}
