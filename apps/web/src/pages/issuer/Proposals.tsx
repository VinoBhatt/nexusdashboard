import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";

interface ProposalRow {
  id: string;
  status: "Submitted" | "Scheduled" | "Launched";
  facilityProduct: string;
  facilityAmount: number;
  noteName: string | null;
}
interface ProposalDetail {
  id: string;
  status: string;
  riskMethod: string | null;
  riskValue: string | null;
  securities: string[];
  documents: string[];
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
  financingType: string;
  principalAmount: number;
  ratePct: number;
  tenorDays: number;
}

const STATUS_LABEL: Record<string, string> = { Submitted: "Submitted", Scheduled: "Scheduled for Launch", Launched: "Launched" };

export default function IssuerProposals() {
  const [openId, setOpenId] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["issuer", "proposals"], queryFn: () => apiGet<{ proposals: ProposalRow[] }>("/api/issuer/proposals") });
  const { data: detail } = useQuery({
    queryKey: ["issuer", "proposal", openId],
    queryFn: () => apiGet<{ proposal: ProposalDetail; facility: Facility }>(`/api/issuer/proposals/${openId}`),
    enabled: !!openId,
  });

  if (openId && detail) {
    const { proposal, facility } = detail;
    return (
      <>
        <PageHeader title="Proposal Details" description="Read-only financing proposal from Cofundr." actions={
          <button className="btn secondary" onClick={() => setOpenId(null)}>
            Back to Proposals
          </button>
        } />
        <div className="card">
          <div className="section-head">
            <h3>{proposal.id}</h3>
            <span className="status ok">{STATUS_LABEL[proposal.status] ?? proposal.status}</span>
          </div>
          <div className="grid cols-3">
            <div className="metric">
              <div className="label">Financing amount</div>
              <div className="value">{money(facility.principalAmount)}</div>
            </div>
            <div className="metric">
              <div className="label">Tenure</div>
              <div className="value">{facility.tenorDays} days</div>
            </div>
            <div className="metric">
              <div className="label">Profit / interest rate</div>
              <div className="value">{facility.ratePct}% p.a.</div>
            </div>
            <div className="metric">
              <div className="label">Processing fee</div>
              <div className="value">{money(proposal.processingFee)}</div>
            </div>
            <div className="metric">
              <div className="label">Platform fee</div>
              <div className="value">{money(proposal.platformFee)}</div>
            </div>
            <div className="metric">
              <div className="label">Risk rating</div>
              <div className="value">{proposal.riskMethod ? `${proposal.riskMethod}: ${proposal.riskValue}` : "-"}</div>
            </div>
          </div>
          <div className="section-head" style={{ marginTop: 16 }}>
            <h3>Security</h3>
          </div>
          <div>{proposal.securities.length ? proposal.securities.map((s) => <span key={s} className="pill blue">{s}</span>) : <span className="sub">None selected</span>}</div>
          <div className="section-head" style={{ marginTop: 16 }}>
            <h3>Supporting Documents</h3>
          </div>
          <div>{proposal.documents.length ? proposal.documents.map((d) => <span key={d} className="pill">{d}</span>) : <span className="sub">No documents attached.</span>}</div>
          {proposal.status !== "Submitted" && (
            <>
              <div className="section-head" style={{ marginTop: 16 }}>
                <h3>Launch Schedule</h3>
              </div>
              <div className="grid cols-3">
                <div className="metric">
                  <div className="label">Promotional start</div>
                  <div className="value">{proposal.promotionalStart ? new Date(proposal.promotionalStart).toLocaleString() : "-"}</div>
                </div>
                <div className="metric">
                  <div className="label">Launch start</div>
                  <div className="value">{proposal.launchStart ? new Date(proposal.launchStart).toLocaleString() : "-"}</div>
                </div>
                <div className="metric">
                  <div className="label">Launch end</div>
                  <div className="value">{proposal.launchEnd ? new Date(proposal.launchEnd).toLocaleString() : "-"}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Proposals" description="Financing proposals prepared by Cofundr - read-only until launch." />
      <div className="card">
        <div className="list">
          {(data?.proposals ?? []).map((p) => (
            <div
              key={p.id}
              className="list-item"
              style={{ cursor: "pointer" }}
              onClick={() => setOpenId(p.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(p.id); } }}
              tabIndex={0}
              role="button"
            >
              <div>
                <b>{p.id}</b>
                <div className="sub">
                  {p.facilityProduct} · {money(p.facilityAmount)}
                </div>
              </div>
              <span className="status ok">{STATUS_LABEL[p.status] ?? p.status}</span>
            </div>
          ))}
          {(data?.proposals ?? []).length === 0 && <div className="sub">No proposals available yet.</div>}
        </div>
      </div>
    </>
  );
}
