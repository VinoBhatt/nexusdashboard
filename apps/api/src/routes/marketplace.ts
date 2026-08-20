import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, or } from "drizzle-orm";
import { financingFacilities, secondaryListings, transactions } from "../db/schema";
import { requireAuth, type AuthedEnv } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { investInFacility } from "../lib/invest";

const marketplace = new Hono<AuthedEnv>();
marketplace.use("*", requireAuth, requireRole("retail"));

marketplace.get("/notes", async (c) => {
  const db = drizzle(c.env.DB);
  const mode = c.req.query("mode") === "secondary" ? "secondary" : "primary";

  if (mode === "secondary") {
    const rows = await db
      .select()
      .from(secondaryListings)
      .where(eq(secondaryListings.status, "Open"));
    return c.json({ mode, listings: rows });
  }

  const rows = await db
    .select()
    .from(financingFacilities)
    .where(or(eq(financingFacilities.status, "Open"), eq(financingFacilities.status, "Ongoing")));
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

const investSchema = z.object({ amount: z.number().positive() });

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

  const result = await investInFacility(db, user.id, facility, amount, "manual");
  if (!result.ok) return c.json({ error: result.error }, result.error === "not_found" ? 404 : 400);

  return c.json({ ok: true, holdingId: result.holdingId });
});

const buySchema = z.object({ units: z.number().positive() });

marketplace.post("/secondary/:id/buy", async (c) => {
  const user = c.get("user");
  const parsed = buySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);

  const db = drizzle(c.env.DB);
  const listingRows = await db
    .select()
    .from(secondaryListings)
    .where(and(eq(secondaryListings.id, c.req.param("id")), eq(secondaryListings.status, "Open")))
    .limit(1);
  const listing = listingRows[0];
  if (!listing) return c.json({ error: "not_found" }, 404);

  await db.update(secondaryListings).set({ status: "Sold" }).where(eq(secondaryListings.id, listing.id));
  await db.insert(transactions).values({
    id: crypto.randomUUID(),
    accountId: user.id,
    type: "Secondary Purchase",
    amount: -(listing.units * listing.pricePerUnit),
    status: "Confirmed",
    referenceJson: JSON.stringify({ listingId: listing.id }),
  });

  return c.json({ ok: true });
});

export default marketplace;
