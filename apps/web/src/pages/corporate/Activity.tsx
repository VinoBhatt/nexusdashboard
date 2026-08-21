import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";

interface ActivityRow {
  id: string;
  action: "corporate_order_created" | "corporate_order_approved" | "corporate_order_rejected";
  subjectId: string;
  metadataJson: string | null;
  actorEmail: string;
  createdAt: string;
}
interface Metadata {
  type?: string;
  amount?: number;
  note?: string | null;
}

const ACTION_LABEL: Record<ActivityRow["action"], string> = {
  corporate_order_created: "Created",
  corporate_order_approved: "Approved",
  corporate_order_rejected: "Rejected",
};

function parseMetadata(json: string | null): Metadata {
  if (!json) return {};
  try {
    return JSON.parse(json) as Metadata;
  } catch {
    return {};
  }
}

export default function CorporateActivity() {
  const [search, setSearch] = useState("");
  const { data } = useQuery({
    queryKey: ["corporate", "activity"],
    queryFn: () => apiGet<{ activity: ActivityRow[] }>("/api/corporate/activity"),
  });

  const rows = data?.activity ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => [r.actorEmail, r.subjectId, ACTION_LABEL[r.action]].join(" ").toLowerCase().includes(q))
    : rows;

  const columns: Column<ActivityRow>[] = [
    { key: "createdAt", label: "When", sortable: true, render: (r) => new Date(r.createdAt).toLocaleString() },
    {
      key: "action",
      label: "Action",
      sortable: true,
      render: (r) => (
        <span className={`status ${r.action === "corporate_order_approved" ? "ok" : r.action === "corporate_order_rejected" ? "default" : "pending"}`}>
          {ACTION_LABEL[r.action]}
        </span>
      ),
    },
    { key: "actorEmail", label: "By", sortable: true },
    { key: "subjectId", label: "Order", sortable: true, render: (r) => <span title={r.subjectId}>{r.subjectId.length > 12 ? `${r.subjectId.slice(0, 8)}…` : r.subjectId}</span> },
    {
      key: "type",
      label: "Type",
      sortValue: (r) => parseMetadata(r.metadataJson).type ?? "",
      render: (r) => parseMetadata(r.metadataJson).type ?? "—",
    },
    {
      key: "amount",
      label: "Amount",
      sortValue: (r) => parseMetadata(r.metadataJson).amount ?? 0,
      render: (r) => {
        const amount = parseMetadata(r.metadataJson).amount;
        return amount != null ? money(amount) : "—";
      },
    },
    {
      key: "note",
      label: "Note",
      render: (r) => {
        const note = parseMetadata(r.metadataJson).note;
        return note ? <span className="sub">"{note}"</span> : "";
      },
    },
  ];

  return (
    <>
      <PageHeader title="Activity Log" description="Full audit trail of every order created, approved and rejected on this account." />
      <div className="card">
        <div className="field" style={{ marginBottom: 14, maxWidth: 360 }}>
          <label>Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order ID, person, action…" />
        </div>
        <DataTable columns={columns} rows={filtered} pageSize={50} emptyMessage="No activity yet." />
      </div>
    </>
  );
}
