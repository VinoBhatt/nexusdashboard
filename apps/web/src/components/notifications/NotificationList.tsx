export interface NotificationRow {
  id: string;
  facilityId: string | null;
  issuerName: string | null;
  investorId: string | null;
  investorName: string | null;
  corporateAccountId: string | null;
  companyName: string | null;
  type: string;
  title: string;
  message: string;
  createdAt: number;
}

export const NOTIFICATION_TYPE_LABEL: Record<string, string> = {
  PAYMENT_RECORDED: "Payment Recorded",
  PAYMENT_ALLOCATED: "Payment Allocated",
  PAYOUT_COMPLETED: "Payout Completed",
  CHARGE_ADJUSTMENT_APPROVED: "Charge Adjustment Approved",
  SCHEDULE_ADJUSTED: "Schedule Adjusted",
  HELD_FUNDS_CREATED: "Held Funds Created",
  HELD_FUNDS_APPLIED: "Held Funds Applied",
  EARLY_SETTLEMENT_APPROVED: "Early Settlement Approved",
  PLATFORM_FEE_POLICY_UPDATED: "Platform Fee Policy Updated",
  BONUS_CREDIT_ISSUED: "Bonus Credit Issued",
  COMMUNICATION_SENT: "Communication Sent",
};

export function NotificationList({ rows }: { rows: NotificationRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <strong>No notifications yet</strong>
        <p>Updates about your notes and account will appear here.</p>
      </div>
    );
  }
  return (
    <div className="list">
      {rows.map((row) => (
        <div key={row.id} className="list-item">
          <div>
            <strong>{row.title}</strong>
            <div className="sub">{NOTIFICATION_TYPE_LABEL[row.type] ?? row.type}</div>
            <div>{row.message}</div>
            <div className="sub">
              {[row.facilityId, row.issuerName, row.companyName].filter(Boolean).join(" · ")} · {new Date(row.createdAt).toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
