import type { RepaymentStructure } from "./repaymentSchedule";

export interface Note {
  id: string;
  issuerName: string;
  riskTier: string;
  ratePct: number;
  tenorDays: number;
  minInvestment: number;
  maxInvestment: number;
  financingType: string;
  fundingProgressPct: number;
  noteName: string | null;
  principalAmount: number;
  repaymentStructure: RepaymentStructure;
  status?: string;
  campaignStart?: string | null;
  campaignEnd?: string | null;
}

export interface Listing {
  id: string;
  units: number;
  pricePerUnit: number;
  status: string;
  facilityId: string;
  noteName: string | null;
  issuerName: string;
  ratePct: number;
  tenorDays: number;
  daysElapsed: number;
  repaymentStructure: RepaymentStructure;
}
