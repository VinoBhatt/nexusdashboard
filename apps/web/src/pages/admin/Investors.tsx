import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";

interface Investor {
  id: string;
  name: string;
  type: "Retail" | "Corporate";
  kyc: string;
  portfolio: number;
  status: string;
}

export default function Investors() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("All");
  const [status, setStatus] = useState("All");

  const { data } = useQuery({
    queryKey: ["admin", "investors", search, type, status],
    queryFn: () =>
      apiGet<{ investors: Investor[] }>(
        `/api/admin/investors?search=${encodeURIComponent(search)}&type=${type}&status=${status}`
      ),
  });

  const columns: Column<Investor>[] = [
    { key: "name", label: "Name", sortable: true },
    { key: "type", label: "Type", sortable: true },
    { key: "kyc", label: "Verification", sortable: true, render: (r) => <span className={`status ${r.kyc === "Verified" ? "ok" : r.kyc === "Rejected" ? "default" : "pending"}`}>{r.kyc}</span> },
    { key: "portfolio", label: "Portfolio Value", sortable: true, render: (r) => money(r.portfolio) },
    { key: "status", label: "Status", sortable: true, render: (r) => <span className={`status ${r.status === "Active" ? "ok" : r.status === "Under review" ? "overdue" : "pending"}`}>{r.status}</span> },
  ];

  return (
    <>
      <PageHeader title="Investors" description="Search and review every investor account on the platform." />
      <div className="card">
        <div className="filters" style={{ gridTemplateColumns: "1.4fr .8fr .8fr" }}>
          <div className="field">
            <label>Search investor</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option>All</option>
              <option>Retail</option>
              <option>Corporate</option>
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option>All</option>
              <option>Active</option>
              <option>Onboarding</option>
              <option>Under review</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <DataTable columns={columns} rows={data?.investors ?? []} emptyMessage="No matching investors." />
        </div>
      </div>
    </>
  );
}
