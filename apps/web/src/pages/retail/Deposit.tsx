import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPostForm } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";

const BANKS = ["Maybank2u", "CIMB Clicks", "Public Bank", "Hong Leong Bank", "RHB Bank", "Bank Islam"];

export default function Deposit() {
  const [mode, setMode] = useState<"fpx" | "manual">("fpx");
  const [bank, setBank] = useState(BANKS[0]);
  const [fpxAmount, setFpxAmount] = useState(100);
  const [manualAmount, setManualAmount] = useState(100);
  const [receipt, setReceipt] = useState<File | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({
    queryKey: ["investor", "overview"],
    queryFn: () => apiGet<{ profile: { cashBalance: number } }>("/api/investor/overview"),
  });

  const fpx = useMutation({
    mutationFn: () => apiPost("/api/wallet/deposit/fpx", { bank, amount: fpxAmount }),
    onSuccess: () => {
      toast(`FPX deposit confirmed from ${bank}. Wallet credited ${money(fpxAmount)}.`);
      qc.invalidateQueries({ queryKey: ["investor"] });
    },
    onError: (e: Error) => toast(e.message),
  });

  const manual = useMutation({
    mutationFn: () => {
      if (!receipt) throw new Error("Please upload your transfer receipt.");
      const form = new FormData();
      form.set("amount", String(manualAmount));
      form.set("receipt", receipt);
      return apiPostForm("/api/wallet/deposit/manual", form);
    },
    onSuccess: () => {
      toast("Manual deposit submitted for verification.");
      qc.invalidateQueries({ queryKey: ["investor"] });
    },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <>
      <PageHeader title="Deposit" description="FPX online deposit and manual transfer deposit flow." />
      <div className="card" style={{ overflow: "hidden", padding: 0 }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>Deposit</h3>
            <div className="sub">Choose FPX for faster crediting, or manual transfer with receipt upload as fallback.</div>
          </div>
          <div style={{ fontWeight: 800 }}>Balance Cash {money(data?.profile.cashBalance ?? 0)}</div>
        </div>
        <div className="grid cols-2" style={{ padding: 20, background: "#fbfdff" }}>
          <div className="card" style={{ boxShadow: "none" }}>
            <div className="deposit-options">
              <button className={`deposit-option ${mode === "fpx" ? "active" : ""}`} onClick={() => setMode("fpx")}>
                <div className="icon">⚡</div>
                <b>FPX Online Deposit</b>
                <span>Bank redirect and instant confirmation.</span>
              </button>
              <button className={`deposit-option ${mode === "manual" ? "active" : ""}`} onClick={() => setMode("manual")}>
                <div className="icon">⛁</div>
                <b>Manual Transfer</b>
                <span>Transfer to trust account and upload receipt.</span>
              </button>
            </div>

            {mode === "fpx" ? (
              <div className="stack">
                <div className="field">
                  <label htmlFor="depositBank">Select bank</label>
                  <select id="depositBank" value={bank} onChange={(e) => setBank(e.target.value)}>
                    {BANKS.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="depositFpxAmount">Deposit amount (MYR)</label>
                  <input id="depositFpxAmount" type="number" min={100} value={fpxAmount} onChange={(e) => setFpxAmount(Number(e.target.value))} />
                </div>
                <button className="btn primary" disabled={fpx.isPending} onClick={() => fpx.mutate()}>
                  Continue with FPX
                </button>
              </div>
            ) : (
              <div className="stack">
                <div className="list-item">
                  <div>
                    <b>Beneficiary</b>
                    <div className="sub">Cofundr Client Trust Account</div>
                  </div>
                  <div>
                    <b>Bank</b>
                    <div className="sub">Hong Leong Bank</div>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="depositManualAmount">Deposit amount (MYR)</label>
                  <input id="depositManualAmount" type="number" min={100} value={manualAmount} onChange={(e) => setManualAmount(Number(e.target.value))} />
                </div>
                <div className="upload">
                  <label htmlFor="depositReceipt">
                    <strong>{receipt ? receipt.name : "Upload transfer receipt"}</strong>
                  </label>
                  <div className="sub">Accepted format: PDF, JPG, PNG</div>
                  <input id="depositReceipt" type="file" style={{ marginTop: 10 }} onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
                </div>
                <button className="btn primary" disabled={manual.isPending} onClick={() => manual.mutate()}>
                  Submit Manual Transfer for Verification
                </button>
              </div>
            )}
          </div>
          <div className="card" style={{ boxShadow: "none" }}>
            <h3>Deposit Status</h3>
            <div className="timeline">
              {mode === "fpx" ? (
                <>
                  <div className="step">
                    <b>1. Select bank and amount</b>
                  </div>
                  <div className="step">
                    <b>2. Redirect to bank authentication</b>
                  </div>
                  <div className="step">
                    <b>3. FPX return and wallet credit</b>
                  </div>
                </>
              ) : (
                <>
                  <div className="step">
                    <b>1. Transfer initiated</b>
                  </div>
                  <div className="step">
                    <b>2. Receipt under verification</b>
                  </div>
                  <div className="step">
                    <b>3. Wallet credit ready</b>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
