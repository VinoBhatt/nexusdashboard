import { describe, it, expect } from "vitest";
import { matchesRule } from "./autoInvest";

function makeFacility(overrides: Partial<Parameters<typeof matchesRule>[1]> = {}) {
  return {
    id: "NOTE-1",
    issuerUserId: null,
    productGroup: "Invoice Financing",
    financingType: "Invoice Financing",
    riskTier: "B+",
    ratePct: 7,
    tenorDays: 90,
    daysElapsed: 0,
    minInvestment: 100,
    maxInvestment: 5000,
    fundingProgressPct: 40,
    principalAmount: 100000,
    serviceFeePct: 8,
    issuerName: "Test Issuer",
    status: "Open" as const,
    purpose: null,
    firstPaymentDate: null,
    lastPaymentDate: null,
    noteName: null,
    campaignStart: null,
    campaignEnd: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeRule(overrides: Partial<Parameters<typeof matchesRule>[0]> = {}) {
  return {
    investorId: "user-1",
    enabled: true,
    minRatePct: null,
    maxTenorDays: null,
    riskTiers: null,
    amountPerNote: 100,
    budgetCap: null,
    totalInvested: 0,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("matchesRule", () => {
  it("matches an unrestricted rule against anything", () => {
    expect(matchesRule(makeRule(), makeFacility())).toBe(true);
  });

  it("rejects a note below the minimum rate", () => {
    const rule = makeRule({ minRatePct: 8 });
    expect(matchesRule(rule, makeFacility({ ratePct: 7 }))).toBe(false);
    expect(matchesRule(rule, makeFacility({ ratePct: 8 }))).toBe(true);
    expect(matchesRule(rule, makeFacility({ ratePct: 9 }))).toBe(true);
  });

  it("rejects a note longer than the maximum tenor", () => {
    const rule = makeRule({ maxTenorDays: 90 });
    expect(matchesRule(rule, makeFacility({ tenorDays: 120 }))).toBe(false);
    expect(matchesRule(rule, makeFacility({ tenorDays: 90 }))).toBe(true);
    expect(matchesRule(rule, makeFacility({ tenorDays: 30 }))).toBe(true);
  });

  it("rejects a note outside the allowed risk tiers", () => {
    const rule = makeRule({ riskTiers: "A,B+" });
    expect(matchesRule(rule, makeFacility({ riskTier: "C+" }))).toBe(false);
    expect(matchesRule(rule, makeFacility({ riskTier: "A" }))).toBe(true);
    expect(matchesRule(rule, makeFacility({ riskTier: "B+" }))).toBe(true);
  });

  it("combines all three constraints", () => {
    const rule = makeRule({ minRatePct: 6, maxTenorDays: 100, riskTiers: "A,B+" });
    expect(matchesRule(rule, makeFacility({ ratePct: 7, tenorDays: 90, riskTier: "B+" }))).toBe(true);
    expect(matchesRule(rule, makeFacility({ ratePct: 5, tenorDays: 90, riskTier: "B+" }))).toBe(false);
    expect(matchesRule(rule, makeFacility({ ratePct: 7, tenorDays: 200, riskTier: "B+" }))).toBe(false);
    expect(matchesRule(rule, makeFacility({ ratePct: 7, tenorDays: 90, riskTier: "C+" }))).toBe(false);
  });
});
