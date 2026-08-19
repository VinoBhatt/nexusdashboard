import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";

interface Facility {
  id: string;
  financingType: string;
  principalAmount: number;
  ratePct: number;
  tenorDays: number;
  status: string;
}

export default function Financing() {
  const [financingType, setFinancingType] = useState<"Invoice Financing" | "Contract Financing" | "Working Capital">("Invoice Financing");
  const [amount, setAmount] = useState(150000);
  const [tenorDays, setTenorDays] = useState(90);
  const [purpose, setPurpose] = useState("Working capital to fulfil confirmed purchase orders.");
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({ queryKey: ["issuer", "facilities"], queryFn: () => apiGet<{ facilities: Facility[] }>("/api/issuer/facilities") });

  const apply = useMutation({
    mutationFn: () => apiPost("/api/issuer/facilities/apply", { financingType, amount, tenorDays, purpose }),
    onSuccess: () => {
      toast("Financing application submitted for review.");
      qc.invalidateQueries({ queryKey: ["issuer"] });
    },
    onError: (e: Error) => toast(e.message),
  });

  return (
    <>
      <PageHeader title="Financing" description="Active facilities and new financing applications." />
      <div className="grid cols-2">
        <div className="card">
          <div className="section-head">
            <h3>Active Facilities</h3>
          </div>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                <tr>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Principal</th>
                  <th>Rate</th>
                  <th>Status</th>
                </tr>
                {(data?.facilities ?? []).map((f) => (
                  <tr key={f.id}>
                    <td>{f.id}</td>
                    <td>{f.financingType}</td>
                    <td>{money(f.principalAmount)}</td>
                    <td>{f.ratePct}%</td>
                    <td>
                      <span className={`status ${f.status === "Ongoing" ? "ok" : f.status === "Pending Review" ? "pending" : f.status === "Rejected" ? "default" : "pending"}`}>{f.status}</span>
                    </td>
                  </tr>
                ))}
                {(data?.facilities ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5}>No facilities yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="section-head">
            <h3>Apply for New Financing</h3>
          </div>
          <div className="stack">
            <div className="field">
              <label>Financing type</label>
              <select value={financingType} onChange={(e) => setFinancingType(e.target.value as typeof financingType)}>
                <option>Invoice Financing</option>
                <option>Contract Financing</option>
                <option>Working Capital</option>
              </select>
            </div>
            <div className="field">
              <label>Requested amount (MYR)</label>
              <input type="number" min={1000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Tenor (days)</label>
              <select value={tenorDays} onChange={(e) => setTenorDays(Number(e.target.value))}>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={360}>12 months</option>
                <option value={540}>18 months</option>
              </select>
            </div>
            <div className="field">
              <label>Purpose</label>
              <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </div>
            <button className="btn primary" disabled={apply.isPending} onClick={() => apply.mutate()}>
              Submit Application
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
