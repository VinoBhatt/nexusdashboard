import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Schema grows incrementally per phase in the rebuild plan - see
// C:\Users\admin\.claude\plans\idempotent-gliding-allen.md
// Phase 1 adds: investor_profiles, financing_facilities,
// repayment_installments, holdings, secondary_listings, transactions,
// deposits, withdrawals, approvals, documents, statements,
// metrics_snapshots. Corporate/admin/issuer-specific tables
// (corporate_accounts, orders, issuer_profiles, ...) land in later phases.

export const roles = ["retail", "corporate", "admin", "issuer"] as const;
export type Role = (typeof roles)[number];

const id = () => text("id").primaryKey();
const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
};

// ---- Identity & auth ----

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: roles }).notNull(),
  displayName: text("display_name").notNull(),
  isDemoReviewer: integer("is_demo_reviewer", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // SHA-256 hash of the raw cookie token
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  activeRole: text("active_role", { enum: roles }), // demo role-switch override
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ...timestamps,
});

export const auditLog = sqliteTable("audit_log", {
  id: id(),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  subjectType: text("subject_type"),
  subjectId: text("subject_id"),
  metadataJson: text("metadata_json"),
  ...timestamps,
});

// ---- Investor profile (retail today; corporate reuses in a later phase) ----

export const investorProfiles = sqliteTable("investor_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  cashBalance: real("cash_balance").notNull().default(0),
  totalDeposits: real("total_deposits").notNull().default(0),
  totalWithdrawals: real("total_withdrawals").notNull().default(0),
  totalInvested: real("total_invested").notNull().default(0),
  annualisedYield: real("annualised_yield").notNull().default(0),
  expectedReturns: real("expected_returns").notNull().default(0),
  expectedThisMonth: real("expected_this_month").notNull().default(0),
  overdueThisMonth: real("overdue_this_month").notNull().default(0),
  outstanding: real("outstanding").notNull().default(0),
  defaulted: real("defaulted").notNull().default(0),
  kycStatus: text("kyc_status").notNull().default("Pending"),
  jobType: text("job_type"),
  incomeRange: text("income_range"),
  netWorth: text("net_worth"),
  sourceOfFunds: text("source_of_funds"),
  objective: text("objective"),
  riskAppetite: text("risk_appetite"),
});

// ---- Financing instruments (marketplace notes + issuer facilities, same entity) ----

export const financingFacilities = sqliteTable("financing_facilities", {
  id: id(), // e.g. 'MBIBG-26070005'
  productGroup: text("product_group").notNull(),
  financingType: text("financing_type").notNull(),
  riskTier: text("risk_tier").notNull(),
  ratePct: real("rate_pct").notNull(),
  tenorDays: integer("tenor_days").notNull(),
  daysElapsed: integer("days_elapsed").notNull().default(0),
  minInvestment: real("min_investment").notNull(),
  maxInvestment: real("max_investment").notNull(),
  fundingProgressPct: real("funding_progress_pct").notNull().default(0),
  principalAmount: real("principal_amount").notNull(),
  serviceFeePct: real("service_fee_pct").notNull().default(0),
  issuerName: text("issuer_name").notNull(),
  status: text("status", { enum: ["Open", "Ongoing", "Completed", "Default"] })
    .notNull()
    .default("Open"),
  firstPaymentDate: text("first_payment_date"),
  lastPaymentDate: text("last_payment_date"),
  ...timestamps,
});

export const repaymentInstallments = sqliteTable("repayment_installments", {
  id: id(),
  facilityId: text("facility_id")
    .notNull()
    .references(() => financingFacilities.id),
  installmentNo: integer("installment_no").notNull(),
  dueDate: text("due_date").notNull(),
  principalDue: real("principal_due").notNull().default(0),
  profitDue: real("profit_due").notNull().default(0),
  feeDue: real("fee_due").notNull().default(0),
  status: text("status", { enum: ["Paid", "Upcoming", "Overdue"] })
    .notNull()
    .default("Upcoming"),
  paidAt: integer("paid_at", { mode: "timestamp" }),
});

// ---- Investor positions ----

export const holdings = sqliteTable("holdings", {
  id: id(),
  investorId: text("investor_id")
    .notNull()
    .references(() => users.id),
  facilityId: text("facility_id")
    .notNull()
    .references(() => financingFacilities.id),
  status: text("status", { enum: ["Ongoing", "Completed", "Default"] }).notNull(),
  amountInvested: real("amount_invested").notNull(),
  expectedReturn: real("expected_return").notNull().default(0),
  actualReturn: real("actual_return").notNull().default(0),
  eligibleForSale: integer("eligible_for_sale", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const secondaryListings = sqliteTable("secondary_listings", {
  id: id(),
  holdingId: text("holding_id")
    .notNull()
    .references(() => holdings.id),
  sellerId: text("seller_id")
    .notNull()
    .references(() => users.id),
  units: real("units").notNull(),
  pricePerUnit: real("price_per_unit").notNull(),
  status: text("status", { enum: ["Open", "Sold", "Cancelled"] }).notNull().default("Open"),
  listedAt: integer("listed_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ---- Money movement ----

export const transactions = sqliteTable("transactions", {
  id: id(),
  accountId: text("account_id")
    .notNull()
    .references(() => users.id),
  type: text("type").notNull(),
  amount: real("amount").notNull(),
  status: text("status", { enum: ["Confirmed", "Pending", "Paid", "Failed"] }).notNull(),
  referenceJson: text("reference_json"),
  occurredAt: integer("occurred_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const deposits = sqliteTable("deposits", {
  id: id(),
  investorId: text("investor_id")
    .notNull()
    .references(() => users.id),
  method: text("method", { enum: ["fpx", "manual"] }).notNull(),
  amount: real("amount").notNull(),
  bank: text("bank"),
  reference: text("reference"),
  receiptDocumentId: text("receipt_document_id"),
  status: text("status", { enum: ["Confirmed", "Pending"] }).notNull(),
  ...timestamps,
});

export const withdrawals = sqliteTable("withdrawals", {
  id: id(),
  investorId: text("investor_id")
    .notNull()
    .references(() => users.id),
  amount: real("amount").notNull(),
  fee: real("fee").notNull().default(1),
  netAmount: real("net_amount").notNull(),
  reason: text("reason"),
  proofDocumentId: text("proof_document_id"),
  status: text("status", { enum: ["Pending", "Confirmed", "Rejected"] }).notNull().default("Pending"),
  ...timestamps,
});

// ---- Compliance / oversight ----

export const approvals = sqliteTable("approvals", {
  id: id(),
  type: text("type", {
    enum: ["Investor KYC", "Issuer KYB", "New Note Listing", "Large Withdrawal"],
  }).notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  applicantName: text("applicant_name").notNull(),
  riskLevel: text("risk_level", { enum: ["Standard", "Enhanced", "Review"] })
    .notNull()
    .default("Standard"),
  status: text("status", { enum: ["Pending", "Approved", "Rejected"] }).notNull().default("Pending"),
  decidedBy: text("decided_by").references(() => users.id),
  decidedAt: integer("decided_at", { mode: "timestamp" }),
  notes: text("notes"),
  submittedAt: integer("submitted_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Metadata-only for now (no R2 binding yet) - file_key is null until a
// real storage backend is added; status/doc_type/file_name are enough
// to drive the UI exactly as the legacy prototype's fake uploads did.
export const documents = sqliteTable("documents", {
  id: id(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  docType: text("doc_type").notNull(),
  fileKey: text("file_key"),
  fileName: text("file_name").notNull(),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes"),
  status: text("status", { enum: ["Verified", "Pending", "Action required"] })
    .notNull()
    .default("Pending"),
  uploadedAt: integer("uploaded_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  reviewedBy: text("reviewed_by").references(() => users.id),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
});

export const statements = sqliteTable("statements", {
  id: id(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  periodLabel: text("period_label").notNull(),
  type: text("type", { enum: ["Monthly", "Annual"] }).notNull(),
  status: text("status", { enum: ["Generating", "Ready"] }).notNull().default("Generating"),
  fileKey: text("file_key"),
  ...timestamps,
  readyAt: integer("ready_at", { mode: "timestamp" }),
});

// Backing data for line charts (retail cumulative profit, admin AUM, etc.)
export const metricsSnapshots = sqliteTable("metrics_snapshots", {
  id: id(),
  accountId: text("account_id").references(() => users.id),
  metricKey: text("metric_key").notNull(),
  snapshotDate: text("snapshot_date").notNull(),
  value: real("value").notNull(),
});
