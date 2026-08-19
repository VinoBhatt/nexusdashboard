import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { holdings, financingFacilities, secondaryListings } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const portfolio = new Hono<AuthedEnv>();
portfolio.use("*", requireAuth, requireRole("retail"));

portfolio.get("/holdings", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const status = c.req.query("status");

  const rows = await db
    .select({
      id: holdings.id,
      status: holdings.status,
      amountInvested: holdings.amountInvested,
      expectedReturn: holdings.expectedReturn,
      actualReturn: holdings.actualReturn,
      eligibleForSale: holdings.eligibleForSale,
      facilityId: financingFacilities.id,
      issuerName: financingFacilities.issuerName,
      ratePct: financingFacilities.ratePct,
      tenorDays: financingFacilities.tenorDays,
      lastPaymentDate: financingFacilities.lastPaymentDate,
    })
    .from(holdings)
    .innerJoin(financingFacilities, eq(holdings.facilityId, financingFacilities.id))
    .where(
      status && status !== "All"
        ? and(eq(holdings.investorId, user.id), eq(holdings.status, status as "Ongoing" | "Completed" | "Default"))
        : eq(holdings.investorId, user.id)
    );

  return c.json({ holdings: rows });
});

portfolio.get("/holdings/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const rows = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.id, c.req.param("id")), eq(holdings.investorId, user.id)))
    .limit(1);
  if (!rows[0]) return c.json({ error: "not_found" }, 404);
  return c.json({ holding: rows[0] });
});

const listForSaleSchema = z.object({ units: z.number().positive(), price: z.number().positive() });

portfolio.post("/holdings/:id/list-for-sale", async (c) => {
  const user = c.get("user");
  const parsed = listForSaleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);

  const db = drizzle(c.env.DB);
  const rows = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.id, c.req.param("id")), eq(holdings.investorId, user.id)))
    .limit(1);
  const holding = rows[0];
  if (!holding) return c.json({ error: "not_found" }, 404);
  if (!holding.eligibleForSale) return c.json({ error: "not_eligible", message: "Defaulted notes cannot be sold." }, 400);

  const id = crypto.randomUUID();
  await db.insert(secondaryListings).values({
    id,
    holdingId: holding.id,
    sellerId: user.id,
    units: parsed.data.units,
    pricePerUnit: parsed.data.price,
    status: "Open",
  });
  return c.json({ ok: true, listingId: id });
});

export default portfolio;
