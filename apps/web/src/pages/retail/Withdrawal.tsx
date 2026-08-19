import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPostForm } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";

export default function Withdrawal() {
  const [amount, setAmount] = useState(50);
  const [reason, setReason] = useState("Personal liquidity");
  const [proof, setProof] = useState<File | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({
    queryKey: ["investor", "overview"],
    queryFn: () => apiGet<{ profile: { cashBalance: number } }>("/api/investor/overview"),
  });

  const withdraw = useMutation({
    mutationFn: () => {
      if (!proof) throw new Error("Please upload bank statement / proof.");
      const form = new FormData();
      form.set("amount", String(amount));
      form.set("reason", reason);
      form.set("proof", proof);
      return apiPostForm<{ message: string }>("/api/wallet/withdrawal", form);
    },
    onSuccess: (res) => {
      toast(res.message);
      qc.invalidateQueries({ queryKey: ["investor"] });
    },
    onError: (e: Error) => toast(e.message === "insufficient_balance" ? "Insufficient balance cash." : e.message),
  });

  return (
    <>
      <PageHeader title="Withdrawal" description="Withdraw to your designated bank account with RM1 fee." />
      <div className="card" style={{ overflow: "hidden", padding: 0 }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>Withdrawal</h3>
            <div className="sub">Withdraw from your balance cash to your designated bank account.</div>
          </div>
          <div style={{ fontWeight: 800 }}>Available Cash {money(data?.profile.cashBalance ?? 0)}</div>
        </div>
        <div className="grid cols-2" style={{ padding: 20, background: "#fbfdff" }}>
          <div className="card" style={{ boxShadow: "none" }}>
            <h3>Designated Bank Account</h3>
            <div className="stack">
              <div className="list-item">
                <div>
                  <b>Name</b>
                  <div className="sub">Joshua Kuan Chung Shearn</div>
                </div>
                <div>
                  <b>Bank</b>
                  <div className="sub">Hong Leong Bank</div>
                </div>
              </div>
              <div className="list-item">
                <div>
                  <b>Account Number</b>
                  <div className="sub">4678512231057496</div>
                </div>
                <div>
                  <b>Withdrawal Fee</b>
                  <div className="sub">RM 1.00</div>
                </div>
              </div>
            </div>
          </div>
          <div className="card" style={{ boxShadow: "none" }}>
            <div className="section-head">
              <h3>Withdrawal Request</h3>
              <span className="pill amber">RM 1 fee auto-applied</span>
            </div>
            <div className="stack">
              <div className="field">
                <label>Amount (min RM1)</label>
                <input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Reason for withdrawal</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option>Personal liquidity</option>
                  <option>Portfolio rebalancing</option>
                  <option>Emergency use</option>
                </select>
              </div>
              <div className="upload">
                <strong>{proof ? proof.name : "Upload bank statement / proof"}</strong>
                <div className="sub">Must clearly show account name and account number.</div>
                <input type="file" style={{ marginTop: 10 }} onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
              </div>
              <div className="banner-notice">
                <div>
                  <b>Net withdrawal after fee</b>
                  <span>{money(Math.max(0, amount - 1))}</span>
                </div>
                <div className="pill blue">Fee RM 1.00</div>
              </div>
              <button className="btn primary" disabled={withdraw.isPending} onClick={() => withdraw.mutate()}>
                Submit Withdrawal
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
