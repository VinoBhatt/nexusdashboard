import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, or, desc, inArray } from "drizzle-orm";
import { financingFacilities, proposals, users, holdings, repaymentInstallments, auditLog } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { generateRepaymentSchedule } from "../lib/repaymentSchedule";
import { activateFacility } from "../lib/facilityLaunch";
import { autoLaunchDueProposals } from "../lib/proposalLifecycle";

const campaignManager = new Hono<AuthedEnv>();
campaignManager.use("*", requireAuth, requireRole("campaign_manager"));

const RISK_OPTIONS: Record<string, string[]> = {
  "Payment Risk Rating": ["A", "B", "C", "D"],
  "CTOS Score Rating": ["Excellent", "Very Good", "Good", "Fair", "Bad", "Poor"],
  "CR Rating": ["CR1", "CR2", "CR3", "CR4", "CR5", "CR6"],
};

function parseJsonArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeProposal(p: typeof proposals.$inferSelect) {
  return { ...p, securities: parseJsonArray(p.securitiesJson), documents: parseJsonArray(p.documentsJson) };
}

// ---- Account Summary (Functional Handbook s.4.1): counts per module,
// each linking to its corresponding filtered list on the frontend. ----

campaignManager.get("/overview", async (c) => {
  const db = drizzle(c.env.DB);
  await autoLaunchDueProposals(db);

  const [pendingApplications, allProposals, allNotes] = await Promise.all([
    db.select({ id: financingFacilities.id }).from(financingFacilities).where(eq(financingFacilities.status, "Pending Review")),
    db.select({ status: proposals.status }).from(proposals),
    db.select({ status: financingFacilities.status }).from(financingFacilities).where(inArray(financingFacilities.status, [...NOTE_STATUSES])),
  ]);

  const countBy = <T extends string>(rows: { status: T }[]) =>
    rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});

  return c.json({
    pendingApplications: pendingApplications.length,
    proposalsByStatus: countBy(allProposals),
    notesByStatus: countBy(allNotes),
  });
});

// ---- Applications (Functional Handbook s.4.2): facilities awaiting review. ----

campaignManager.get("/applications", async (c) => {
  const db = drizzle(c.env.DB);
  const search = (c.req.query("search") ?? "").toLowerCase();
  let rows = await db.select().from(financingFacilities).where(eq(financingFacilities.status, "Pending Review")).orderBy(desc(financingFacilities.createdAt));
  if (search) rows = rows.filter((r) => r.issuerName.toLowerCase().includes(search));
  return c.json({ applications: rows });
});

campaignManager.get("/applications/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, c.req.param("id"))).limit(1);
  if (!facility) return c.json({ error: "not_found" }, 404);
  const businessInfo = facility.businessInfoJson ? JSON.parse(facility.businessInfoJson) : {};
  return c.json({ facility, businessInfo });
});

// ---- Proposals (Functional Handbook s.4.3): commercial-terms drafting,
// submission, launch scheduling, and launch. financingFacilities carries
// the amount/tenor/rate/repayment-structure fields the schedule generator
// needs; this table layers risk/security/fees/launch-materials on top. ----

campaignManager.get("/proposals", async (c) => {
  const db = drizzle(c.env.DB);
  await autoLaunchDueProposals(db);
  const status = c.req.query("status");
  const rows = await db
    .select({
      id: proposals.id,
      facilityId: proposals.facilityId,
      status: proposals.status,
      noteName: proposals.noteName,
      promotionalStart: proposals.promotionalStart,
      launchStart: proposals.launchStart,
      launchEnd: proposals.launchEnd,
      createdAt: proposals.createdAt,
      issuerName: financingFacilities.issuerName,
      product: financingFacilities.financingType,
      amount: financingFacilities.principalAmount,
    })
    .from(proposals)
    .innerJoin(financingFacilities, eq(proposals.facilityId, financingFacilities.id))
    .orderBy(desc(proposals.createdAt));
  const filtered = status ? rows.filter((r) => r.status === status) : rows;
  return c.json({ proposals: filtered });
});

campaignManager.get("/proposals/:id", async (c) => {
  const db = drizzle(c.env.DB);
  await autoLaunchDueProposals(db);
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, c.req.param("id"))).limit(1);
  if (!proposal) return c.json({ error: "not_found" }, 404);
  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, proposal.facilityId)).limit(1);
  const schedule = facility
    ? generateRepaymentSchedule(facility.principalAmount, facility.ratePct, facility.tenorDays, facility.repaymentStructure)
    : [];
  return c.json({ proposal: serializeProposal(proposal), facility, schedulePreview: schedule });
});

function nextProposalId(product: string, islamicConventional: string | null, count: number): string {
  const normalized = product.replace(/\s*\((Receivables|Purchases)\)\s*/i, "").trim();
  let prefix = "OTH";
  if (/^Invoice Financing$/i.test(normalized)) prefix = islamicConventional === "Islamic" ? "IIF" : "CIF";
  else if (/^Working Capital$/i.test(normalized)) prefix = islamicConventional === "Islamic" ? "IWC" : "CWC";
  else if (/^Insurance Premium Financing$/i.test(normalized)) prefix = "IPF";
  else {
    const initials = normalized
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase();
    if (initials) prefix = initials;
  }
  const seq = 2075 + count;
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  return `${prefix}${seq}-${dd}${mm}${today.getFullYear()}`;
}

const proposalFieldsSchema = z.object({
  amount: z.number().min(1000),
  tenorDays: z.number().min(1),
  ratePct: z.number().min(0),
  repaymentStructure: z.enum(["Bullet Principal, Monthly Profit", "Bullet Principal & Profit", "Monthly Principal & Profit"]),
  riskMethod: z.enum(["Payment Risk Rating", "CTOS Score Rating", "CR Rating"]).optional(),
  riskValue: z.string().optional(),
  securities: z.array(z.string()).optional(),
  corporateGuaranteeSource: z.string().optional(),
  corporateGuaranteeOther: z.string().optional(),
  collateralDetails: z.string().optional(),
  otherSecurityDetails: z.string().optional(),
  processingFee: z.number().min(0).optional(),
  platformFee: z.number().min(0).optional(),
  documents: z.array(z.string()).optional(),
});

function validRiskValue(method?: string, value?: string): boolean {
  if (!method || !value) return true;
  return RISK_OPTIONS[method]?.includes(value) ?? false;
}

const createProposalSchema = proposalFieldsSchema.extend({ facilityId: z.string() });

campaignManager.post("/proposals", async (c) => {
  const user = c.get("user");
  const parsed = createProposalSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  if (!validRiskValue(parsed.data.riskMethod, parsed.data.riskValue)) return c.json({ error: "invalid_risk_rating" }, 400);

  const db = drizzle(c.env.DB);
  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, parsed.data.facilityId)).limit(1);
  if (!facility) return c.json({ error: "not_found" }, 404);
  if (facility.status !== "Pending Review") return c.json({ error: "not_reviewable" }, 409);

  await db
    .update(financingFacilities)
    .set({
      principalAmount: parsed.data.amount,
      maxInvestment: parsed.data.amount,
      tenorDays: parsed.data.tenorDays,
      ratePct: parsed.data.ratePct,
      repaymentStructure: parsed.data.repaymentStructure,
    })
    .where(eq(financingFacilities.id, facility.id));

  const existingCount = (await db.select({ id: proposals.id }).from(proposals)).length;
  const id = nextProposalId(facility.financingType, facility.islamicConventional, existingCount);

  await db.insert(proposals).values({
    id,
    facilityId: facility.id,
    preparedBy: user.id,
    status: "Drafted",
    riskMethod: parsed.data.riskMethod,
    riskValue: parsed.data.riskValue,
    securitiesJson: parsed.data.securities ? JSON.stringify(parsed.data.securities) : null,
    corporateGuaranteeSource: parsed.data.corporateGuaranteeSource,
    corporateGuaranteeOther: parsed.data.corporateGuaranteeOther,
    collateralDetails: parsed.data.collateralDetails,
    otherSecurityDetails: parsed.data.otherSecurityDetails,
    processingFee: parsed.data.processingFee ?? 0,
    platformFee: parsed.data.platformFee ?? 0,
    documentsJson: parsed.data.documents ? JSON.stringify(parsed.data.documents) : null,
  });

  return c.json({ ok: true, id }, 201);
});

async function loadDraftProposal(db: ReturnType<typeof drizzle>, id: string) {
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
  if (!proposal || proposal.status !== "Drafted") return null;
  return proposal;
}

campaignManager.patch("/proposals/:id", async (c) => {
  const parsed = proposalFieldsSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  if (!validRiskValue(parsed.data.riskMethod, parsed.data.riskValue)) return c.json({ error: "invalid_risk_rating" }, 400);

  const db = drizzle(c.env.DB);
  const proposal = await loadDraftProposal(db, c.req.param("id"));
  if (!proposal) return c.json({ error: "not_found_or_not_editable" }, 404);

  const facilityUpdate: Partial<typeof financingFacilities.$inferInsert> = {};
  if (parsed.data.amount !== undefined) {
    facilityUpdate.principalAmount = parsed.data.amount;
    facilityUpdate.maxInvestment = parsed.data.amount;
  }
  if (parsed.data.tenorDays !== undefined) facilityUpdate.tenorDays = parsed.data.tenorDays;
  if (parsed.data.ratePct !== undefined) facilityUpdate.ratePct = parsed.data.ratePct;
  if (parsed.data.repaymentStructure !== undefined) facilityUpdate.repaymentStructure = parsed.data.repaymentStructure;
  if (Object.keys(facilityUpdate).length > 0) {
    await db.update(financingFacilities).set(facilityUpdate).where(eq(financingFacilities.id, proposal.facilityId));
  }

  const proposalUpdate: Partial<typeof proposals.$inferInsert> = {};
  if (parsed.data.riskMethod !== undefined) proposalUpdate.riskMethod = parsed.data.riskMethod;
  if (parsed.data.riskValue !== undefined) proposalUpdate.riskValue = parsed.data.riskValue;
  if (parsed.data.securities !== undefined) proposalUpdate.securitiesJson = JSON.stringify(parsed.data.securities);
  if (parsed.data.corporateGuaranteeSource !== undefined) proposalUpdate.corporateGuaranteeSource = parsed.data.corporateGuaranteeSource;
  if (parsed.data.corporateGuaranteeOther !== undefined) proposalUpdate.corporateGuaranteeOther = parsed.data.corporateGuaranteeOther;
  if (parsed.data.collateralDetails !== undefined) proposalUpdate.collateralDetails = parsed.data.collateralDetails;
  if (parsed.data.otherSecurityDetails !== undefined) proposalUpdate.otherSecurityDetails = parsed.data.otherSecurityDetails;
  if (parsed.data.processingFee !== undefined) proposalUpdate.processingFee = parsed.data.processingFee;
  if (parsed.data.platformFee !== undefined) proposalUpdate.platformFee = parsed.data.platformFee;
  if (parsed.data.documents !== undefined) proposalUpdate.documentsJson = JSON.stringify(parsed.data.documents);
  if (Object.keys(proposalUpdate).length > 0) {
    await db.update(proposals).set(proposalUpdate).where(eq(proposals.id, proposal.id));
  }

  return c.json({ ok: true });
});

campaignManager.post("/proposals/:id/submit", async (c) => {
  const db = drizzle(c.env.DB);
  const proposal = await loadDraftProposal(db, c.req.param("id"));
  if (!proposal) return c.json({ error: "not_found_or_not_editable" }, 404);
  if (!proposal.riskMethod || !proposal.riskValue) return c.json({ error: "incomplete", missing: ["Risk rating"], message: "Set a risk rating before submitting." }, 400);

  await db.update(proposals).set({ status: "Submitted", submittedAt: new Date() }).where(eq(proposals.id, proposal.id));
  return c.json({ ok: true });
});

campaignManager.post("/proposals/:id/recall", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = drizzle(c.env.DB);
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, c.req.param("id"))).limit(1);
  if (!proposal || proposal.status !== "Submitted") return c.json({ error: "not_recallable" }, 409);

  await db.update(proposals).set({ status: "Drafted", recallReason: typeof body?.reason === "string" ? body.reason : null }).where(eq(proposals.id, proposal.id));
  return c.json({ ok: true });
});

const scheduleSchema = z.object({
  promotionalStart: z.string(),
  launchStart: z.string(),
  launchEnd: z.string(),
  noteName: z.string().min(1),
  noteMessage: z.string().optional(),
});

campaignManager.post("/proposals/:id/schedule", async (c) => {
  const parsed = scheduleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const promotionalStart = new Date(parsed.data.promotionalStart);
  const launchStart = new Date(parsed.data.launchStart);
  const launchEnd = new Date(parsed.data.launchEnd);
  if ([promotionalStart, launchStart, launchEnd].some((d) => Number.isNaN(d.getTime()))) return c.json({ error: "invalid_dates" }, 400);
  if (!(promotionalStart < launchStart && launchStart < launchEnd)) {
    return c.json({ error: "invalid_date_order", message: "Promotional start must be before launch start, which must be before launch end." }, 400);
  }

  const db = drizzle(c.env.DB);
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, c.req.param("id"))).limit(1);
  if (!proposal || !["Submitted", "Scheduled"].includes(proposal.status)) return c.json({ error: "not_schedulable" }, 409);

  await db
    .update(proposals)
    .set({
      status: "Scheduled",
      promotionalStart,
      launchStart,
      launchEnd,
      noteName: parsed.data.noteName,
      noteMessage: parsed.data.noteMessage,
      scheduledAt: new Date(),
    })
    .where(eq(proposals.id, proposal.id));

  await db.update(financingFacilities).set({ noteName: parsed.data.noteName, campaignStart: parsed.data.launchStart.slice(0, 10), campaignEnd: parsed.data.launchEnd.slice(0, 10) }).where(eq(financingFacilities.id, proposal.facilityId));

  return c.json({ ok: true });
});

campaignManager.post("/proposals/:id/cancel-schedule", async (c) => {
  const db = drizzle(c.env.DB);
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, c.req.param("id"))).limit(1);
  if (!proposal || proposal.status !== "Scheduled") return c.json({ error: "not_scheduled" }, 409);
  await db.update(proposals).set({ status: "Submitted", promotionalStart: null, launchStart: null, launchEnd: null }).where(eq(proposals.id, proposal.id));
  return c.json({ ok: true });
});

campaignManager.post("/proposals/:id/launch", async (c) => {
  const user = c.get("user");
  const db = drizzle(c.env.DB);
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, c.req.param("id"))).limit(1);
  if (!proposal || proposal.status !== "Scheduled") return c.json({ error: "not_scheduled" }, 409);

  const activated = await activateFacility(db, proposal.facilityId);
  if (!activated) return c.json({ error: "not_found" }, 404);
  await db.update(proposals).set({ status: "Launched", launchedAt: new Date() }).where(eq(proposals.id, proposal.id));
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    actorId: user.id,
    action: "proposal_launched",
    subjectType: "proposal",
    subjectId: proposal.id,
    metadataJson: JSON.stringify({ facilityId: proposal.facilityId }),
  });
  return c.json({ ok: true });
});

// ---- Notes (Functional Handbook s.4.4): facilities once live/ongoing. ----

const NOTE_STATUSES = ["Open", "Ongoing", "Completed", "Default"] as const;

campaignManager.get("/notes", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(financingFacilities).where(inArray(financingFacilities.status, [...NOTE_STATUSES])).orderBy(desc(financingFacilities.createdAt));
  return c.json({ notes: rows });
});

campaignManager.get("/notes/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, id)).limit(1);
  if (!facility) return c.json({ error: "not_found" }, 404);
  const schedule = await db.select().from(repaymentInstallments).where(eq(repaymentInstallments.facilityId, id)).orderBy(repaymentInstallments.installmentNo);
  const positions = await db
    .select({ investorId: holdings.investorId, amount: holdings.amountInvested, createdAt: holdings.createdAt, email: users.email, name: users.displayName })
    .from(holdings)
    .innerJoin(users, eq(holdings.investorId, users.id))
    .where(eq(holdings.facilityId, id));
  const fundedAmount = positions.reduce((s, p) => s + p.amount, 0);
  return c.json({ facility, schedule, positions, fundedAmount, uniqueInvestors: new Set(positions.map((p) => p.investorId)).size });
});

const disburseSchema = z.object({ disbursementDate: z.string() });

campaignManager.post("/notes/:id/disburse", async (c) => {
  const parsed = disburseSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const db = drizzle(c.env.DB);
  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, c.req.param("id"))).limit(1);
  if (!facility || facility.status !== "Open") return c.json({ error: "not_disbursable" }, 409);

  await db.update(financingFacilities).set({ status: "Ongoing", firstPaymentDate: parsed.data.disbursementDate }).where(eq(financingFacilities.id, facility.id));
  return c.json({ ok: true });
});

const paymentSchema = z.object({ installmentId: z.string() });

campaignManager.post("/notes/:id/payment", async (c) => {
  const parsed = paymentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const db = drizzle(c.env.DB);
  const [installment] = await db
    .select()
    .from(repaymentInstallments)
    .where(and(eq(repaymentInstallments.id, parsed.data.installmentId), eq(repaymentInstallments.facilityId, c.req.param("id"))))
    .limit(1);
  if (!installment) return c.json({ error: "not_found" }, 404);
  if (installment.status === "Paid") return c.json({ error: "already_paid" }, 409);

  await db.update(repaymentInstallments).set({ status: "Paid", paidAt: new Date() }).where(eq(repaymentInstallments.id, installment.id));

  const remaining = await db
    .select()
    .from(repaymentInstallments)
    .where(and(eq(repaymentInstallments.facilityId, c.req.param("id")), or(eq(repaymentInstallments.status, "Upcoming"), eq(repaymentInstallments.status, "Overdue"))));
  if (remaining.length === 0) {
    await db.update(financingFacilities).set({ status: "Completed" }).where(eq(financingFacilities.id, c.req.param("id")));
  }

  return c.json({ ok: true });
});

export default campaignManager;
