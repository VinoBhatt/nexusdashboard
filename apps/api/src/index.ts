import { Hono } from "hono";
import auth from "./routes/auth";
import investor from "./routes/investor";
import marketplace from "./routes/marketplace";
import portfolio from "./routes/portfolio";
import autoinvest from "./routes/autoinvest";
import alerts from "./routes/alerts";
import wallet from "./routes/wallet";
import statements from "./routes/statements";
import account from "./routes/account";
import activate from "./routes/activate";
import exportRouter from "./routes/export";
import corporate from "./routes/corporate";
import admin from "./routes/admin";
import issuer from "./routes/issuer";
import campaignManager from "./routes/campaignManager";
import regulatoryReporting from "./routes/regulatoryReporting";
import issuerRegulatory from "./routes/issuerRegulatory";
import mycifReporting from "./routes/mycifReporting";
import adminRepayments from "./routes/adminRepayments";
import adminBonusCredits from "./routes/adminBonusCredits";
import adminCommunications from "./routes/adminCommunications";
import adminTransactions from "./routes/adminTransactions";
import { handleScheduled } from "./scheduled";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

app.route("/api/auth", auth);
app.route("/api/investor", investor);
app.route("/api/marketplace", marketplace);
app.route("/api/portfolio", portfolio);
app.route("/api/autoinvest", autoinvest);
app.route("/api/alerts", alerts);
app.route("/api/wallet", wallet);
app.route("/api/statements", statements);
app.route("/api/account", account);
app.route("/api/activate", activate);
app.route("/api/export", exportRouter);
app.route("/api/corporate", corporate);
app.route("/api/admin", admin);
app.route("/api/issuer", issuer);
app.route("/api/campaign-manager", campaignManager);
app.route("/api/admin/regulatory", regulatoryReporting);
app.route("/api/admin/regulatory", issuerRegulatory);
app.route("/api/admin/mycif", mycifReporting);
app.route("/api/admin/repayments", adminRepayments);
app.route("/api/admin/bonus-credits", adminBonusCredits);
app.route("/api/admin/communications", adminCommunications);
app.route("/api/admin/transactions", adminTransactions);

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },
};
