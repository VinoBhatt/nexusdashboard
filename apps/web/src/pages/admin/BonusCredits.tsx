import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { DataTable, type Column } from "../../components/data/DataTable";
import { SkeletonPage, QueryError } from "../../components/QueryState";

interface InvestorOption {
  id: string;
  name: string;
  type: "Retail" | "Corporate";
}
interface BonusCreditRow {
  id: string;
  investorId: string;
  investorName: string;
  investorEmail: string;
  bonusType: string;
  amount: number;
  effectiveDate: string;
  reference: string | null;
  reason: string;
  createdAt: string;
}

const BONUS_TYPE_LABEL: Record<string, string> = {
  REFERRAL: "Referral",
  GOODWILL: "Goodwill",
  COMPENSATION: "Compensation",
  PROMOTIONAL: "Promotional",
  OTHER: "Other",
};

export default function AdminBonusCredits() {
  const toast = useToast();
  const qc = useQueryClient();

  const { data: investorsData } = useQuery({
    queryKey: ["admin", "investors", "picker"],
    queryFn: () => apiGet<{ investors: InvestorOption[] }>("/api/admin/investors"),
  });
  const retailInvestors = useMemo(() => (investorsData?.investors ?? []).filter((i) => i.type === "Retail"), [investorsData]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "bonus-credits"],
    queryFn: () => apiGet<{ bonusCredits: BonusCreditRow[] }>("/api/admin/bonus-credits"),
  });

  const [investorId, setInvestorId] = useState("");
  const [bonusType, setBonusType] = useState("GOODWILL");
  const [amount, setAmount] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");

  const submitMutation = useMutation({
    mutationFn: () =>
      apiPost("/api/admin/bonus-credits", {
        investorId,
        bonusType,
        amount: Number(amount),
        effectiveDate,
        reference: reference || undefined,
        reason,
      }),
    onSuccess: () => {
      toast("Bonus credit applied to investor's wallet.");
      setAmount("");
      setReference("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin", "bonus-credits"] });
      refetch();
    },
    onError: (e: Error) => toast(e.message),
  });

  const columns: Column<BonusCreditRow>[] = [
    { key: "investorName", label: "Investor", sortable: true, render: (r) => `${r.investorName} (${r.investorEmail})` },
    { key: "bonusType", label: "Type", sortable: true, render: (r) => BONUS_TYPE_LABEL[r.bonusType] ?? r.bonusType },
    { key: "amount", label: "Amount", sortable: true, render: (r) => money(r.amount) },
    { key: "effectiveDate", label: "Effective Date", sortable: true },
    { key: "reason", label: "Reason" },
  ];

  if (isLoading) return <SkeletonPage />;
  if (isError || !data) return <QueryError onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader title="Bonus Credits" description="Credit an investor's wallet directly - referral, goodwill, compensation or promotional." />
      <div className="card">
        <div className="stack">
          <div className="field">
            <label htmlFor="bcInvestor">Investor</label>
            <select id="bcInvestor" value={investorId} onChange={(e) => setInvestorId(e.target.value)}>
              <option value="">Select an investor…</option>
              {retailInvestors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bcType">Bonus type</label>
            <select id="bcType" value={bonusType} onChange={(e) => setBonusType(e.target.value)}>
              {Object.entries(BONUS_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bcAmount">Amount (RM)</label>
            <input id="bcAmount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bcEffectiveDate">Effective date</label>
            <input id="bcEffectiveDate" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bcReference">Reference (optional)</label>
            <input id="bcReference" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bcReason">Reason</label>
            <textarea id="bcReason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn primary"
              disabled={!investorId || !amount || !reason || submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
            >
              Apply Bonus Credit
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h3>Bonus Credit History</h3>
        </div>
        <DataTable columns={columns} rows={data.bonusCredits} emptyMessage="No bonus credits issued yet." />
      </div>
    </>
  );
}
