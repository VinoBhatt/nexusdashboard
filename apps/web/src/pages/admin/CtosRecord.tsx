import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { SkeletonPage, QueryError } from "../../components/QueryState";

interface Approval {
  id: string;
  type: string;
  applicantName: string;
  riskLevel: "Standard" | "Enhanced" | "Review";
  status: "Pending" | "Approved" | "Rejected";
  submittedAt: string;
  confidenceScore: number | null;
  flaggedReason: string | null;
  notes: string | null;
}
interface KycProfile {
  fullName: string;
  icNumber: string | null;
  dob: string | null;
  address: string | null;
  nationality: string | null;
  faceMatchScore: number | null;
  livenessPassed: boolean | null;
}
interface CtosResult {
  request_id: string;
  retrieved_at: string;
  credit_score: number;
  credit_band: string;
  litigation_flag: boolean;
  bankruptcy_flag: boolean;
  defaults_24m: number;
  aml_list_matches: { list: string; match_confidence: number; position: string }[];
}
interface CaseDetail {
  approval: Approval;
  kycProfile: KycProfile | null;
  ctos: CtosResult | null;
}

function bandLabel(score: number) {
  if (score <= 20) return { label: "HIGH CONFIDENCE", pill: "green" };
  if (score <= 50) return { label: "MEDIUM - Manual review", pill: "amber" };
  return { label: "LOW CONFIDENCE", pill: "red" };
}

export default function CtosRecord() {
  const { approvalId } = useParams<{ approvalId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [requestDocsOpen, setRequestDocsOpen] = useState(false);
  const [requestDocsNotes, setRequestDocsNotes] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "kyc-review", approvalId],
    queryFn: () => apiGet<CaseDetail>(`/api/admin/kyc-review/${approvalId}`),
    enabled: !!approvalId,
  });

  const approve = useMutation({
    mutationFn: () => apiPost(`/api/admin/approvals/${approvalId}/approve`),
    onSuccess: () => {
      toast("Case cleared and approved.");
      qc.invalidateQueries({ queryKey: ["admin"] });
      navigate("/app/kyc-queue");
    },
    onError: (e: Error) => toast(e.message),
  });
  const reject = useMutation({
    mutationFn: () => apiPost(`/api/admin/approvals/${approvalId}/reject`),
    onSuccess: () => {
      toast("Case rejected.");
      qc.invalidateQueries({ queryKey: ["admin"] });
      navigate("/app/kyc-queue");
    },
    onError: (e: Error) => toast(e.message),
  });
  const requestDocs = useMutation({
    mutationFn: () => apiPost(`/api/admin/kyc-review/${approvalId}/request-docs`, { notes: requestDocsNotes }),
    onSuccess: () => {
      toast("Additional documents requested.");
      setRequestDocsOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "kyc-review", approvalId] });
    },
    onError: (e: Error) => toast(e.message),
  });

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;
  const { approval, kycProfile, ctos } = data!;
  const band = bandLabel(approval.confidenceScore ?? 0);
  const decided = approval.status !== "Pending";

  return (
    <>
      <div id="printArea">
        <div className="print-header">
          Cofundr Sdn Bhd - KYC Screening Record
          <small>
            Case ref: {approval.id} · Printed: {new Date().toLocaleDateString("en-GB")}
          </small>
        </div>
        <div className="row no-print" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div>
            <div className="section-title" style={{ fontSize: 22, fontWeight: 700 }}>
              CTOS Screening Record
            </div>
            <div className="sub">
              Case <b className="mono">{approval.id}</b> · {approval.applicantName} · Submitted {new Date(approval.submittedAt).toLocaleString("en-MY")}
            </div>
          </div>
          <button className="btn outline no-print" onClick={() => window.print()}>
            🖨️ Print / Save PDF
          </button>
        </div>

        <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <div className="card">
              <h3>User-submitted profile</h3>
              <dl className="kv">
                <dt>Full name</dt>
                <dd>{kycProfile?.fullName ?? approval.applicantName}</dd>
                <dt>IC / registration number</dt>
                <dd className="mono">{kycProfile?.icNumber ?? "-"}</dd>
                <dt>Date of birth</dt>
                <dd>{kycProfile?.dob ?? "-"}</dd>
                <dt>Address</dt>
                <dd>{kycProfile?.address ?? "-"}</dd>
                <dt>Nationality</dt>
                <dd>{kycProfile?.nationality ?? "-"}</dd>
                <dt>Face match score</dt>
                <dd>
                  {kycProfile?.faceMatchScore != null ? (
                    <span className={`pill ${kycProfile.faceMatchScore >= 80 ? "green" : "red"}`}>{kycProfile.faceMatchScore} / 100 {kycProfile.faceMatchScore >= 80 ? "- PASS" : "- FAIL"}</span>
                  ) : (
                    "-"
                  )}
                </dd>
                <dt>Liveness check</dt>
                <dd>{kycProfile?.livenessPassed ? <span className="pill green">PASSED</span> : <span className="pill">-</span>}</dd>
              </dl>
            </div>
            <div className="card">
              <h3>Confidence score</h3>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: 14, background: "var(--surface2)", borderRadius: 8 }}>
                <b>Total score</b>
                <span>
                  <b style={{ fontSize: 18 }}>{approval.confidenceScore ?? 0} pts</b>{" "}
                  <span className={`pill ${band.pill}`}>{band.label}</span>
                </span>
              </div>
              {approval.flaggedReason && <div className="sub" style={{ marginTop: 10 }}>Flagged: {approval.flaggedReason}</div>}
            </div>
          </div>
          <div>
            <div className="card">
              <h3>CTOS API response (raw)</h3>
              <div className="code-block">{ctos ? JSON.stringify(ctos, null, 2) : "No CTOS pull on file."}</div>
            </div>
            <div className="card no-print">
              <h3>Officer decision</h3>
              {decided ? (
                <div className={`status ${approval.status === "Approved" ? "ok" : "default"}`}>{approval.status}</div>
              ) : (
                <>
                  {approval.notes && (
                    <div className="banner-notice" style={{ marginBottom: 12 }}>
                      <div>Docs requested: {approval.notes}</div>
                    </div>
                  )}
                  {requestDocsOpen && (
                    <div className="field" style={{ marginBottom: 12 }}>
                      <label htmlFor="requestDocsNotes">What's needed?</label>
                      <textarea id="requestDocsNotes" rows={2} value={requestDocsNotes} onChange={(e) => setRequestDocsNotes(e.target.value)} />
                    </div>
                  )}
                  <div className="banner-notice danger">
                    <div>Decision is immutable once submitted - written to the KYC audit log.</div>
                  </div>
                  <div className="btn-row" style={{ display: "flex", gap: 10, marginTop: 14 }}>
                    <button className="btn danger" disabled={reject.isPending} onClick={() => reject.mutate()}>
                      Reject hard
                    </button>
                    {requestDocsOpen ? (
                      <button className="btn secondary" disabled={requestDocs.isPending || requestDocsNotes.trim().length === 0} onClick={() => requestDocs.mutate()}>
                        Send request
                      </button>
                    ) : (
                      <button className="btn secondary" onClick={() => setRequestDocsOpen(true)}>
                        Request docs
                      </button>
                    )}
                    <button className="btn primary" disabled={approve.isPending} onClick={() => approve.mutate()}>
                      Clear &amp; approve
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="print-footer">For regulatory audit purposes only - printed from compliance officer dashboard</div>
      </div>
    </>
  );
}
