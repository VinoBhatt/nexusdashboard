import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";
import { SkeletonPage, QueryError } from "../../components/QueryState";

interface RetailProfile {
  kycStatus: string;
  totalDeposits: number;
  totalWithdrawals: number;
  totalInvested: number;
  outstanding: number;
  defaulted: number;
  cashBalance: number;
  annualisedYield: number;
  riskProfileTier: string | null;
  identificationType: string | null;
  identificationNumber: string | null;
  contactNumber: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}
interface KycProfile {
  fullName: string;
  icNumber: string | null;
  nationality: string | null;
  dob: string | null;
}
interface Holding {
  id: string;
  facilityId: string;
  noteName: string | null;
  issuerName: string;
  status: string;
  amountInvested: number;
  expectedReturn: number;
  actualReturn: number;
}
interface Transaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  occurredAt: string;
}
interface RetailDetail {
  type: "Retail";
  name: string;
  email: string;
  profile: RetailProfile;
  kycProfile: KycProfile | null;
  holdings: Holding[];
  recentTransactions: Transaction[];
}
interface CorporateAccount {
  companyName: string;
  nav: number;
  weightedYield: number;
  collectionRate: number;
  cashBalance: number;
  deployedFunds: number;
  realised: number;
  performing: number;
  overdue: number;
  defaulted: number;
  watchlist: number;
  makerCheckerEnabled: boolean;
}
interface CorporateUserRow {
  id: string;
  corpRole: "maker" | "checker";
  email: string;
  displayName: string;
}
interface Subwallet {
  id: string;
  name: string;
  deployedAmount: number;
  performancePct: number;
}
interface OrderRow {
  id: string;
  type: string;
  amount: number;
  status: string;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
}
interface CorporateDetail {
  type: "Corporate";
  name: string;
  account: CorporateAccount;
  corporateUsers: CorporateUserRow[];
  subwallets: Subwallet[];
  recentOrders: OrderRow[];
}
type Detail = RetailDetail | CorporateDetail;

const holdingColumns: Column<Holding>[] = [
  { key: "noteName", label: "Note", render: (r) => r.noteName ?? r.facilityId },
  { key: "issuerName", label: "Issuer" },
  { key: "status", label: "Status", render: (r) => <span className={`status ${r.status === "Ongoing" ? "pending" : r.status === "Completed" ? "ok" : "default"}`}>{r.status}</span> },
  { key: "amountInvested", label: "Invested", render: (r) => money(r.amountInvested) },
  { key: "expectedReturn", label: "Expected Return", render: (r) => money(r.expectedReturn) },
  { key: "actualReturn", label: "Actual Return", render: (r) => money(r.actualReturn) },
];
const transactionColumns: Column<Transaction>[] = [
  { key: "occurredAt", label: "Date", render: (r) => new Date(r.occurredAt).toLocaleString("en-MY") },
  { key: "type", label: "Type" },
  { key: "amount", label: "Amount", render: (r) => money(r.amount) },
  { key: "status", label: "Status", render: (r) => <span className={`status ${r.status === "Confirmed" || r.status === "Paid" ? "ok" : r.status === "Failed" ? "default" : "pending"}`}>{r.status}</span> },
];
const orderColumns: Column<OrderRow>[] = [
  { key: "createdAt", label: "Date", render: (r) => new Date(r.createdAt).toLocaleString("en-MY") },
  { key: "type", label: "Type" },
  { key: "amount", label: "Amount", render: (r) => money(r.amount) },
  { key: "status", label: "Status", render: (r) => <span className={`status ${r.status === "Approved" ? "ok" : r.status === "Rejected" ? "default" : "pending"}`}>{r.status}</span> },
];

export default function InvestorDetail() {
  const { investorId } = useParams<{ investorId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "investor-detail", investorId],
    queryFn: () => apiGet<Detail>(`/api/admin/investors/${investorId}`),
    enabled: !!investorId,
  });

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <>
      <PageHeader
        title={data.name}
        description={data.type === "Retail" ? data.email : "Corporate account"}
        actions={
          <button className="btn small" onClick={() => navigate("/app/investors")}>
            ← Back to Investors
          </button>
        }
      />

      {data.type === "Retail" ? (
        <>
          <div className="grid cols-2">
            <div className="card">
              <h3>Profile</h3>
              <dl className="kv">
                <dt>KYC Status</dt>
                <dd>
                  <span className={`status ${data.profile.kycStatus === "Verified" ? "ok" : data.profile.kycStatus === "Rejected" ? "default" : "pending"}`}>{data.profile.kycStatus}</span>
                </dd>
                <dt>Risk Tier</dt>
                <dd>{data.profile.riskProfileTier ?? "-"}</dd>
                <dt>Identification</dt>
                <dd>
                  {data.profile.identificationType ?? "-"} {data.profile.identificationNumber ?? ""}
                </dd>
                <dt>Full Name (KYC)</dt>
                <dd>{data.kycProfile?.fullName ?? "-"}</dd>
                <dt>Nationality</dt>
                <dd>{data.kycProfile?.nationality ?? "-"}</dd>
                <dt>Contact Number</dt>
                <dd>{data.profile.contactNumber ?? "-"}</dd>
                <dt>Bank</dt>
                <dd>
                  {data.profile.bankName ?? "-"} {data.profile.bankAccountNumber ?? ""}
                </dd>
                <dt>Address</dt>
                <dd>
                  {[data.profile.addressLine1, data.profile.city, data.profile.state, data.profile.country].filter(Boolean).join(", ") || "-"}
                </dd>
              </dl>
            </div>
            <div className="card">
              <h3>Portfolio</h3>
              <div className="mini-metrics">
                <div>
                  <span>Cash Balance</span>
                  <b>{money(data.profile.cashBalance)}</b>
                </div>
                <div>
                  <span>Total Invested</span>
                  <b>{money(data.profile.totalInvested)}</b>
                </div>
                <div>
                  <span>Outstanding</span>
                  <b>{money(data.profile.outstanding)}</b>
                </div>
                <div>
                  <span>Defaulted</span>
                  <b>{money(data.profile.defaulted)}</b>
                </div>
                <div>
                  <span>Total Deposits</span>
                  <b>{money(data.profile.totalDeposits)}</b>
                </div>
                <div>
                  <span>Total Withdrawals</span>
                  <b>{money(data.profile.totalWithdrawals)}</b>
                </div>
              </div>
              <div className="sub" style={{ marginTop: 10 }}>
                Annualised yield: {data.profile.annualisedYield.toFixed(2)}%
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3>Holdings</h3>
            <DataTable columns={holdingColumns} rows={data.holdings} emptyMessage="No holdings yet." />
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3>Recent Transactions</h3>
            <DataTable columns={transactionColumns} rows={data.recentTransactions} emptyMessage="No transactions yet." />
          </div>
        </>
      ) : (
        <>
          <div className="grid cols-2">
            <div className="card">
              <h3>Account</h3>
              <dl className="kv">
                <dt>NAV</dt>
                <dd>{money(data.account.nav)}</dd>
                <dt>Weighted Yield</dt>
                <dd>{data.account.weightedYield.toFixed(2)}%</dd>
                <dt>Collection Rate</dt>
                <dd>{data.account.collectionRate.toFixed(2)}%</dd>
                <dt>Maker-Checker</dt>
                <dd>{data.account.makerCheckerEnabled ? "Enabled" : "Disabled"}</dd>
              </dl>
            </div>
            <div className="card">
              <h3>Fund Status</h3>
              <div className="mini-metrics">
                <div>
                  <span>Cash Balance</span>
                  <b>{money(data.account.cashBalance)}</b>
                </div>
                <div>
                  <span>Deployed Funds</span>
                  <b>{money(data.account.deployedFunds)}</b>
                </div>
                <div>
                  <span>Performing</span>
                  <b>{money(data.account.performing)}</b>
                </div>
                <div>
                  <span>Overdue</span>
                  <b>{money(data.account.overdue)}</b>
                </div>
                <div>
                  <span>Defaulted</span>
                  <b>{money(data.account.defaulted)}</b>
                </div>
                <div>
                  <span>Watchlist</span>
                  <b>{money(data.account.watchlist)}</b>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3>Maker / Checker Users</h3>
            <div className="list">
              {data.corporateUsers.map((u) => (
                <div key={u.id} className="list-item">
                  <div>
                    <b>{u.displayName}</b>
                    <div className="sub">{u.email}</div>
                  </div>
                  <span className="pill blue">{u.corpRole}</span>
                </div>
              ))}
              {data.corporateUsers.length === 0 && <div className="sub">No maker/checker users.</div>}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3>Subwallets</h3>
            <div className="list">
              {data.subwallets.map((s) => (
                <div key={s.id} className="list-item">
                  <div>
                    <b>{s.name}</b>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div>{money(s.deployedAmount)}</div>
                    <div className="sub">{s.performancePct.toFixed(2)}% performance</div>
                  </div>
                </div>
              ))}
              {data.subwallets.length === 0 && <div className="sub">No subwallets.</div>}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3>Recent Orders</h3>
            <DataTable columns={orderColumns} rows={data.recentOrders} emptyMessage="No orders yet." />
          </div>
        </>
      )}
    </>
  );
}
