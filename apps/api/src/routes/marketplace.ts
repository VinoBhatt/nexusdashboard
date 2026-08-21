import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, or, sql } from "drizzle-orm";
import { financingFacilities, secondaryListings, transactions, holdings, investorProfiles } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { investInFacility } from "../lib/invest";

const marketplace = new Hono<AuthedEnv>();
marketplace.use("*", requireAuth);

// Corporate accounts can browse notes too, but they invest through
// corporate.ts's maker-proposes/checker-approves order flow, not the two
// immediate-execution routes below (invest, secondary buy) - those stay
// retail-only, gated per-path instead of at the router level. Scoped via
// `.use(path, ...)` rather than passing the middleware inline to `.get()` -
// the latter breaks Hono's `:id` path-param type inference.
marketplace.use("/notes", requireRole("retail", "corporate"));
marketplace.use("/notes/:id", requireRole("retail", "corporate"));
marketplace.use("/notes/:id/invest", requireRole("retail"));
marketplace.use("/secondary/:id/buy", requireRole("retail"));

// Demo-friendly: a random subset each request, so reloading the page
// surfaces a different-feeling set of notes instead of the same static list.
const PRIMARY_NOTES_SHOWN = 8;

marketplace.get("/notes", async (c) => {
  const db = drizzle(c.env.DB);
  const mode = c.req.query("mode") === "secondary" ? "secondary" : "primary";

  if (mode === "secondary") {
    const rows = await db
      .select({
        id: secondaryListings.id,
        units: secondaryListings.units,
        pricePerUnit: secondaryListings.pricePerUnit,
        status: secondaryListings.status,
        facilityId: financingFacilities.id,
        noteName: financingFacilities.noteName,
        issuerName: financingFacilities.issuerName,
        ratePct: financingFacilities.ratePct,
        tenorDays: financingFacilities.tenorDays,
        daysElapsed: financingFacilities.daysElapsed,
        repaymentStructure: financingFacilities.repaymentStructure,
      })
      .from(secondaryListings)
      .innerJoin(holdings, eq(secondaryListings.holdingId, holdings.id))
      .innerJoin(financingFacilities, eq(holdings.facilityId, financingFacilities.id))
      .where(eq(secondaryListings.status, "Open"));
    return c.json({ mode, listings: rows });
  }

  const rows = await db
    .select()
    .from(financingFacilities)
    .where(or(eq(financingFacilities.status, "Open"), eq(financingFacilities.status, "Ongoing")))
    .orderBy(sql`RANDOM()`)
    .limit(PRIMARY_NOTES_SHOWN);
  return c.json({ mode, notes: rows });
});

marketplace.get("/notes/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select()
    .from(financingFacilities)
    .where(eq(financingFacilities.id, c.req.param("id")))
    .limit(1);
  if (!rows[0]) return c.json({ error: "not_found" }, 404);
  return c.json({ note: rows[0] });
});

const investSchema = z.object({ amount: z.number().min(100) });

marketplace.post("/notes/:id/invest", async (c) => {
  const user = c.get("user");
  const parsed = investSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const { amount } = parsed.data;

  const db = drizzle(c.env.DB);
  const facilityRows = await db
    .select()
    .from(financingFacilities)
    .where(eq(financingFacilities.id, c.req.param("id")))
    .limit(1);
  const facility = facilityRows[0];
  if (!facility) return c.json({ error: "not_found" }, 404);
  if (amount < facility.minInvestment) {
    return c.json({ error: "below_minimum", message: `Minimum investment for this note is RM${facility.minInvestment}.` }, 400);
  }
  if (amount > facility.maxInvestment) {
    return c.json({ error: "above_maximum", message: `Maximum investment for this note is RM${facility.maxInvestment}.` }, 400);
  }

  const result = await investInFacility(db, user.id, facility, amount, "manual");
  if (!result.ok) return c.json({ error: result.error }, result.error === "not_found" ? 404 : 400);

  return c.json({ ok: true, holdingId: result.holdingId, expectedReturn: +(amount * (1 + facility.ratePct / 100)).toFixed(2) });
});

const buySchema = z.object({ units: z.number().positive() });

marketplace.post("/secondary/:id/buy", async (c) => {
  const user = c.get("user");
  const parsed = buySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const { units: unitsToBuy } = parsed.data;

  const db = drizzle(c.env.DB);
  const rows = await db
    .select({ listing: secondaryListings, facilityId: holdings.facilityId })
    .from(secondaryListings)
    .innerJoin(holdings, eq(secondaryListings.holdingId, holdings.id))
    .where(and(eq(secondaryListings.id, c.req.param("id")), eq(secondaryListings.status, "Open")))
    .limit(1);
  const row = rows[0];
  if (!row) return c.json({ error: "not_found" }, 404);
  const { listing, facilityId } = row;
  if (unitsToBuy > listing.units) {
    return c.json({ error: "above_available", message: `Only ${listing.units} unit(s) are available in this listing.` }, 400);
  }
  const cost = unitsToBuy * listing.pricePerUnit;

  const profileRows = await db.select().from(investorProfiles).where(eq(investorProfiles.userId, user.id)).limit(1);
  const profile = profileRows[0];
  if (!profile) return c.json({ error: "not_found" }, 404);
  if (profile.cashBalance < cost) return c.json({ error: "insufficient_balance" }, 400);

  if (unitsToBuy === listing.units) {
    await db.update(secondaryListings).set({ status: "Sold" }).where(eq(secondaryListings.id, listing.id));
  } else {
    await db.update(secondaryListings).set({ units: listing.units - unitsToBuy }).where(eq(secondaryListings.id, listing.id));
  }

  // Ownership actually transfers to the buyer: a real holding, priced at
  // what they paid, receivable at full par (unitsToBuy) at maturity - the
  // gap between the two is the discount they bought at.
  const holdingId = crypto.randomUUID();
  await db.insert(holdings).values({
    id: holdingId,
    investorId: user.id,
    facilityId,
    status: "Ongoing",
    amountInvested: cost,
    expectedReturn: unitsToBuy,
    actualReturn: 0,
    eligibleForSale: true,
    source: "manual",
  });
  await db
    .update(investorProfiles)
    .set({ cashBalance: profile.cashBalance - cost, totalInvested: profile.totalInvested + cost, outstanding: profile.outstanding + cost })
    .where(eq(investorProfiles.userId, user.id));
  await db.insert(transactions).values({
    id: crypto.randomUUID(),
    accountId: user.id,
    type: "Secondary Purchase",
    amount: -cost,
    status: "Confirmed",
    referenceJson: JSON.stringify({ listingId: listing.id }),
  });

  return c.json({ ok: true, holdingId });
});

export default marketplace;
