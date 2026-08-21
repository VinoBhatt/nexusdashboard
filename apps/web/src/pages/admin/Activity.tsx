import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";

interface ActivityRow {
  id: string;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  metadataJson: string | null;
  actorEmail: string;
  actorRole: string;
  createdAt: string;
}
interface Metadata {
  type?: string;
  amount?: number;
  note?: string | null;
  applicantName?: string;
  riskLevel?: string;
}

const ACTION_LABEL: Record<string, string> = {
  corporate_order_created: "Order Created",
  corporate_order_approved: "Order Approved",
  corporate_order_rejected: "Order Rejected",
  admin_approval_approved: "Approval Granted",
  admin_approval_rejected: "Approval Rejected",
};

function actionClass(action: string): string {
  if (action.endsWith("approved")) return "ok";
  if (action.endsWith("rejected")) return "default";
  return "pending";
}

function parseMetadata(json: string | null): Metadata {
  if (!json) return {};
  try {
    return JSON.parse(json) as Metadata;
  } catch {
    return {};
  }
}

export default function AdminActivity() {
  const [search, setSearch] = useState("");
  const { data } = useQuery({
    queryKey: ["admin", "activity", search],
    queryFn: () => apiGet<{ activity: ActivityRow[] }>(`/api/admin/activity?search=${encodeURIComponent(search)}`),
  });

  const rows = data?.activity ?? [];

  const columns: Column<ActivityRow>[] = [
    { key: "createdAt", label: "When", sortable: true, render: (r) => new Date(r.createdAt).toLocaleString() },
    {
      key: "action",
      label: "Action",
      sortable: true,
      render: (r) => <span className={`status ${actionClass(r.action)}`}>{ACTION_LABEL[r.action] ?? r.action}</span>,
    },
    { key: "actorEmail", label: "Actor", sortable: true },
    { key: "actorRole", label: "Role", sortable: true, render: (r) => <span className="pill blue">{r.actorRole}</span> },
    {
      key: "subject",
      label: "Subject",
      sortValue: (r) => r.subjectId ?? "",
      render: (r) => {
        const meta = parseMetadata(r.metadataJson);
        const label = meta.applicantName ?? r.subjectId ?? "—";
        return (
          <>
            {label}
            {r.subjectType && <div className="sub">{r.subjectType}</div>}
          </>
        );
      },
    },
    {
      key: "details",
      label: "Details",
      render: (r) => {
        const meta = parseMetadata(r.metadataJson);
        return (
          <>
            {meta.type && <div>{meta.type}</div>}
            {meta.note && <span className="sub">"{meta.note}"</span>}
          </>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader title="Activity Log" description="Platform-wide audit trail: every corporate order decision and every risk & approvals decision, across every account." />
      <div className="card">
        <div className="field" style={{ marginBottom: 14, maxWidth: 360 }}>
          <label>Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Actor, action, subject…" />
        </div>
        <DataTable columns={columns} rows={rows} pageSize={15} emptyMessage="No activity yet." />
      </div>
    </>
  );
}
