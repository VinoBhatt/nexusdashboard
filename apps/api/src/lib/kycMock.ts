// Deterministic mock generators for the KYC Engine / CTOS Screening Record
// demo (Barrier 2). Nothing here calls a real vendor - JPN/CTOS/OFAC/a real
// blockchain don't exist for this platform - but every result is seeded off
// a stable per-user string so a given account always sees the same "case"
// on repeat visits, rather than random noise on every page load.

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const FLAG_REASONS = [
  "PEP fuzzy name match (87%)",
  "OFAC partial name + DOB year match",
  "CTOS litigation flag (civil suit)",
  "Address state match only - low signal",
];

export interface ConfidenceResult {
  score: number;
  band: "High" | "Medium" | "Low";
  outcome: "APPROVED" | "MANUAL_REVIEW" | "REJECTED_SOFT";
  flaggedReason: string | null;
}

/** The prototype's own scoring table is illustrative rather than a
 * rigorously specified algorithm (its worked example doesn't sum to its
 * stated total) - this reproduces the same band language (0-20 High/
 * auto-clear, 21-50 Medium/manual-review, 51+ Low/rejected-soft) with a
 * coherent direction (higher = more suspicious). About 70% of demo
 * signups come back clean so the platform doesn't feel broken; the rest
 * land in Medium/Low so the admin KYC queue always has real, varied
 * cases to review. */
export function mockConfidenceScore(seed: string): ConfidenceResult {
  const h = hashString(seed);
  const bucket = h % 100;

  if (bucket < 70) {
    return { score: h % 16, band: "High", outcome: "APPROVED", flaggedReason: null };
  }
  if (bucket < 92) {
    return { score: 21 + (h % 30), band: "Medium", outcome: "MANUAL_REVIEW", flaggedReason: FLAG_REASONS[h % FLAG_REASONS.length] };
  }
  return { score: 51 + (h % 40), band: "Low", outcome: "REJECTED_SOFT", flaggedReason: FLAG_REASONS[(h + 1) % FLAG_REASONS.length] };
}

export function mockCtosResult(icNumber: string, confidence: ConfidenceResult) {
  const h = hashString(icNumber);
  const creditScore = 600 + (h % 250);
  return {
    request_id: `ctos_req_${h.toString(16)}`,
    retrieved_at: new Date().toISOString(),
    ic_number: icNumber,
    credit_score: creditScore,
    credit_band: creditScore > 780 ? "EXCELLENT" : creditScore > 700 ? "GOOD" : "FAIR",
    litigation_flag: confidence.band === "Low" && h % 3 === 0,
    bankruptcy_flag: false,
    defaults_24m: confidence.band === "Low" ? h % 2 : 0,
    aml_list_matches:
      confidence.outcome === "APPROVED"
        ? []
        : [
            {
              list: h % 2 === 0 ? "PEP_DOMESTIC" : "OFAC_SDN",
              name_matched: null as string | null,
              match_confidence: Math.round(Math.min(0.99, 0.7 + (h % 30) / 100) * 100) / 100,
              position: h % 2 === 0 ? "State assembly member (former)" : "Sanctions watchlist entry",
            },
          ],
  };
}

/** Not a real address - a believable-looking hex string, matching the
 * prototype's own "server generates keypair, stores public address"
 * framing without a real chain behind it. */
export function mockWalletAddress(seed: string): string {
  const parts = ["a", "b", "c", "d"].map((salt) => hashString(seed + salt).toString(16).padStart(8, "0"));
  return "0x" + parts.join("");
}

export interface RiskProfile {
  tier: "LOW" | "MEDIUM" | "HIGH";
  reviewMonths: number;
  investmentLimit: number | null; // null = no limit
}

/** The prototype's investor risk profile matrix (Barrier 2 reference). */
export function computeRiskProfile(nationality: string, netWorth: string): RiskProfile {
  const isMalaysian = nationality.toLowerCase().includes("malaysia");
  const accredited = netWorth.includes("Above RM 3M") || netWorth.includes("Above RM3M") || netWorth.toLowerCase().includes("accredited");

  if (isMalaysian && accredited) return { tier: "HIGH", reviewMonths: 24, investmentLimit: null };
  if (isMalaysian && (netWorth.includes("300k") || netWorth.includes("3M"))) return { tier: "MEDIUM", reviewMonths: 12, investmentLimit: 200_000 };
  if (isMalaysian) return { tier: "LOW", reviewMonths: 12, investmentLimit: 50_000 };
  // Non-Malaysian: treat as foreign (not PR-distinguished in this demo's signup form).
  return { tier: "LOW", reviewMonths: 6, investmentLimit: 20_000 };
}

export function addMonths(date: Date, months: number): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
