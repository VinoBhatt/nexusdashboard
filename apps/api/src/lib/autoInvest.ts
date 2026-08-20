import { drizzle } from "drizzle-orm/d1";
import { eq, and, or } from "drizzle-orm";
import { autoInvestRules, financingFacilities, holdings } from "../db/schema";
import { investInFacility } from "./invest";

type Db = ReturnType<typeof drizzle>;
type AutoInvestRule = typeof autoInvestRules.$inferSelect;
type FinancingFacility = typeof financingFacilities.$inferSelect;

export function matchesRule(rule: AutoInvestRule, facility: FinancingFacility): boolean {
  if (rule.minRatePct !== null && facility.ratePct < rule.minRatePct) return false;
  if (rule.maxTenorDays !== null && facility.tenorDays > rule.maxTenorDays) return false;
  if (rule.riskTiers) {
    const tiers = rule.riskTiers.split(",").map((t) => t.trim());
    if (tiers.length > 0 && !tiers.includes(facility.riskTier)) return false;
  }
  return true;
}

/** One rule, one facility: check match, budget, and any existing position, then invest. */
async function matchAndInvest(db: Db, rule: AutoInvestRule, facility: FinancingFacility): Promise<boolean> {
  if (facility.fundingProgressPct >= 100) return false;
  if (!matchesRule(rule, facility)) return false;
  if (rule.budgetCap !== null && rule.totalInvested + rule.amountPerNote > rule.budgetCap) return false;

  const existing = await db
    .select({ id: holdings.id })
    .from(holdings)
    .where(and(eq(holdings.investorId, rule.investorId), eq(holdings.facilityId, facility.id)))
    .limit(1);
  if (existing.length > 0) return false;

  const result = await investInFacility(db, rule.investorId, facility, rule.amountPerNote, "auto");
  if (!result.ok) return false;

  await db
    .update(autoInvestRules)
    .set({ totalInvested: rule.totalInvested + rule.amountPerNote, updatedAt: new Date() })
    .where(eq(autoInvestRules.investorId, rule.investorId));
  return true;
}

/** A facility just opened for investment (new listing approved) - offer it to every enabled rule. */
export async function runAutoInvestForNewFacility(db: Db, facility: FinancingFacility): Promise<void> {
  const rules = await db.select().from(autoInvestRules).where(eq(autoInvestRules.enabled, true));
  for (const rule of rules) {
    await matchAndInvest(db, rule, facility);
  }
}

/** A rule was just enabled/updated - immediately sweep currently open notes for matches. */
export async function runAutoInvestForRule(db: Db, rule: AutoInvestRule): Promise<void> {
  if (!rule.enabled) return;
  const facilities = await db
    .select()
    .from(financingFacilities)
    .where(or(eq(financingFacilities.status, "Open"), eq(financingFacilities.status, "Ongoing")));
  for (const facility of facilities) {
    await matchAndInvest(db, rule, facility);
  }
}
