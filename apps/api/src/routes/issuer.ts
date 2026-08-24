import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, inArray, asc, desc, or } from "drizzle-orm";
import {
  issuerProfiles,
  financingFacilities,
  repaymentInstallments,
  transactions,
  documents,
  proposals,
  metricsSnapshots,
} from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { autoLaunchDueProposals } from "../lib/proposalLifecycle";

const issuer = new Hono<AuthedEnv>();
issuer.use("*", requireAuth, requireRole("issuer"));

const KYB_DOC_TYPES = ["Certificate of Incorporation", "Latest Audited Financials", "Bank Statements (6 months)", "Director IC / Passport", "Board Resolution"];

// Application supporting-document keys (Functional Handbook s.3.2). Metadata
// only (filename), same "no real storage yet" convention as `documents`.
const REQUIRED_APPLICATION_DOCS = [
  "craConsent",
  "declaration",
  "statutoryForm",
  "bankStatements",
  "auditedFinancials",
  "managementAccount",
  "supplierList",
  "customerList",
] as const;

interface BusinessInfo {
  otherProductName?: string;
  businessInsurance?: "Yes" | "No";
  otherP2PFinancing?: "Yes" | "No";
  annualSales?: number;
  employeeCount?: number;
  clientCount?: number;
  documents?: Record<string, string>;
}

function parseBusinessInfo(json: string | null): BusinessInfo {
  if (!json) return {};
  try {
    return JSON.parse(json) as BusinessInfo;
  } catch {
    return {};
  }
}

async function myFacilityIds(db: ReturnType<typeof drizzle>, userId: string) {
  const rows = await db.select({ id: financingFacilities.id }).from(financingFacilities).where(eq(financingFacilities.issuerUserId, userId));
  return rows.map((r) => r.id);
}

issuer.get("/overview", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const [profile] = await db.select().from(issuerProfiles).where(eq(issuerProfiles.userId, user.id)).limit(1);
  if (!profile) return c.json({ error: "not_found" }, 404);

  const facilities = await db.select().from(financingFacilities).where(eq(financingFacilities.issuerUserId, user.id));
  const facilityIds = facilities.map((f) => f.id);

  const outstanding = facilities.filter((f) => f.status === "Ongoing").reduce((s, f) => s + f.principalAmount, 0);
  const totalDrawn = facilities.filter((f) => ["Ongoing", "Completed", "Default"].includes(f.status)).reduce((s, f) => s + f.principalAmount, 0);

  let totalRepaid = 0;
  let nextDue: { amount: number; dueDate: string; facilityId: string } | null = null;
  // Repayment alert (Functional Handbook s.3.1): overdue or due within 3 days.
  const repaymentAlerts: { facilityId: string; dueDate: string; amount: number; daysUntilDue: number }[] = [];
  if (facilityIds.length > 0) {
    const installments = await db.select().from(repaymentInstallments).where(inArray(repaymentInstallments.facilityId, facilityIds));
    totalRepaid = installments.filter((i) => i.status === "Paid").reduce((s, i) => s + i.principalDue + i.profitDue - i.feeDue, 0);
    const upcoming = installments.filter((i) => i.status === "Upcoming").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (upcoming[0]) nextDue = { amount: upcoming[0].principalDue + upcoming[0].profitDue - upcoming[0].feeDue, dueDate: upcoming[0].dueDate, facilityId: upcoming[0].facilityId };

    const today = new Date().toISOString().slice(0, 10);
    for (const i of installments) {
      if (i.status !== "Upcoming" && i.status !== "Overdue") continue;
      const daysUntilDue = Math.round((new Date(i.dueDate).getTime() - new Date(today).getTime()) / 86400000);
      if (i.status === "Overdue" || daysUntilDue <= 3) {
        repaymentAlerts.push({ facilityId: i.facilityId, dueDate: i.dueDate, amount: i.principalDue + i.profitDue - i.feeDue, daysUntilDue });
      }
    }
    repaymentAlerts.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  }

  const pendingCount = facilityIds.length
    ? (await db.select({ id: proposals.id }).from(proposals).where(and(inArray(proposals.facilityId, facilityIds), eq(proposals.status, "Submitted")))).length
    : 0;

  return c.json({
    profile,
    outstanding,
    totalDrawn,
    totalRepaid,
    activeFacilities: facilities.filter((f) => f.status === "Ongoing").length,
    nextDue,
    facilities,
    repaymentAlerts,
    pendingProposalsCount: pendingCount,
  });
});

issuer.get("/chart/outstanding", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const rows = await db
    .select({ date: metricsSnapshots.snapshotDate, value: metricsSnapshots.value })
    .from(metricsSnapshots)
    .where(and(eq(metricsSnapshots.metricKey, "issuer_outstanding"), eq(metricsSnapshots.accountId, user.id)))
    .orderBy(metricsSnapshots.snapshotDate);
  return c.json({ points: rows });
});

issuer.get("/facilities", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(financingFacilities).where(eq(financingFacilities.issuerUserId, c.get("user").id)).orderBy(desc(financingFacilities.createdAt));
  return c.json({ facilities: rows });
});

// ---- Applications (Functional Handbook s.3.2): a multi-step draft wizard.
// Step 1 (Product Selection) creates the Draft row; steps 2-4 (Forms,
// Business Information, Supporting Documents) PATCH it; Submit validates
// everything and moves the facility to Pending Review, where it becomes
// visible to the campaign manager's Applications queue. ----

issuer.get("/applications", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(financingFacilities).where(eq(financingFacilities.issuerUserId, c.get("user").id)).orderBy(desc(financingFacilities.createdAt));
  return c.json({
    applications: rows.map((r) => ({ ...r, businessInfo: parseBusinessInfo(r.businessInfoJson) })),
  });
});

const startApplicationSchema = z.object({
  islamicConventional: z.enum(["Islamic", "Conventional"]),
  productFamily: z.string().min(1),
});

issuer.post("/applications", async (c) => {
  const user = c.get("user");
  const parsed = startApplicationSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);

  const db = drizzle(c.env.DB);
  const [profile] = await db.select().from(issuerProfiles).where(eq(issuerProfiles.userId, user.id)).limit(1);
  if (!profile) return c.json({ error: "not_found" }, 404);

  const facilityId = `APP-${Date.now().toString(36).toUpperCase()}`;
  await db.insert(financingFacilities).values({
    id: facilityId,
    issuerUserId: user.id,
    productGroup: parsed.data.productFamily,
    financingType: parsed.data.productFamily,
    islamicConventional: parsed.data.islamicConventional,
    riskTier: "B",
    ratePct: 8,
    tenorDays: 90,
    minInvestment: 100,
    maxInvestment: 100000,
    principalAmount: 100000,
    serviceFeePct: 8,
    issuerName: profile.companyName,
    status: "Draft",
  });

  return c.json({ ok: true, id: facilityId }, 201);
});

const patchApplicationSchema = z.object({
  islamicConventional: z.enum(["Islamic", "Conventional"]).optional(),
  productFamily: z.string().min(1).optional(),
  otherProductName: z.string().optional(),
  counterpartyName: z.string().optional(),
  counterpartyRegistration: z.string().optional(),
  amount: z.number().min(0).optional(),
  tenorDays: z.number().min(1).optional(),
  purpose: z.string().max(500).optional(),
  businessInsurance: z.enum(["Yes", "No"]).optional(),
  otherP2PFinancing: z.enum(["Yes", "No"]).optional(),
  annualSales: z.number().min(0).optional(),
  employeeCount: z.number().min(0).optional(),
  clientCount: z.number().min(0).optional(),
  documents: z.record(z.string(), z.string()).optional(),
});

async function loadOwnedDraft(db: ReturnType<typeof drizzle>, userId: string, id: string) {
  const rows = await db.select().from(financingFacilities).where(and(eq(financingFacilities.id, id), eq(financingFacilities.issuerUserId, userId))).limit(1);
  return rows[0] ?? null;
}

issuer.patch("/applications/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const parsed = patchApplicationSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);

  const db = drizzle(c.env.DB);
  const facility = await loadOwnedDraft(db, user.id, id);
  if (!facility) return c.json({ error: "not_found" }, 404);
  if (facility.status !== "Draft") return c.json({ error: "not_editable" }, 409);

  const { amount, tenorDays, purpose, productFamily, islamicConventional, counterpartyName, counterpartyRegistration, ...businessFields } = parsed.data;

  const facilityUpdate: Partial<typeof financingFacilities.$inferInsert> = {};
  if (amount !== undefined) facilityUpdate.principalAmount = amount;
  if (amount !== undefined) facilityUpdate.maxInvestment = amount;
  if (tenorDays !== undefined) facilityUpdate.tenorDays = tenorDays;
  if (purpose !== undefined) facilityUpdate.purpose = purpose;
  if (productFamily !== undefined) {
    facilityUpdate.productGroup = productFamily;
    facilityUpdate.financingType = productFamily;
  }
  if (islamicConventional !== undefined) facilityUpdate.islamicConventional = islamicConventional;
  if (counterpartyName !== undefined) facilityUpdate.counterpartyName = counterpartyName;
  if (counterpartyRegistration !== undefined) facilityUpdate.counterpartyRegistration = counterpartyRegistration;

  const hasBusinessFields = Object.values(businessFields).some((v) => v !== undefined);
  if (hasBusinessFields) {
    const current = parseBusinessInfo(facility.businessInfoJson);
    const merged: BusinessInfo = {
      ...current,
      ...(businessFields.businessInsurance !== undefined && { businessInsurance: businessFields.businessInsurance }),
      ...(businessFields.otherP2PFinancing !== undefined && { otherP2PFinancing: businessFields.otherP2PFinancing }),
      ...(businessFields.annualSales !== undefined && { annualSales: businessFields.annualSales }),
      ...(businessFields.employeeCount !== undefined && { employeeCount: businessFields.employeeCount }),
      ...(businessFields.clientCount !== undefined && { clientCount: businessFields.clientCount }),
      documents: businessFields.documents ? { ...current.documents, ...businessFields.documents } : current.documents,
    };
    facilityUpdate.businessInfoJson = JSON.stringify(merged);
  }

  if (Object.keys(facilityUpdate).length > 0) {
    await db.update(financingFacilities).set(facilityUpdate).where(eq(financingFacilities.id, id));
  }

  return c.json({ ok: true });
});

issuer.post("/applications/:id/submit", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const db = drizzle(c.env.DB);
  const facility = await loadOwnedDraft(db, user.id, id);
  if (!facility) return c.json({ error: "not_found" }, 404);
  if (facility.status !== "Draft") return c.json({ error: "not_editable" }, 409);

  const info = parseBusinessInfo(facility.businessInfoJson);
  const missing: string[] = [];
  if (!facility.principalAmount || facility.principalAmount < 1000) missing.push("Financing amount (minimum RM1,000)");
  if (!facility.purpose) missing.push("Purpose");
  if (!info.businessInsurance) missing.push("Business insurance answer");
  if (!info.otherP2PFinancing) missing.push("Other P2P financing answer");
  if (!info.annualSales) missing.push("Annual sales / turnover");
  if (!info.employeeCount) missing.push("Number of employees");
  if (!info.clientCount) missing.push("Number of clients");
  const requiredDocs = facility.financingType === "Working Capital" ? REQUIRED_APPLICATION_DOCS : [...REQUIRED_APPLICATION_DOCS, "specificFinanceDoc"];
  for (const doc of requiredDocs) {
    if (!info.documents?.[doc]) missing.push(`Document: ${doc}`);
  }
  if (missing.length > 0) {
    return c.json({ error: "incomplete", missing, message: `Incomplete: ${missing[0]}${missing.length > 1 ? ` (+${missing.length - 1} more)` : ""}` }, 400);
  }

  await db.update(financingFacilities).set({ status: "Pending Review" }).where(eq(financingFacilities.id, id));
  return c.json({ ok: true });
});

// ---- Proposals (issuer, read-only - Functional Handbook s.3.3): only
// Submitted, Scheduled and Launched proposals are visible; never Drafted. ----

issuer.get("/proposals", async (c) => {
  const db = drizzle(c.env.DB);
  await autoLaunchDueProposals(db);
  const ids = await myFacilityIds(db, c.get("user").id);
  if (ids.length === 0) return c.json({ proposals: [] });
  const rows = await db
    .select({
      id: proposals.id,
      facilityId: proposals.facilityId,
      status: proposals.status,
      promotionalStart: proposals.promotionalStart,
      launchStart: proposals.launchStart,
      launchEnd: proposals.launchEnd,
      noteName: proposals.noteName,
      createdAt: proposals.createdAt,
      facilityProduct: financingFacilities.financingType,
      facilityAmount: financingFacilities.principalAmount,
    })
    .from(proposals)
    .innerJoin(financingFacilities, eq(proposals.facilityId, financingFacilities.id))
    .where(and(inArray(proposals.facilityId, ids), or(eq(proposals.status, "Submitted"), eq(proposals.status, "Scheduled"), eq(proposals.status, "Launched"))))
    .orderBy(desc(proposals.createdAt));
  return c.json({ proposals: rows });
});

issuer.get("/proposals/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const ids = await myFacilityIds(db, c.get("user").id);
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, c.req.param("id"))).limit(1);
  if (!proposal || !ids.includes(proposal.facilityId) || proposal.status === "Drafted") return c.json({ error: "not_found" }, 404);
  const [facility] = await db.select().from(financingFacilities).where(eq(financingFacilities.id, proposal.facilityId)).limit(1);
  return c.json({
    proposal: { ...proposal, securities: proposal.securitiesJson ? JSON.parse(proposal.securitiesJson) : [], documents: proposal.documentsJson ? JSON.parse(proposal.documentsJson) : [] },
    facility,
  });
});

issuer.get("/repayments/schedule", async (c) => {
  const db = drizzle(c.env.DB);
  const ids = await myFacilityIds(db, c.get("user").id);
  if (ids.length === 0) return c.json({ schedule: [] });
  const rows = await db
    .select()
    .from(repaymentInstallments)
    .where(inArray(repaymentInstallments.facilityId, ids))
    .orderBy(asc(repaymentInstallments.dueDate));
  return c.json({ schedule: rows });
});

issuer.get("/repayments/history", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(transactions).where(eq(transactions.accountId, c.get("user").id)).orderBy(desc(transactions.occurredAt));
  return c.json({ history: rows });
});

issuer.get("/documents", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(documents).where(eq(documents.ownerId, c.get("user").id));
  const byType = new Map(rows.map((r) => [r.docType, r]));
  const checklist = KYB_DOC_TYPES.map((type) => byType.get(type) ?? { docType: type, status: "Action required" as const, fileName: null });
  return c.json({ documents: checklist });
});

issuer.post("/documents", async (c) => {
  const user = c.get("user");
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "invalid_input" }, 400);
  const docType = String(form.get("docType") ?? "");
  const fileField = form.get("file");
  if (!KYB_DOC_TYPES.includes(docType)) return c.json({ error: "invalid_doc_type" }, 400);
  if (!fileField || typeof fileField === "string") return c.json({ error: "file_required" }, 400);
  const file = fileField as File;

  const db = drizzle(c.env.DB);
  const existing = await db.select().from(documents).where(and(eq(documents.ownerId, user.id), eq(documents.docType, docType))).limit(1);
  if (existing[0]) {
    await db.update(documents).set({ fileName: file.name, contentType: file.type, sizeBytes: file.size, status: "Pending", uploadedAt: new Date() }).where(eq(documents.id, existing[0].id));
  } else {
    await db.insert(documents).values({ id: crypto.randomUUID(), ownerId: user.id, docType, fileName: file.name, contentType: file.type, sizeBytes: file.size, status: "Pending" });
  }
  return c.json({ ok: true, message: `${docType} submitted for review.` });
});

export default issuer;
