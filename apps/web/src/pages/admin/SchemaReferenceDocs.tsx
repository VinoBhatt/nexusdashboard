import { PageHeader } from "../../components/layout/PageHeader";

export default function SchemaReferenceDocs() {
  return (
    <>
      <PageHeader title="ID & CIF Architecture" description="DB schema reference for the identity/compliance layer - users.id is the permanent root; CIFs and wallets bind at Barrier 2." />
      <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="card">
          <h3>users (root)</h3>
          <div className="code-block">{`id TEXT PK (= user_id)
email TEXT UNIQUE NOT NULL
password_hash TEXT NOT NULL
role ENUM('retail','corporate','admin','issuer','campaign_manager')
is_demo_reviewer BOOLEAN DEFAULT false
created_at TIMESTAMP
updated_at TIMESTAMP`}</div>
        </div>
        <div className="card">
          <h3>kyc_profiles</h3>
          <div className="code-block">{`id TEXT PK
user_id TEXT FK → users, UNIQUE
full_name TEXT NOT NULL
ic_number TEXT
dob TEXT
nationality TEXT
address TEXT
gender TEXT
ocr_overridden BOOLEAN DEFAULT false
face_match_score INTEGER
liveness_passed BOOLEAN
jpn_verified BOOLEAN
aml_confidence_score INTEGER
created_at TIMESTAMP
verified_at TIMESTAMP`}</div>
        </div>
        <div className="card">
          <h3>investor_profiles (Barrier 2: Individual Investor)</h3>
          <div className="code-block">{`user_id TEXT PK, FK → users
kyc_status TEXT DEFAULT 'Pending'
investor_ref_no TEXT
referral_code TEXT
identification_type ENUM('NRIC','Passport')
identification_number TEXT
job_type TEXT
company_name TEXT
income_range TEXT
net_worth TEXT
source_of_funds TEXT
bank_name TEXT
bank_account_number TEXT
bank_account_holder TEXT
risk_profile_tier ENUM('LOW','MEDIUM','HIGH')
annual_review_due TEXT
...`}</div>
        </div>
        <div className="card">
          <h3>corporate_accounts + corporate_users (Barrier 2: Corporate Investor)</h3>
          <div className="code-block">{`corporate_accounts:
  id TEXT PK
  company_name TEXT NOT NULL
  cash_balance REAL DEFAULT 0
  ...

corporate_users:
  id TEXT PK
  corporate_account_id TEXT FK
  user_id TEXT FK → users
  corp_role ENUM('maker','checker')`}</div>
        </div>
        <div className="card">
          <h3>issuer_profiles (Barrier 2: Issuer)</h3>
          <div className="code-block">{`user_id TEXT PK, FK → users
company_name TEXT NOT NULL
registration_number TEXT
sector TEXT
kyb_status TEXT DEFAULT 'Pending'
...`}</div>
        </div>
        <div className="card">
          <h3>wallets</h3>
          <div className="code-block">{`id TEXT PK
user_id TEXT FK → users
cif_id TEXT NOT NULL
cif_type ENUM('INDIVIDUAL','CORPORATE','ISSUER')
wallet_type ENUM('INVESTOR','ISSUER')
wallet_address TEXT UNIQUE
chain_id TEXT DEFAULT 'Arbitrum'
status ENUM('ACTIVE','FROZEN','CLOSED')
created_at TIMESTAMP`}</div>
        </div>
        <div className="card">
          <h3>approvals (compliance case queue)</h3>
          <div className="code-block">{`id TEXT PK
type ENUM('Investor Verification','Issuer Verification', ...)
subject_type TEXT   -- 'user' | 'corporate_account' | 'facility'
subject_id TEXT
applicant_name TEXT
risk_level ENUM('Standard','Enhanced','Review')
status ENUM('Pending','Approved','Rejected')
confidence_score INTEGER
flagged_reason TEXT
ctos_result_json TEXT
decided_by TEXT FK → users
decided_at TIMESTAMP`}</div>
        </div>
        <div className="card">
          <h3>kyc_audit_log</h3>
          <div className="code-block">{`id TEXT PK
user_id TEXT FK → users
status_from TEXT
status_to TEXT NOT NULL
actor_type ENUM('SYSTEM','ADMIN')
actor_id TEXT FK → users
reason_code TEXT
notes TEXT
created_at TIMESTAMP`}</div>
        </div>
        <div className="card" style={{ gridColumn: "1/-1" }}>
          <h3>Multi-staff corporate accounts</h3>
          <p style={{ lineHeight: 1.8 }}>
            Entity-centric, not email-centric. The first registrant at Barrier 2 becomes the <b>maker</b> - a second signer (<b>checker</b>) is provisioned separately and approves the maker's proposed
            investments/withdrawals. Every corporate wallet transaction is attributed to the individual user_id that initiated it, not just the shared company.
          </p>
        </div>
      </div>
    </>
  );
}
