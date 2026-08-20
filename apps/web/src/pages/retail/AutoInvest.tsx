import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { DataTable, type Column } from "../../components/data/DataTable";

interface Rule {
  investorId: string;
  enabled: boolean;
  minRatePct: number | null;
  maxTenorDays: number | null;
  riskTiers: string | null;
  amountPerNote: number;
  budgetCap: number | null;
  totalInvested: number;
  updatedAt: string | null;
}

interface HistoryRow {
  id: string;
  facilityId: string;
  issuerName: string;
  ratePct: number;
  amountInvested: number;
  status: "Ongoing" | "Completed" | "Default";
  createdAt: string;
}

const RISK_TIERS = ["A", "B+", "B", "C+", "C"];

const historyColumns: Column<HistoryRow>[] = [
  { key: "facilityId", label: "Facility", sortable: true },
  { key: "issuerName", label: "Issuer", sortable: true },
  { key: "ratePct", label: "Rate (p.a.)", sortable: true, render: (r) => `${r.ratePct}%` },
  { key: "amountInvested", label: "Invested", sortable: true, render: (r) => money(r.amountInvested) },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (r) => <span className={`status ${r.status === "Completed" ? "ok" : r.status === "Default" ? "default" : "pending"}`}>{r.status}</span>,
  },
  { key: "createdAt", label: "Invested On", sortable: true, render: (r) => new Date(r.createdAt).toLocaleDateString() },
];

export default function AutoInvest() {
  const [form, setForm] = useState<{
    enabled: boolean;
    minRatePct: string;
    maxTenorDays: string;
    riskTiers: string[];
    amountPerNote: string;
    budgetCap: string;
  }>({ enabled: false, minRatePct: "", maxTenorDays: "", riskTiers: [], amountPerNote: "100", budgetCap: "" });
  const toast = useToast();
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["autoinvest", "rule"], queryFn: () => apiGet<{ rule: Rule }>("/api/autoinvest/rule") });
  const { data: historyData } = useQuery({ queryKey: ["autoinvest", "history"], queryFn: () => apiGet<{ history: HistoryRow[] }>("/api/autoinvest/history") });

  useEffect(() => {
    if (!data) return;
    const r = data.rule;
    setForm({
      enabled: r.enabled,
      minRatePct: r.minRatePct?.toString() ?? "",
      maxTenorDays: r.maxTenorDays?.toString() ?? "",
      riskTiers: r.riskTiers ? r.riskTiers.split(",") : [],
      amountPerNote: r.amountPerNote.toString(),
      budgetCap: r.budgetCap?.toString() ?? "",
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiPut<{ rule: Rule }>("/api/autoinvest/rule", {
        enabled: form.enabled,
        minRatePct: form.minRatePct === "" ? null : Number(form.minRatePct),
        maxTenorDays: form.maxTenorDays === "" ? null : Number(form.maxTenorDays),
        riskTiers: form.riskTiers.length > 0 ? form.riskTiers : null,
        amountPerNote: Number(form.amountPerNote),
        budgetCap: form.budgetCap === "" ? null : Number(form.budgetCap),
      }),
    onSuccess: () => {
      toast("Auto Invest rule saved. Matching notes are invested immediately.");
      qc.invalidateQueries({ queryKey: ["autoinvest"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["investor"] });
    },
    onError: (e: Error) => toast(e.message),
  });

  function toggleTier(tier: string) {
    setForm((f) => ({ ...f, riskTiers: f.riskTiers.includes(tier) ? f.riskTiers.filter((t) => t !== tier) : [...f.riskTiers, tier] }));
  }

  if (!data) return <PageHeader title="Auto Invest" description="Loading…" />;
  const rule = data.rule;

  return (
    <>
      <PageHeader title="Auto Invest" description="Set your criteria once - matching notes are invested automatically." />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-head">
          <div>
            <h3>Auto Invest Rule</h3>
            <p>Runs immediately against open notes when saved, and again whenever a new note is approved.</p>
          </div>
          <span className={`pill ${form.enabled ? "green" : "blue"}`}>{form.enabled ? "Enabled" : "Disabled"}</span>
        </div>

        <label className="row" style={{ marginBottom: 16, gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          <span className="sub">Enable Auto Invest</span>
        </label>

        <div className="grid cols-2">
          <div className="field">
            <label>Minimum Profit Rate (% p.a.)</label>
            <input
              type="number"
              step="0.1"
              placeholder="No minimum"
              value={form.minRatePct}
              onChange={(e) => setForm({ ...form, minRatePct: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Maximum Tenor (days)</label>
            <input
              type="number"
              placeholder="No maximum"
              value={form.maxTenorDays}
              onChange={(e) => setForm({ ...form, maxTenorDays: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Amount per Note (RM)</label>
            <input type="number" min={1} value={form.amountPerNote} onChange={(e) => setForm({ ...form, amountPerNote: e.target.value })} />
          </div>
          <div className="field">
            <label>Budget Cap (RM)</label>
            <input
              type="number"
              min={1}
              placeholder="No cap"
              value={form.budgetCap}
              onChange={(e) => setForm({ ...form, budgetCap: e.target.value })}
            />
          </div>
        </div>

        <div className="field" style={{ marginTop: 6 }}>
          <label>Accepted Credit Risk Ratings (any if none selected)</label>
          <div className="row">
            {RISK_TIERS.map((tier) => (
              <button
                key={tier}
                type="button"
                className={`btn small ${form.riskTiers.includes(tier) ? "primary" : ""}`}
                onClick={() => toggleTier(tier)}
              >
                {tier}
              </button>
            ))}
          </div>
        </div>

        {rule && (
          <div className="banner-notice" style={{ marginTop: 16 }}>
            <div>
              <b>RM{rule.totalInvested.toFixed(2)} invested via Auto Invest so far</b>
              <span>{rule.budgetCap ? `Budget cap RM${rule.budgetCap.toFixed(2)}` : "No budget cap set"}</span>
            </div>
          </div>
        )}

        <button className="btn primary" style={{ marginTop: 14 }} disabled={save.isPending} onClick={() => save.mutate()}>
          Save Auto Invest Rule
        </button>
      </div>

      <div className="card">
        <div className="section-head">
          <h3>Auto Invest History</h3>
        </div>
        <DataTable columns={historyColumns} rows={historyData?.history ?? []} emptyMessage="No notes invested via Auto Invest yet." />
      </div>
    </>
  );
}
