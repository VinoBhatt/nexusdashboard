import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { SkeletonPage, QueryError } from "../../components/QueryState";

interface OverviewResponse {
  account: { cashBalance: number };
  myCorpRole: "maker" | "checker";
}

export default function CorporateWithdrawal() {
  const [amount, setAmount] = useState(1000);
  const [reason, setReason] = useState("Portfolio rebalancing");
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["corporate", "overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/corporate/overview"),
  });

  const withdraw = useMutation({
    mutationFn: () => apiPost("/api/corporate/orders", { type: "Withdrawal", amount, reason }),
    onSuccess: () => {
      toast("Withdrawal proposed, pending checker approval.");
      qc.invalidateQueries({ queryKey: ["corporate"] });
    },
    onError: (e: Error) => toast(e.message === "insufficient_balance" ? "Withdrawal exceeds the treasury cash balance." : e.message),
  });

  const myCorpRole = data?.myCorpRole;

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader title="Withdrawal" description="Propose a treasury withdrawal. Requires Checker approval before funds leave the account." />
      <div className="card" style={{ overflow: "hidden", padding: 0 }}>
        <div
          style={{
            padding: "18px 20px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "center",
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Withdrawal Request</h3>
            <div className="sub">Debits the shared treasury cash balance once approved.</div>
          </div>
          <div style={{ fontWeight: 800 }}>Treasury Cash {money(data?.account.cashBalance ?? 0)}</div>
        </div>
        <div style={{ padding: 20, background: "var(--surface2)" }}>
          {myCorpRole === "maker" ? (
            <div className="card" style={{ boxShadow: "none", maxWidth: 420 }}>
              <div className="field">
                <label htmlFor="corpWithdrawalAmount">Amount (MYR)</label>
                <input id="corpWithdrawalAmount" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="corpWithdrawalReason">Reason for withdrawal</label>
                <select id="corpWithdrawalReason" value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option>Portfolio rebalancing</option>
                  <option>Operating expenses</option>
                  <option>Distribution to shareholders</option>
                </select>
              </div>
              <div className="banner-notice">
                <div>
                  <b>This request needs Checker sign-off</b>
                  <span>The Checker will see it in the Overview approvals queue.</span>
                </div>
                <div className="pill blue">Pending Checker</div>
              </div>
              <button className="btn primary" disabled={withdraw.isPending} onClick={() => withdraw.mutate()} style={{ marginTop: 12 }}>
                Submit Withdrawal Request
              </button>
            </div>
          ) : (
            <div className="sub">Only the Maker can propose a withdrawal. Approve pending requests from Overview.</div>
          )}
        </div>
      </div>
    </>
  );
}
