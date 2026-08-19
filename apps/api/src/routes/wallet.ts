import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { investorProfiles, deposits, withdrawals, transactions, documents } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const wallet = new Hono<AuthedEnv>();
wallet.use("*", requireAuth, requireRole("retail"));

const fpxSchema = z.object({ bank: z.string().min(1), amount: z.number().min(100) });

wallet.post("/deposit/fpx", async (c) => {
  const user = c.get("user");
  const parsed = fpxSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input", message: "Minimum FPX deposit is RM100." }, 400);
  const { bank, amount } = parsed.data;

  const db = drizzle(c.env.DB);
  const profileRows = await db.select().from(investorProfiles).where(eq(investorProfiles.userId, user.id)).limit(1);
  const profile = profileRows[0];
  if (!profile) return c.json({ error: "not_found" }, 404);

  await db.insert(deposits).values({
    id: crypto.randomUUID(),
    investorId: user.id,
    method: "fpx",
    amount,
    bank,
    status: "Confirmed",
  });
  await db
    .update(investorProfiles)
    .set({ cashBalance: profile.cashBalance + amount, totalDeposits: profile.totalDeposits + amount })
    .where(eq(investorProfiles.userId, user.id));
  await db.insert(transactions).values({
    id: crypto.randomUUID(),
    accountId: user.id,
    type: "FPX Deposit",
    amount,
    status: "Confirmed",
  });

  return c.json({ ok: true });
});

// Multipart: amount (form field), receipt (file, metadata only - no R2 yet)
wallet.post("/deposit/manual", async (c) => {
  const user = c.get("user");
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "invalid_input" }, 400);
  const amount = Number(form.get("amount"));
  const receiptField = form.get("receipt");
  if (!Number.isFinite(amount) || amount < 100) return c.json({ error: "invalid_input" }, 400);
  if (!receiptField || typeof receiptField === "string") return c.json({ error: "receipt_required" }, 400);
  const receipt = receiptField as File;

  const db = drizzle(c.env.DB);
  const docId = crypto.randomUUID();
  await db.insert(documents).values({
    id: docId,
    ownerId: user.id,
    docType: "Deposit Receipt",
    fileName: receipt.name,
    contentType: receipt.type,
    sizeBytes: receipt.size,
    status: "Pending",
  });
  await db.insert(deposits).values({
    id: crypto.randomUUID(),
    investorId: user.id,
    method: "manual",
    amount,
    reference: `INV-RT-${Math.floor(10000 + Math.random() * 89999)}`,
    receiptDocumentId: docId,
    status: "Pending",
  });
  const profileRows = await db.select().from(investorProfiles).where(eq(investorProfiles.userId, user.id)).limit(1);
  const profile = profileRows[0];
  await db
    .update(investorProfiles)
    .set({ totalDeposits: profile.totalDeposits + amount })
    .where(eq(investorProfiles.userId, user.id));
  await db.insert(transactions).values({
    id: crypto.randomUUID(),
    accountId: user.id,
    type: "Manual Deposit",
    amount,
    status: "Pending",
  });

  return c.json({ ok: true, message: "Manual deposit submitted for verification." });
});

wallet.post("/withdrawal", async (c) => {
  const user = c.get("user");
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "invalid_input" }, 400);
  const amount = Number(form.get("amount"));
  const reason = String(form.get("reason") ?? "");
  const proofField = form.get("proof");
  if (!Number.isFinite(amount) || amount < 1) return c.json({ error: "invalid_input" }, 400);
  if (!proofField || typeof proofField === "string") return c.json({ error: "proof_required" }, 400);
  const proof = proofField as File;

  const db = drizzle(c.env.DB);
  const profileRows = await db.select().from(investorProfiles).where(eq(investorProfiles.userId, user.id)).limit(1);
  const profile = profileRows[0];
  if (!profile) return c.json({ error: "not_found" }, 404);
  const fee = 1;
  if (amount + fee > profile.cashBalance) return c.json({ error: "insufficient_balance" }, 400);

  const docId = crypto.randomUUID();
  await db.insert(documents).values({
    id: docId,
    ownerId: user.id,
    docType: "Bank Statement / Proof",
    fileName: proof.name,
    contentType: proof.type,
    sizeBytes: proof.size,
    status: "Pending",
  });
  await db.insert(withdrawals).values({
    id: crypto.randomUUID(),
    investorId: user.id,
    amount,
    fee,
    netAmount: amount - fee,
    reason,
    proofDocumentId: docId,
    status: "Pending",
  });
  await db
    .update(investorProfiles)
    .set({ cashBalance: profile.cashBalance - amount - fee })
    .where(eq(investorProfiles.userId, user.id));
  await db.insert(transactions).values({
    id: crypto.randomUUID(),
    accountId: user.id,
    type: "Withdrawal",
    amount: -amount,
    status: "Pending",
  });

  return c.json({ ok: true, message: "Withdrawal request submitted. RM1 fee applied automatically." });
});

export default wallet;
