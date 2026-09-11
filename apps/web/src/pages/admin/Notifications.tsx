import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { SkeletonPage, QueryError } from "../../components/QueryState";

interface Note {
  id: string;
  issuerName: string;
}
interface InvestorOption {
  id: string;
  name: string;
  type: "Retail" | "Corporate";
}
interface NotificationRow {
  id: string;
  facilityId: string | null;
  issuerName: string | null;
  investorId: string | null;
  investorName: string | null;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: number;
}

const TYPE_LABEL: Record<string, string> = {
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

export default function AdminNotifications() {
  const toast = useToast();
  const qc = useQueryClient();

  const [noteId, setNoteId] = useState("ALL");
  const [issuer, setIssuer] = useState("ALL");
  const [investorId, setInvestorId] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: notesData } = useQuery({
    queryKey: ["admin", "repayments"],
    queryFn: () => apiGet<{ notes: Note[] }>("/api/admin/repayments"),
  });
  const issuers = useMemo(() => [...new Set((notesData?.notes ?? []).map((n) => n.issuerName))], [notesData]);

  const { data: investorsData } = useQuery({
    queryKey: ["admin", "investors", "picker"],
    queryFn: () => apiGet<{ investors: InvestorOption[] }>("/api/admin/investors"),
  });
  const retailInvestors = useMemo(() => (investorsData?.investors ?? []).filter((i) => i.type === "Retail"), [investorsData]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "notifications", noteId, investorId, type, status, from, to],
    queryFn: () =>
      apiGet<{ notifications: NotificationRow[] }>(`/api/admin/notifications?${new URLSearchParams({ noteId, investorId, type, status, from, to }).toString()}`),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiPost("/api/admin/notifications/read-all", {}),
    onSuccess: () => {
      toast("All notifications marked read.");
      qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
      refetch();
    },
    onError: (e: Error) => toast(e.message),
  });

  const rows = useMemo(() => (data?.notifications ?? []).filter((row) => issuer === "ALL" || row.issuerName === issuer), [data, issuer]);

  if (isLoading) return <SkeletonPage />;
  if (isError || !data) return <QueryError onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Notification Centre"
        description="Role-appropriate workflow updates."
        actions={
          <button className="btn" onClick={() => markAllReadMutation.mutate()} disabled={markAllReadMutation.isPending}>
            Mark all read
          </button>
        }
      />
      <div className="card">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="notifNote">Note ID</label>
            <select id="notifNote" value={noteId} onChange={(e) => setNoteId(e.target.value)}>
              <option value="ALL">All notes</option>
              {(notesData?.notes ?? []).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="notifIssuer">Issuer</label>
            <select id="notifIssuer" value={issuer} onChange={(e) => setIssuer(e.target.value)}>
              <option value="ALL">All issuers</option>
              {issuers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="notifInvestor">Investor</label>
            <select id="notifInvestor" value={investorId} onChange={(e) => setInvestorId(e.target.value)}>
              <option value="ALL">All investors</option>
              {retailInvestors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="notifType">Notification Type</label>
            <select id="notifType" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="ALL">All types</option>
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="notifStatus">Status</label>
            <select id="notifStatus" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ALL">Read and unread</option>
              <option value="READ">Read</option>
              <option value="UNREAD">Unread</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="notifFrom">Date From</label>
            <input id="notifFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="notifTo">Date To</label>
            <input id="notifTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty-state">
            <strong>No matching notifications</strong>
            <p>Adjust the filters.</p>
          </div>
        ) : (
          <div className="list">
            {rows.map((row) => (
              <div key={row.id} className="list-item">
                <div>
                  <strong>
                    {row.title} {row.read ? "" : "· New"}
                  </strong>
                  <div className="sub">{TYPE_LABEL[row.type] ?? row.type}</div>
                  <div>{row.message}</div>
                  <div className="sub">
                    {[row.facilityId, row.issuerName, row.investorName].filter(Boolean).join(" · ")} · {new Date(row.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
