import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { DataTable, type Column } from "../../components/data/DataTable";
import { SkeletonPage, QueryError } from "../../components/QueryState";

interface Application {
  id: string;
  issuerName: string;
  financingType: string;
  islamicConventional: string | null;
  principalAmount: number;
  tenorDays: number;
  purpose: string | null;
  createdAt: string;
}
interface BusinessInfo {
  businessInsurance?: string;
  otherP2PFinancing?: string;
  annualSales?: number;
  employeeCount?: number;
  clientCount?: number;
  documents?: Record<string, string>;
}

export default function CampaignManagerApplications() {
  const [openId, setOpenId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["cm", "applications"], queryFn: () => apiGet<{ applications: Application[] }>("/api/campaign-manager/applications") });
  const { data: detail } = useQuery({
    queryKey: ["cm", "application", openId],
    queryFn: () => apiGet<{ facility: Application; businessInfo: BusinessInfo }>(`/api/campaign-manager/applications/${openId}`),
    enabled: !!openId,
  });

  const columns: Column<Application>[] = [
    { key: "issuerName", label: "Issuer", sortable: true },
    { key: "financingType", label: "Product", sortable: true, render: (a) => `${a.islamicConventional ? `${a.islamicConventional} ` : ""}${a.financingType}` },
    { key: "principalAmount", label: "Amount (MYR)", sortable: true, render: (a) => money(a.principalAmount) },
    { key: "createdAt", label: "Date Applied", sortable: true, render: (a) => new Date(a.createdAt).toLocaleDateString("en-GB") },
    { key: "id", label: "Action", render: (a) => <button className="btn small" onClick={() => setOpenId(a.id)}>View</button> },
  ];

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  if (openId && detail) {
    const { facility, businessInfo } = detail;
    const docsEntries = Object.entries(businessInfo.documents ?? {});
    return (
      <>
        <PageHeader title="Application Detail" description={facility.issuerName} actions={
          <button className="btn secondary" onClick={() => setOpenId(null)}>
            Back to Applications
          </button>
        } />
        <div className="card">
          <div className="grid cols-3">
            <div className="metric">
              <div className="label">Requested amount</div>
              <div className="value">{money(facility.principalAmount)}</div>
            </div>
            <div className="metric">
              <div className="label">Tenor</div>
              <div className="value">{facility.tenorDays} days</div>
            </div>
            <div className="metric">
              <div className="label">Product</div>
              <div className="value">{facility.islamicConventional} {facility.financingType}</div>
            </div>
            <div className="metric">
              <div className="label">Annual sales</div>
              <div className="value">{businessInfo.annualSales ? money(businessInfo.annualSales) : "-"}</div>
            </div>
            <div className="metric">
              <div className="label">Employees</div>
              <div className="value">{businessInfo.employeeCount ?? "-"}</div>
            </div>
            <div className="metric">
              <div className="label">Clients</div>
              <div className="value">{businessInfo.clientCount ?? "-"}</div>
            </div>
          </div>
          <div className="section-head" style={{ marginTop: 16 }}>
            <h3>Purpose</h3>
          </div>
          <p className="sub">{facility.purpose ?? "-"}</p>
          <div className="section-head" style={{ marginTop: 16 }}>
            <h3>Uploaded Documents</h3>
          </div>
          <div>
            {docsEntries.length ? docsEntries.map(([k, v]) => <span key={k} className="pill">{v}</span>) : <span className="sub">No documents attached.</span>}
          </div>
          <div className="footer-actions" style={{ marginTop: 20 }}>
            <button className="btn primary" onClick={() => navigate(`/app/cm-proposals?draft=${facility.id}`)}>
              Create Proposal
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Applications" description="Financing applications awaiting review." />
      <div className="card">
        <DataTable columns={columns} rows={data?.applications ?? []} emptyMessage="No applications pending review." />
      </div>
    </>
  );
}
