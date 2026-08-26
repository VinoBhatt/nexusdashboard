import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiGet, apiPostForm } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { SkeletonPage, QueryError } from "../../components/QueryState";
import {
  NATURE_OF_JOB,
  GROSS_ANNUAL_INCOME,
  NET_WORTH,
  SOURCE_OF_FUNDS,
  BANKS,
  LEGAL_ENTITY_TYPES,
  CORPORATE_SOURCE_OF_FUNDS,
  NET_ASSETS_RANGE,
  FINANCING_TENURES,
  FINANCING_PURPOSES,
} from "../../lib/profileOptions";

type Tab = "individual" | "corporate" | "issuer";

interface ActivationStatus {
  activated: { individual: boolean; corporate: boolean; issuer: boolean };
}

export default function Activate() {
  const { activateIndividual, activateCorporate, activateIssuer } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("individual");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const { data: status, isLoading, isError, refetch } = useQuery({ queryKey: ["activate", "status"], queryFn: () => apiGet<ActivationStatus>("/api/activate/status") });

  // Individual Investor
  const [jobType, setJobType] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [incomeRange, setIncomeRange] = useState("");
  const [netWorth, setNetWorth] = useState("");
  const [sourceOfFunds, setSourceOfFunds] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankStatementFile, setBankStatementFile] = useState<File | null>(null);

  // Corporate Investor
  const [corpCompanyName, setCorpCompanyName] = useState("");
  const [corpRegNo, setCorpRegNo] = useState("");
  const [corpEntityType, setCorpEntityType] = useState(LEGAL_ENTITY_TYPES[0]);
  const [corpSourceOfFunds, setCorpSourceOfFunds] = useState("");
  const [corpNetAssets, setCorpNetAssets] = useState("");
  const [corpBankName, setCorpBankName] = useState("");
  const [corpBankAccountNumber, setCorpBankAccountNumber] = useState("");
  const [corpDocs, setCorpDocs] = useState<Record<string, string>>({});

  // Issuer
  const [issuerCompanyName, setIssuerCompanyName] = useState("");
  const [issuerRegNo, setIssuerRegNo] = useState("");
  const [issuerEntityType, setIssuerEntityType] = useState(LEGAL_ENTITY_TYPES[0]);
  const [amountToRaise, setAmountToRaise] = useState("");
  const [tenure, setTenure] = useState(FINANCING_TENURES[1]);
  const [purpose, setPurpose] = useState(FINANCING_PURPOSES[0]);
  const [issuerDocs, setIssuerDocs] = useState<Record<string, string>>({});

  function onFileChosen(setter: (v: Record<string, string>) => void, prev: Record<string, string>, key: string, file: File | undefined) {
    if (!file) return;
    setter({ ...prev, [key]: file.name });
  }

  async function submitIndividual() {
    setSubmitting(true);
    setError("");
    try {
      await activateIndividual({ jobType, companyName, incomeRange, netWorth, sourceOfFunds, bankName, bankAccountNumber });
      if (bankStatementFile) {
        const fd = new FormData();
        fd.set("docType", "Bank Statement");
        fd.set("file", bankStatementFile);
        await apiPostForm("/api/account/documents", fd);
      }
      toast("Investor profile activated. Verification is in progress.");
      navigate("/app/overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCorporate() {
    setSubmitting(true);
    setError("");
    try {
      await activateCorporate({
        companyName: corpCompanyName,
        registrationNumber: corpRegNo,
        legalEntityType: corpEntityType,
        sourceOfFunds: corpSourceOfFunds,
        netAssetsRange: corpNetAssets,
        bankName: corpBankName,
        bankAccountNumber: corpBankAccountNumber,
      });
      toast("Corporate investor account activated. Verification is in progress.");
      navigate("/app/overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitIssuer() {
    setSubmitting(true);
    setError("");
    try {
      await activateIssuer({
        companyName: issuerCompanyName,
        registrationNumber: issuerRegNo,
        legalEntityType: issuerEntityType,
        amountToRaise: amountToRaise ? Number(amountToRaise) : undefined,
        tenure,
        purpose,
      });
      toast("Issuer application submitted. Verification is in progress.");
      navigate("/app/overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setSubmitting(false);
    }
  }

  const alreadyActivated = status?.activated.individual || status?.activated.corporate || status?.activated.issuer;

  if (isLoading) return <SkeletonPage />;
  if (isError) return <QueryError onRetry={() => refetch()} />;

  if (alreadyActivated) {
    return (
      <>
        <PageHeader title="Start Investing" description="Barrier 2 - sub-profile activation." />
        <div className="card">
          <h3>You're already activated</h3>
          <p className="sub">This account already has an active sub-profile. Head to your dashboard to continue.</p>
          <button className="btn primary" style={{ marginTop: 12 }} onClick={() => navigate("/app/overview")}>
            Go to dashboard
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Start Investing" description="Choose the kind of account to activate. This is what triggers real KYC/KYB checks and issues your CIF + wallet." />
      <div className="card">
        <div className="tabs">
          <button type="button" className={`tab ${tab === "individual" ? "active" : ""}`} onClick={() => setTab("individual")}>
            Individual Investor
          </button>
          <button type="button" className={`tab ${tab === "corporate" ? "active" : ""}`} onClick={() => setTab("corporate")}>
            Corporate Investor
          </button>
          <button type="button" className={`tab ${tab === "issuer" ? "active" : ""}`} onClick={() => setTab("issuer")}>
            Issuer
          </button>
        </div>

        {tab === "individual" && (
          <div className="stack">
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="field">
                <label htmlFor="actJobType">Occupation</label>
                <select id="actJobType" value={jobType} onChange={(e) => setJobType(e.target.value)}>
                  <option value="">Select…</option>
                  {NATURE_OF_JOB.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="actEmployer">Employer / company name</label>
                <input id="actEmployer" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Petronas Bhd" />
              </div>
              <div className="field">
                <label htmlFor="actIncome">Gross annual income</label>
                <select id="actIncome" value={incomeRange} onChange={(e) => setIncomeRange(e.target.value)}>
                  <option value="">Select…</option>
                  {GROSS_ANNUAL_INCOME.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="actNetWorth">Total net worth</label>
                <select id="actNetWorth" value={netWorth} onChange={(e) => setNetWorth(e.target.value)}>
                  <option value="">Select…</option>
                  {NET_WORTH.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ gridColumn: "1/-1" }}>
                <label htmlFor="actSourceOfFunds">Source of funds</label>
                <select id="actSourceOfFunds" value={sourceOfFunds} onChange={(e) => setSourceOfFunds(e.target.value)}>
                  <option value="">Select…</option>
                  {SOURCE_OF_FUNDS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>
            <h4>Banking details</h4>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="field">
                <label htmlFor="actBankName">Registered bank name</label>
                <select id="actBankName" value={bankName} onChange={(e) => setBankName(e.target.value)}>
                  <option value="">Select bank…</option>
                  {BANKS.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="actBankAccountNumber">Bank account number</label>
                <input id="actBankAccountNumber" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="e.g. 512345678901" />
              </div>
              <div className="field" style={{ gridColumn: "1/-1" }}>
                <label htmlFor="actBankStatement">Bank statement header</label>
                <input id="actBankStatement" type="file" onChange={(e) => setBankStatementFile(e.target.files?.[0] ?? null)} />
                {bankStatementFile && <div className="hint">Selected: {bankStatementFile.name}</div>}
              </div>
            </div>
            {error && (
              <div className="banner-notice">
                <div>{error}</div>
              </div>
            )}
            <button className="btn primary" disabled={submitting} onClick={submitIndividual}>
              {submitting && <span className="spinner" aria-hidden="true" />}
              Activate investor profile
            </button>
          </div>
        )}

        {tab === "corporate" && (
          <div className="stack">
            <div className="banner-notice">
              <div>CIF assigned from your company registration number. KYB runs on the company entity, not you personally.</div>
            </div>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="field" style={{ gridColumn: "1/-1" }}>
                <label htmlFor="actCorpCompanyName">Company name *</label>
                <input id="actCorpCompanyName" value={corpCompanyName} onChange={(e) => setCorpCompanyName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="actCorpRegNo">Company registration number</label>
                <input id="actCorpRegNo" value={corpRegNo} onChange={(e) => setCorpRegNo(e.target.value)} placeholder="e.g. 202301012345" />
              </div>
              <div className="field">
                <label htmlFor="actCorpEntityType">Legal entity type</label>
                <select id="actCorpEntityType" value={corpEntityType} onChange={(e) => setCorpEntityType(e.target.value)}>
                  {LEGAL_ENTITY_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <h4>Statutory documents</h4>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="field">
                <label htmlFor="actBoardReso">Board Resolution / Letter of Authorisation</label>
                <input id="actBoardReso" type="file" onChange={(e) => onFileChosen(setCorpDocs, corpDocs, "boardReso", e.target.files?.[0])} />
                {corpDocs.boardReso && <div className="hint">Selected: {corpDocs.boardReso}</div>}
              </div>
              <div className="field">
                <label htmlFor="actForm14">Form 14 - Return of allotment</label>
                <input id="actForm14" type="file" onChange={(e) => onFileChosen(setCorpDocs, corpDocs, "form14", e.target.files?.[0])} />
                {corpDocs.form14 && <div className="hint">Selected: {corpDocs.form14}</div>}
              </div>
              <div className="field">
                <label htmlFor="actForm17">Form 17 - Statutory declaration</label>
                <input id="actForm17" type="file" onChange={(e) => onFileChosen(setCorpDocs, corpDocs, "form17", e.target.files?.[0])} />
                {corpDocs.form17 && <div className="hint">Selected: {corpDocs.form17}</div>}
              </div>
            </div>
            <h4>Financial &amp; banking details</h4>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="field">
                <label htmlFor="actCorpSourceOfFunds">Source of funds</label>
                <select id="actCorpSourceOfFunds" value={corpSourceOfFunds} onChange={(e) => setCorpSourceOfFunds(e.target.value)}>
                  <option value="">Select…</option>
                  {CORPORATE_SOURCE_OF_FUNDS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="actCorpNetAssets">Net assets range</label>
                <select id="actCorpNetAssets" value={corpNetAssets} onChange={(e) => setCorpNetAssets(e.target.value)}>
                  <option value="">Select…</option>
                  {NET_ASSETS_RANGE.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="actCorpBankName">Registered bank name</label>
                <select id="actCorpBankName" value={corpBankName} onChange={(e) => setCorpBankName(e.target.value)}>
                  <option value="">Select bank…</option>
                  {BANKS.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="actCorpBankAccountNumber">Bank account number</label>
                <input id="actCorpBankAccountNumber" value={corpBankAccountNumber} onChange={(e) => setCorpBankAccountNumber(e.target.value)} placeholder="Corporate account number" />
              </div>
            </div>
            {error && (
              <div className="banner-notice">
                <div>{error}</div>
              </div>
            )}
            <button className="btn primary" disabled={submitting || corpCompanyName.trim().length === 0} onClick={submitCorporate}>
              {submitting && <span className="spinner" aria-hidden="true" />}
              Activate corporate investor profile
            </button>
          </div>
        )}

        {tab === "issuer" && (
          <div className="stack">
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="field" style={{ gridColumn: "1/-1" }}>
                <label htmlFor="actIssuerCompanyName">Company name *</label>
                <input id="actIssuerCompanyName" value={issuerCompanyName} onChange={(e) => setIssuerCompanyName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="actIssuerRegNo">Company registration number</label>
                <input id="actIssuerRegNo" value={issuerRegNo} onChange={(e) => setIssuerRegNo(e.target.value)} placeholder="Triggers SSM lookup" />
              </div>
              <div className="field">
                <label htmlFor="actIssuerEntityType">Legal entity type</label>
                <select id="actIssuerEntityType" value={issuerEntityType} onChange={(e) => setIssuerEntityType(e.target.value)}>
                  {LEGAL_ENTITY_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <h4>Campaign details</h4>
            <div className="sub">Captured here for context - submit your real financing application from the Financing page once your account is verified.</div>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="field">
                <label htmlFor="actAmountToRaise">Amount to raise (RM)</label>
                <input id="actAmountToRaise" type="number" min={0} value={amountToRaise} onChange={(e) => setAmountToRaise(e.target.value)} placeholder="e.g. 500,000" />
              </div>
              <div className="field">
                <label htmlFor="actTenure">Proposed tenure</label>
                <select id="actTenure" value={tenure} onChange={(e) => setTenure(e.target.value)}>
                  {FINANCING_TENURES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ gridColumn: "1/-1" }}>
                <label htmlFor="actPurpose">Purpose of financing</label>
                <select id="actPurpose" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                  {FINANCING_PURPOSES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
            <h4>Documents</h4>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="field">
                <label htmlFor="actBankStatements">Bank statements - last 6 months</label>
                <input id="actBankStatements" type="file" onChange={(e) => onFileChosen(setIssuerDocs, issuerDocs, "bankStatements", e.target.files?.[0])} />
                {issuerDocs.bankStatements && <div className="hint">Selected: {issuerDocs.bankStatements}</div>}
              </div>
              <div className="field">
                <label htmlFor="actAuditedFinancials">Audited financial statements - last 2 years</label>
                <input id="actAuditedFinancials" type="file" onChange={(e) => onFileChosen(setIssuerDocs, issuerDocs, "auditedFinancials", e.target.files?.[0])} />
                {issuerDocs.auditedFinancials && <div className="hint">Selected: {issuerDocs.auditedFinancials}</div>}
              </div>
            </div>
            <div className="banner-notice">
              <div>
                Director consent flow: the secretary/PIC adds directors after submission, each gets a secure one-time link (72hr expiry) to complete their own consent. Director details stay out of scope for
                this demo.
              </div>
            </div>
            {error && (
              <div className="banner-notice">
                <div>{error}</div>
              </div>
            )}
            <button className="btn primary" disabled={submitting || issuerCompanyName.trim().length === 0} onClick={submitIssuer}>
              {submitting && <span className="spinner" aria-hidden="true" />}
              Submit issuer application
            </button>
          </div>
        )}
      </div>
    </>
  );
}
