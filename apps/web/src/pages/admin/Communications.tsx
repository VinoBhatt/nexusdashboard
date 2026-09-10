import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { DataTable, type Column } from "../../components/data/DataTable";
import { SkeletonPage, QueryError } from "../../components/QueryState";

interface InvestorOption {
  id: string;
  name: string;
  type: "Retail" | "Corporate";
}
interface NoteOption {
  id: string;
  issuerName: string;
  noteName: string | null;
}
interface CommunicationRow {
  id: string;
  audience: string;
  facilityId: string | null;
  specificInvestorId: string | null;
  title: string;
  message: string;
  sendDate: string;
  recipientCount: number;
  createdAt: string;
}

const AUDIENCE_LABEL: Record<string, string> = {
  ALL_INVESTORS: "All Investors",
  FACILITY_INVESTORS: "Investors in a Note",
  SPECIFIC_INVESTOR: "Specific Investor",
};

export default function AdminCommunications() {
  const toast = useToast();
  const qc = useQueryClient();

  const { data: investorsData } = useQuery({
    queryKey: ["admin", "investors", "picker"],
    queryFn: () => apiGet<{ investors: InvestorOption[] }>("/api/admin/investors"),
  });
  const retailInvestors = useMemo(() => (investorsData?.investors ?? []).filter((i) => i.type === "Retail"), [investorsData]);

  const { data: notesData } = useQuery({
    queryKey: ["admin", "repayments"],
    queryFn: () => apiGet<{ notes: NoteOption[] }>("/api/admin/repayments"),
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "communications"],
    queryFn: () => apiGet<{ communications: CommunicationRow[] }>("/api/admin/communications"),
  });

  const [audience, setAudience] = useState("ALL_INVESTORS");
  const [facilityId, setFacilityId] = useState("");
  const [specificInvestorId, setSpecificInvestorId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sendDate, setSendDate] = useState(() => new Date().toISOString().slice(0, 10));

  const submitMutation = useMutation({
    mutationFn: () =>
      apiPost<{ ok: true; id: string; recipientCount: number }>("/api/admin/communications", {
        audience,
        facilityId: audience === "FACILITY_INVESTORS" ? facilityId : undefined,
        specificInvestorId: audience === "SPECIFIC_INVESTOR" ? specificInvestorId : undefined,
        title,
        message,
        sendDate,
      }),
    onSuccess: (r) => {
      toast(`Sent to ${r.recipientCount} recipient${r.recipientCount === 1 ? "" : "s"}.`);
      setTitle("");
      setMessage("");
      qc.invalidateQueries({ queryKey: ["admin", "communications"] });
      refetch();
    },
    onError: (e: Error) => toast(e.message),
  });

  const columns: Column<CommunicationRow>[] = [
    { key: "title", label: "Title", sortable: true },
    { key: "audience", label: "Audience", sortable: true, render: (r) => AUDIENCE_LABEL[r.audience] ?? r.audience },
    { key: "recipientCount", label: "Recipients", sortable: true },
    { key: "sendDate", label: "Send Date", sortable: true },
  ];

  const canSubmit =
    !!title && !!message && (audience !== "FACILITY_INVESTORS" || !!facilityId) && (audience !== "SPECIFIC_INVESTOR" || !!specificInvestorId);

  if (isLoading) return <SkeletonPage />;
  if (isError || !data) return <QueryError onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader title="Communications" description="Send a message to investors and keep a record of what was sent, to whom, and when." />
      <div className="card">
        <div className="stack">
          <div className="field">
            <label htmlFor="cmAudience">Audience</label>
            <select id="cmAudience" value={audience} onChange={(e) => setAudience(e.target.value)}>
              {Object.entries(AUDIENCE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {audience === "FACILITY_INVESTORS" && (
            <div className="field">
              <label htmlFor="cmFacility">Note</label>
              <select id="cmFacility" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
                <option value="">Select a note…</option>
                {(notesData?.notes ?? []).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.noteName ?? n.id} · {n.issuerName}
                  </option>
                ))}
              </select>
            </div>
          )}
          {audience === "SPECIFIC_INVESTOR" && (
            <div className="field">
              <label htmlFor="cmInvestor">Investor</label>
              <select id="cmInvestor" value={specificInvestorId} onChange={(e) => setSpecificInvestorId(e.target.value)}>
                <option value="">Select an investor…</option>
                {retailInvestors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="cmTitle">Title</label>
            <input id="cmTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cmMessage">Message</label>
            <textarea id="cmMessage" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} />
          </div>
          <div className="field">
            <label htmlFor="cmSendDate">Send date</label>
            <input id="cmSendDate" type="date" value={sendDate} onChange={(e) => setSendDate(e.target.value)} />
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn primary" disabled={!canSubmit || submitMutation.isPending} onClick={() => submitMutation.mutate()}>
              Send
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <h3>Communications History</h3>
        </div>
        <DataTable columns={columns} rows={data.communications} emptyMessage="No communications sent yet." />
      </div>
    </>
  );
}
