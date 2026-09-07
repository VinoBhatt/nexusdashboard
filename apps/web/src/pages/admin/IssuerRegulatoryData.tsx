import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { SkeletonPage, QueryError } from "../../components/QueryState";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface IssuerOption {
  userId: string;
  companyName: string;
  registrationNumber: string | null;
}
interface IssuerProfile {
  userId: string;
  companyName: string;
  issuerIdCode: string | null;
  dateOfIncorporation: string | null;
  dateOfCommencement: string | null;
  countryOfIncorporation: string | null;
  typeOfCompany: string | null;
  registeredAddressState: string | null;
  registeredAddressPostcode: string | null;
  businessAddress: string | null;
  businessAddressState: string | null;
  businessAddressPostcode: string | null;
  phoneNumber: string | null;
  website: string | null;
  companyActivities: string | null;
}
interface BoardMember {
  id: string;
  name: string;
  salutation: string | null;
  identityPrefix: string | null;
  identityNumber: string | null;
  nationality: string | null;
  designation: string | null;
  appointmentDate: string | null;
}
interface Shareholder {
  id: string;
  shareholderType: string;
  shareholderName: string;
  identityPrefix: string | null;
  identityNumber: string | null;
  nationality: string | null;
  shareType: string | null;
  shareholdingUnits: number | null;
  shareholdingAmount: number | null;
  shareholdingPercentage: number | null;
}
interface Financials {
  id: string;
  periodLabel: string;
  totalRevenueRM: number | null;
  profitLossAfterTaxRM: number | null;
}

const PROFILE_FIELDS: { key: keyof IssuerProfile; label: string }[] = [
  { key: "issuerIdCode", label: "Issuer ID Code" },
  { key: "dateOfIncorporation", label: "Date of Incorporation (YYYY-MM-DD)" },
  { key: "dateOfCommencement", label: "Date of Commencement (YYYY-MM-DD)" },
  { key: "countryOfIncorporation", label: "Country of Incorporation" },
  { key: "typeOfCompany", label: "Type of Company" },
  { key: "registeredAddressState", label: "Registered Address - State" },
  { key: "registeredAddressPostcode", label: "Registered Address - Postcode" },
  { key: "businessAddress", label: "Business Address" },
  { key: "businessAddressState", label: "Business Address - State" },
  { key: "businessAddressPostcode", label: "Business Address - Postcode" },
  { key: "phoneNumber", label: "Phone Number" },
  { key: "website", label: "Website" },
  { key: "companyActivities", label: "Company Activities" },
];

function ProfileForm({ userId }: { userId: string }) {
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "regulatory", "issuer-profile", userId],
    queryFn: () => apiGet<{ item: IssuerProfile }>(`/api/admin/regulatory/issuers/${userId}`),
  });
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data?.item) {
      const next: Record<string, string> = {};
      for (const f of PROFILE_FIELDS) next[f.key] = (data.item[f.key] as string | null) ?? "";
      setForm(next);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiPut(`/api/admin/regulatory/issuers/${userId}/profile`, form),
    onSuccess: () => toast("Profile updated."),
    onError: (e: Error) => toast(e.message),
  });

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-head">
        <div>
          <h3>Extended Company Profile</h3>
          <p>SC RMO P2P Report [02000] Profile of Issuer - supplementary fields not captured elsewhere.</p>
        </div>
      </div>
      <div className="grid cols-3">
        {PROFILE_FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`profile-${f.key}`}>{f.label}</label>
            <input id={`profile-${f.key}`} value={form[f.key] ?? ""} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>
          Save Profile
        </button>
      </div>
    </div>
  );
}

function BoardSection({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const queryKey = ["admin", "regulatory", "board", userId];
  const { data, isLoading, isError, refetch } = useQuery({ queryKey, queryFn: () => apiGet<{ items: BoardMember[] }>(`/api/admin/regulatory/issuers/${userId}/board`) });
  const [form, setForm] = useState<Record<string, string>>({});
  const [removeId, setRemoveId] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => apiPost(`/api/admin/regulatory/issuers/${userId}/board`, { ...form, identityPrefix: form.identityPrefix || "NRIC" }),
    onSuccess: () => {
      toast("Board member added.");
      qc.invalidateQueries({ queryKey });
      setForm({});
    },
    onError: (e: Error) => toast(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/regulatory/board/${id}`),
    onSuccess: () => {
      toast("Board member removed.");
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
          <h3>Board of Directors</h3>
          <p>SC RMO P2P Report [06000] - directors and management team.</p>
        </div>
      </div>
      <div className="list" style={{ marginBottom: 16 }}>
        {(data?.items ?? []).map((m) => (
          <div key={m.id} className="list-item">
            <div>
              <b>{m.name}</b>
              <div className="sub">
                {m.designation ?? "-"} · {m.identityPrefix ?? "NRIC"} {m.identityNumber ?? ""} · {m.nationality ?? "-"}
              </div>
            </div>
            <button className="btn small danger" onClick={() => setRemoveId(m.id)}>
              Remove
            </button>
          </div>
        ))}
        {(data?.items ?? []).length === 0 && <div className="sub">No board members recorded yet.</div>}
      </div>
      <div className="grid cols-3">
        <div className="field">
          <label htmlFor="board-name">Name</label>
          <input id="board-name" value={form.name ?? ""} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="board-designation">Designation</label>
          <input id="board-designation" value={form.designation ?? ""} onChange={(e) => setForm((s) => ({ ...s, designation: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="board-identityPrefix">ID Type</label>
          <select id="board-identityPrefix" value={form.identityPrefix ?? "NRIC"} onChange={(e) => setForm((s) => ({ ...s, identityPrefix: e.target.value }))}>
            <option>NRIC</option>
            <option>Passport</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="board-identityNumber">ID Number</label>
          <input id="board-identityNumber" value={form.identityNumber ?? ""} onChange={(e) => setForm((s) => ({ ...s, identityNumber: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="board-nationality">Nationality</label>
          <input id="board-nationality" value={form.nationality ?? ""} onChange={(e) => setForm((s) => ({ ...s, nationality: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="board-appointmentDate">Appointment Date (YYYY-MM-DD)</label>
          <input id="board-appointmentDate" value={form.appointmentDate ?? ""} onChange={(e) => setForm((s) => ({ ...s, appointmentDate: e.target.value }))} />
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={!form.name || add.isPending} onClick={() => add.mutate()}>
          Add Board Member
        </button>
      </div>
      <ConfirmDialog
        open={!!removeId}
        title="Remove this board member?"
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

function ShareholdersSection({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const queryKey = ["admin", "regulatory", "shareholders", userId];
  const { data, isLoading, isError, refetch } = useQuery({ queryKey, queryFn: () => apiGet<{ items: Shareholder[] }>(`/api/admin/regulatory/issuers/${userId}/shareholders`) });
  const [form, setForm] = useState<Record<string, string>>({});
  const [removeId, setRemoveId] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      apiPost(`/api/admin/regulatory/issuers/${userId}/shareholders`, {
        ...form,
        shareholderType: form.shareholderType || "Individual",
        identityPrefix: form.identityPrefix || "NRIC",
        shareholdingUnits: form.shareholdingUnits ? Number(form.shareholdingUnits) : undefined,
        shareholdingAmount: form.shareholdingAmount ? Number(form.shareholdingAmount) : undefined,
        shareholdingPercentage: form.shareholdingPercentage ? Number(form.shareholdingPercentage) : undefined,
      }),
    onSuccess: () => {
      toast("Shareholder added.");
      qc.invalidateQueries({ queryKey });
      setForm({});
    },
    onError: (e: Error) => toast(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/regulatory/shareholders/${id}`),
    onSuccess: () => {
      toast("Shareholder removed.");
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
          <h3>Shareholding Structure</h3>
          <p>SC RMO P2P Report [05000] - shareholders of record.</p>
        </div>
      </div>
      <div className="list" style={{ marginBottom: 16 }}>
        {(data?.items ?? []).map((s) => (
          <div key={s.id} className="list-item">
            <div>
              <b>{s.shareholderName}</b>
              <div className="sub">
                {s.shareholderType} · {s.shareType ?? "-"} · {s.shareholdingPercentage != null ? `${s.shareholdingPercentage}%` : "-"}
              </div>
            </div>
            <button className="btn small danger" onClick={() => setRemoveId(s.id)}>
              Remove
            </button>
          </div>
        ))}
        {(data?.items ?? []).length === 0 && <div className="sub">No shareholders recorded yet.</div>}
      </div>
      <div className="grid cols-3">
        <div className="field">
          <label htmlFor="sh-shareholderName">Shareholder Name</label>
          <input id="sh-shareholderName" value={form.shareholderName ?? ""} onChange={(e) => setForm((s) => ({ ...s, shareholderName: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="sh-shareholderType">Type</label>
          <select id="sh-shareholderType" value={form.shareholderType ?? "Individual"} onChange={(e) => setForm((s) => ({ ...s, shareholderType: e.target.value }))}>
            <option>Individual</option>
            <option>Company</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sh-shareType">Share Type</label>
          <input id="sh-shareType" value={form.shareType ?? ""} onChange={(e) => setForm((s) => ({ ...s, shareType: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="sh-shareholdingUnits">Shareholding Units</label>
          <input id="sh-shareholdingUnits" type="number" value={form.shareholdingUnits ?? ""} onChange={(e) => setForm((s) => ({ ...s, shareholdingUnits: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="sh-shareholdingAmount">Shareholding Amount (RM)</label>
          <input id="sh-shareholdingAmount" type="number" value={form.shareholdingAmount ?? ""} onChange={(e) => setForm((s) => ({ ...s, shareholdingAmount: e.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="sh-shareholdingPercentage">Shareholding %</label>
          <input id="sh-shareholdingPercentage" type="number" value={form.shareholdingPercentage ?? ""} onChange={(e) => setForm((s) => ({ ...s, shareholdingPercentage: e.target.value }))} />
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={!form.shareholderName || add.isPending} onClick={() => add.mutate()}>
          Add Shareholder
        </button>
      </div>
      <ConfirmDialog
        open={!!removeId}
        title="Remove this shareholder?"
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

function FinancialsSection({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const queryKey = ["admin", "regulatory", "financials", userId];
  const { data, isLoading, isError, refetch } = useQuery({ queryKey, queryFn: () => apiGet<{ items: Financials[] }>(`/api/admin/regulatory/issuers/${userId}/financials`) });
  const [form, setForm] = useState<Record<string, string>>({});
  const [removeId, setRemoveId] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { periodLabel: form.periodLabel };
      for (const key of Object.keys(form)) {
        if (key === "periodLabel") continue;
        if (form[key]) body[key] = Number(form[key]);
      }
      return apiPost(`/api/admin/regulatory/issuers/${userId}/financials`, body);
    },
    onSuccess: () => {
      toast("Financial period added.");
      qc.invalidateQueries({ queryKey });
      setForm({});
    },
    onError: (e: Error) => toast(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/regulatory/financials/${id}`),
    onSuccess: () => {
      toast("Financial period removed.");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast(e.message),
  });

  const numField = (key: string, label: string) => (
    <div className="field" key={key}>
      <label htmlFor={`fin-${key}`}>{label}</label>
      <input id={`fin-${key}`} type="number" value={form[key] ?? ""} onChange={(e) => setForm((s) => ({ ...s, [key]: e.target.value }))} />
    </div>
  );

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-head">
        <div>
          <h3>Balance Sheet &amp; Profit/Loss</h3>
          <p>SC RMO P2P Report [09000]/[09100] - one row per reporting period (e.g. FY2025).</p>
        </div>
      </div>
      <div className="list" style={{ marginBottom: 16 }}>
        {(data?.items ?? []).map((f) => (
          <div key={f.id} className="list-item">
            <div>
              <b>{f.periodLabel}</b>
              <div className="sub">
                Revenue: {f.totalRevenueRM ?? "-"} · Profit after tax: {f.profitLossAfterTaxRM ?? "-"}
              </div>
            </div>
            <button className="btn small danger" onClick={() => setRemoveId(f.id)}>
              Remove
            </button>
          </div>
        ))}
        {(data?.items ?? []).length === 0 && <div className="sub">No financial periods recorded yet.</div>}
      </div>

      <div className="field" style={{ maxWidth: 220, marginBottom: 14 }}>
        <label htmlFor="fin-periodLabel">Period Label (e.g. FY2025)</label>
        <input id="fin-periodLabel" value={form.periodLabel ?? ""} onChange={(e) => setForm((s) => ({ ...s, periodLabel: e.target.value }))} />
      </div>

      <h4>Balance Sheet</h4>
      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        {numField("assetsCurrentRM", "Current Assets (RM)")}
        {numField("assetsNonCurrentRM", "Non-Current Assets (RM)")}
        {numField("liabCurrentBorrowingRM", "Current Liab - Borrowing (RM)")}
        {numField("liabCurrentNonBorrowingRM", "Current Liab - Non-Borrowing (RM)")}
        {numField("liabNonCurrentLoanRM", "Non-Current Liab - Loan (RM)")}
        {numField("liabNonCurrentNonLoanRM", "Non-Current Liab - Non-Loan (RM)")}
        {numField("equityCapitalRM", "Equity Capital (RM)")}
        {numField("equityShareApplicationRM", "Equity - Share Application (RM)")}
        {numField("equitySharePremiumRM", "Equity - Share Premium (RM)")}
        {numField("equityAccumulatedProfitRM", "Equity - Accumulated Profit (RM)")}
        {numField("equityMinorityInterestRM", "Equity - Minority Interest (RM)")}
      </div>

      <h4>Profit &amp; Loss</h4>
      <div className="grid cols-3">
        {numField("totalRevenueRM", "Total Revenue (RM)")}
        {numField("operatingCostRM", "Operating Cost (RM)")}
        {numField("administrativeCostRM", "Administrative Cost (RM)")}
        {numField("interestCostRM", "Interest Cost (RM)")}
        {numField("otherCostRM", "Other Cost (RM)")}
        {numField("profitLossBeforeTaxRM", "Profit/Loss Before Tax (RM)")}
        {numField("profitLossAfterTaxRM", "Profit/Loss After Tax (RM)")}
        {numField("minorityInterestRM", "Minority Interest (RM)")}
        {numField("netDividendRM", "Net Dividend (RM)")}
      </div>

      <div style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={!form.periodLabel || add.isPending} onClick={() => add.mutate()}>
          Add Financial Period
        </button>
      </div>
      <ConfirmDialog
        open={!!removeId}
        title="Remove this financial period?"
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

export default function IssuerRegulatoryData() {
  const [userId, setUserId] = useState<string>("");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "regulatory", "issuers-picker"],
    queryFn: () => apiGet<{ items: IssuerOption[] }>("/api/admin/regulatory/issuers"),
  });

  useEffect(() => {
    if (!userId && data?.items?.length) setUserId(data.items[0].userId);
  }, [data, userId]);

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader title="Issuer Regulatory Data" description="Supplementary issuer detail required for SC RMO P2P filings - profile, board of directors, shareholding and financials." />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="field" style={{ maxWidth: 380 }}>
          <label htmlFor="issuerPicker">Issuer</label>
          <select id="issuerPicker" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {(data?.items ?? []).map((i) => (
              <option key={i.userId} value={i.userId}>
                {i.companyName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!userId && (data?.items ?? []).length === 0 && (
        <div className="card">
          <p className="sub">No issuers onboarded yet - this page will populate once an issuer account exists.</p>
        </div>
      )}

      {userId && (
        <div key={userId}>
          <ProfileForm userId={userId} />
          <BoardSection userId={userId} />
          <ShareholdersSection userId={userId} />
          <FinancialsSection userId={userId} />
        </div>
      )}
    </>
  );
}
