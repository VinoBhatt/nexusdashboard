import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "../../lib/api";
import { money } from "../../lib/money";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";

const PRODUCT_FAMILIES = ["Invoice Financing", "Invoice Financing (Receivables)", "Invoice Financing (Purchases)", "Working Capital", "Insurance Premium Financing"];

const SUPPORTING_DOCS: { key: string; label: string }[] = [
  { key: "statutoryForm", label: "Company Statutory Form" },
  { key: "bankStatements", label: "Latest 6 Months Bank Statements" },
  { key: "auditedFinancials", label: "Latest 2 Years Audited Financial Statements" },
  { key: "managementAccount", label: "Latest Management Account" },
  { key: "supplierList", label: "List of Suppliers & Payment Terms" },
  { key: "customerList", label: "List of Customers & Payment Terms" },
];

interface BusinessInfo {
  businessInsurance?: "Yes" | "No";
  otherP2PFinancing?: "Yes" | "No";
  annualSales?: number;
  employeeCount?: number;
  clientCount?: number;
  documents?: Record<string, string>;
}
interface Application {
  id: string;
  financingType: string;
  islamicConventional: "Islamic" | "Conventional" | null;
  principalAmount: number;
  tenorDays: number;
  purpose: string | null;
  status: string;
  createdAt: string;
  businessInfo: BusinessInfo;
}

type Step = "product" | "forms" | "business" | "supporting";
const STEPS: { key: Step; label: string }[] = [
  { key: "product", label: "Product Selection" },
  { key: "forms", label: "Forms" },
  { key: "business", label: "Business Information" },
  { key: "supporting", label: "Supporting Documents" },
];

function statusClass(status: string) {
  if (status === "Draft") return "pending";
  if (status === "Pending Review") return "pending";
  if (status === "Rejected") return "default";
  return "ok";
}

function displayStatus(status: string) {
  if (status === "Pending Review") return "Under Review";
  if (status === "Draft") return "Draft";
  if (status === "Rejected") return "Rejected";
  return "Approved";
}

export default function Financing() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [step, setStep] = useState<Step>("product");
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({ queryKey: ["issuer", "applications"], queryFn: () => apiGet<{ applications: Application[] }>("/api/issuer/applications") });
  const editing = data?.applications.find((a) => a.id === editingId) ?? null;

  const [islamicConventional, setIslamicConventional] = useState<"Islamic" | "Conventional">("Islamic");
  const [productFamily, setProductFamily] = useState(PRODUCT_FAMILIES[0]);
  const [amount, setAmount] = useState(150000);
  const [tenorDays, setTenorDays] = useState(90);
  const [purpose, setPurpose] = useState("");
  const [businessInsurance, setBusinessInsurance] = useState<"Yes" | "No" | "">("");
  const [otherP2PFinancing, setOtherP2PFinancing] = useState<"Yes" | "No" | "">("");
  const [annualSales, setAnnualSales] = useState<number | "">("");
  const [employeeCount, setEmployeeCount] = useState<number | "">("");
  const [clientCount, setClientCount] = useState<number | "">("");
  const [docs, setDocs] = useState<Record<string, string>>({});

  const start = useMutation({
    mutationFn: () => apiPost<{ id: string }>("/api/issuer/applications", { islamicConventional, productFamily }),
    onSuccess: (res) => {
      setEditingId(res.id);
      setStep("forms");
      qc.invalidateQueries({ queryKey: ["issuer", "applications"] });
    },
    onError: (e: Error) => toast(e.message),
  });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch(`/api/issuer/applications/${editingId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issuer", "applications"] }),
    onError: (e: Error) => toast(e.message),
  });

  const submit = useMutation({
    mutationFn: () => apiPost(`/api/issuer/applications/${editingId}/submit`, {}),
    onSuccess: () => {
      toast("Application submitted. Status: Under Review.");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["issuer"] });
    },
    onError: (e: Error) => toast(e.message),
  });

  function beginNewApplication() {
    setEditingId(null);
    setIsCreating(true);
    setStep("product");
    setIslamicConventional("Islamic");
    setProductFamily(PRODUCT_FAMILIES[0]);
    setAmount(150000);
    setTenorDays(90);
    setPurpose("");
    setBusinessInsurance("");
    setOtherP2PFinancing("");
    setAnnualSales("");
    setClientCount("");
    setEmployeeCount("");
    setDocs({});
  }

  function editApplication(app: Application) {
    setEditingId(app.id);
    setIsCreating(false);
    setIslamicConventional(app.islamicConventional ?? "Islamic");
    setProductFamily(app.financingType);
    setAmount(app.principalAmount);
    setTenorDays(app.tenorDays);
    setPurpose(app.purpose ?? "");
    setBusinessInsurance(app.businessInfo.businessInsurance ?? "");
    setOtherP2PFinancing(app.businessInfo.otherP2PFinancing ?? "");
    setAnnualSales(app.businessInfo.annualSales ?? "");
    setEmployeeCount(app.businessInfo.employeeCount ?? "");
    setClientCount(app.businessInfo.clientCount ?? "");
    setDocs(app.businessInfo.documents ?? {});
    setStep("forms");
  }

  function currentFields() {
    return {
      islamicConventional,
      productFamily,
      amount,
      tenorDays,
      purpose,
      businessInsurance: businessInsurance || undefined,
      otherP2PFinancing: otherP2PFinancing || undefined,
      annualSales: annualSales === "" ? undefined : annualSales,
      employeeCount: employeeCount === "" ? undefined : employeeCount,
      clientCount: clientCount === "" ? undefined : clientCount,
      documents: docs,
    };
  }

  function saveDraft() {
    if (!editingId) return;
    patch.mutate(currentFields(), { onSuccess: () => toast("Draft saved.") });
  }

  function goToStep(next: Step) {
    if (!editingId) return;
    patch.mutate(currentFields(), { onSuccess: () => setStep(next) });
  }

  async function submitApplication() {
    if (!editingId) return;
    try {
      await patch.mutateAsync(currentFields());
      submit.mutate();
    } catch {
      /* patch's onError already toasts */
    }
  }

  function onFileChosen(key: string, file: File | undefined) {
    if (!file) return;
    setDocs((prev) => ({ ...prev, [key]: file.name }));
  }

  const requiresSpecificDoc = productFamily !== "Working Capital";

  if (editingId || isCreating || start.isPending) {
    return (
      <>
        <PageHeader title="Financing" description={`${editing?.status === "Draft" || !editing ? "Continue your" : "Editing your"} financing application.`} />
        <div className="card">
          <div className="section-head">
            <div className="row" style={{ gap: 8 }}>
              {STEPS.map((s) => (
                <button key={s.key} className={`btn small ${step === s.key ? "primary" : "secondary"}`} onClick={() => setStep(s.key)} type="button">
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {step === "product" && (
            <div className="stack">
              <div className="field">
                <label>Financing Type</label>
                <select value={islamicConventional} onChange={(e) => setIslamicConventional(e.target.value as "Islamic" | "Conventional")}>
                  <option value="Islamic">Islamic</option>
                  <option value="Conventional">Conventional</option>
                </select>
              </div>
              <div className="field">
                <label>Product</label>
                <select value={productFamily} onChange={(e) => setProductFamily(e.target.value)}>
                  {PRODUCT_FAMILIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              {!editingId && (
                <button className="btn primary" onClick={() => start.mutate()} disabled={start.isPending}>
                  Proceed
                </button>
              )}
              {editingId && (
                <button className="btn primary" onClick={() => goToStep("forms")}>
                  Next
                </button>
              )}
            </div>
          )}

          {step === "forms" && editingId && (
            <div className="stack">
              <div className="field">
                <label>Sign, Stamp and Attach the CRA Consent Form</label>
                <input type="file" onChange={(e) => onFileChosen("craConsent", e.target.files?.[0])} />
                {docs.craConsent && <div className="hint">Uploaded: {docs.craConsent}</div>}
              </div>
              <div className="field">
                <label>Stamp and Attach the Declaration Form</label>
                <input type="file" onChange={(e) => onFileChosen("declaration", e.target.files?.[0])} />
                {docs.declaration && <div className="hint">Uploaded: {docs.declaration}</div>}
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <button className="btn secondary" onClick={saveDraft}>
                  Save Draft
                </button>
                <button className="btn primary" onClick={() => goToStep("business")}>
                  Next
                </button>
              </div>
            </div>
          )}

          {step === "business" && editingId && (
            <div className="stack">
              <div className="field">
                <label>Financing Amount Requested (RM)</label>
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
              <div className="field">
                <label>Do you have any form of business insurance?</label>
                <select value={businessInsurance} onChange={(e) => setBusinessInsurance(e.target.value as "Yes" | "No")}>
                  <option value="">Select answer</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div className="field">
                <label>Has your company applied for financing with other P2P lending operators?</label>
                <select value={otherP2PFinancing} onChange={(e) => setOtherP2PFinancing(e.target.value as "Yes" | "No")}>
                  <option value="">Select answer</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div className="field">
                <label>Annual Sales / Turnover (RM)</label>
                <input type="number" min={0} value={annualSales} onChange={(e) => setAnnualSales(e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Number of Employees</label>
                <input type="number" min={0} value={employeeCount} onChange={(e) => setEmployeeCount(e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Number of Clients</label>
                <input type="number" min={0} value={clientCount} onChange={(e) => setClientCount(e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <button className="btn secondary" onClick={saveDraft}>
                  Save Draft
                </button>
                <button className="btn primary" onClick={() => goToStep("supporting")}>
                  Next
                </button>
              </div>
            </div>
          )}

          {step === "supporting" && editingId && (
            <div className="stack">
              {SUPPORTING_DOCS.map((doc) => (
                <div className="field" key={doc.key}>
                  <label>{doc.label}</label>
                  <input type="file" onChange={(e) => onFileChosen(doc.key, e.target.files?.[0])} />
                  {docs[doc.key] && <div className="hint">Uploaded: {docs[doc.key]}</div>}
                </div>
              ))}
              {requiresSpecificDoc && (
                <div className="field">
                  <label>Invoices, Contracts, SPAs, Awards, or Insurance Documents for Financing</label>
                  <input type="file" onChange={(e) => onFileChosen("specificFinanceDoc", e.target.files?.[0])} />
                  {docs.specificFinanceDoc && <div className="hint">Uploaded: {docs.specificFinanceDoc}</div>}
                </div>
              )}
              <div className="row" style={{ justifyContent: "space-between" }}>
                <button className="btn secondary" onClick={saveDraft}>
                  Save Draft
                </button>
                <button className="btn primary" disabled={patch.isPending || submit.isPending} onClick={submitApplication}>
                  Submit Application
                </button>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Financing"
        description="Applications dashboard - track existing applications or start a new one."
        actions={
          <button className="btn primary" onClick={beginNewApplication}>
            New Application
          </button>
        }
      />
      <div className="card">
        <div className="section-head">
          <h3>Applications Dashboard</h3>
        </div>
        <div className="list">
          {(data?.applications ?? []).map((app) => (
            <div key={app.id} className="list-item">
              <div>
                <b>{app.id}</b>
                <div className="sub">
                  {app.financingType} · {money(app.principalAmount)} · {new Date(app.createdAt).toLocaleDateString("en-GB")}
                </div>
              </div>
              <div className="row" style={{ alignItems: "center" }}>
                <span className={`status ${statusClass(app.status)}`}>{displayStatus(app.status)}</span>
                {app.status === "Draft" && (
                  <button className="btn small secondary" onClick={() => editApplication(app)}>
                    Continue Draft
                  </button>
                )}
              </div>
            </div>
          ))}
          {(data?.applications ?? []).length === 0 && <div className="sub">No applications submitted yet.</div>}
        </div>
      </div>
    </>
  );
}
