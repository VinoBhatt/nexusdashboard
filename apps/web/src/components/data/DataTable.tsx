import { useMemo, useState } from "react";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
}

export function DataTable<T>({
  columns,
  rows,
  pageSize = 8,
  emptyMessage = "No results.",
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  pageSize?: number;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const getValue = col.sortValue ?? ((row: T) => (row as Record<string, unknown>)[sortKey] as string | number);
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  return (
    <div>
      <div className="table-wrap">
        <table className="table">
          <tbody>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={col.sortable ? { cursor: "pointer", userSelect: "none" } : undefined} onClick={() => col.sortable && toggleSort(col.key)}>
                  {col.label}
                  {col.sortable && sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
            {pageRows.map((row, i) => (
              <tr
                key={i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); } } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
                style={onRowClick ? { cursor: "pointer" } : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key}>{col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "")}</td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="table-empty">
                  <div className="table-empty-icon" aria-hidden="true">
                    ⌀
                  </div>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
          <button className="btn small" disabled={clampedPage === 0} onClick={() => setPage(clampedPage - 1)}>
            Previous
          </button>
          <span className="sub">
            Page {clampedPage + 1} of {totalPages}
          </span>
          <button className="btn small" disabled={clampedPage >= totalPages - 1} onClick={() => setPage(clampedPage + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
