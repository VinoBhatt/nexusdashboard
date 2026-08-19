import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";

interface Approval {
  id: string;
  type: string;
  applicantName: string;
  riskLevel: "Standard" | "Enhanced" | "Review";
  status: "Pending" | "Approved" | "Rejected";
  submittedAt: string;
}
interface Sector {
  name: string;
  value: number;
}

export default function RiskApprovals() {
  const [pendingAction, setPendingAction] = useState<{ id: string; outcome: "approve" | "reject"; label: string } | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({ queryKey: ["admin", "approvals"], queryFn: () => apiGet<{ approvals: Approval[] }>("/api/admin/approvals?status=Pending") });
  const { data: risk } = useQuery({ queryKey: ["admin", "risk-by-sector"], queryFn: () => apiGet<{ sectors: Sector[] }>("/api/admin/risk-by-sector") });

  const decide = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: "approve" | "reject" }) => apiPost(`/api/admin/approvals/${id}/${outcome}`),
    onSuccess: (_res, vars) => {
      toast(vars.outcome === "approve" ? "Approved. The applicant's account has been updated." : "Rejected.");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast(e.message),
  });

  const approvals = data?.approvals ?? [];

  return (
    <>
      <PageHeader title="Risk & Approvals" description="Clear the KYC/KYB, listing and withdrawal approval queue." />
      <div className="grid cols-2">
        <div className="card">
          <div className="section-head">
            <div>
              <h3>Approvals Queue</h3>
              <p>KYC, KYB, new note listings and large withdrawals awaiting sign-off.</p>
            </div>
            <span className="pill amber">{approvals.length} pending</span>
          </div>
          <div className="list">
            {approvals.map((a) => (
              <div key={a.id} className="list-item">
                <div>
                  <b>{a.type}</b>
                  <div className="sub">{a.applicantName}</div>
                  <div className="sub">Submitted {a.submittedAt}</div>
                </div>
                <div style={{ textAlign: "right", display: "grid", gap: 6 }}>
                  <span className={`pill ${a.riskLevel === "Review" ? "red" : a.riskLevel === "Enhanced" ? "amber" : "blue"}`}>{a.riskLevel}</span>
                  <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                    <button className="btn small success" onClick={() => setPendingAction({ id: a.id, outcome: "approve", label: `${a.type} - ${a.applicantName}` })}>
                      Approve
                    </button>
                    <button className="btn small danger" onClick={() => setPendingAction({ id: a.id, outcome: "reject", label: `${a.type} - ${a.applicantName}` })}>
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {approvals.length === 0 && <div className="sub">Queue is clear.</div>}
          </div>
        </div>
        <div className="card">
          <div className="section-head">
            <div>
              <h3>Risk Exposure by Sector</h3>
              <p>Outstanding financing exposure across issuer sectors.</p>
            </div>
            <span className="pill blue">Platform-wide</span>
          </div>
          <div className="bars">
            {(risk?.sectors ?? []).map((s) => (
              <div key={s.name} className="bar">
                <div>{s.name}</div>
                <div className="track">
                  <div className="fill" style={{ width: `${s.value}%` }} />
                </div>
                <div>{s.value}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingAction}
        title={pendingAction?.outcome === "approve" ? "Approve this application?" : "Reject this application?"}
        description={pendingAction ? `${pendingAction.label}. This updates the applicant's account status immediately.` : ""}
        confirmLabel={pendingAction?.outcome === "approve" ? "Approve" : "Reject"}
        danger={pendingAction?.outcome === "reject"}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (pendingAction) decide.mutate({ id: pendingAction.id, outcome: pendingAction.outcome });
          setPendingAction(null);
        }}
      />
    </>
  );
}
