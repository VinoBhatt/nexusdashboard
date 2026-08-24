import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { SOURCE_OF_FUNDS, NATURE_OF_JOB, GROSS_ANNUAL_INCOME, ISSUER_SECTORS } from "../../lib/profileOptions";

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

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<OnboardingRole | null>(null);
  const [step, setStep] = useState<Step>("account");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Account
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");

  // Investor details
  const [identificationType, setIdentificationType] = useState<"NRIC" | "Passport">("NRIC");
  const [identificationNumber, setIdentificationNumber] = useState("");
  const [sourceOfFunds, setSourceOfFunds] = useState("");
  const [jobType, setJobType] = useState("");
  const [incomeRange, setIncomeRange] = useState("");

  // Issuer details
  const [companyName, setCompanyName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [sector, setSector] = useState("");
  const [registeredAddress, setRegisteredAddress] = useState("");

  // Agreements
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [riskAccepted, setRiskAccepted] = useState(false);

  const strength = passwordStrength(password);

  function accountStepValid() {
    return displayName.trim().length > 0 && email.trim().length > 0 && password.length >= 8 && password === confirmPassword;
  }
  function detailsStepValid() {
    if (role === "issuer") return companyName.trim().length > 0;
    return true;
  }

  function goNext() {
    if (step === "account" && !accountStepValid()) {
      setError(password !== confirmPassword ? "Passwords do not match." : "Please complete every field with a password of at least 8 characters.");
      return;
    }
    if (step === "details" && !detailsStepValid()) {
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
      navigate("/app/overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Role selection (entry point) ----
  if (!role) {
    return (
      <div className="login-wrap">
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

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ gridTemplateColumns: "1fr", maxWidth: 640 }}>
        <div className="login-form">
          <h3>{role === "retail" ? "Investor Onboarding" : "Issuer Onboarding"}</h3>
          <div className="row" style={{ gap: 8, margin: "14px 0" }}>
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
                  <input id="onboardingConfirmPassword" type="password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
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
                <input id="onboardingCompanyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
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
            <button type="button" className="btn secondary" onClick={step === "account" ? () => setRole(null) : goBack}>
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
