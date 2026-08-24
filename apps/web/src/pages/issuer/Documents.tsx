import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPostForm } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { SkeletonPage, QueryError } from "../../components/QueryState";

const DOC_TYPES = ["Certificate of Incorporation", "Latest Audited Financials", "Bank Statements (6 months)", "Director IC / Passport", "Board Resolution"];

interface DocRow {
  docType: string;
  status: "Verified" | "Pending" | "Action required";
  fileName: string | null;
}

export default function Documents() {
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["issuer", "documents"], queryFn: () => apiGet<{ documents: DocRow[] }>("/api/issuer/documents") });

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Please choose a file to upload.");
      const form = new FormData();
      form.set("docType", docType);
      form.set("file", file);
      return apiPostForm<{ message: string }>("/api/issuer/documents", form);
    },
    onSuccess: (res) => {
      toast(res.message);
      qc.invalidateQueries({ queryKey: ["issuer", "documents"] });
      setFile(null);
    },
    onError: (e: Error) => toast(e.message),
  });

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader title="Documents" description="Compliance documents required to stay in good standing." />
      <div className="grid cols-2">
        <div className="card">
          <div className="section-head">
            <h3>Compliance Documents</h3>
          </div>
          <div className="list">
            {(data?.documents ?? []).map((d) => (
              <div key={d.docType} className="list-item">
                <div>
                  <b>{d.docType}</b>
                  {d.fileName && <div className="sub">{d.fileName}</div>}
                </div>
                <span className={`status ${d.status === "Verified" ? "ok" : d.status === "Pending" ? "pending" : "overdue"}`}>{d.status}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="section-head">
            <h3>Upload a Document</h3>
          </div>
          <div className="stack">
            <div className="field">
              <label htmlFor="issuerDocType">Document type</label>
              <select id="issuerDocType" value={docType} onChange={(e) => setDocType(e.target.value)}>
                {DOC_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="upload">
              <strong>{file ? file.name : "Upload document"}</strong>
              <div className="sub">Accepted format: PDF, JPG, PNG</div>
              <input type="file" style={{ marginTop: 10 }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <button className="btn primary" disabled={upload.isPending} onClick={() => upload.mutate()}>
              Submit for Review
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
