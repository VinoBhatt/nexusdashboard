import { Hono } from "hono";
import auth from "./routes/auth";
import investor from "./routes/investor";
import marketplace from "./routes/marketplace";
import portfolio from "./routes/portfolio";
import wallet from "./routes/wallet";
import statements from "./routes/statements";
import account from "./routes/account";
import exportRouter from "./routes/export";
import corporate from "./routes/corporate";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

app.route("/api/auth", auth);
app.route("/api/investor", investor);
app.route("/api/marketplace", marketplace);
app.route("/api/portfolio", portfolio);
app.route("/api/wallet", wallet);
app.route("/api/statements", statements);
app.route("/api/account", account);
app.route("/api/export", exportRouter);
app.route("/api/corporate", corporate);

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
