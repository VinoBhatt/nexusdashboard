import { useQuery } from "@tanstack/react-query";
import { apiGet, downloadUrl } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";

interface Profile {
  cashBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalInvested: number;
  outstanding: number;
}
interface Activity {
  id: string;
  type: string;
  amount: number;
  status: string;
  occurredAt: string;
}

const columns: Column<Activity>[] = [
  { key: "occurredAt", label: "Date", sortable: true, render: (a) => new Date(a.occurredAt).toLocaleString() },
  { key: "type", label: "Type", sortable: true },
  {
    key: "amount",
    label: "Amount",
    sortable: true,
    render: (a) => `${a.amount < 0 ? "- " : ""}${money(Math.abs(a.amount))}`,
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (a) => <span className={`status ${a.status === "Confirmed" || a.status === "Paid" ? "ok" : "pending"}`}>{a.status}</span>,
  },
];

export default function AccountBalance() {
  const { data } = useQuery({
    queryKey: ["investor", "overview"],
    queryFn: () => apiGet<{ profile: Profile }>("/api/investor/overview"),
  });
  const { data: activities } = useQuery({
    queryKey: ["investor", "activities"],
    queryFn: () => apiGet<{ activities: Activity[] }>("/api/investor/activities"),
  });

  if (!data) return <PageHeader title="Account Balance" description="Loading…" />;
  const { profile } = data;

  return (
    <>
      <PageHeader
        title="Account Balance"
        description="Wallet balance and the full transaction ledger."
        actions={
          <a className="btn small" href={downloadUrl("/api/export/transactions.csv")}>
            Export CSV
          </a>
        }
      />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="metric green">
          <div className="label">Current Balance</div>
          <div className="value">{money(profile.cashBalance)}</div>
          <div className="hint">Available cash in your wallet.</div>
        </div>
        <div className="metric">
          <div className="label">Total Deposits</div>
          <div className="value">{money(profile.totalDeposits)}</div>
          <div className="hint">Lifetime deposits, FPX and manual.</div>
        </div>
        <div className="metric amber">
          <div className="label">Total Withdrawals</div>
          <div className="value">{money(profile.totalWithdrawals)}</div>
          <div className="hint">Lifetime withdrawals, fees included.</div>
        </div>
        <div className="metric">
          <div className="label">Outstanding Investment</div>
          <div className="value">{money(profile.outstanding)}</div>
          <div className="hint">Principal currently deployed in notes.</div>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <h3>Transaction Ledger</h3>
            <p>Every deposit, investment, repayment, withdrawal and fee affecting your balance.</p>
          </div>
        </div>
        <DataTable columns={columns} rows={activities?.activities ?? []} pageSize={12} emptyMessage="No transactions yet." />
      </div>
    </>
  );
}
