import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { SOURCE_OF_FUNDS, NATURE_OF_JOB, GROSS_ANNUAL_INCOME, ISSUER_SECTORS } from "../../lib/profileOptions";
import { ThemeToggle } from "../../components/ThemeToggle";

type OnboardingRole = "retail" | "issuer";
type Step = "account" | "details" | "agreements";

const STEPS: { key: Step; label: string }[] = [
  { key: "account", label: "Account Setup" },
  { key: "details", label: "Details" },
  { key: "agreements", label: "Agreements" },
];

function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}
const STRENGTH_COLOR = ["#e34848", "#e34848", "#d89020", "#2f8c5b", "#2f8c5b"];
const STRENGTH_LABEL = ["Very weak", "Weak", "Fair", "Good", "Strong"];

const DRAFT_KEY = "onboardingDraft";

interface Draft {
  role: OnboardingRole;
  step: Step;
  displayName: string;
  email: string;
  phone: string;
  identificationType: "NRIC" | "Passport";
  identificationNumber: string;
  sourceOfFunds: string;
  jobType: string;
  incomeRange: string;
  companyName: string;
  registrationNumber: string;
  sector: string;
  registeredAddress: string;
}

function loadDraft(): Partial<Draft> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [draft] = useState(loadDraft);
  const [role, setRole] = useState<OnboardingRole | null>(draft?.role ?? null);
  const [step, setStep] = useState<Step>(draft?.step ?? "account");
  const [submitting, setSubmitting] = useState(false);
  const [justCreated, setJustCreated] = useState(false);
  const [error, setError] = useState("");

  // Account - passwords are deliberately never persisted to the draft.
  const [displayName, setDisplayName] = useState(draft?.displayName ?? "");
  const [email, setEmail] = useState(draft?.email ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [phone, setPhone] = useState(draft?.phone ?? "");

  // Investor details
  const [identificationType, setIdentificationType] = useState<"NRIC" | "Passport">(draft?.identificationType ?? "NRIC");
  const [identificationNumber, setIdentificationNumber] = useState(draft?.identificationNumber ?? "");
  const [sourceOfFunds, setSourceOfFunds] = useState(draft?.sourceOfFunds ?? "");
  const [jobType, setJobType] = useState(draft?.jobType ?? "");
  const [incomeRange, setIncomeRange] = useState(draft?.incomeRange ?? "");

  // Issuer details
  const [companyName, setCompanyName] = useState(draft?.companyName ?? "");
  const [companyTouched, setCompanyTouched] = useState(false);
  const [registrationNumber, setRegistrationNumber] = useState(draft?.registrationNumber ?? "");
  const [sector, setSector] = useState(draft?.sector ?? "");
  const [registeredAddress, setRegisteredAddress] = useState(draft?.registeredAddress ?? "");

  // Agreements
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [riskAccepted, setRiskAccepted] = useState(false);

  const strength = passwordStrength(password);

  useEffect(() => {
    document.title = role ? `${role === "retail" ? "Investor" : "Issuer"} Onboarding · Cofundr` : "Join Cofundr";
  }, [role]);

  // Persist everything except passwords so a stray refresh or back-button
  // tap during a live walkthrough doesn't lose the demo's progress.
  useEffect(() => {
    if (!role) return;
    const toSave: Draft = {
      role,
      step,
      displayName,
      email,
      phone,
      identificationType,
      identificationNumber,
      sourceOfFunds,
      jobType,
      incomeRange,
      companyName,
      registrationNumber,
      sector,
      registeredAddress,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(toSave));
  }, [role, step, displayName, email, phone, identificationType, identificationNumber, sourceOfFunds, jobType, incomeRange, companyName, registrationNumber, sector, registeredAddress]);

  function accountStepValid() {
    return displayName.trim().length > 0 && email.trim().length > 0 && password.length >= 8 && password === confirmPassword;
  }
  function detailsStepValid() {
    if (role === "issuer") return companyName.trim().length > 0;
    return true;
  }

  function goNext() {
    if (step === "account" && !accountStepValid()) {
      setConfirmTouched(true);
      setError(password !== confirmPassword ? "Passwords do not match." : "Please complete every field with a password of at least 8 characters.");
      return;
    }
    if (step === "details" && !detailsStepValid()) {
      setCompanyTouched(true);
      setError("Company name is required.");
      return;
    }
    setError("");
    setStep(step === "account" ? "details" : "agreements");
  }

  function goBack() {
    setError("");
    setStep(step === "agreements" ? "details" : "account");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (e.key === "Enter" && target.tagName !== "TEXTAREA" && target.tagName !== "BUTTON") {
      e.preventDefault();
      if (step === "agreements") void onSubmit();
      else goNext();
    }
    if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && target.closest(".btn.small")) {
      const idx = STEPS.findIndex((s) => s.key === step);
      if (e.key === "ArrowRight" && idx < STEPS.length - 1) setStep(STEPS[idx + 1].key);
      if (e.key === "ArrowLeft" && idx > 0) setStep(STEPS[idx - 1].key);
    }
  }

  async function onSubmit() {
    if (!termsAccepted || !privacyAccepted || !riskAccepted) {
      setError("Please accept the Terms of Service, Privacy Policy and General Risk Statement to continue.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await signup({
        email,
        password,
        displayName,
        role: role ?? "retail",
        investorProfile:
          role === "retail"
            ? { contactNumber: phone || undefined, identificationType, identificationNumber: identificationNumber || undefined, sourceOfFunds: sourceOfFunds || undefined, jobType: jobType || undefined, incomeRange: incomeRange || undefined }
            : undefined,
        issuerProfile:
          role === "issuer"
            ? { companyName, registrationNumber: registrationNumber || undefined, sector: sector || undefined, registeredAddress: registeredAddress || undefined }
            : undefined,
      });
      localStorage.removeItem(DRAFT_KEY);
      setJustCreated(true);
      setTimeout(() => navigate("/app/overview"), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
      setSubmitting(false);
    }
  }

  // ---- Role selection (entry point) ----
  if (!role) {
    return (
      <div className="login-wrap">
        <ThemeToggle className="floating" />
        <div className="login-card" style={{ gridTemplateColumns: "1fr", maxWidth: 640 }}>
          <div className="login-form">
            <h3>Join Cofundr</h3>
            <div className="sub">Choose how you'd like to onboard. Corporate accounts are provisioned directly - explore that role from the demo buttons on the <Link to="/login">login page</Link>.</div>
            <div className="role-grid" style={{ marginTop: 18 }}>
              <button type="button" className="role-card" onClick={() => setRole("retail")} style={{ cursor: "pointer" }}>
                <div>
                  <b>Investor</b>
                  <span>Track returns, invest in financing notes, and manage your portfolio.</span>
                </div>
                <span className="cta-arrow" aria-hidden="true">→</span>
              </button>
              <button type="button" className="role-card" onClick={() => setRole("issuer")} style={{ cursor: "pointer" }}>
                <div>
                  <b>Issuer</b>
                  <span>Apply for financing, track repayments, and manage your company's facilities.</span>
                </div>
                <span className="cta-arrow" aria-hidden="true">→</span>
              </button>
            </div>
            <div className="sub" style={{ marginTop: 14 }}>
              Already have an account? <Link to="/login">Sign in</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (justCreated) {
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ gridTemplateColumns: "1fr", maxWidth: 440 }}>
          <div className="login-form" style={{ textAlign: "center" }}>
            <div className="success-check" aria-hidden="true">
              ✓
            </div>
            <h3 style={{ marginTop: 16 }}>Account created</h3>
            <div className="sub">Taking you to your dashboard…</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap" onKeyDown={handleKeyDown}>
      <ThemeToggle className="floating" />
      <div className="login-card" style={{ gridTemplateColumns: "1fr", maxWidth: 640 }}>
        <div className="login-form">
          <h3>{role === "retail" ? "Investor Onboarding" : "Issuer Onboarding"}</h3>
          <div className="progress" style={{ marginTop: 14 }}>
            <span style={{ width: `${((STEPS.findIndex((s) => s.key === step) + 1) / STEPS.length) * 100}%` }} />
          </div>
          <div className="row" style={{ gap: 8, margin: "10px 0 14px" }}>
            {STEPS.map((s) => (
              <button key={s.key} type="button" className={`btn small ${step === s.key ? "primary" : "secondary"}`} onClick={() => setStep(s.key)}>
                {s.label}
              </button>
            ))}
          </div>

          <div key={step} className="wizard-step">
          {step === "account" && (
            <div className="stack">
              <div className="field">
                <label htmlFor="onboardingName">Full name</label>
                <input id="onboardingName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="onboardingEmail">Email</label>
                <input id="onboardingEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="onboardingPhone">Mobile number</label>
                <input id="onboardingPhone" type="tel" placeholder="+60 12-345 6789" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="duo">
                <div className="field">
                  <label htmlFor="onboardingPassword">Password</label>
                  <input id="onboardingPassword" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="onboardingConfirmPassword">Re-enter password</label>
                  <input
                    id="onboardingConfirmPassword"
                    type="password"
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onBlur={() => setConfirmTouched(true)}
                    required
                  />
                  {confirmTouched && confirmPassword.length > 0 && password !== confirmPassword && <div className="field-error">Passwords do not match.</div>}
                </div>
              </div>
              {password.length > 0 && (
                <div>
                  <div className="progress">
                    <span style={{ width: `${(strength / 4) * 100}%`, background: STRENGTH_COLOR[strength] }} />
                  </div>
                  <div className="sub" style={{ marginTop: 4 }}>
                    Password strength: {STRENGTH_LABEL[strength]}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "details" && role === "retail" && (
            <div className="stack">
              <div className="field">
                <label htmlFor="onboardingIdType">Identification type</label>
                <select id="onboardingIdType" value={identificationType} onChange={(e) => setIdentificationType(e.target.value as "NRIC" | "Passport")}>
                  <option value="NRIC">NRIC</option>
                  <option value="Passport">Passport</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="onboardingIdNumber">{identificationType} number</label>
                <input id="onboardingIdNumber" value={identificationNumber} onChange={(e) => setIdentificationNumber(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="onboardingSourceOfFunds">Source of funds</label>
                <select id="onboardingSourceOfFunds" value={sourceOfFunds} onChange={(e) => setSourceOfFunds(e.target.value)}>
                  <option value="">Select…</option>
                  {SOURCE_OF_FUNDS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="onboardingJobType">Nature of job</label>
                <select id="onboardingJobType" value={jobType} onChange={(e) => setJobType(e.target.value)}>
                  <option value="">Select…</option>
                  {NATURE_OF_JOB.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="onboardingIncomeRange">Gross annual income</label>
                <select id="onboardingIncomeRange" value={incomeRange} onChange={(e) => setIncomeRange(e.target.value)}>
                  <option value="">Select…</option>
                  {GROSS_ANNUAL_INCOME.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="sub">You can complete the rest of your KYC profile - bank details, address and document uploads - after signing in from My Profile.</div>
            </div>
          )}

          {step === "details" && role === "issuer" && (
            <div className="stack">
              <div className="field">
                <label htmlFor="onboardingCompanyName">Company name *</label>
                <input
                  id="onboardingCompanyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  onBlur={() => setCompanyTouched(true)}
                  required
                />
                {companyTouched && companyName.trim().length === 0 && <div className="field-error">Company name is required.</div>}
              </div>
              <div className="field">
                <label htmlFor="onboardingRegistrationNumber">Registration number</label>
                <input id="onboardingRegistrationNumber" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="SSM 202001234567" />
              </div>
              <div className="field">
                <label htmlFor="onboardingSector">Sector</label>
                <select id="onboardingSector" value={sector} onChange={(e) => setSector(e.target.value)}>
                  <option value="">Select…</option>
                  {ISSUER_SECTORS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="onboardingRegisteredAddress">Registered address</label>
                <textarea id="onboardingRegisteredAddress" value={registeredAddress} onChange={(e) => setRegisteredAddress(e.target.value)} />
              </div>
              <div className="sub">Once verified, you'll be able to apply for financing from the Financing page.</div>
            </div>
          )}

          {step === "agreements" && (
            <div className="stack">
              <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
                <span className="sub">I agree to the Terms of Service.</span>
              </label>
              <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                <input type="checkbox" checked={privacyAccepted} onChange={(e) => setPrivacyAccepted(e.target.checked)} />
                <span className="sub">I agree to the Privacy Policy.</span>
              </label>
              <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                <input type="checkbox" checked={riskAccepted} onChange={(e) => setRiskAccepted(e.target.checked)} />
                <span className="sub">I acknowledge the General Risk Statement.</span>
              </label>
            </div>
          )}
          </div>

          {error && (
            <div className="banner-notice" style={{ marginTop: 12 }}>
              <div>{error}</div>
            </div>
          )}

          <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
            <button
              type="button"
              className="btn secondary"
              onClick={
                step === "account"
                  ? () => {
                      localStorage.removeItem(DRAFT_KEY);
                      setRole(null);
                    }
                  : goBack
              }
            >
              Back
            </button>
            {step === "agreements" ? (
              <button type="button" className="btn primary" disabled={submitting} onClick={onSubmit}>
                {submitting && <span className="spinner" aria-hidden="true" />}
                Create account
              </button>
            ) : (
              <button type="button" className="btn primary" onClick={goNext}>
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
