import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, downloadUrl } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";
import { SellHoldingCard, type Holding } from "../../components/retail/SellHoldingCard";

const FILTERS = ["All", "Ongoing", "Default"] as const;

const columns: Column<Holding>[] = [
  { key: "facilityId", label: "Facility", sortable: true },
  { key: "issuerName", label: "Issuer", sortable: true },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (h) => <span className={`status ${h.status === "Default" ? "default" : "pending"}`}>{h.status}</span>,
  },
  { key: "ratePct", label: "Returns (p.a.)", sortable: true, render: (h) => `${h.ratePct}%` },
  { key: "amountInvested", label: "Invested", sortable: true, render: (h) => money(h.amountInvested) },
  { key: "expectedReturn", label: "Expected", sortable: true, render: (h) => money(h.expectedReturn) },
  { key: "actualReturn", label: "Actual", sortable: true, render: (h) => money(h.actualReturn) },
];

export default function OngoingNotes() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const { data } = useQuery({
    queryKey: ["portfolio", "holdings", "all"],
    queryFn: () => apiGet<{ holdings: Holding[] }>(`/api/portfolio/holdings`),
  });
  const active = (data?.holdings ?? []).filter((h) => h.status !== "Completed");
  const shown = filter === "All" ? active : active.filter((h) => h.status === filter);

  return (
    <>
      <PageHeader
        title="On-Going Notes"
        description="Funded notes still accruing profit, including any in default."
        actions={
          <a className="btn small" href={downloadUrl("/api/export/portfolio.csv")}>
            Export CSV
          </a>
        }
      />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          {FILTERS.map((f) => (
            <button key={f} className={`btn small ${filter === f ? "primary" : ""}`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <DataTable columns={columns} rows={shown} emptyMessage="No on-going notes match this filter." />
      </div>

      <SellHoldingCard holdings={active} />
    </>
  );
}
