import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { statements } from "./db/schema";
import { autoLaunchDueProposals } from "./lib/proposalLifecycle";
import type { Env } from "./index";

/** Runs on the Cron Trigger configured in wrangler.jsonc. Flips any
 * statement still "Generating" to "Ready" - the real background-job
 * boundary the rebuild plan called for, replacing the instant
 * client-triggered flip the app used through Phase 4. Also launches any
 * Scheduled proposal whose launch date/time has passed. */
export async function handleScheduled(env: Env): Promise<void> {
  const db = drizzle(env.DB);
  const pending = await db.select().from(statements).where(eq(statements.status, "Generating"));
  for (const statement of pending) {
    await db.update(statements).set({ status: "Ready", readyAt: new Date() }).where(eq(statements.id, statement.id));
  }
  await autoLaunchDueProposals(db);
}
