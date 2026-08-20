import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc } from "drizzle-orm";
import { statements } from "../db/schema";
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

statementsRouter.get("/:id/download", async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get("user");
  const rows = await db
    .select()
    .from(statements)
    .where(eq(statements.id, c.req.param("id")))
    .limit(1);
  const statement = rows[0];
  if (!statement || statement.ownerId !== user.id) return c.json({ error: "not_found" }, 404);
  if (statement.status !== "Ready") return c.json({ error: "not_ready" }, 409);

  const csv = `Period,Type,Status\n${statement.periodLabel},${statement.type},${statement.status}\n`;
  return c.body(csv, 200, {
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment; filename="${statement.periodLabel.replace(/\s+/g, "-")}-statement.csv"`,
  });
});

export default statementsRouter;
