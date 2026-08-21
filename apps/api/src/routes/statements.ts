import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { statements, users, investorProfiles, transactions, corporateAccounts, holdings } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { generateTextPdf } from "../lib/pdf";
import { resolveCorporateContext } from "../auth/corporateContext";
import type { AuthedUser } from "../auth/session";

function fmt(amount: number): string {
  return `RM ${amount.toFixed(2)}`;
}

const statementsRouter = new Hono<AuthedEnv>();
statementsRouter.use("*", requireAuth, requireRole("retail", "corporate"));

statementsRouter.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");

  if (user.effectiveRole === "corporate") {
    const ctx = await resolveCorporateContext(c.env.DB, user.id);
    if (!ctx) return c.json({ error: "not_found" }, 404);
    const rows = await db
      .select()
      .from(statements)
      .where(eq(statements.corporateAccountId, ctx.corporateAccountId))
      .orderBy(desc(statements.createdAt));
    return c.json({ statements: rows });
  }

  const rows = await db
    .select()
    .from(statements)
    .where(eq(statements.ownerId, user.id))
    .orderBy(desc(statements.createdAt));
  return c.json({ statements: rows });
});

const generateSchema = z.object({ period: z.string().min(1), type: z.enum(["Monthly", "Annual"]) });

statementsRouter.post("/generate", async (c) => {
  const user = c.get("user");
  const parsed = generateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);

  const db = drizzle(c.env.DB);
  const id = crypto.randomUUID();

  let corporateAccountId: string | null = null;
  if (user.effectiveRole === "corporate") {
    const ctx = await resolveCorporateContext(c.env.DB, user.id);
    if (!ctx) return c.json({ error: "not_found" }, 404);
    corporateAccountId = ctx.corporateAccountId;
  }

  await db.insert(statements).values({
    id,
    ownerId: user.id,
    corporateAccountId,
    periodLabel: parsed.data.period,
    type: parsed.data.type,
    status: "Generating",
  });
  // Stays "Generating" - a Cron Trigger (see src/scheduled.ts) flips it
  // to "Ready" on its next run, matching how a real statement-rendering
  // job would actually behave instead of resolving instantly.
  return c.json({ ok: true, id });
});

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** "August 2026" / "FY 2026" -> the unix-second range that period covers,
 * so a statement's transactions and download reflect that real window
 * instead of a fixed placeholder. */
function periodRange(periodLabel: string, type: "Monthly" | "Annual"): { startTs: number; endTs: number } {
  const yearMatch = periodLabel.match(/\d{4}/);
  const year = yearMatch ? Number(yearMatch[0]) : new Date().getUTCFullYear();
  if (type === "Annual") {
    return { startTs: Math.floor(Date.UTC(year, 0, 1) / 1000), endTs: Math.floor(Date.UTC(year + 1, 0, 1) / 1000) - 1 };
  }
  const lower = periodLabel.toLowerCase();
  const monthIdx = MONTHS.findIndex((m) => lower.includes(m));
  const month = monthIdx >= 0 ? monthIdx : new Date().getUTCMonth();
  return { startTs: Math.floor(Date.UTC(year, month, 1) / 1000), endTs: Math.floor(Date.UTC(year, month + 1, 1) / 1000) - 1 };
}

async function loadStatementData(db: ReturnType<typeof drizzle>, statementId: string, user: AuthedUser, env: { DB: D1Database }) {
  const rows = await db.select().from(statements).where(eq(statements.id, statementId)).limit(1);
  const statement = rows[0];
  if (!statement) return { error: "not_found" as const };

  if (user.effectiveRole === "corporate") {
    const ctx = await resolveCorporateContext(env.DB, user.id);
    if (!ctx || statement.corporateAccountId !== ctx.corporateAccountId) return { error: "not_found" as const };
    if (statement.status !== "Ready") return { error: "not_ready" as const };

    const [account] = await db.select().from(corporateAccounts).where(eq(corporateAccounts.id, ctx.corporateAccountId)).limit(1);
    const { startTs, endTs } = periodRange(statement.periodLabel, statement.type);
    const txns = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.corporateAccountId, ctx.corporateAccountId),
          gte(transactions.occurredAt, new Date(startTs * 1000)),
          lte(transactions.occurredAt, new Date(endTs * 1000))
        )
      )
      .orderBy(transactions.occurredAt);
    const heldRows = await db.select().from(holdings).where(eq(holdings.corporateAccountId, ctx.corporateAccountId));
    const totalInvested = heldRows.reduce((sum, h) => sum + h.amountInvested, 0);
    const outstanding = heldRows.filter((h) => h.status === "Ongoing" || h.status === "Default").reduce((sum, h) => sum + h.amountInvested, 0);
    const allTxns = await db.select().from(transactions).where(eq(transactions.corporateAccountId, ctx.corporateAccountId));
    const totalDeposits = allTxns.filter((t) => t.type === "Treasury Deposit").reduce((sum, t) => sum + t.amount, 0);
    const totalWithdrawals = allTxns.filter((t) => t.type === "Corporate Withdrawal").reduce((sum, t) => sum + Math.abs(t.amount), 0);

    return {
      statement,
      holder: { displayName: account?.companyName ?? "Corporate Account", email: user.email },
      summary: {
        cashBalance: account?.cashBalance ?? 0,
        totalDeposits,
        totalWithdrawals,
        totalInvested,
        outstanding,
      },
      transactions: txns,
    };
  }

  if (statement.ownerId !== user.id) return { error: "not_found" as const };
  if (statement.status !== "Ready") return { error: "not_ready" as const };

  const [userRow] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const [profile] = await db.select().from(investorProfiles).where(eq(investorProfiles.userId, user.id)).limit(1);
  const { startTs, endTs } = periodRange(statement.periodLabel, statement.type);
  const txns = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, user.id), gte(transactions.occurredAt, new Date(startTs * 1000)), lte(transactions.occurredAt, new Date(endTs * 1000))))
    .orderBy(transactions.occurredAt);

  return {
    statement,
    holder: { displayName: userRow.displayName, email: userRow.email },
    summary: {
      cashBalance: profile?.cashBalance ?? 0,
      totalDeposits: profile?.totalDeposits ?? 0,
      totalWithdrawals: profile?.totalWithdrawals ?? 0,
      totalInvested: profile?.totalInvested ?? 0,
      outstanding: profile?.outstanding ?? 0,
    },
    transactions: txns,
  };
}

statementsRouter.get("/:id/view", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const result = await loadStatementData(db, c.req.param("id"), user, c.env);
  if ("error" in result) return c.json({ error: result.error }, result.error === "not_found" ? 404 : 409);
  return c.json(result);
});

statementsRouter.get("/:id/download", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const result = await loadStatementData(db, c.req.param("id"), user, c.env);
  if ("error" in result) return c.json({ error: result.error }, result.error === "not_found" ? 404 : 409);
  const { statement, holder, summary, transactions: txns } = result;

  const lines = [
    "COFUNDR ACCOUNT STATEMENT",
    `${statement.periodLabel} - ${statement.type} Statement`,
    "",
    `Account Holder: ${holder.displayName}`,
    `Email: ${holder.email}`,
    "",
    "SUMMARY",
    `Cash Balance:            ${fmt(summary.cashBalance)}`,
    `Total Deposits:          ${fmt(summary.totalDeposits)}`,
    `Total Withdrawals:       ${fmt(summary.totalWithdrawals)}`,
    `Total Invested:          ${fmt(summary.totalInvested)}`,
    `Outstanding Investment:  ${fmt(summary.outstanding)}`,
    "",
    "TRANSACTIONS FOR THIS PERIOD",
    "Date        Type                      Amount        Status",
    "----------------------------------------------------------",
    ...txns.map((t) => {
      const date = new Date(t.occurredAt).toISOString().slice(0, 10);
      const type = t.type.padEnd(24).slice(0, 24);
      const amount = (t.amount < 0 ? "-" : " ") + fmt(Math.abs(t.amount)).padStart(11);
      return `${date}  ${type}  ${amount}  ${t.status}`;
    }),
  ];
  if (txns.length === 0) lines.push("No transactions in this period.");

  const pdf = generateTextPdf(lines);
  return c.body(pdf, 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${statement.periodLabel.replace(/\s+/g, "-")}-statement.pdf"`,
  });
});

export default statementsRouter;
