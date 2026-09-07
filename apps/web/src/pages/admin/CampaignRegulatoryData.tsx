import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { SkeletonPage, QueryError } from "../../components/QueryState";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface FacilityOption {
  id: string;
  noteName: string | null;
  issuerName: string;
  status: string;
}
interface FacilityDetail {
  id: string;
  campaignDescription: string | null;
  campaignApplicationDate: string | null;
  campaignApprovalDate: string | null;
  campaignUrl: string | null;
  campaignSector: string | null;
  sustainabilityCategory: string | null;
  typeOfInvestmentNotes: string | null;
  shariahAdviserName: string | null;
  purposeOfFundRaising: string | null;
  purposeOfFundRaisingOther: string | null;
  remark: string | null;
  isSaranaScheme: boolean | null;
  saranaFinancingOptions: string | null;
  saranaFinancingScope: string | null;
  targetFinancingAmount: number | null;
  financingSecurity: string | null;
  issuerInterestRateEffective: number | null;
  investorReturnRateSimple: number | null;
  investorReturnRateEffective: number | null;
  defaultClassification: string | null;
  defaultClassificationOther: string | null;
  actualDueRepaymentDate: string | null;
}
interface RRNote {
  id: string;
  rrCampaignId: string | null;
  interestRatePct: number | null;
  tenureOriginalMonths: number | null;
  tenureRRMonths: number | null;
  commencementDateRR: string | null;
  financingAmountOriginal: number | null;
  rrAmountRevised: number | null;
  rrPaymentStructure: string | null;
}
interface Settlement {
  paymentTo: string | null;
  fundDisbursementDate: string | null;
  settlementAmount: number | null;
  fundRefundedDate: string | null;
  remark: string | null;
}

const TEXT_FIELDS: { key: keyof FacilityDetail; label: string }[] = [
  { key: "campaignDescription", label: "Campaign Description" },
  { key: "campaignApplicationDate", label: "Application Date (YYYY-MM-DD)" },
  { key: "campaignApprovalDate", label: "Approval Date (YYYY-MM-DD)" },
  { key: "campaignUrl", label: "Campaign URL" },
  { key: "campaignSector", label: "Campaign Sector" },
  { key: "sustainabilityCategory", label: "Sustainability Category" },
  { key: "typeOfInvestmentNotes", label: "Type of Investment Notes" },
  { key: "shariahAdviserName", label: "Shariah Adviser Name" },
  { key: "purposeOfFundRaising", label: "Purpose of Fund Raising" },
  { key: "purposeOfFundRaisingOther", label: "Purpose of Fund Raising (Other)" },
  { key: "saranaFinancingOptions", label: "SARANA Financing Options" },
  { key: "saranaFinancingScope", label: "SARANA Financing Scope" },
  { key: "financingSecurity", label: "Financing Security" },
  { key: "defaultClassification", label: "Default Classification" },
  { key: "defaultClassificationOther", label: "Default Classification (Other)" },
  { key: "actualDueRepaymentDate", label: "Actual Due Repayment Date (YYYY-MM-DD)" },
  { key: "remark", label: "Remark" },
];
const NUMBER_FIELDS: { key: keyof FacilityDetail; label: string }[] = [
  { key: "targetFinancingAmount", label: "Target Financing Amount (RM)" },
  { key: "issuerInterestRateEffective", label: "Issuer Interest Rate - Effective (%)" },
  { key: "investorReturnRateSimple", label: "Investor Return Rate - Simple (%)" },
  { key: "investorReturnRateEffective", label: "Investor Return Rate - Effective (%)" },
];

function CampaignFieldsForm({ facilityId }: { facilityId: string }) {
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "regulatory", "facility", facilityId],
    queryFn: () => apiGet<{ item: FacilityDetail }>(`/api/admin/regulatory/facilities/${facilityId}`),
  });
  const [form, setForm] = useState<Record<string, string>>({});
  const [isSarana, setIsSarana] = useState(false);

  useEffect(() => {
    if (data?.item) {
      const next: Record<string, string> = {};
      for (const f of [...TEXT_FIELDS, ...NUMBER_FIELDS]) next[f.key] = data.item[f.key] != null ? String(data.item[f.key]) : "";
      setForm(next);
      setIsSarana(!!data.item.isSaranaScheme);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { isSaranaScheme: isSarana };
      for (const f of TEXT_FIELDS) body[f.key] = form[f.key] || null;
      for (const f of NUMBER_FIELDS) body[f.key] = form[f.key] ? Number(form[f.key]) : null;
      return apiPut(`/api/admin/regulatory/facilities/${facilityId}/campaign-fields`, body);
    },
    onSuccess: () => toast("Campaign fields updated."),
    onError: (e: Error) => toast(e.message),
  });

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-head">
        <div>
          <h3>Campaign &amp; Financing Detail</h3>
          <p>SC RMO P2P Report [03000]/[03100]/[11000] - supplementary campaign fields not captured at application intake.</p>
        </div>
      </div>
      <div className="field" style={{ maxWidth: 220, marginBottom: 14 }}>
        <label htmlFor="campaign-isSarana">SARANA Scheme</label>
        <select id="campaign-isSarana" value={isSarana ? "yes" : "no"} onChange={(e) => setIsSarana(e.target.value === "yes")}>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </div>
      <div className="grid cols-3">
        {TEXT_FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`campaign-${f.key}`}>{f.label}</label>
            <input id={`campaign-${f.key}`} value={form[f.key] ?? ""} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />
          </div>
        ))}
        {NUMBER_FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`campaign-${f.key}`}>{f.label}</label>
            <input id={`campaign-${f.key}`} type="number" value={form[f.key] ?? ""} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>
          Save Campaign Detail
        </button>
      </div>
    </div>
  );
}

function RRSection({ facilityId }: { facilityId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const queryKey = ["admin", "regulatory", "rr", facilityId];
  const { data, isLoading, isError, refetch } = useQuery({ queryKey, queryFn: () => apiGet<{ items: RRNote[] }>(`/api/admin/regulatory/facilities/${facilityId}/rr`) });
  const [form, setForm] = useState<Record<string, string>>({});
  const [removeId, setRemoveId] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        rrCampaignId: form.rrCampaignId || null,
        commencementDateRR: form.commencementDateRR || null,
        rrPaymentStructure: form.rrPaymentStructure || null,
      };
      for (const key of ["interestRatePct", "tenureOriginalMonths", "tenureRRMonths", "financingAmountOriginal", "rrAmountRevised"]) {
        body[key] = form[key] ? Number(form[key]) : null;
      }
      return apiPost(`/api/admin/regulatory/facilities/${facilityId}/rr`, body);
    },
    onSuccess: () => {
      toast("R&R record added.");
      qc.invalidateQueries({ queryKey });
      setForm({});
    },
    onError: (e: Error) => toast(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/regulatory/rr/${id}`),
    onSuccess: () => {
      toast("R&R record removed.");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast(e.message),
  });

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-head">
        <div>
          <h3>Reschedule &amp; Restructure Notes</h3>
          <p>Record a reschedule/restructure event for this note.</p>
        </div>
      </div>
      <div className="list" style={{ marginBottom: 16 }}>
        {(data?.items ?? []).map((r) => (
          <div key={r.id} className="list-item">
            <div>
              <b>{r.rrCampaignId ?? r.id}</b>
              <div className="sub">
                {r.tenureOriginalMonths ?? "-"} mo → {r.tenureRRMonths ?? "-"} mo · Revised amount {r.rrAmountRevised ?? "-"}
              </div>
            </div>
            <button className="btn small danger" onClick={() => setRemoveId(r.id)}>
              Remove
            </button>
          </div>
        ))}
        {(data?.items ?? []).length === 0 && <div className="sub">No R&amp;R records for this note yet.</div>}
      </div>
      <div className="grid cols-3">
        <div className="field">
          <label htmlFor="rr-rrCampaignId">R&amp;R Campaign ID</label>
          <input id="rr-rrCampaignId" value={form.rrCampaignId ?? ""} onChange={(e) => setForm((s) => ({ ...s, rrCampaignId: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="rr-interestRatePct">Rate %</label>
          <input id="rr-interestRatePct" type="number" value={form.interestRatePct ?? ""} onChange={(e) => setForm((s) => ({ ...s, interestRatePct: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="rr-tenureOriginalMonths">Original Tenure (months)</label>
          <input id="rr-tenureOriginalMonths" type="number" value={form.tenureOriginalMonths ?? ""} onChange={(e) => setForm((s) => ({ ...s, tenureOriginalMonths: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="rr-tenureRRMonths">R&amp;R Tenure (months)</label>
          <input id="rr-tenureRRMonths" type="number" value={form.tenureRRMonths ?? ""} onChange={(e) => setForm((s) => ({ ...s, tenureRRMonths: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="rr-commencementDateRR">R&amp;R Commencement (YYYY-MM-DD)</label>
          <input id="rr-commencementDateRR" value={form.commencementDateRR ?? ""} onChange={(e) => setForm((s) => ({ ...s, commencementDateRR: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="rr-financingAmountOriginal">Original Financing Amount (RM)</label>
          <input id="rr-financingAmountOriginal" type="number" value={form.financingAmountOriginal ?? ""} onChange={(e) => setForm((s) => ({ ...s, financingAmountOriginal: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="rr-rrAmountRevised">Revised Amount (RM)</label>
          <input id="rr-rrAmountRevised" type="number" value={form.rrAmountRevised ?? ""} onChange={(e) => setForm((s) => ({ ...s, rrAmountRevised: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="rr-rrPaymentStructure">Payment Structure</label>
          <input id="rr-rrPaymentStructure" value={form.rrPaymentStructure ?? ""} onChange={(e) => setForm((s) => ({ ...s, rrPaymentStructure: e.target.value }))} />
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={add.isPending} onClick={() => add.mutate()}>
          Add R&amp;R Record
        </button>
      </div>
      <ConfirmDialog
        open={!!removeId}
        title="Remove this R&R record?"
        description="This removes the record from the regulatory reporting data set."
        confirmLabel="Remove"
        danger
        onCancel={() => setRemoveId(null)}
        onConfirm={() => {
          if (removeId) remove.mutate(removeId);
          setRemoveId(null);
        }}
      />
    </div>
  );
}

function SettlementSection({ facilityId }: { facilityId: string }) {
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "regulatory", "settlement", facilityId],
    queryFn: () => apiGet<{ item: Settlement | null }>(`/api/admin/regulatory/facilities/${facilityId}/settlement`),
  });
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm({
      paymentTo: data?.item?.paymentTo ?? "",
      fundDisbursementDate: data?.item?.fundDisbursementDate ?? "",
      settlementAmount: data?.item?.settlementAmount != null ? String(data.item.settlementAmount) : "",
      fundRefundedDate: data?.item?.fundRefundedDate ?? "",
      remark: data?.item?.remark ?? "",
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiPut(`/api/admin/regulatory/facilities/${facilityId}/settlement`, {
        paymentTo: form.paymentTo || null,
        fundDisbursementDate: form.fundDisbursementDate || null,
        settlementAmount: form.settlementAmount ? Number(form.settlementAmount) : null,
        fundRefundedDate: form.fundRefundedDate || null,
        remark: form.remark || null,
      }),
    onSuccess: () => toast("Settlement record saved."),
    onError: (e: Error) => toast(e.message),
  });

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-head">
        <div>
          <h3>Campaign Settlement</h3>
          <p>SC RMO P2P Report [04500] - fund disbursement/refund detail for this note.</p>
        </div>
      </div>
      <div className="grid cols-3">
        <div className="field">
          <label htmlFor="settlement-paymentTo">Payment To</label>
          <select id="settlement-paymentTo" value={form.paymentTo ?? ""} onChange={(e) => setForm((s) => ({ ...s, paymentTo: e.target.value }))}>
            <option value="">-</option>
            <option value="Issuer">Issuer</option>
            <option value="Investor">Investor</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="settlement-fundDisbursementDate">Fund Disbursement Date (YYYY-MM-DD)</label>
          <input id="settlement-fundDisbursementDate" value={form.fundDisbursementDate ?? ""} onChange={(e) => setForm((s) => ({ ...s, fundDisbursementDate: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="settlement-settlementAmount">Settlement Amount (RM)</label>
          <input id="settlement-settlementAmount" type="number" value={form.settlementAmount ?? ""} onChange={(e) => setForm((s) => ({ ...s, settlementAmount: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="settlement-fundRefundedDate">Fund Refunded Date (YYYY-MM-DD)</label>
          <input id="settlement-fundRefundedDate" value={form.fundRefundedDate ?? ""} onChange={(e) => setForm((s) => ({ ...s, fundRefundedDate: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="settlement-remark">Remark</label>
          <input id="settlement-remark" value={form.remark ?? ""} onChange={(e) => setForm((s) => ({ ...s, remark: e.target.value }))} />
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>
          Save Settlement
        </button>
      </div>
    </div>
  );
}

export default function CampaignRegulatoryData() {
  const [facilityId, setFacilityId] = useState<string>("");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "regulatory", "facilities-picker"],
    queryFn: () => apiGet<{ items: FacilityOption[] }>("/api/admin/regulatory/facilities"),
  });

  useEffect(() => {
    if (!facilityId && data?.items?.length) setFacilityId(data.items[0].id);
  }, [data, facilityId]);

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader title="Campaign Regulatory Data" description="Supplementary campaign detail required for SC RMO P2P filings - financing detail, reschedule/restructure and settlement." />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="field" style={{ maxWidth: 420 }}>
          <label htmlFor="facilityPicker">Note</label>
          <select id="facilityPicker" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
            {(data?.items ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.noteName ?? f.id} - {f.issuerName} ({f.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {!facilityId && (data?.items ?? []).length === 0 && (
        <div className="card">
          <p className="sub">No financing notes yet - this page will populate once a note exists.</p>
        </div>
      )}

      {facilityId && (
        <div key={facilityId}>
          <CampaignFieldsForm facilityId={facilityId} />
          <RRSection facilityId={facilityId} />
          <SettlementSection facilityId={facilityId} />
        </div>
      )}
    </>
  );
}
