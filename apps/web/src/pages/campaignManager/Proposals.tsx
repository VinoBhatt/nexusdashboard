import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

const REPAYMENT_STRUCTURES = ["Bullet Principal, Monthly Profit", "Bullet Principal & Profit", "Monthly Principal & Profit"] as const;
const RISK_OPTIONS: Record<string, string[]> = {
  "Payment Risk Rating": ["A", "B", "C", "D"],
  "CTOS Score Rating": ["Excellent", "Very Good", "Good", "Fair", "Bad", "Poor"],
  "CR Rating": ["CR1", "CR2", "CR3", "CR4", "CR5", "CR6"],
};
const SECURITY_OPTIONS = [
  "Assignment of Invoice Proceeds (Closed Assignment)",
  "Assignment of Invoice Proceeds (Open Assignment)",
  "Joint Control of Collection Account",
  "Joint and Several Directors' Guarantee (JSG)",
  "Corporate Guarantee",
  "Personal Guarantee",
  "Sinking Fund",
  "Collateral",
  "Other",
];
const STATUS_TABS = ["All", "Drafted", "Submitted", "Scheduled", "Launched"] as const;

interface ProposalRow {
  id: string;
  facilityId: string;
  status: string;
  issuerName: string;
  product: string;
  amount: number;
  noteName: string | null;
}
interface ProposalDetail {
  id: string;
  facilityId: string;
  status: string;
  riskMethod: string | null;
  riskValue: string | null;
  securities: string[];
  documents: string[];
  corporateGuaranteeSource: string | null;
  corporateGuaranteeOther: string | null;
  collateralDetails: string | null;
  otherSecurityDetails: string | null;
  processingFee: number;
  platformFee: number;
  noteName: string | null;
  noteMessage: string | null;
  promotionalStart: string | null;
  launchStart: string | null;
  launchEnd: string | null;
}
interface Facility {
  id: string;
  issuerName: string;
  financingType: string;
  principalAmount: number;
  tenorDays: number;
  ratePct: number;
  repaymentStructure: (typeof REPAYMENT_STRUCTURES)[number];
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CampaignManagerProposals() {
  const [params, setParams] = useSearchParams();
  const draftFacilityId = params.get("draft");
  const openProposalId = params.get("id");
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>("All");
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  useEscapeToClose(showScheduleModal, () => setShowScheduleModal(false));
  const qc = useQueryClient();
  const toast = useToast();

  const { data: list } = useQuery({ queryKey: ["cm", "proposals"], queryFn: () => apiGet<{ proposals: ProposalRow[] }>("/api/campaign-manager/proposals") });
  const { data: draftFacility } = useQuery({
    queryKey: ["cm", "application", draftFacilityId],
    queryFn: () => apiGet<{ facility: Facility }>(`/api/campaign-manager/applications/${draftFacilityId}`),
    enabled: !!draftFacilityId,
  });
  const { data: proposalDetail, refetch: refetchDetail } = useQuery({
    queryKey: ["cm", "proposal", openProposalId],
    queryFn: () => apiGet<{ proposal: ProposalDetail; facility: Facility }>(`/api/campaign-manager/proposals/${openProposalId}`),
    enabled: !!openProposalId,
  });

  const [amount, setAmount] = useState(150000);
  const [tenorDays, setTenorDays] = useState(90);
  const [ratePct, setRatePct] = useState(8);
  const [repaymentStructure, setRepaymentStructure] = useState<(typeof REPAYMENT_STRUCTURES)[number]>(REPAYMENT_STRUCTURES[0]);
  const [riskMethod, setRiskMethod] = useState("");
  const [riskValue, setRiskValue] = useState("");
  const [securities, setSecurities] = useState<string[]>([]);
  const [collateralDetails, setCollateralDetails] = useState("");
  const [otherSecurityDetails, setOtherSecurityDetails] = useState("");
  const [processingFee, setProcessingFee] = useState(0);
  const [platformFee, setPlatformFee] = useState(0);
  const [documents, setDocuments] = useState<string[]>([]);
  const [newDocName, setNewDocName] = useState("");
  const [promotionalStart, setPromotionalStart] = useState("");
  const [launchStart, setLaunchStart] = useState("");
  const [launchEnd, setLaunchEnd] = useState("");
  const [noteName, setNoteName] = useState("");
  const [noteMessage, setNoteMessage] = useState("");

  useEffect(() => {
    if (draftFacility?.facility) {
      const f = draftFacility.facility;
      setAmount(f.principalAmount);
      setTenorDays(f.tenorDays);
      setRatePct(f.ratePct || 8);
      setRepaymentStructure(f.repaymentStructure ?? REPAYMENT_STRUCTURES[0]);
    }
  }, [draftFacility]);

  useEffect(() => {
    if (proposalDetail) {
      const { proposal, facility } = proposalDetail;
      setAmount(facility.principalAmount);
      setTenorDays(facility.tenorDays);
      setRatePct(facility.ratePct);
      setRepaymentStructure(facility.repaymentStructure);
      setRiskMethod(proposal.riskMethod ?? "");
      setRiskValue(proposal.riskValue ?? "");
      setSecurities(proposal.securities);
      setCollateralDetails(proposal.collateralDetails ?? "");
      setOtherSecurityDetails(proposal.otherSecurityDetails ?? "");
      setProcessingFee(proposal.processingFee);
      setPlatformFee(proposal.platformFee);
      setDocuments(proposal.documents);
      setNoteName(proposal.noteName ?? "");
      setNoteMessage(proposal.noteMessage ?? "");
      setPromotionalStart(toDatetimeLocal(proposal.promotionalStart));
      setLaunchStart(toDatetimeLocal(proposal.launchStart));
      setLaunchEnd(toDatetimeLocal(proposal.launchEnd));
    }
  }, [proposalDetail]);

  const proposalFields = () => ({
    amount,
    tenorDays,
    ratePct,
    repaymentStructure,
    riskMethod: riskMethod || undefined,
    riskValue: riskValue || undefined,
    securities,
    collateralDetails: collateralDetails || undefined,
    otherSecurityDetails: otherSecurityDetails || undefined,
    processingFee,
    platformFee,
    documents,
  });

  const createDraft = useMutation({
    mutationFn: () => apiPost<{ id: string }>("/api/campaign-manager/proposals", { facilityId: draftFacilityId, ...proposalFields() }),
    onSuccess: (res) => {
      toast(`${res.id} saved as Drafted.`);
      qc.invalidateQueries({ queryKey: ["cm"] });
      setParams({ id: res.id });
    },
    onError: (e: Error) => toast(e.message),
  });

  const saveDraft = useMutation({
    mutationFn: () => apiPatch(`/api/campaign-manager/proposals/${openProposalId}`, proposalFields()),
    onSuccess: () => {
      toast("Draft saved.");
      qc.invalidateQueries({ queryKey: ["cm"] });
      refetchDetail();
    },
    onError: (e: Error) => toast(e.message),
  });

  const submit = useMutation({
    mutationFn: () => apiPost(`/api/campaign-manager/proposals/${openProposalId}/submit`, {}),
    onSuccess: () => {
      toast(`${openProposalId} submitted to the issuer for review.`);
      qc.invalidateQueries({ queryKey: ["cm"] });
      refetchDetail();
    },
    onError: (e: Error) => toast(e.message),
  });

  const recall = useMutation({
    mutationFn: () => apiPost(`/api/campaign-manager/proposals/${openProposalId}/recall`, {}),
    onSuccess: () => {
      toast(`${openProposalId} recalled to Drafted.`);
      qc.invalidateQueries({ queryKey: ["cm"] });
      refetchDetail();
    },
    onError: (e: Error) => toast(e.message),
  });

  const schedule = useMutation({
    mutationFn: () => apiPost(`/api/campaign-manager/proposals/${openProposalId}/schedule`, { promotionalStart, launchStart, launchEnd, noteName, noteMessage }),
    onSuccess: () => {
      toast(`${openProposalId} scheduled for launch.`);
      setShowScheduleModal(false);
      qc.invalidateQueries({ queryKey: ["cm"] });
      refetchDetail();
    },
    onError: (e: Error) => toast(e.message),
  });

  const cancelSchedule = useMutation({
    mutationFn: () => apiPost(`/api/campaign-manager/proposals/${openProposalId}/cancel-schedule`, {}),
    onSuccess: () => {
      toast("Launch schedule cancelled.");
      qc.invalidateQueries({ queryKey: ["cm"] });
      refetchDetail();
    },
    onError: (e: Error) => toast(e.message),
  });

  const launchNow = useMutation({
    mutationFn: () => apiPost(`/api/campaign-manager/proposals/${openProposalId}/launch`, {}),
    onSuccess: () => {
      toast(`${openProposalId} launched and added to Notes.`);
      qc.invalidateQueries({ queryKey: ["cm"] });
      refetchDetail();
    },
    onError: (e: Error) => toast(e.message),
  });

  function addDocument() {
    if (!newDocName.trim()) return;
    setDocuments((prev) => [...prev, newDocName.trim()]);
    setNewDocName("");
  }

  function toggleSecurity(option: string) {
    setSecurities((prev) => (prev.includes(option) ? prev.filter((s) => s !== option) : [...prev, option]));
  }

  // ---- Create-from-application form ----
  if (draftFacilityId && draftFacility) {
    return (
      <>
        <PageHeader title="Create Proposal" description={draftFacility.facility.issuerName} actions={
          <button className="btn secondary" onClick={() => setParams({})}>
            Back to Proposals
          </button>
        } />
        <ProposalForm
          {...{ amount, setAmount, tenorDays, setTenorDays, ratePct, setRatePct, repaymentStructure, setRepaymentStructure, riskMethod, setRiskMethod, riskValue, setRiskValue, securities, toggleSecurity, collateralDetails, setCollateralDetails, otherSecurityDetails, setOtherSecurityDetails, processingFee, setProcessingFee, platformFee, setPlatformFee, documents, newDocName, setNewDocName, addDocument }}
        />
        <div className="footer-actions">
          <button className="btn primary" disabled={createDraft.isPending} onClick={() => createDraft.mutate()}>
            Save Draft
          </button>
        </div>
      </>
    );
  }

  // ---- Proposal detail / editor ----
  if (openProposalId && proposalDetail) {
    const { proposal } = proposalDetail;
    const isDrafted = proposal.status === "Drafted";
    return (
      <>
        <PageHeader title={proposal.id} description={proposalDetail.facility.issuerName} actions={
          <button className="btn secondary" onClick={() => setParams({})}>
            Back to Proposals
          </button>
        } />
        <div className="card">
          <div className="section-head">
            <h3>Status</h3>
            <span className="status ok">{proposal.status}</span>
          </div>
        </div>
        {isDrafted && (
          <ProposalForm
            {...{ amount, setAmount, tenorDays, setTenorDays, ratePct, setRatePct, repaymentStructure, setRepaymentStructure, riskMethod, setRiskMethod, riskValue, setRiskValue, securities, toggleSecurity, collateralDetails, setCollateralDetails, otherSecurityDetails, setOtherSecurityDetails, processingFee, setProcessingFee, platformFee, setPlatformFee, documents, newDocName, setNewDocName, addDocument }}
          />
        )}
        {!isDrafted && (
          <div className="card">
            <div className="grid cols-3">
              <div className="metric"><div className="label">Risk rating</div><div className="value">{proposal.riskMethod}: {proposal.riskValue}</div></div>
              <div className="metric"><div className="label">Processing fee</div><div className="value">{money(proposal.processingFee)}</div></div>
              <div className="metric"><div className="label">Platform fee</div><div className="value">{money(proposal.platformFee)}</div></div>
            </div>
            {proposal.status !== "Submitted" && (
              <div className="grid cols-3" style={{ marginTop: 12 }}>
                <div className="metric"><div className="label">Promotional start</div><div className="value">{proposal.promotionalStart ? new Date(proposal.promotionalStart).toLocaleString() : "-"}</div></div>
                <div className="metric"><div className="label">Launch start</div><div className="value">{proposal.launchStart ? new Date(proposal.launchStart).toLocaleString() : "-"}</div></div>
                <div className="metric"><div className="label">Launch end</div><div className="value">{proposal.launchEnd ? new Date(proposal.launchEnd).toLocaleString() : "-"}</div></div>
              </div>
            )}
          </div>
        )}

        <div className="footer-actions">
          {isDrafted && (
            <button className="btn secondary" disabled={saveDraft.isPending} onClick={() => saveDraft.mutate()}>
              Save Draft
            </button>
          )}
          {isDrafted && (
            <button className="btn primary" disabled={submit.isPending} onClick={() => submit.mutate()}>
              Submit Proposal
            </button>
          )}
          {proposal.status === "Submitted" && (
            <>
              <button className="btn danger" disabled={recall.isPending} onClick={() => recall.mutate()}>
                Recall
              </button>
              <button className="btn primary" onClick={() => setShowScheduleModal(true)}>
                Launch Note
              </button>
            </>
          )}
          {proposal.status === "Scheduled" && (
            <>
              <button className="btn danger" disabled={cancelSchedule.isPending} onClick={() => cancelSchedule.mutate()}>
                Cancel Launch
              </button>
              <button className="btn secondary" onClick={() => setShowScheduleModal(true)}>
                Edit Launch Schedule
              </button>
              <button className="btn primary" disabled={launchNow.isPending} onClick={() => launchNow.mutate()}>
                Launch Now
              </button>
            </>
          )}
        </div>

        {showScheduleModal && (
          <div className="modal show" style={{ display: "block" }}>
            <div className="modal-dialog">
              <h3>Schedule Note Launch</h3>
              <div className="field">
                <label>Promotional Date & Time</label>
                <input type="datetime-local" value={promotionalStart} onChange={(e) => setPromotionalStart(e.target.value)} />
              </div>
              <div className="field">
                <label>Note Launching Date & Time</label>
                <input type="datetime-local" value={launchStart} onChange={(e) => setLaunchStart(e.target.value)} />
              </div>
              <div className="field">
                <label>Note Closing Date & Time</label>
                <input type="datetime-local" value={launchEnd} onChange={(e) => setLaunchEnd(e.target.value)} />
              </div>
              <div className="field">
                <label>Note Name</label>
                <input value={noteName} onChange={(e) => setNoteName(e.target.value)} />
              </div>
              <div className="field">
                <label>Message (Optional)</label>
                <textarea value={noteMessage} onChange={(e) => setNoteMessage(e.target.value)} />
              </div>
              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="btn secondary" onClick={() => setShowScheduleModal(false)}>
                  Cancel
                </button>
                <button className="btn primary" disabled={schedule.isPending} onClick={() => schedule.mutate()}>
                  Schedule Note Launch
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  const rows = (list?.proposals ?? []).filter((p) => tab === "All" || p.status === tab);

  return (
    <>
      <PageHeader title="Proposals" description="Draft, submit and launch financing proposals." />
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        {STATUS_TABS.map((s) => (
          <button key={s} className={`btn small ${tab === s ? "primary" : "secondary"}`} onClick={() => setTab(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="card">
        <div className="list">
          {rows.map((p) => (
            <div
              key={p.id}
              className="list-item"
              style={{ cursor: "pointer" }}
              onClick={() => setParams({ id: p.id })}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setParams({ id: p.id }); } }}
              tabIndex={0}
              role="button"
            >
              <div>
                <b>{p.id}</b>
                <div className="sub">
                  {p.issuerName} · {p.product} · {money(p.amount)}
                </div>
              </div>
              <span className="status ok">{p.status}</span>
            </div>
          ))}
          {rows.length === 0 && <div className="sub">No proposals match this filter.</div>}
        </div>
      </div>
    </>
  );
}

interface ProposalFormProps {
  amount: number;
  setAmount: (n: number) => void;
  tenorDays: number;
  setTenorDays: (n: number) => void;
  ratePct: number;
  setRatePct: (n: number) => void;
  repaymentStructure: (typeof REPAYMENT_STRUCTURES)[number];
  setRepaymentStructure: (s: (typeof REPAYMENT_STRUCTURES)[number]) => void;
  riskMethod: string;
  setRiskMethod: (s: string) => void;
  riskValue: string;
  setRiskValue: (s: string) => void;
  securities: string[];
  toggleSecurity: (s: string) => void;
  collateralDetails: string;
  setCollateralDetails: (s: string) => void;
  otherSecurityDetails: string;
  setOtherSecurityDetails: (s: string) => void;
  processingFee: number;
  setProcessingFee: (n: number) => void;
  platformFee: number;
  setPlatformFee: (n: number) => void;
  documents: string[];
  newDocName: string;
  setNewDocName: (s: string) => void;
  addDocument: () => void;
}

function ProposalForm(p: ProposalFormProps) {
  return (
    <div className="card">
      <div className="section-head">
        <h3>General Note Details</h3>
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Financing Amount (RM)</label>
          <input type="number" min={1000} value={p.amount} onChange={(e) => p.setAmount(Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Tenor (days)</label>
          <input type="number" min={1} value={p.tenorDays} onChange={(e) => p.setTenorDays(Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Profit / Interest Rate (% p.a.)</label>
          <input type="number" min={0} step={0.1} value={p.ratePct} onChange={(e) => p.setRatePct(Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Repayment Structure</label>
          <select value={p.repaymentStructure} onChange={(e) => p.setRepaymentStructure(e.target.value as (typeof REPAYMENT_STRUCTURES)[number])}>
            {REPAYMENT_STRUCTURES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Processing Fee (RM)</label>
          <input type="number" min={0} value={p.processingFee} onChange={(e) => p.setProcessingFee(Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Platform Fee (RM)</label>
          <input type="number" min={0} value={p.platformFee} onChange={(e) => p.setPlatformFee(Number(e.target.value))} />
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 16 }}>
        <h3>Risk Rating</h3>
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Risk Rating Method</label>
          <select value={p.riskMethod} onChange={(e) => { p.setRiskMethod(e.target.value); p.setRiskValue(""); }}>
            <option value="">Select method</option>
            {Object.keys(RISK_OPTIONS).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Rating</label>
          <select value={p.riskValue} onChange={(e) => p.setRiskValue(e.target.value)} disabled={!p.riskMethod}>
            <option value="">Select rating</option>
            {(RISK_OPTIONS[p.riskMethod] ?? []).map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 16 }}>
        <h3>Security</h3>
      </div>
      <div className="doc-list">
        {SECURITY_OPTIONS.map((s) => (
          <label className="check" key={s}>
            <input type="checkbox" checked={p.securities.includes(s)} onChange={() => p.toggleSecurity(s)} />
            <span>{s}</span>
          </label>
        ))}
      </div>
      {p.securities.includes("Collateral") && (
        <div className="field" style={{ marginTop: 10 }}>
          <label>Collateral Details</label>
          <input value={p.collateralDetails} onChange={(e) => p.setCollateralDetails(e.target.value)} />
        </div>
      )}
      {p.securities.includes("Other") && (
        <div className="field" style={{ marginTop: 10 }}>
          <label>Other Security Details</label>
          <input value={p.otherSecurityDetails} onChange={(e) => p.setOtherSecurityDetails(e.target.value)} />
        </div>
      )}

      <div className="section-head" style={{ marginTop: 16 }}>
        <h3>Supporting Documents</h3>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <input placeholder="e.g. Issue Request.pdf" value={p.newDocName} onChange={(e) => p.setNewDocName(e.target.value)} />
        <button className="btn secondary" type="button" onClick={p.addDocument}>
          Add
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        {p.documents.map((d) => (
          <span key={d} className="pill">
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}
