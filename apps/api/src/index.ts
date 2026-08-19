import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { platformStats } from "./db/schema";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

// Proves the full pipeline end-to-end: Worker -> Hono -> Drizzle -> D1.
app.get("/api/health", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(platformStats).all();
  return c.json({ ok: true, db: "connected", platformStats: rows });
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
