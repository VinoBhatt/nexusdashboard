import { useQuery } from "@tanstack/react-query";
import { apiGet, downloadUrl } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";
import { SellHoldingCard, type Holding } from "../../components/retail/SellHoldingCard";

const columns: Column<Holding>[] = [
  { key: "facilityId", label: "Facility", sortable: true },
  { key: "issuerName", label: "Issuer", sortable: true },
  { key: "ratePct", label: "Returns (p.a.)", sortable: true, render: (h) => `${h.ratePct}%` },
  { key: "amountInvested", label: "Invested", sortable: true, render: (h) => money(h.amountInvested) },
  { key: "expectedReturn", label: "Expected", sortable: true, render: (h) => money(h.expectedReturn) },
  { key: "actualReturn", label: "Actual", sortable: true, render: (h) => money(h.actualReturn) },
];

export default function CompletedNotes() {
  const { data } = useQuery({
    queryKey: ["portfolio", "holdings", "Completed"],
    queryFn: () => apiGet<{ holdings: Holding[] }>(`/api/portfolio/holdings?status=Completed`),
  });
  const holdings = data?.holdings ?? [];
  const totalProfit = holdings.reduce((sum, h) => sum + (h.actualReturn - h.amountInvested), 0);

  return (
    <>
      <PageHeader
        title="Completed Notes"
        description="Notes that have fully matured and repaid."
        actions={
          <a className="btn small" href={downloadUrl("/api/export/portfolio.csv")}>
            Export CSV
          </a>
        }
      />
      <div className="card" style={{ marginBottom: 16 }}>
        {holdings.length > 0 && (
          <div className="grid cols-2" style={{ marginBottom: 14 }}>
            <div className="card" style={{ boxShadow: "none", background: "#fbfdff" }}>
              <span className="sub">Total Profit Earned (RM)</span>
              <h3 style={{ margin: "4px 0 0" }}>{money(totalProfit)}</h3>
            </div>
            <div className="card" style={{ boxShadow: "none", background: "#fbfdff" }}>
              <span className="sub">Average Profit (RM)</span>
              <h3 style={{ margin: "4px 0 0" }}>{money(totalProfit / holdings.length)}</h3>
            </div>
          </div>
        )}
        <DataTable columns={columns} rows={holdings} emptyMessage="No completed notes yet." />
      </div>

      <SellHoldingCard holdings={holdings} />
    </>
  );
}
