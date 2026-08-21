import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, downloadUrl } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";

interface Statement {
  id: string;
  periodLabel: string;
  type: string;
  status: "Generating" | "Ready";
}

interface StatementDetail {
  statement: Statement;
  holder: { displayName: string; email: string };
  summary: {
    cashBalance: number;
    totalDeposits: number;
    totalWithdrawals: number;
    totalInvested: number;
    outstanding: number;
  };
  transactions: { id: string; type: string; amount: number; status: string; occurredAt: string }[];
}

export default function Statements() {
  const qc = useQueryClient();
  const toast = useToast();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["statements"],
    queryFn: () => apiGet<{ statements: Statement[] }>("/api/statements"),
  });
  const { data: detail } = useQuery({
    queryKey: ["statements", "view", viewingId],
    queryFn: () => apiGet<StatementDetail>(`/api/statements/${viewingId}/view`),
    enabled: !!viewingId,
  });

  const generate = useMutation({
    mutationFn: () => apiPost("/api/statements/generate", { period: "August 2026", type: "Monthly" }),
    onSuccess: () => {
      toast("Monthly statement queued. It will be ready shortly.");
      qc.invalidateQueries({ queryKey: ["statements"] });
    },
  });

  return (
    <>
      <PageHeader title="Statements" description="Request, view and download monthly and annual account statements." />
      <div className="grid cols-2">
        <div className="card">
          <div className="section-head">
            <h3>Account Statements</h3>
          </div>
          <div className="list">
            {(data?.statements ?? []).map((s) => (
              <div key={s.id} className="list-item">
                <div>
                  <b>{s.periodLabel}</b>
                  <div className="sub">{s.type} statement</div>
                </div>
                <div className="row">
                  <span className={`status ${s.status === "Ready" ? "ok" : "pending"}`}>{s.status}</span>
                  {s.status === "Ready" && (
                    <button className="btn small" onClick={() => setViewingId(s.id)}>
                      View
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="section-head">
            <h3>Statement Queue</h3>
            <button className="btn small" disabled={generate.isPending} onClick={() => generate.mutate()}>
              Generate monthly
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                <tr>
                  <th>Period</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
                {(data?.statements ?? []).map((s) => (
                  <tr key={s.id}>
                    <td>{s.periodLabel}</td>
                    <td>{s.type}</td>
                    <td>
                      <span className={`status ${s.status === "Ready" ? "ok" : "pending"}`}>{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {viewingId && (
        <div className="modal show">
          <div className="modal-card" style={{ maxWidth: 620 }}>
            <div className="modal-head">
              <div>
                <h3>{detail ? `${detail.statement.periodLabel} Statement` : "Loading…"}</h3>
                {detail && (
                  <div className="sub">
                    {detail.statement.type} · {detail.holder.displayName} · {detail.holder.email}
                  </div>
                )}
              </div>
              <button className="close" onClick={() => setViewingId(null)} aria-label="Close">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="5" y1="5" x2="19" y2="19" />
                  <line x1="19" y1="5" x2="5" y2="19" />
                </svg>
              </button>
            </div>

            {detail && (
              <>
                <div className="mini-metrics">
                  <div>
                    <span>Cash Balance</span>
                    <b>{money(detail.summary.cashBalance)}</b>
                  </div>
                  <div>
                    <span>Total Deposits</span>
                    <b>{money(detail.summary.totalDeposits)}</b>
                  </div>
                  <div>
                    <span>Total Invested</span>
                    <b>{money(detail.summary.totalInvested)}</b>
                  </div>
                  <div>
                    <span>Outstanding Investment</span>
                    <b>{money(detail.summary.outstanding)}</b>
                  </div>
                </div>

                <div className="field" style={{ marginTop: 14 }}>
                  <label>Transactions for this period</label>
                  <div className="table-wrap">
                    <table className="table" style={{ minWidth: 0 }}>
                      <tbody>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>Status</th>
                        </tr>
                        {detail.transactions.map((t) => (
                          <tr key={t.id}>
                            <td>{new Date(t.occurredAt).toLocaleDateString()}</td>
                            <td>{t.type}</td>
                            <td>
                              {t.amount < 0 ? "- " : ""}
                              {money(Math.abs(t.amount))}
                            </td>
                            <td>{t.status}</td>
                          </tr>
                        ))}
                        {detail.transactions.length === 0 && (
                          <tr>
                            <td colSpan={4}>No transactions in this period.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <a className="btn" href={downloadUrl(`/api/statements/${viewingId}/download`)}>
                Download PDF
              </a>
              <button className="btn primary" onClick={() => setViewingId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
