// Platform-wide transaction ledger (Stage 3a) - the real-data equivalent of
// the Module 5 prototype's admin-transactions page. Purely additive read
// queries over data already written by invest.ts, adminRepayments.ts's
// payout route, and adminBonusCredits.ts - no new tables. See
// idempotent-gliding-allen.md.
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { desc, eq } from "drizzle-orm";
import { facilityPayments, financingFacilities, transactions, users, investorPayoutLines, investorPayouts } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const adminTransactions = new Hono<AuthedEnv>();
adminTransactions.use("*", requireAuth, requireRole("admin"));

interface LedgerRow {
  scope: "ISSUER" | "INVESTOR" | "FEES";
  at: string;
  noteId: string | null;
  investorId: string | null;
  product: string | null;
  party: string;
  type: string;
  reference: string;
  amount: number;
  grossReturn?: number;
  platformFee?: number;
  sst?: number;
  netReturn?: number;
  status: string;
}

function parseFacilityId(referenceJson: string | null): string | null {
  if (!referenceJson) return null;
  try {
    const parsed = JSON.parse(referenceJson) as { facilityId?: string };
    return parsed.facilityId ?? null;
  } catch {
    return null;
  }
}

adminTransactions.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const tab = (c.req.query("tab") ?? "ALL").toUpperCase();
  const search = (c.req.query("search") ?? "").toLowerCase();
  const noteId = c.req.query("noteId");
  const investorId = c.req.query("investorId");
  const product = c.req.query("product");
  const status = c.req.query("status");
  const from = c.req.query("from");
  const to = c.req.query("to");

  const facilityRows = await db.select({ id: financingFacilities.id, issuerName: financingFacilities.issuerName, financingType: financingFacilities.financingType }).from(financingFacilities);
  const facilityById = new Map(facilityRows.map((f) => [f.id, f]));

  const rows: LedgerRow[] = [];

  if (tab === "ALL" || tab === "ISSUER") {
    const payments = await db.select().from(facilityPayments).orderBy(desc(facilityPayments.createdAt));
    rows.push(
      ...payments.map((p): LedgerRow => {
        const facility = facilityById.get(p.facilityId);
        return {
          scope: "ISSUER",
          at: new Date(p.createdAt).toISOString(),
          noteId: p.facilityId,
          investorId: null,
          product: facility?.financingType ?? null,
          party: facility?.issuerName ?? p.facilityId,
          type: "Issuer Payment",
          reference: p.paymentReference,
          amount: p.amount,
          status: p.payoutStatus,
        };
      })
    );
  }

  if (tab === "ALL" || tab === "INVESTOR") {
    const investorRows = await db
      .select({ id: transactions.id, accountId: transactions.accountId, type: transactions.type, amount: transactions.amount, status: transactions.status, referenceJson: transactions.referenceJson, occurredAt: transactions.occurredAt, name: users.displayName })
      .from(transactions)
      .innerJoin(users, eq(transactions.accountId, users.id))
      .orderBy(desc(transactions.occurredAt));
    rows.push(
      ...investorRows.map((t): LedgerRow => {
        const facilityId = parseFacilityId(t.referenceJson);
        const facility = facilityId ? facilityById.get(facilityId) : undefined;
        return {
          scope: "INVESTOR",
          at: new Date(t.occurredAt).toISOString(),
          noteId: facilityId,
          investorId: t.accountId,
          product: facility?.financingType ?? null,
          party: t.name,
          type: t.type,
          reference: t.id,
          amount: t.amount,
          status: t.status,
        };
      })
    );
  }

  if (tab === "ALL" || tab === "FEES") {
    const feeRows = await db
      .select({
        payoutId: investorPayoutLines.payoutId,
        investorId: investorPayoutLines.investorId,
        grossScheduledReturn: investorPayoutLines.grossScheduledReturn,
        grossLateReturn: investorPayoutLines.grossLateReturn,
        platformFee: investorPayoutLines.platformFee,
        sst: investorPayoutLines.sst,
        netReturn: investorPayoutLines.netReturn,
        status: investorPayoutLines.status,
        facilityId: investorPayouts.facilityId,
        createdAt: investorPayouts.createdAt,
        investorName: users.displayName,
      })
      .from(investorPayoutLines)
      .innerJoin(investorPayouts, eq(investorPayoutLines.payoutId, investorPayouts.id))
      .innerJoin(users, eq(investorPayoutLines.investorId, users.id))
      .orderBy(desc(investorPayouts.createdAt));
    rows.push(
      ...feeRows
        .filter((r) => r.platformFee > 0 || r.sst > 0)
        .map((r): LedgerRow => {
          const facility = facilityById.get(r.facilityId);
          return {
            scope: "FEES",
            at: new Date(r.createdAt).toISOString(),
            noteId: r.facilityId,
            investorId: r.investorId,
            product: facility?.financingType ?? null,
            party: r.investorName,
            type: "Platform Fee & SST",
            reference: r.payoutId,
            amount: r.platformFee + r.sst,
            grossReturn: r.grossScheduledReturn + r.grossLateReturn,
            platformFee: r.platformFee,
            sst: r.sst,
            netReturn: r.netReturn,
            status: r.status,
          };
        })
    );
  }

  const filtered = rows.filter((row) => {
    if (search && !`${row.noteId ?? ""} ${row.party} ${row.reference}`.toLowerCase().includes(search)) return false;
    if (noteId && noteId !== "ALL" && row.noteId !== noteId) return false;
    if (investorId && investorId !== "ALL" && row.investorId !== investorId) return false;
    if (product && product !== "ALL" && row.product !== product) return false;
    if (status && status !== "ALL" && row.status !== status) return false;
    if (from && row.at.slice(0, 10) < from) return false;
    if (to && row.at.slice(0, 10) > to) return false;
    return true;
  });

  filtered.sort((a, b) => b.at.localeCompare(a.at));

  return c.json({ rows: filtered });
});

export default adminTransactions;
