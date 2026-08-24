import { Hono, type Context } from "hono";
import { z } from "zod";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import {
  users,
  kycProfiles,
  investorProfiles,
  issuerProfiles,
  corporateAccounts,
  corporateUsers,
  wallets,
  approvals,
  kycAuditLog,
} from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { resolveSession, readSessionCookie } from "../auth/session";
import { generateInvestorRefNo, generateReferralCode } from "../lib/ids";
import { mockConfidenceScore, mockCtosResult, mockWalletAddress, computeRiskProfile, addMonths, type ConfidenceResult } from "../lib/kycMock";

const activate = new Hono<AuthedEnv>();
activate.use("*", requireAuth);

function riskLevelFromBand(band: ConfidenceResult["band"]): "Standard" | "Enhanced" | "Review" {
  if (band === "High") return "Standard";
  if (band === "Medium") return "Enhanced";
  return "Review";
}

/** Creates the compliance case for a newly-activated sub-profile: computes
 * a mock confidence score + CTOS pull, inserts the approval (auto-cleared
 * immediately if the mock score lands in the "high confidence" band,
 * otherwise queued Pending for the KYC Review Queue), and logs the
 * transition. Returns whether it auto-cleared so the caller can set the
 * corresponding kycStatus/kybStatus. */
async function createComplianceCase(
  db: DrizzleD1Database,
  args: { type: "Investor Verification" | "Issuer Verification"; subjectType: string; subjectId: string; applicantName: string; userId: string; seed: string; icNumber: string }
) {
  const confidence = mockConfidenceScore(args.seed);
  const ctosResult = mockCtosResult(args.icNumber, confidence);
  const autoCleared = confidence.outcome === "APPROVED";

  await db.insert(approvals).values({
    id: crypto.randomUUID(),
    type: args.type,
    subjectType: args.subjectType,
    subjectId: args.subjectId,
    applicantName: args.applicantName,
    riskLevel: riskLevelFromBand(confidence.band),
    status: autoCleared ? "Approved" : "Pending",
    decidedAt: autoCleared ? new Date() : undefined,
    confidenceScore: confidence.score,
    flaggedReason: confidence.flaggedReason,
    ctosResultJson: JSON.stringify(ctosResult),
  });

  await db.insert(kycAuditLog).values({
    id: crypto.randomUUID(),
    userId: args.userId,
    statusFrom: "PENDING_SUBMISSION",
    statusTo: autoCleared ? "APPROVED" : "MANUAL_REVIEW",
    actorType: "SYSTEM",
    reasonCode: autoCleared ? "AUTO_CLEAR" : confidence.flaggedReason ?? undefined,
  });

  return autoCleared;
}

async function refreshSessionUser(c: Context<AuthedEnv>) {
  const token = readSessionCookie(c.req.header("cookie"))!;
  return resolveSession(c.env.DB, token);
}

// ---- Individual Investor ----

const individualSchema = z.object({
  jobType: z.string().max(60).optional(),
  companyName: z.string().max(160).optional(),
  incomeRange: z.string().max(60).optional(),
  netWorth: z.string().max(60).optional(),
  sourceOfFunds: z.string().max(60).optional(),
  bankName: z.string().max(120).optional(),
  bankAccountNumber: z.string().max(40).optional(),
});

activate.post("/individual", async (c) => {
  const user = c.get("user");
  const parsed = individualSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const body = parsed.data;

  const db = drizzle(c.env.DB);
  const existing = await db.select({ userId: investorProfiles.userId }).from(investorProfiles).where(eq(investorProfiles.userId, user.id)).limit(1);
  if (existing.length > 0) return c.json({ error: "already_activated" }, 409);

  const [kyc] = await db.select().from(kycProfiles).where(eq(kycProfiles.userId, user.id)).limit(1);
  const risk = computeRiskProfile(kyc?.nationality ?? "Malaysian", body.netWorth ?? "");

  await db.insert(investorProfiles).values({
    userId: user.id,
    kycStatus: "Pending",
    investorRefNo: generateInvestorRefNo(),
    referralCode: generateReferralCode(),
    identificationType: kyc?.icNumber?.includes("-") ? "NRIC" : "Passport",
    identificationNumber: kyc?.icNumber,
    jobType: body.jobType,
    companyName: body.companyName,
    incomeRange: body.incomeRange,
    netWorth: body.netWorth,
    sourceOfFunds: body.sourceOfFunds,
    bankName: body.bankName,
    bankAccountNumber: body.bankAccountNumber,
    bankAccountHolder: kyc?.fullName ?? user.displayName,
    riskProfileTier: risk.tier,
    annualReviewDue: addMonths(new Date(), risk.reviewMonths),
  });

  const seed = kyc?.icNumber ?? user.id;
  const autoCleared = await createComplianceCase(db, {
    type: "Investor Verification",
    subjectType: "user",
    subjectId: user.id,
    applicantName: kyc?.fullName ?? user.displayName,
    userId: user.id,
    seed,
    icNumber: kyc?.icNumber ?? user.id,
  });
  if (autoCleared) {
    await db.update(investorProfiles).set({ kycStatus: "Verified" }).where(eq(investorProfiles.userId, user.id));
  }

  await db.insert(wallets).values({
    id: crypto.randomUUID(),
    userId: user.id,
    cifId: kyc?.icNumber ?? user.id,
    cifType: "INDIVIDUAL",
    walletType: "INVESTOR",
    walletAddress: mockWalletAddress(user.id + "individual"),
  });

  const refreshed = await refreshSessionUser(c);
  return c.json({ ok: true, user: refreshed }, 201);
});

// ---- Corporate Investor ----

const corporateSchema = z.object({
  companyName: z.string().min(1).max(160),
  registrationNumber: z.string().max(60).optional(),
  legalEntityType: z.string().max(60).optional(),
  sourceOfFunds: z.string().max(60).optional(),
  netAssetsRange: z.string().max(60).optional(),
  bankName: z.string().max(120).optional(),
  bankAccountNumber: z.string().max(40).optional(),
});

activate.post("/corporate", async (c) => {
  const user = c.get("user");
  const parsed = corporateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const body = parsed.data;

  const db = drizzle(c.env.DB);
  const existing = await db.select({ id: corporateUsers.id }).from(corporateUsers).where(eq(corporateUsers.userId, user.id)).limit(1);
  if (existing.length > 0) return c.json({ error: "already_activated" }, 409);

  const corporateAccountId = crypto.randomUUID();
  await db.insert(corporateAccounts).values({ id: corporateAccountId, companyName: body.companyName });
  await db.insert(corporateUsers).values({ id: crypto.randomUUID(), corporateAccountId, userId: user.id, corpRole: "maker" });
  await db.update(users).set({ role: "corporate", updatedAt: new Date() }).where(eq(users.id, user.id));

  const seed = body.registrationNumber ?? corporateAccountId;
  await createComplianceCase(db, {
    type: "Investor Verification",
    subjectType: "corporate_account",
    subjectId: corporateAccountId,
    applicantName: body.companyName,
    userId: user.id,
    seed,
    icNumber: body.registrationNumber ?? corporateAccountId,
  });

  await db.insert(wallets).values({
    id: crypto.randomUUID(),
    userId: user.id,
    cifId: body.registrationNumber ?? corporateAccountId,
    cifType: "CORPORATE",
    walletType: "INVESTOR",
    walletAddress: mockWalletAddress(corporateAccountId + "corporate"),
  });

  const refreshed = await refreshSessionUser(c);
  return c.json({ ok: true, user: refreshed }, 201);
});

// ---- Issuer ----

const issuerSchema = z.object({
  companyName: z.string().min(1).max(160),
  registrationNumber: z.string().max(60).optional(),
  legalEntityType: z.string().max(60).optional(),
  amountToRaise: z.number().positive().optional(),
  tenure: z.string().max(30).optional(),
  purpose: z.string().max(300).optional(),
});

activate.post("/issuer", async (c) => {
  const user = c.get("user");
  const parsed = issuerSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const body = parsed.data;

  const db = drizzle(c.env.DB);
  const existing = await db.select({ userId: issuerProfiles.userId }).from(issuerProfiles).where(eq(issuerProfiles.userId, user.id)).limit(1);
  if (existing.length > 0) return c.json({ error: "already_activated" }, 409);

  await db.insert(issuerProfiles).values({
    userId: user.id,
    companyName: body.companyName,
    registrationNumber: body.registrationNumber,
    contactPerson: user.displayName,
    contactEmail: user.email,
    kybStatus: "Pending",
  });
  await db.update(users).set({ role: "issuer", updatedAt: new Date() }).where(eq(users.id, user.id));

  const seed = body.registrationNumber ?? user.id;
  await createComplianceCase(db, {
    type: "Issuer Verification",
    subjectType: "user",
    subjectId: user.id,
    applicantName: body.companyName,
    userId: user.id,
    seed,
    icNumber: body.registrationNumber ?? user.id,
  });

  await db.insert(wallets).values({
    id: crypto.randomUUID(),
    userId: user.id,
    cifId: body.registrationNumber ?? user.id,
    cifType: "ISSUER",
    walletType: "ISSUER",
    walletAddress: mockWalletAddress(user.id + "issuer"),
  });

  const refreshed = await refreshSessionUser(c);
  return c.json({ ok: true, user: refreshed }, 201);
});

// ---- Status: what (if anything) this user has activated + their wallets ----

activate.get("/status", async (c) => {
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const [kyc] = await db.select().from(kycProfiles).where(eq(kycProfiles.userId, user.id)).limit(1);
  const myWallets = await db.select().from(wallets).where(eq(wallets.userId, user.id));
  const hasIndividual = (await db.select({ userId: investorProfiles.userId }).from(investorProfiles).where(eq(investorProfiles.userId, user.id)).limit(1)).length > 0;
  const hasCorporate = (await db.select({ id: corporateUsers.id }).from(corporateUsers).where(eq(corporateUsers.userId, user.id)).limit(1)).length > 0;
  const hasIssuer = (await db.select({ userId: issuerProfiles.userId }).from(issuerProfiles).where(eq(issuerProfiles.userId, user.id)).limit(1)).length > 0;
  return c.json({ kycProfile: kyc ?? null, wallets: myWallets, activated: { individual: hasIndividual, corporate: hasCorporate, issuer: hasIssuer } });
});

export default activate;
