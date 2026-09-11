import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";
import { SkeletonPage, QueryError } from "../../components/QueryState";

interface Note {
  id: string;
  financingType: string;
}
interface LedgerRow {
  scope: "ISSUER" | "INVESTOR" | "FEES";
  at: string;
  noteId: string | null;
  investorId: string | null;
  product: string | null;
  party: string;
  type: string;
  reference: string;
  amount: number;
  grossReturn?: number;
  platformFee?: number;
  sst?: number;
  netReturn?: number;
  status: string;
}

const TABS = [
  { id: "ALL", label: "All" },
  { id: "INVESTOR", label: "Investor Transactions" },
  { id: "ISSUER", label: "Issuer Transactions" },
  { id: "FEES", label: "Platform Fees & SST" },
] as const;

export default function AdminTransactions() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("ALL");
  const [search, setSearch] = useState("");
  const [noteId, setNoteId] = useState("ALL");
  const [product, setProduct] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: notesData } = useQuery({
    queryKey: ["admin", "repayments"],
    queryFn: () => apiGet<{ notes: Note[] }>("/api/admin/repayments"),
  });
  const products = useMemo(() => [...new Set((notesData?.notes ?? []).map((n) => n.financingType))], [notesData]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "transactions", tab, search, noteId, product, from, to],
    queryFn: () =>
      apiGet<{ rows: LedgerRow[] }>(
        `/api/admin/transactions?${new URLSearchParams({ tab, search, noteId, product, from, to }).toString()}`
      ),
  });

  const columns: Column<LedgerRow>[] =
    tab === "FEES"
      ? [
          { key: "at", label: "Date", sortable: true, render: (r) => new Date(r.at).toLocaleDateString() },
          { key: "noteId", label: "Note ID", sortable: true, render: (r) => r.noteId ?? "—" },
          { key: "product", label: "Product", sortable: true, render: (r) => r.product ?? "—" },
          { key: "party", label: "Investor", sortable: true },
          { key: "grossReturn", label: "Gross Return", sortable: true, render: (r) => money(r.grossReturn ?? 0) },
          { key: "platformFee", label: "Platform Fee", sortable: true, render: (r) => money(r.platformFee ?? 0) },
          { key: "sst", label: "SST", sortable: true, render: (r) => money(r.sst ?? 0) },
          { key: "netReturn", label: "Net Return", sortable: true, render: (r) => money(r.netReturn ?? 0) },
          { key: "status", label: "Status", sortable: true },
        ]
      : [
          { key: "at", label: "Date", sortable: true, render: (r) => new Date(r.at).toLocaleString() },
          { key: "noteId", label: "Note ID", sortable: true, render: (r) => r.noteId ?? "—" },
          { key: "party", label: "Party", sortable: true },
          { key: "type", label: "Type", sortable: true },
          { key: "reference", label: "Reference" },
          { key: "amount", label: "Amount", sortable: true, render: (r) => money(r.amount) },
          { key: "status", label: "Status", sortable: true },
        ];

  if (isLoading) return <SkeletonPage />;
  if (isError || !data) return <QueryError onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader title="Transactions" description="Platform-wide issuer and investor transaction history." />
      <div className="transaction-tabs" role="tablist" aria-label="Transaction categories">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="card">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="txSearch">Search</label>
            <input id="txSearch" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Note ID, party or reference" />
          </div>
          <div className="field">
            <label htmlFor="txNote">Note</label>
            <select id="txNote" value={noteId} onChange={(e) => setNoteId(e.target.value)}>
              <option value="ALL">All notes</option>
              {(notesData?.notes ?? []).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id}
                </option>
              ))}
            </select>
          </div>
          {tab === "FEES" && (
            <div className="field">
              <label htmlFor="txProduct">Product</label>
              <select id="txProduct" value={product} onChange={(e) => setProduct(e.target.value)}>
                <option value="ALL">All products</option>
                {products.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="txFrom">Date From</label>
            <input id="txFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="txTo">Date To</label>
            <input id="txTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="card">
        <DataTable columns={columns} rows={data.rows} emptyMessage="No matching transactions." pageSize={15} />
      </div>
    </>
  );
}
