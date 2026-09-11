// Admin-issued goodwill/compensation/referral credits - always posts a real
// wallet-crediting transaction (mirrors invest.ts's wallet-credit pattern)
// rather than a fake ledger line, per the Stage 2 servicing plan
// (idempotent-gliding-allen.md, Stage 2d). Stage 5 adds a corporate-account
// branch alongside the original retail-only one.
import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, and } from "drizzle-orm";
import { bonusCredits, users, investorProfiles, transactions, financingFacilities, corporateAccounts, corporateUsers } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { insertNotification } from "../lib/notifications";

const adminBonusCredits = new Hono<AuthedEnv>();
adminBonusCredits.use("*", requireAuth, requireRole("admin"));

const createSchema = z
  .object({
    investorId: z.string().optional(),
    corporateAccountId: z.string().optional(),
    bonusType: z.enum(["REFERRAL", "GOODWILL", "COMPENSATION", "PROMOTIONAL", "OTHER"]),
    amount: z.number().positive(),
    effectiveDate: z.string().min(1),
    reference: z.string().optional(),
    relatedInvestorId: z.string().optional(),
    facilityId: z.string().optional(),
    reason: z.string().min(1),
  })
  .refine((data) => Boolean(data.investorId) !== Boolean(data.corporateAccountId), { message: "Exactly one of investorId or corporateAccountId is required." });

adminBonusCredits.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      id: bonusCredits.id,
      investorId: bonusCredits.investorId,
      investorName: users.displayName,
      investorEmail: users.email,
      corporateAccountId: bonusCredits.corporateAccountId,
      companyName: corporateAccounts.companyName,
      bonusType: bonusCredits.bonusType,
      amount: bonusCredits.amount,
      effectiveDate: bonusCredits.effectiveDate,
      reference: bonusCredits.reference,
      facilityId: bonusCredits.facilityId,
      reason: bonusCredits.reason,
      createdAt: bonusCredits.createdAt,
    })
    .from(bonusCredits)
    .leftJoin(users, eq(bonusCredits.investorId, users.id))
    .leftJoin(corporateAccounts, eq(bonusCredits.corporateAccountId, corporateAccounts.id))
    .orderBy(desc(bonusCredits.createdAt))
    .limit(500);
  return c.json({ bonusCredits: rows });
});

adminBonusCredits.post("/", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const { investorId, corporateAccountId, bonusType, amount, effectiveDate, reference, relatedInvestorId, facilityId, reason } = parsed.data;
  const db = drizzle(c.env.DB);

  if (facilityId) {
    const [facility] = await db.select({ id: financingFacilities.id }).from(financingFacilities).where(eq(financingFacilities.id, facilityId)).limit(1);
    if (!facility) return c.json({ error: "facility_not_found" }, 404);
  }

  const transactionId = crypto.randomUUID();
  const bonusId = crypto.randomUUID();

  if (investorId) {
    const [profile] = await db.select().from(investorProfiles).where(eq(investorProfiles.userId, investorId)).limit(1);
    if (!profile) return c.json({ error: "investor_not_found" }, 404);

    await db.update(investorProfiles).set({ cashBalance: profile.cashBalance + amount }).where(eq(investorProfiles.userId, investorId));
    await db.insert(transactions).values({
      id: transactionId,
      accountId: investorId,
      type: "Bonus",
      amount,
      status: "Confirmed",
      referenceJson: JSON.stringify({ bonusType, reason, facilityId: facilityId ?? null }),
    });
  } else {
    // corporateAccountId branch: corporateAccounts.cashBalance is a shared
    // treasury, not a per-user investorProfiles row. transactions.accountId
    // is a NOT NULL FK to users.id - every other corporate-scoped
    // transaction in corporate.ts attributes that column to the account's
    // maker, so this does the same rather than inventing a new convention.
    const [account] = await db.select().from(corporateAccounts).where(eq(corporateAccounts.id, corporateAccountId!)).limit(1);
    if (!account) return c.json({ error: "corporate_account_not_found" }, 404);
    const [maker] = await db
      .select({ userId: corporateUsers.userId })
      .from(corporateUsers)
      .where(and(eq(corporateUsers.corporateAccountId, corporateAccountId!), eq(corporateUsers.corpRole, "maker")))
      .limit(1);
    if (!maker) return c.json({ error: "corporate_maker_not_found" }, 404);

    await db.update(corporateAccounts).set({ cashBalance: account.cashBalance + amount }).where(eq(corporateAccounts.id, corporateAccountId!));
    await db.insert(transactions).values({
      id: transactionId,
      accountId: maker.userId,
      corporateAccountId,
      type: "Bonus",
      amount,
      status: "Confirmed",
      referenceJson: JSON.stringify({ bonusType, reason, facilityId: facilityId ?? null }),
    });
  }

  await db.insert(bonusCredits).values({
    id: bonusId,
    investorId: investorId ?? null,
    corporateAccountId: corporateAccountId ?? null,
    bonusType,
    amount,
    effectiveDate,
    reference: reference ?? null,
    relatedInvestorId: relatedInvestorId ?? null,
    facilityId: facilityId ?? null,
    reason,
    approvedBy: c.get("user").id,
    transactionId,
  });

  await insertNotification(db, {
    facilityId: facilityId ?? null,
    investorId: investorId ?? null,
    corporateAccountId: corporateAccountId ?? null,
    type: "BONUS_CREDIT_ISSUED",
    title: "Bonus credit issued",
    message: `${bonusType} · ${amount} credited to ${investorId ? "investor" : "corporate account"} wallet.`,
  });

  return c.json({ ok: true, id: bonusId, transactionId }, 201);
});

export default adminBonusCredits;
