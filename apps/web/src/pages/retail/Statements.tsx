import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, downloadUrl } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";

interface Statement {
  id: string;
  periodLabel: string;
  type: string;
  status: "Generating" | "Ready";
}

export default function Statements() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ["statements"],
    queryFn: () => apiGet<{ statements: Statement[] }>("/api/statements"),
  });

  const generate = useMutation({
    mutationFn: () => apiPost("/api/statements/generate", { period: "August 2026", type: "Monthly" }),
    onSuccess: () => {
      toast("Monthly statement queued. It will be ready shortly.");
      qc.invalidateQueries({ queryKey: ["statements"] });
    },
  });

  return (
    <>
      <PageHeader title="Statements" description="Request and download monthly and annual account statements." />
      <div className="grid cols-2">
        <div className="card">
          <div className="section-head">
            <h3>Account Statements</h3>
          </div>
          <div className="list">
            {(data?.statements ?? []).map((s) => (
              <div key={s.id} className="list-item">
                <div>
                  <b>{s.periodLabel}</b>
                  <div className="sub">{s.type} statement</div>
                </div>
                <div className="row">
                  <span className={`status ${s.status === "Ready" ? "ok" : "pending"}`}>{s.status}</span>
                  {s.status === "Ready" && (
                    <a className="btn small" href={downloadUrl(`/api/statements/${s.id}/download`)}>
                      Download
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="section-head">
            <h3>Statement Queue</h3>
            <button className="btn small" disabled={generate.isPending} onClick={() => generate.mutate()}>
              Generate monthly
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                <tr>
                  <th>Period</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
                {(data?.statements ?? []).map((s) => (
                  <tr key={s.id}>
                    <td>{s.periodLabel}</td>
                    <td>{s.type}</td>
                    <td>
                      <span className={`status ${s.status === "Ready" ? "ok" : "pending"}`}>{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
