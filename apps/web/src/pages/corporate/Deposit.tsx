import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";

interface OverviewResponse {
  account: { cashBalance: number };
  myCorpRole: "maker" | "checker";
}

export default function CorporateDeposit() {
  const [amount, setAmount] = useState(1000);
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({
    queryKey: ["corporate", "overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/corporate/overview"),
  });

  const deposit = useMutation({
    mutationFn: () => apiPost("/api/corporate/deposit", { amount }),
    onSuccess: () => {
      toast(`Treasury credited ${money(amount)}.`);
      qc.invalidateQueries({ queryKey: ["corporate"] });
      qc.invalidateQueries({ queryKey: ["investor"] });
    },
    onError: (e: Error) => toast(e.message),
  });

  const myCorpRole = data?.myCorpRole;

  return (
    <>
      <PageHeader title="Deposit" description="Top up the shared treasury cash balance. Instant, no Checker approval needed." />
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
            <h3 style={{ margin: 0 }}>Treasury Deposit</h3>
            <div className="sub">Adds uncommitted cash the Maker can later propose to invest.</div>
          </div>
          <div style={{ fontWeight: 800 }}>Treasury Cash {money(data?.account.cashBalance ?? 0)}</div>
        </div>
        <div style={{ padding: 20, background: "#fbfdff" }}>
          {myCorpRole === "maker" ? (
            <div className="card" style={{ boxShadow: "none", maxWidth: 420 }}>
              <div className="field">
                <label>Deposit amount (MYR)</label>
                <input type="number" min={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              </div>
              <button className="btn primary" disabled={deposit.isPending} onClick={() => deposit.mutate()}>
                Deposit to Treasury
              </button>
            </div>
          ) : (
            <div className="sub">Only the Maker can deposit into the treasury.</div>
          )}
        </div>
      </div>
    </>
  );
}
