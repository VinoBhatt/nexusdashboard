import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { NATIONALITIES, RACES, GENDERS } from "../../lib/profileOptions";
import { ThemeToggle } from "../../components/ThemeToggle";

type Step = "account" | "icscan" | "selfie" | "review" | "terms" | "done";

const STEPS: { key: Step; label: string }[] = [
  { key: "account", label: "Email & Password" },
  { key: "icscan", label: "Scan IC" },
  { key: "selfie", label: "Selfie & Liveness" },
  { key: "review", label: "Review Data" },
  { key: "terms", label: "T&C" },
  { key: "done", label: "Done" },
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
  step: Step;
  email: string;
  icDocType: "MyKad" | "Passport";
  icNumber: string;
  fullName: string;
  dob: string;
  gender: string;
  nationality: string;
  race: string;
  address: string;
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
  const [step, setStep] = useState<Step>(draft?.step ?? "account");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Email & Password
  const [email, setEmail] = useState(draft?.email ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);

  // Step 2: Scan IC
  const [scanMode, setScanMode] = useState<"webcam" | "qr">("webcam");
  const [icDocType, setIcDocType] = useState<"MyKad" | "Passport">(draft?.icDocType ?? "MyKad");
  const [icNumber, setIcNumber] = useState(draft?.icNumber ?? "");
  const [icTouched, setIcTouched] = useState(false);

  // Step 4: Review Data (mocked OCR result, editable)
  const [fullName, setFullName] = useState(draft?.fullName ?? "");
  const [fullNameTouched, setFullNameTouched] = useState(false);
  const [dob, setDob] = useState(draft?.dob ?? "");
  const [gender, setGender] = useState(draft?.gender ?? "Male");
  const [nationality, setNationality] = useState(draft?.nationality ?? "Malaysian");
  const [race, setRace] = useState(draft?.race ?? "Malay");
  const [address, setAddress] = useState(draft?.address ?? "");
  const [ocrOverridden, setOcrOverridden] = useState(false);

  // Step 5: T&C
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [pdpaAccepted, setPdpaAccepted] = useState(false);

  const strength = passwordStrength(password);

  useEffect(() => {
    document.title = "Join Cofundr";
  }, []);

  // Persist everything except passwords/OTP/Turnstile (ephemeral verification
  // - redo it if resuming a stray-refreshed draft) so a stray refresh or
  // back-button tap during a live walkthrough doesn't lose progress.
  useEffect(() => {
    const toSave: Draft = { step, email, icDocType, icNumber, fullName, dob, gender, nationality, race, address };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(toSave));
  }, [step, email, icDocType, icNumber, fullName, dob, gender, nationality, race, address]);

  function accountStepValid() {
    return email.trim().length > 0 && password.length >= 8 && password === confirmPassword && turnstileVerified && otp.every((d) => d.length === 1);
  }

  function goNext() {
    if (step === "account" && !accountStepValid()) {
      setConfirmTouched(true);
      if (password !== confirmPassword) setError("Passwords do not match.");
      else if (!turnstileVerified) setError("Please complete the human verification check.");
      else if (!otp.every((d) => d.length === 1)) setError("Please enter the 6-digit code sent to your email.");
      else setError("Please complete every field with a password of at least 8 characters.");
      return;
    }
    if (step === "icscan" && icNumber.trim().length === 0) {
      setIcTouched(true);
      setError(`Please enter your ${icDocType} number to continue.`);
      return;
    }
    if (step === "review" && fullName.trim().length === 0) {
      setFullNameTouched(true);
      setError("Full name is required.");
      return;
    }
    setError("");
    const order: Step[] = ["account", "icscan", "selfie", "review", "terms", "done"];
    const idx = order.indexOf(step);
    setStep(order[Math.min(idx + 1, order.length - 1)]);
  }

  function goBack() {
    setError("");
    const order: Step[] = ["account", "icscan", "selfie", "review", "terms", "done"];
    const idx = order.indexOf(step);
    setStep(order[Math.max(idx - 1, 0)]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (e.key === "Enter" && target.tagName !== "TEXTAREA" && target.tagName !== "BUTTON") {
      e.preventDefault();
      if (step === "terms") void onSubmit();
      else if (step !== "done") goNext();
    }
    if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && target.closest(".btn.small")) {
      const order: Step[] = ["account", "icscan", "selfie", "review", "terms", "done"];
      const idx = order.indexOf(step);
      if (e.key === "ArrowRight" && idx < order.length - 1) setStep(order[idx + 1]);
      if (e.key === "ArrowLeft" && idx > 0) setStep(order[idx - 1]);
    }
  }

  function handleOtpChange(i: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setOtp((prev) => {
      const next = [...prev];
      next[i] = digit;
      return next;
    });
    if (digit && i < 5) {
      const nextInput = document.getElementById(`otp-${i + 1}`);
      nextInput?.focus();
    }
  }

  async function onSubmit() {
    if (!termsAccepted || !riskAccepted || !pdpaAccepted) {
      setError("Please accept the Terms of Service, General Risk Statement and PDPA consent to continue.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await signup({
        email,
        password,
        displayName: fullName,
        kycProfile: {
          fullName,
          icNumber,
          dob: dob || undefined,
          nationality,
          address: address || undefined,
          gender,
          ocrOverridden,
          faceMatchScore: 92,
          livenessPassed: true,
        },
      });
      localStorage.removeItem(DRAFT_KEY);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh" }} onKeyDown={handleKeyDown}>
      <ThemeToggle className="floating" />
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 24px 60px" }}>
        <div className="top" style={{ position: "static" }}>
          <div className="heading">
            <h2>Create your account</h2>
            <p>Get started in under 3 minutes. No paid verification checks fire here - investing unlocks after a quick activation the first time you tap Invest.</p>
          </div>
        </div>

          {step !== "done" && (
            <div className="stepper">
              {STEPS.map((s, i) => {
                const currentIndex = STEPS.findIndex((x) => x.key === step);
                const isCurrent = s.key === step;
                const isDone = i < currentIndex;
                return (
                  <div key={s.key} className={`step${isDone ? " done" : ""}${isCurrent ? " current" : ""}`}>
                    <button
                      type="button"
                      className="dot"
                      disabled={s.key === "done"}
                      onClick={() => s.key !== "done" && setStep(s.key)}
                      aria-label={s.label}
                      aria-current={isCurrent ? "step" : undefined}
                    >
                      {isDone ? "✓" : i + 1}
                    </button>
                    <span className="lbl">{s.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="card">
          <div key={step} className="wizard-step">
            {step === "account" && (
              <div className="stack">
                <div className="field">
                  <label htmlFor="signupEmail">Email address</label>
                  <input id="signupEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="duo">
                  <div className="field">
                    <label htmlFor="signupPassword">Password</label>
                    <input id="signupPassword" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </div>
                  <div className="field">
                    <label htmlFor="signupConfirmPassword">Re-enter password</label>
                    <input
                      id="signupConfirmPassword"
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
                <label className="row" style={{ gap: 10, alignItems: "center", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px", cursor: "pointer" }}>
                  <input type="checkbox" checked={turnstileVerified} onChange={(e) => setTurnstileVerified(e.target.checked)} />
                  <span className="sub">{turnstileVerified ? "✓ Success - human verified" : "Verify you are human (Cloudflare Turnstile)"}</span>
                </label>
                <div className="field">
                  <label>Enter the 6-digit code sent to your email</label>
                  <div className="row" style={{ gap: 8 }}>
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        id={`otp-${i}`}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        maxLength={1}
                        inputMode="numeric"
                        style={{ width: 44, height: 48, textAlign: "center", fontSize: 18, fontWeight: 700 }}
                      />
                    ))}
                  </div>
                  <div className="hint">Didn't get it? Resend code (expires in 10:00)</div>
                </div>
              </div>
            )}

            {step === "icscan" && (
              <div className="stack">
                <div className="field" style={{ maxWidth: 260 }}>
                  <label htmlFor="signupDocType">Document type</label>
                  <select id="signupDocType" value={icDocType} onChange={(e) => setIcDocType(e.target.value as "MyKad" | "Passport")}>
                    <option value="MyKad">MyKad</option>
                    <option value="Passport">Passport</option>
                  </select>
                </div>
                <div className="row" style={{ gap: 12 }}>
                  <button type="button" className={`role-card${scanMode === "webcam" ? " active" : ""}`} style={{ flex: 1, cursor: "pointer" }} onClick={() => setScanMode("webcam")}>
                    <div>
                      <b>Use webcam on this computer</b>
                      <span>Vendor SDK overlay guides you through the capture</span>
                    </div>
                  </button>
                  <button type="button" className={`role-card${scanMode === "qr" ? " active" : ""}`} style={{ flex: 1, cursor: "pointer" }} onClick={() => setScanMode("qr")}>
                    <div>
                      <b>Scan QR with your phone</b>
                      <span>Continue on mobile - no app install needed</span>
                    </div>
                  </button>
                </div>
                <div className="card" style={{ background: "var(--nav)", color: "#fff", textAlign: "center", padding: 24 }}>
                  {scanMode === "webcam" ? (
                    <>
                      <div style={{ fontSize: 40 }}>🪪</div>
                      <div className="sub" style={{ color: "#cfe1f2" }}>
                        Position your {icDocType} inside the frame - front side first
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 40 }}>📱</div>
                      <div className="sub" style={{ color: "#cfe1f2" }}>
                        Scan with your phone camera. Link expires in 15:00.
                      </div>
                    </>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="signupIcNumber">{icDocType} number</label>
                  <input id="signupIcNumber" value={icNumber} onChange={(e) => setIcNumber(e.target.value)} onBlur={() => setIcTouched(true)} placeholder={icDocType === "MyKad" ? "880214-14-5677" : "A48291002"} required />
                  {icTouched && icNumber.trim().length === 0 && <div className="field-error">{icDocType} number is required.</div>}
                </div>
                <div className="banner-notice">
                  <div>SDK returns: full name, IC number, DOB, address, gender, nationality - reviewed in the next step.</div>
                </div>
              </div>
            )}

            {step === "selfie" && (
              <div className="stack">
                <div className="card" style={{ background: "var(--nav)", color: "#fff", textAlign: "center", padding: 30 }}>
                  <div style={{ fontSize: 40, borderRadius: "50%", width: 120, height: 120, margin: "0 auto 14px", display: "grid", placeItems: "center", border: "2px dashed rgba(255,255,255,.4)" }}>😊</div>
                  <div className="sub" style={{ color: "#cfe1f2" }}>
                    Look at the camera and blink once when prompted
                  </div>
                </div>
                <div className="grid cols-2">
                  <div className="metric green">
                    <div className="label">face_match_score (mock result)</div>
                    <div className="value">92</div>
                  </div>
                  <div className="metric green">
                    <div className="label">liveness_passed</div>
                    <div className="value">PASS</div>
                  </div>
                </div>
                <div className="sub">Vendor compares selfie to IC photo and returns a match score plus a liveness result. Threshold: score ≥ 80 = pass.</div>
              </div>
            )}

            {step === "review" && (
              <div className="stack">
                <div className="sub">Fields below are extracted from your IC scan. Review and correct anything that's wrong - editing a field flags it for extra scrutiny later.</div>
                <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div className="field full" style={{ gridColumn: "1/-1" }}>
                    <label htmlFor="signupFullName">Full name</label>
                    <input
                      id="signupFullName"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        setOcrOverridden(true);
                      }}
                      onBlur={() => setFullNameTouched(true)}
                      required
                    />
                    {fullNameTouched && fullName.trim().length === 0 && <div className="field-error">Full name is required.</div>}
                  </div>
                  <div className="field">
                    <label htmlFor="signupIcReadonly">{icDocType} number (read-only)</label>
                    <input id="signupIcReadonly" value={icNumber} readOnly disabled />
                  </div>
                  <div className="field">
                    <label htmlFor="signupDob">Date of birth</label>
                    <input id="signupDob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="signupGender">Gender</label>
                    <select id="signupGender" value={gender} onChange={(e) => setGender(e.target.value)}>
                      {GENDERS.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="signupNationality">Nationality</label>
                    <select id="signupNationality" value={nationality} onChange={(e) => setNationality(e.target.value)}>
                      {NATIONALITIES.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="signupRace">Race / ethnicity</label>
                    <select id="signupRace" value={race} onChange={(e) => setRace(e.target.value)}>
                      {RACES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ gridColumn: "1/-1" }}>
                    <label htmlFor="signupAddress">Address</label>
                    <textarea id="signupAddress" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {step === "terms" && (
              <div className="stack">
                <div className="tnc-scroll" style={{ height: 150, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 10, padding: 14, fontSize: 12, color: "var(--muted)", lineHeight: 1.7, background: "var(--surface2)" }}>
                  <b>COFUNDR SDN BHD - TERMS OF SERVICE</b>
                  <br />
                  <br />
                  1. Cofundr Sdn Bhd operates a recognised market operator platform under the SC-MyCIF framework issued by the Securities Commission Malaysia.
                  <br />
                  <br />
                  2. Investments in private credit notes carry risk, including the loss of the entire principal amount. Notes are not principal-guaranteed and are not covered by PIDM.
                  <br />
                  <br />
                  3. Your personal data is processed in accordance with the Personal Data Protection Act 2010 (PDPA) for identity verification, AML compliance and regulatory reporting.
                  <br />
                  <br />
                  4. Tokenised notes are issued on the Arbitrum blockchain. Cofundr operates custodial wallets on your behalf; you will not hold private keys directly.
                </div>
                <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
                  <span className="sub">I have read and agree to the Terms of Service and Privacy Policy.</span>
                </label>
                <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <input type="checkbox" checked={riskAccepted} onChange={(e) => setRiskAccepted(e.target.checked)} />
                  <span className="sub">I have read and understood the general risk statement.</span>
                </label>
                <label className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <input type="checkbox" checked={pdpaAccepted} onChange={(e) => setPdpaAccepted(e.target.checked)} />
                  <span className="sub">I consent to my personal data being processed for identity verification and regulatory compliance under PDPA.</span>
                </label>
              </div>
            )}

            {step === "done" && (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div className="success-check" aria-hidden="true">
                  ✓
                </div>
                <h3 style={{ marginTop: 16 }}>Welcome to Cofundr!</h3>
                <p className="sub" style={{ maxWidth: 420, margin: "10px auto" }}>
                  Your account is created and you're signed in. Browse the marketplace and view live campaigns now - investing unlocks after a quick activation the first time you tap Invest.
                </p>
                <button className="btn primary" style={{ marginTop: 10 }} onClick={() => navigate("/app/overview")}>
                  Explore marketplace →
                </button>
              </div>
            )}
          </div>

          {error && step !== "done" && (
            <div className="banner-notice" style={{ marginTop: 12 }}>
              <div>{error}</div>
            </div>
          )}

          {step !== "done" && (
            <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
              <button type="button" className="btn secondary" onClick={goBack} disabled={step === "account"}>
                Back
              </button>
              {step === "terms" ? (
                <button type="button" className="btn primary" disabled={submitting} onClick={onSubmit}>
                  {submitting && <span className="spinner" aria-hidden="true" />}
                  Create my account
                </button>
              ) : (
                <button type="button" className="btn primary" onClick={goNext}>
                  Continue →
                </button>
              )}
            </div>
          )}

          {step === "account" && (
            <div className="sub" style={{ marginTop: 14 }}>
              Already have an account? <Link to="/login">Sign in</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
