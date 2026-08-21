import { drizzle } from "drizzle-orm/d1";
import { eq, and, lte } from "drizzle-orm";
import { proposals } from "../db/schema";
import { activateFacility } from "./facilityLaunch";

type Db = ReturnType<typeof drizzle>;

/** A Scheduled proposal launches itself once its launch date/time has
 * passed - checked both by the cron trigger (handleScheduled, every 5
 * minutes, matching the statements Generating->Ready pattern) and lazily
 * on every read of the proposals/notes lists, so the demo doesn't need to
 * wait for the next cron tick to see a just-scheduled note go live. */
export async function autoLaunchDueProposals(db: Db): Promise<void> {
  const due = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.status, "Scheduled"), lte(proposals.launchStart, new Date())));

  for (const proposal of due) {
    const activated = await activateFacility(db, proposal.facilityId);
    if (activated) {
      await db.update(proposals).set({ status: "Launched", launchedAt: new Date() }).where(eq(proposals.id, proposal.id));
    }
  }
}
