import { drizzle } from "drizzle-orm/d1";
import { notifications } from "../db/schema";

type Db = ReturnType<typeof drizzle>;
type NotificationType = (typeof notifications.$inferInsert)["type"];

/** One-line helper so mutating routes add a Notification Centre entry (Stage 3b) without repeating insert boilerplate. */
export function insertNotification(
  db: Db,
  params: { facilityId?: string | null; investorId?: string | null; corporateAccountId?: string | null; type: NotificationType; title: string; message: string }
) {
  return db.insert(notifications).values({
    id: crypto.randomUUID(),
    facilityId: params.facilityId ?? null,
    investorId: params.investorId ?? null,
    corporateAccountId: params.corporateAccountId ?? null,
    type: params.type,
    title: params.title,
    message: params.message,
  });
}
