import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { financingFacilities, repaymentInstallments, alerts } from "../db/schema";
import { generateRepaymentSchedule } from "./repaymentSchedule";
import { runAutoInvestForNewFacility } from "./autoInvest";

type Db = ReturnType<typeof drizzle>;

/** Launching a proposal's note: flips the linked facility to Open, generates
 * its real repayment schedule, offers it to Auto Invest, and raises an
 * alert - the same real effect admin.ts's New Note Listing approval has,
 * just triggered by the campaign-manager launch-scheduling flow instead. */
export async function activateFacility(db: Db, facilityId: string): Promise<boolean> {
  const rows = await db.select().from(financingFacilities).where(eq(financingFacilities.id, facilityId)).limit(1);
  const facility = rows[0];
  if (!facility) return false;

  await db.update(financingFacilities).set({ status: "Open" }).where(eq(financingFacilities.id, facility.id));

  const schedule = generateRepaymentSchedule(facility.principalAmount, facility.ratePct, facility.tenorDays, facility.repaymentStructure);
  for (const installment of schedule) {
    await db.insert(repaymentInstallments).values({
      id: `${facility.id}-${installment.installmentNo}`,
      facilityId: facility.id,
      status: "Upcoming",
      ...installment,
    });
  }

  await runAutoInvestForNewFacility(db, { ...facility, status: "Open" });
  await db.insert(alerts).values({
    id: crypto.randomUUID(),
    message: `${facility.noteName ?? facility.id} is open for funding | RM${facility.principalAmount.toLocaleString()} | ${facility.tenorDays} days | ${facility.ratePct}% p.a.`,
    facilityId: facility.id,
  });

  return true;
}
