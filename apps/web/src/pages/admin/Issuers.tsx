import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";

interface Issuer {
  name: string;
  sector: string;
  outstanding: number;
  tier: string;
  status: "Performing" | "Default" | "Onboarding";
}

export default function Issuers() {
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["admin", "issuers", search],
    queryFn: () => apiGet<{ issuers: Issuer[] }>(`/api/admin/issuers?search=${encodeURIComponent(search)}`),
  });

  const columns: Column<Issuer>[] = [
    { key: "name", label: "Company", sortable: true },
    { key: "sector", label: "Sector", sortable: true },
    { key: "outstanding", label: "Outstanding", sortable: true, render: (r) => money(r.outstanding) },
    { key: "tier", label: "Risk Tier", sortable: true },
    { key: "status", label: "Status", sortable: true, render: (r) => <span className={`status ${r.status === "Performing" ? "ok" : r.status === "Default" ? "default" : "pending"}`}>{r.status}</span> },
  ];

  return (
    <>
      <PageHeader title="Issuers" description="Companies borrowing through the platform and their risk standing." />
      <div className="card">
        <div className="field" style={{ maxWidth: 340 }}>
          <label>Search issuer</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by company" />
        </div>
        <div style={{ marginTop: 14 }}>
          <DataTable columns={columns} rows={data?.issuers ?? []} emptyMessage="No matching issuers." />
        </div>
      </div>
    </>
  );
}
