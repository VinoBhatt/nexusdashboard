import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { statements, users, investorProfiles, transactions } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const statementsRouter = new Hono<AuthedEnv>();
statementsRouter.use("*", requireAuth, requireRole("retail"));

statementsRouter.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
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
  await db.insert(statements).values({
    id,
    ownerId: user.id,
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

async function loadStatementData(db: ReturnType<typeof drizzle>, statementId: string, userId: string) {
  const rows = await db.select().from(statements).where(eq(statements.id, statementId)).limit(1);
  const statement = rows[0];
  if (!statement || statement.ownerId !== userId) return { error: "not_found" as const };
  if (statement.status !== "Ready") return { error: "not_ready" as const };

  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [profile] = await db.select().from(investorProfiles).where(eq(investorProfiles.userId, userId)).limit(1);
  const { startTs, endTs } = periodRange(statement.periodLabel, statement.type);
  const txns = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, userId), gte(transactions.occurredAt, new Date(startTs * 1000)), lte(transactions.occurredAt, new Date(endTs * 1000))))
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
  const result = await loadStatementData(db, c.req.param("id"), user.id);
  if ("error" in result) return c.json({ error: result.error }, result.error === "not_found" ? 404 : 409);
  return c.json(result);
});

statementsRouter.get("/:id/download", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const result = await loadStatementData(db, c.req.param("id"), user.id);
  if ("error" in result) return c.json({ error: result.error }, result.error === "not_found" ? 404 : 409);
  const { statement, holder, summary, transactions: txns } = result;

  const lines = [
    `Statement,${statement.periodLabel},${statement.type}`,
    `Account Holder,${holder.displayName},${holder.email}`,
    "",
    "Summary",
    `Cash Balance,${summary.cashBalance.toFixed(2)}`,
    `Total Deposits,${summary.totalDeposits.toFixed(2)}`,
    `Total Withdrawals,${summary.totalWithdrawals.toFixed(2)}`,
    `Total Invested,${summary.totalInvested.toFixed(2)}`,
    `Outstanding Investment,${summary.outstanding.toFixed(2)}`,
    "",
    "Transactions for this period",
    "Date,Type,Amount,Status",
    ...txns.map((t) => `${new Date(t.occurredAt).toISOString().slice(0, 10)},${t.type},${t.amount.toFixed(2)},${t.status}`),
  ];
  if (txns.length === 0) lines.push("No transactions in this period.");

  return c.body(lines.join("\n") + "\n", 200, {
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment; filename="${statement.periodLabel.replace(/\s+/g, "-")}-statement.csv"`,
  });
});

export default statementsRouter;
