import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, inArray, asc, desc } from "drizzle-orm";
import {
  issuerProfiles,
  financingFacilities,
  repaymentInstallments,
  transactions,
  documents,
  approvals,
  metricsSnapshots,
} from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const issuer = new Hono<AuthedEnv>();
issuer.use("*", requireAuth, requireRole("issuer"));

const KYB_DOC_TYPES = ["Certificate of Incorporation", "Latest Audited Financials", "Bank Statements (6 months)", "Director IC / Passport", "Board Resolution"];

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
  if (facilityIds.length > 0) {
    const installments = await db.select().from(repaymentInstallments).where(inArray(repaymentInstallments.facilityId, facilityIds));
    totalRepaid = installments.filter((i) => i.status === "Paid").reduce((s, i) => s + i.principalDue + i.profitDue - i.feeDue, 0);
    const upcoming = installments.filter((i) => i.status === "Upcoming").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (upcoming[0]) nextDue = { amount: upcoming[0].principalDue + upcoming[0].profitDue - upcoming[0].feeDue, dueDate: upcoming[0].dueDate, facilityId: upcoming[0].facilityId };
  }

  return c.json({
    profile,
    outstanding,
    totalDrawn,
    totalRepaid,
    activeFacilities: facilities.filter((f) => f.status === "Ongoing").length,
    nextDue,
    facilities,
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

const applySchema = z.object({
  financingType: z.enum(["Invoice Financing", "Contract Financing", "Working Capital"]),
  amount: z.number().min(1000),
  tenorDays: z.number().min(1),
  purpose: z.string().min(1).max(500),
});

issuer.post("/facilities/apply", async (c) => {
  const user = c.get("user");
  const parsed = applySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);

  const db = drizzle(c.env.DB);
  const [profile] = await db.select().from(issuerProfiles).where(eq(issuerProfiles.userId, user.id)).limit(1);
  if (!profile) return c.json({ error: "not_found" }, 404);

  const facilityId = `APP-${Date.now().toString(36).toUpperCase()}`;
  await db.insert(financingFacilities).values({
    id: facilityId,
    issuerUserId: user.id,
    productGroup: parsed.data.financingType,
    financingType: parsed.data.financingType,
    riskTier: "B",
    ratePct: 8,
    tenorDays: parsed.data.tenorDays,
    minInvestment: 100,
    maxInvestment: parsed.data.amount,
    principalAmount: parsed.data.amount,
    serviceFeePct: 8,
    issuerName: profile.companyName,
    status: "Pending Review",
    purpose: parsed.data.purpose,
  });
  await db.insert(approvals).values({
    id: crypto.randomUUID(),
    type: "New Note Listing",
    subjectType: "facility",
    subjectId: facilityId,
    applicantName: profile.companyName,
    riskLevel: "Standard",
  });

  return c.json({ ok: true, facilityId }, 201);
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
