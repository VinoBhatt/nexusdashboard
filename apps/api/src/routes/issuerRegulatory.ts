import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import {
  issuerProfiles,
  issuerBoardMembers,
  issuerShareholders,
  issuerFinancials,
  financingFacilities,
  campaignSettlements,
  rescheduleRestructureNotes,
} from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const issuerRegulatory = new Hono<AuthedEnv>();
issuerRegulatory.use("*", requireAuth, requireRole("admin"));

// ---- Pickers ----

issuerRegulatory.get("/issuers", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({ userId: issuerProfiles.userId, companyName: issuerProfiles.companyName, registrationNumber: issuerProfiles.registrationNumber })
    .from(issuerProfiles);
  return c.json({ items: rows });
});

issuerRegulatory.get("/facilities", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({ id: financingFacilities.id, noteName: financingFacilities.noteName, issuerName: financingFacilities.issuerName, status: financingFacilities.status })
    .from(financingFacilities);
  return c.json({ items: rows });
});

issuerRegulatory.get("/issuers/:userId", async (c) => {
  const db = drizzle(c.env.DB);
  const [row] = await db.select().from(issuerProfiles).where(eq(issuerProfiles.userId, c.req.param("userId")));
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ item: row });
});

// ---- Issuer extended profile ----

const profileSchema = z.object({
  issuerIdCode: z.string().optional().nullable(),
  dateOfIncorporation: z.string().optional().nullable(),
  dateOfCommencement: z.string().optional().nullable(),
  countryOfIncorporation: z.string().optional().nullable(),
  typeOfCompany: z.string().optional().nullable(),
  registeredAddressState: z.string().optional().nullable(),
  registeredAddressPostcode: z.string().optional().nullable(),
  businessAddress: z.string().optional().nullable(),
  businessAddressState: z.string().optional().nullable(),
  businessAddressPostcode: z.string().optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  companyActivities: z.string().optional().nullable(),
});

issuerRegulatory.put("/issuers/:userId/profile", async (c) => {
  const userId = c.req.param("userId");
  const parsed = profileSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  const db = drizzle(c.env.DB);
  const [existing] = await db.select().from(issuerProfiles).where(eq(issuerProfiles.userId, userId));
  if (!existing) return c.json({ error: "not_found" }, 404);
  await db.update(issuerProfiles).set(parsed.data).where(eq(issuerProfiles.userId, userId));
  return c.json({ ok: true });
});

// ---- Board members ----

const boardMemberSchema = z.object({
  name: z.string().min(1),
  salutation: z.string().optional().nullable(),
  identityPrefix: z.enum(["NRIC", "Passport"]).optional(),
  identityNumber: z.string().optional().nullable(),
  dob: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  nationality: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  addressState: z.string().optional().nullable(),
  addressPostcode: z.string().optional().nullable(),
  designation: z.string().optional().nullable(),
  designationOther: z.string().optional().nullable(),
  appointmentDate: z.string().optional().nullable(),
  resignationDate: z.string().optional().nullable(),
});

issuerRegulatory.get("/issuers/:userId/board", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(issuerBoardMembers).where(eq(issuerBoardMembers.issuerUserId, c.req.param("userId")));
  return c.json({ items: rows });
});

issuerRegulatory.post("/issuers/:userId/board", async (c) => {
  const userId = c.req.param("userId");
  const parsed = boardMemberSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  const db = drizzle(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(issuerBoardMembers).values({ id, issuerUserId: userId, ...parsed.data });
  return c.json({ id }, 201);
});

issuerRegulatory.delete("/board/:id", async (c) => {
  const db = drizzle(c.env.DB);
  await db.delete(issuerBoardMembers).where(eq(issuerBoardMembers.id, c.req.param("id")));
  return c.json({ ok: true });
});

// ---- Shareholders ----

const shareholderSchema = z.object({
  shareholderType: z.enum(["Individual", "Company"]).optional(),
  shareholderName: z.string().min(1),
  salutation: z.string().optional().nullable(),
  identityPrefix: z.enum(["NRIC", "Passport", "Company Registration No."]).optional(),
  identityNumber: z.string().optional().nullable(),
  dob: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  nationality: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  addressState: z.string().optional().nullable(),
  addressPostcode: z.string().optional().nullable(),
  shareType: z.string().optional().nullable(),
  shareTypeOther: z.string().optional().nullable(),
  shareholdingUnits: z.number().optional().nullable(),
  shareholdingAmount: z.number().optional().nullable(),
  shareholdingPercentage: z.number().optional().nullable(),
});

issuerRegulatory.get("/issuers/:userId/shareholders", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(issuerShareholders).where(eq(issuerShareholders.issuerUserId, c.req.param("userId")));
  return c.json({ items: rows });
});

issuerRegulatory.post("/issuers/:userId/shareholders", async (c) => {
  const userId = c.req.param("userId");
  const parsed = shareholderSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  const db = drizzle(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(issuerShareholders).values({ id, issuerUserId: userId, ...parsed.data });
  return c.json({ id }, 201);
});

issuerRegulatory.delete("/shareholders/:id", async (c) => {
  const db = drizzle(c.env.DB);
  await db.delete(issuerShareholders).where(eq(issuerShareholders.id, c.req.param("id")));
  return c.json({ ok: true });
});

// ---- Financials (balance sheet + P&L, one row per period) ----

const financialsSchema = z.object({
  periodLabel: z.string().min(1),
  assetsCurrentRM: z.number().optional().nullable(),
  assetsNonCurrentRM: z.number().optional().nullable(),
  liabCurrentBorrowingRM: z.number().optional().nullable(),
  liabCurrentNonBorrowingRM: z.number().optional().nullable(),
  liabNonCurrentLoanRM: z.number().optional().nullable(),
  liabNonCurrentNonLoanRM: z.number().optional().nullable(),
  equityCapitalRM: z.number().optional().nullable(),
  equityShareApplicationRM: z.number().optional().nullable(),
  equitySharePremiumRM: z.number().optional().nullable(),
  equityAccumulatedProfitRM: z.number().optional().nullable(),
  equityMinorityInterestRM: z.number().optional().nullable(),
  totalRevenueRM: z.number().optional().nullable(),
  operatingCostRM: z.number().optional().nullable(),
  administrativeCostRM: z.number().optional().nullable(),
  interestCostRM: z.number().optional().nullable(),
  otherCostRM: z.number().optional().nullable(),
  profitLossBeforeTaxRM: z.number().optional().nullable(),
  profitLossAfterTaxRM: z.number().optional().nullable(),
  minorityInterestRM: z.number().optional().nullable(),
  netDividendRM: z.number().optional().nullable(),
});

issuerRegulatory.get("/issuers/:userId/financials", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(issuerFinancials).where(eq(issuerFinancials.issuerUserId, c.req.param("userId")));
  return c.json({ items: rows });
});

issuerRegulatory.post("/issuers/:userId/financials", async (c) => {
  const userId = c.req.param("userId");
  const parsed = financialsSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  const db = drizzle(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(issuerFinancials).values({ id, issuerUserId: userId, ...parsed.data });
  return c.json({ id }, 201);
});

issuerRegulatory.delete("/financials/:id", async (c) => {
  const db = drizzle(c.env.DB);
  await db.delete(issuerFinancials).where(eq(issuerFinancials.id, c.req.param("id")));
  return c.json({ ok: true });
});

issuerRegulatory.get("/facilities/:facilityId", async (c) => {
  const db = drizzle(c.env.DB);
  const [row] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, c.req.param("facilityId")));
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ item: row });
});

// ---- Campaign / financing facility supplementary fields ----

const campaignFieldsSchema = z.object({
  campaignDescription: z.string().optional().nullable(),
  campaignApplicationDate: z.string().optional().nullable(),
  campaignApprovalDate: z.string().optional().nullable(),
  campaignUrl: z.string().optional().nullable(),
  campaignSector: z.string().optional().nullable(),
  sustainabilityCategory: z.string().optional().nullable(),
  typeOfInvestmentNotes: z.string().optional().nullable(),
  shariahAdviserName: z.string().optional().nullable(),
  purposeOfFundRaising: z.string().optional().nullable(),
  purposeOfFundRaisingOther: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  isSaranaScheme: z.boolean().optional(),
  saranaFinancingOptions: z.string().optional().nullable(),
  saranaFinancingScope: z.string().optional().nullable(),
  targetFinancingAmount: z.number().optional().nullable(),
  financingSecurity: z.string().optional().nullable(),
  issuerInterestRateEffective: z.number().optional().nullable(),
  investorReturnRateSimple: z.number().optional().nullable(),
  investorReturnRateEffective: z.number().optional().nullable(),
  defaultClassification: z.string().optional().nullable(),
  defaultClassificationOther: z.string().optional().nullable(),
  actualDueRepaymentDate: z.string().optional().nullable(),
});

issuerRegulatory.put("/facilities/:facilityId/campaign-fields", async (c) => {
  const facilityId = c.req.param("facilityId");
  const parsed = campaignFieldsSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  const db = drizzle(c.env.DB);
  const [existing] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, facilityId));
  if (!existing) return c.json({ error: "not_found" }, 404);
  await db.update(financingFacilities).set(parsed.data).where(eq(financingFacilities.id, facilityId));
  return c.json({ ok: true });
});

// ---- Reschedule & Restructure notes ----

const rrSchema = z.object({
  rrCampaignId: z.string().optional().nullable(),
  interestRatePct: z.number().optional().nullable(),
  tenureOriginalMonths: z.number().optional().nullable(),
  tenureRRMonths: z.number().optional().nullable(),
  commencementDateRR: z.string().optional().nullable(),
  financingAmountOriginal: z.number().optional().nullable(),
  rrAmountRevised: z.number().optional().nullable(),
  rrPaymentStructure: z.string().optional().nullable(),
});

issuerRegulatory.get("/facilities/:facilityId/rr", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select()
    .from(rescheduleRestructureNotes)
    .where(eq(rescheduleRestructureNotes.facilityId, c.req.param("facilityId")));
  return c.json({ items: rows });
});

issuerRegulatory.post("/facilities/:facilityId/rr", async (c) => {
  const facilityId = c.req.param("facilityId");
  const parsed = rrSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  const db = drizzle(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(rescheduleRestructureNotes).values({ id, facilityId, ...parsed.data });
  return c.json({ id }, 201);
});

issuerRegulatory.delete("/rr/:id", async (c) => {
  const db = drizzle(c.env.DB);
  await db.delete(rescheduleRestructureNotes).where(eq(rescheduleRestructureNotes.id, c.req.param("id")));
  return c.json({ ok: true });
});

// ---- Campaign settlement (one row per facility) ----

const settlementSchema = z.object({
  paymentTo: z.enum(["Issuer", "Investor"]).optional().nullable(),
  fundDisbursementDate: z.string().optional().nullable(),
  settlementAmount: z.number().optional().nullable(),
  fundRefundedDate: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
});

issuerRegulatory.get("/facilities/:facilityId/settlement", async (c) => {
  const db = drizzle(c.env.DB);
  const [row] = await db
    .select()
    .from(campaignSettlements)
    .where(eq(campaignSettlements.facilityId, c.req.param("facilityId")));
  return c.json({ item: row ?? null });
});

issuerRegulatory.put("/facilities/:facilityId/settlement", async (c) => {
  const facilityId = c.req.param("facilityId");
  const parsed = settlementSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  const db = drizzle(c.env.DB);
  const [existing] = await db.select().from(campaignSettlements).where(eq(campaignSettlements.facilityId, facilityId));
  if (existing) {
    await db.update(campaignSettlements).set(parsed.data).where(eq(campaignSettlements.facilityId, facilityId));
  } else {
    await db.insert(campaignSettlements).values({ id: crypto.randomUUID(), facilityId, ...parsed.data });
  }
  return c.json({ ok: true });
});

export default issuerRegulatory;
