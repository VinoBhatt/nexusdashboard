import { useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";

type Tab = "states" | "scoring" | "risk";

function SimulateKyc() {
  const [status, setStatus] = useState<"idle" | "processing" | "approved">("idle");

  function run() {
    setStatus("processing");
    setTimeout(() => setStatus("approved"), 1800);
  }

  return (
    <div className="banner-notice">
      <div>
        <b>Try it:</b>{" "}
        <button className="btn primary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={run}>
          Simulate KYC run
        </button>{" "}
        {status === "idle" && <span className="pill">PENDING_SUBMISSION</span>}
        {status === "processing" && <span className="pill blue">IN_PROCESSING · Verifying your details… (JPN + CTOS + OFAC running in parallel)</span>}
        {status === "approved" && <span className="pill green">APPROVED · Sub-profile form unlocked</span>}
      </div>
    </div>
  );
}

export default function KycEngineDocs() {
  const [tab, setTab] = useState<Tab>("states");

  return (
    <>
      <PageHeader title="KYC Engine" description="7-state model, fires at Barrier 2 when a user first activates a sub-profile. JPN + CTOS + OFAC/UN/PEP run in parallel (mocked in this demo)." />
      <div className="tabs">
        <button className={`tab ${tab === "states" ? "active" : ""}`} onClick={() => setTab("states")}>
          Status Flow
        </button>
        <button className={`tab ${tab === "scoring" ? "active" : ""}`} onClick={() => setTab("scoring")}>
          Confidence Scoring
        </button>
        <button className={`tab ${tab === "risk" ? "active" : ""}`} onClick={() => setTab("risk")}>
          Risk Profile Matrix
        </button>
      </div>

      {tab === "states" && (
        <>
          <div className="card">
            <h3>Status transitions</h3>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    <th>Trigger</th>
                    <th>User sees</th>
                    <th>Backend action</th>
                  </tr>
                  <tr>
                    <td>S1</td>
                    <td><span className="pill">PENDING_SUBMISSION</span></td>
                    <td>Account created at Barrier 1</td>
                    <td className="sub">Browse-only home</td>
                    <td className="sub">users + kyc_profiles rows only. No checks.</td>
                  </tr>
                  <tr>
                    <td>S2</td>
                    <td><span className="pill blue">IN_PROCESSING</span></td>
                    <td>User activates a sub-profile (Barrier 2)</td>
                    <td className="sub">"Verification is in progress"</td>
                    <td className="sub">Mock JPN + CTOS + OFAC/UN/PEP scoring runs synchronously</td>
                  </tr>
                  <tr>
                    <td>S3</td>
                    <td><span className="pill amber">FLAGGED_FOR_REVIEW</span></td>
                    <td>Possible AML/PEP name match</td>
                    <td className="sub">Unchanged</td>
                    <td className="sub">Confidence scoring engine fires</td>
                  </tr>
                  <tr>
                    <td>S4</td>
                    <td><span className="pill amber">MANUAL_REVIEW</span></td>
                    <td>Medium confidence score (21-50 pts)</td>
                    <td className="sub">"Verification is in progress"</td>
                    <td className="sub">Case queued on the KYC Review Queue</td>
                  </tr>
                  <tr>
                    <td>S5</td>
                    <td><span className="pill red">REJECTED_SOFT</span></td>
                    <td>Officer requests more documents</td>
                    <td className="sub">"We need one more document"</td>
                    <td className="sub">approvals.notes set, case stays Pending</td>
                  </tr>
                  <tr>
                    <td>S6</td>
                    <td><span className="pill green">APPROVED</span></td>
                    <td>Score ≤20pts auto-clear, or officer clears</td>
                    <td className="sub">"Your account is verified"</td>
                    <td className="sub">kycStatus/kybStatus → Verified. Full access.</td>
                  </tr>
                  <tr>
                    <td>S7</td>
                    <td><span className="pill red">REJECTED_HARD</span></td>
                    <td>Officer rejects</td>
                    <td className="sub">"We're unable to verify your account"</td>
                    <td className="sub">kycStatus/kybStatus → Rejected</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <h3>Three parallel checks at IN_PROCESSING</h3>
            <div className="grid cols-3">
              <div className="metric">
                <div className="label">JPN Registry</div>
                <div className="hint">IC number + full name cross-checked against Jabatan Pendaftaran Negara (mocked)</div>
              </div>
              <div className="metric">
                <div className="label">CTOS Pull</div>
                <div className="hint">Credit score, litigation flag, bankruptcy flag, defaults in last 24 months (mocked)</div>
              </div>
              <div className="metric">
                <div className="label">OFAC / UN / PEP</div>
                <div className="hint">International sanctions list screening (mocked)</div>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <SimulateKyc />
            </div>
          </div>
        </>
      )}

      {tab === "scoring" && (
        <div className="card">
          <h3>Confidence scoring engine</h3>
          <p className="sub" style={{ marginBottom: 14 }}>
            Deterministic mock, seeded per applicant so a given case always scores the same rather than randomly changing on every view. ~70% of cases clear automatically.
          </p>
          <h4>Score → outcome</h4>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                <tr>
                  <th>Score band</th>
                  <th>Confidence</th>
                  <th>Outcome</th>
                </tr>
                <tr>
                  <td className="mono">0-20 pts</td>
                  <td>High</td>
                  <td>
                    Auto-clear → <span className="pill green">APPROVED</span>
                  </td>
                </tr>
                <tr>
                  <td className="mono">21-50 pts</td>
                  <td>Medium</td>
                  <td>
                    → <span className="pill amber">MANUAL_REVIEW</span>
                  </td>
                </tr>
                <tr>
                  <td className="mono">51+ pts</td>
                  <td>Low</td>
                  <td>
                    → <span className="pill red">REJECTED_SOFT</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "risk" && (
        <div className="card">
          <h3>Investor risk profile matrix (applied at Barrier 2 activation)</h3>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                <tr>
                  <th>Nationality</th>
                  <th>Net worth declared</th>
                  <th>Risk profile</th>
                  <th>Annual review</th>
                  <th>Investment limit</th>
                </tr>
                <tr>
                  <td>Malaysian</td>
                  <td>Below RM 300k</td>
                  <td><span className="pill green">LOW</span></td>
                  <td>12 months</td>
                  <td>RM 50,000</td>
                </tr>
                <tr>
                  <td>Malaysian</td>
                  <td>RM 300k - RM 3M</td>
                  <td><span className="pill amber">MEDIUM</span></td>
                  <td>12 months</td>
                  <td>RM 200,000</td>
                </tr>
                <tr>
                  <td>Malaysian (accredited)</td>
                  <td>Above RM 3M</td>
                  <td><span className="pill red">HIGH</span></td>
                  <td>24 months</td>
                  <td>No limit</td>
                </tr>
                <tr>
                  <td>Non-Malaysian</td>
                  <td>Any</td>
                  <td><span className="pill green">LOW</span></td>
                  <td>6 months</td>
                  <td>RM 20,000 (FX rules apply)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <h4 style={{ marginTop: 14 }}>Annual review behaviour</h4>
          <p className="sub">
            30 days before the review is due: shown as a yellow row on the Investor Risk Profiles page. Overdue: shown as a red row and the account would be restricted to browse-only until re-declaration.
          </p>
        </div>
      )}
    </>
  );
}
