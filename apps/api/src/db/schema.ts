import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Schema grows incrementally per phase in the rebuild plan - see
// C:\Users\admin\.claude\plans\idempotent-gliding-allen.md
// Phase 1 adds: investor_profiles, financing_facilities,
// repayment_installments, holdings, secondary_listings, transactions,
// deposits, withdrawals, approvals, documents, statements,
// metrics_snapshots. Corporate/admin/issuer-specific tables
// (corporate_accounts, orders, issuer_profiles, ...) land in later phases.

export const roles = ["retail", "corporate", "admin", "issuer", "campaign_manager", "ceo"] as const;
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
  // ---- Full profile (investor ID card, bank, address, referral) ----
  investorRefNo: text("investor_ref_no"),
  // ---- Barrier 2 risk profiling (nationality + net worth matrix) ----
  riskProfileTier: text("risk_profile_tier", { enum: ["LOW", "MEDIUM", "HIGH"] }),
  annualReviewDue: text("annual_review_due"),
  contactNumber: text("contact_number"),
  identificationType: text("identification_type", { enum: ["NRIC", "Passport"] }).default("NRIC"),
  identificationNumber: text("identification_number"),
  jobTitle: text("job_title"),
  companyName: text("company_name"),
  natureOfBusiness: text("nature_of_business"),
  bankName: text("bank_name"),
  bankAccountHolder: text("bank_account_holder"),
  bankAccountNumber: text("bank_account_number"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  country: text("country").default("Malaysia"),
  state: text("state"),
  postcode: text("postcode"),
  referralCode: text("referral_code"),
  declarationAccepted: integer("declaration_accepted", { mode: "boolean" }).notNull().default(false),
  profileUpdatedAt: integer("profile_updated_at", { mode: "timestamp" }),
});

// ---- Financing instruments (marketplace notes + issuer facilities, same entity) ----

export const financingFacilities = sqliteTable("financing_facilities", {
  id: id(), // e.g. 'MBIBG-26070005'
  // Nullable: facilities seeded before an issuer had a real login are
  // only identified by issuerName. New applications set this to the
  // real issuer user (Phase 4).
  issuerUserId: text("issuer_user_id").references(() => users.id),
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
  status: text("status", { enum: ["Draft", "Pending Review", "Open", "Ongoing", "Completed", "Default", "Rejected"] })
    .notNull()
    .default("Open"),
  purpose: text("purpose"),
  firstPaymentDate: text("first_payment_date"),
  lastPaymentDate: text("last_payment_date"),
  noteName: text("note_name"),
  campaignStart: text("campaign_start"),
  campaignEnd: text("campaign_end"),
  repaymentStructure: text("repayment_structure", {
    enum: ["Bullet Principal, Monthly Profit", "Bullet Principal & Profit", "Monthly Principal & Profit"],
  })
    .notNull()
    .default("Bullet Principal, Monthly Profit"),
  // ---- Application detail (Phase: Issuer Portal / Campaign Manager parity) ----
  islamicConventional: text("islamic_conventional", { enum: ["Islamic", "Conventional"] }),
  counterpartyName: text("counterparty_name"),
  counterpartyRegistration: text("counterparty_registration"),
  // { businessInsurance, otherP2PFinancing, annualSales, employeeCount, clientCount } -
  // denormalized JSON, mirrors the documents table's metadata-only pattern rather
  // than a new normalized table for a handful of application-intake answers.
  businessInfoJson: text("business_info_json"),
  // ---- Regulatory reporting: SC RMO P2P Report [03000]/[03100] Financing
  // Details and [11000] Defaulted Issuer - supplementary campaign detail the
  // platform doesn't otherwise capture, entered by an admin via the
  // Campaign Regulatory Data page. ----
  campaignDescription: text("campaign_description"),
  campaignApplicationDate: text("campaign_application_date"),
  campaignApprovalDate: text("campaign_approval_date"),
  campaignUrl: text("campaign_url"),
  campaignSector: text("campaign_sector"),
  sustainabilityCategory: text("sustainability_category"),
  typeOfInvestmentNotes: text("type_of_investment_notes"),
  shariahAdviserName: text("shariah_adviser_name"),
  purposeOfFundRaising: text("purpose_of_fund_raising"),
  purposeOfFundRaisingOther: text("purpose_of_fund_raising_other"),
  remark: text("remark"),
  isSaranaScheme: integer("is_sarana_scheme", { mode: "boolean" }).default(false),
  saranaFinancingOptions: text("sarana_financing_options"),
  saranaFinancingScope: text("sarana_financing_scope"),
  targetFinancingAmount: real("target_financing_amount"),
  financingSecurity: text("financing_security"),
  issuerInterestRateEffective: real("issuer_interest_rate_effective"),
  investorReturnRateSimple: real("investor_return_rate_simple"),
  investorReturnRateEffective: real("investor_return_rate_effective"),
  defaultClassification: text("default_classification"),
  defaultClassificationOther: text("default_classification_other"),
  actualDueRepaymentDate: text("actual_due_repayment_date"),
  // ---- Regulatory reporting: MyCIF General P2P Financing Campaign
  // Quarterly Report (Transaction/Status/Impact Reporting) - supplementary
  // MyCIF co-investment and issuer-impact detail the platform doesn't
  // otherwise capture, entered by an admin via the Campaign Regulatory Data
  // page. Separate from the SC RMO SARANA fields above - MyCIF and SARANA
  // are distinct co-investment schemes. ----
  mycifSchemeType: text("mycif_scheme_type"),
  mycifCoInvestmentAmount: real("mycif_co_investment_amount"),
  issuerCurrentRevenueRM: real("issuer_current_revenue_rm"),
  issuerCurrentCustomerBase: integer("issuer_current_customer_base"),
  issuerCurrentEmployeeCount: integer("issuer_current_employee_count"),
  mycifProblemStatement: text("mycif_problem_statement"),
  mycifSolution: text("mycif_solution"),
  mycifBeneficiaries: text("mycif_beneficiaries"),
  mycifOutcomes: text("mycif_outcomes"),
  mycifFundUtilisationPct: real("mycif_fund_utilisation_pct"),
  mycifImpactMeasure: text("mycif_impact_measure"),
  mycifBaseline: text("mycif_baseline"),
  mycifImpactTarget: text("mycif_impact_target"),
  mycifProgressPct: real("mycif_progress_pct"),
  mycifKeyMilestones: text("mycif_key_milestones"),
  mycifChallenges: text("mycif_challenges"),
  mycifMitigationStrategies: text("mycif_mitigation_strategies"),
  // ---- Servicing engine (Islamic ta'widh/deferred-profit + conventional
  // late-interest accrual, payment waterfall, investor payout splitting) -
  // see C:\Users\admin\.claude\plans\idempotent-gliding-allen.md. All
  // nullable with engine-side defaults so existing rows keep working;
  // islamicConventional above already carries the structure flag but is
  // NULL on most seeded facilities, so the engine reads it via
  // COALESCE(islamic_conventional, 'Conventional'), never assuming non-null.
  deferredProfitCapRateBps: integer("deferred_profit_cap_rate_bps"),
  deferredProfitMaximumDays: integer("deferred_profit_maximum_days"),
  tawidhRateBps: integer("tawidh_rate_bps"),
  lateInterestRateBps: integer("late_interest_rate_bps"),
  dayCountBasis: integer("day_count_basis"),
  platformFeeBps: integer("platform_fee_bps"),
  sstRateBps: integer("sst_rate_bps"),
  delinquentDays: integer("delinquent_days"),
  defaultDays: integer("default_days"),
  // Live outstanding principal balance, decremented as payments are
  // allocated - replaces deriving this from installment rows so the
  // servicing engine has a single authoritative running balance. Backfilled
  // to principalAmount for existing rows by the Stage 1 migration.
  facilityPrincipalOutstanding: real("facility_principal_outstanding"),
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
  status: text("status", { enum: ["Paid", "Upcoming", "Overdue", "Defaulted"] })
    .notNull()
    .default("Upcoming"),
  paidAt: integer("paid_at", { mode: "timestamp" }),
  // ---- Servicing engine: richer per-component due/paid breakdown and a
  // parallel, more granular status. `status` above is untouched and stays
  // driven by a compatibility mapping (see servicing/servicingEngine.ts) so
  // the ~15 existing `status === "..."` call sites keep working unmodified;
  // servicingStatus is the new authoritative field the engine and any new
  // UI read. ----
  principalPaid: real("principal_paid").notNull().default(0),
  profitPaid: real("profit_paid").notNull().default(0),
  deferredProfitDue: real("deferred_profit_due").notNull().default(0),
  deferredProfitPaid: real("deferred_profit_paid").notNull().default(0),
  tawidhDue: real("tawidh_due").notNull().default(0),
  tawidhPaid: real("tawidh_paid").notNull().default(0),
  lateInterestDue: real("late_interest_due").notNull().default(0),
  lateInterestPaid: real("late_interest_paid").notNull().default(0),
  feesPaid: real("fees_paid").notNull().default(0),
  servicingStatus: text("servicing_status", {
    enum: ["UPCOMING", "DUE", "LATE", "DELINQUENT", "DEFAULT", "PAID", "SETTLED_EARLY"],
  }),
  originalDueDate: text("original_due_date"),
  superseded: integer("superseded", { mode: "boolean" }).notNull().default(false),
  settlementId: text("settlement_id"),
});

// ---- Servicing engine: payment ledger, investor payouts, held funds,
// charge/schedule adjustments, early settlement, fee policy history. One
// row per event, mirroring the prototype's facilityLedger.payments /
// payoutHistory / heldFunds / chargeAdjustments / scheduleVersions. ----

export const facilityPayments = sqliteTable(
  "facility_payments",
  {
    id: id(),
    facilityId: text("facility_id")
      .notNull()
      .references(() => financingFacilities.id),
    paymentReference: text("payment_reference").notNull(),
    paymentDate: text("payment_date").notNull(),
    method: text("method"),
    bank: text("bank"),
    receivedFrom: text("received_from"),
    amount: real("amount").notNull(),
    // { fees, tawidh, deferredProfit, profit, principal, lateInterest } - only
    // the components relevant to the facility's structure are populated.
    allocationJson: text("allocation_json").notNull(),
    instalmentIdsJson: text("instalment_ids_json").notNull(),
    trustStatus: text("trust_status", { enum: ["CONFIRMED"] }).notNull().default("CONFIRMED"),
    allocationStatus: text("allocation_status", { enum: ["RECORDED", "ALLOCATED"] })
      .notNull()
      .default("RECORDED"),
    payoutStatus: text("payout_status", { enum: ["PENDING", "COMPLETED", "EXCEPTION"] })
      .notNull()
      .default("PENDING"),
    recordedBy: text("recorded_by").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    // Stage 2a idempotency: the same admin-entered payment reference must not
    // be recordable twice against the same facility (a different facility
    // reusing the issuer's own reference numbering is fine).
    uniqueIndex("facility_payments_facility_reference_unique").on(table.facilityId, table.paymentReference),
  ]
);

export const investorPayouts = sqliteTable("investor_payouts", {
  id: id(),
  facilityId: text("facility_id")
    .notNull()
    .references(() => financingFacilities.id),
  // Stage 2a idempotency: one payout batch per payment, ever.
  paymentId: text("payment_id")
    .notNull()
    .unique()
    .references(() => facilityPayments.id),
  principalTotal: real("principal_total").notNull().default(0),
  grossScheduledReturnTotal: real("gross_scheduled_return_total").notNull().default(0),
  grossLateReturnTotal: real("gross_late_return_total").notNull().default(0),
  platformFeeTotal: real("platform_fee_total").notNull().default(0),
  sstTotal: real("sst_total").notNull().default(0),
  walletCreditTotal: real("wallet_credit_total").notNull().default(0),
  status: text("status", { enum: ["COMPLETED", "EXCEPTION"] }).notNull().default("COMPLETED"),
  ...timestamps,
});

export const investorPayoutLines = sqliteTable("investor_payout_lines", {
  id: id(),
  payoutId: text("payout_id")
    .notNull()
    .references(() => investorPayouts.id),
  investorId: text("investor_id")
    .notNull()
    .references(() => users.id),
  principalEntitlement: real("principal_entitlement").notNull().default(0),
  grossScheduledReturn: real("gross_scheduled_return").notNull().default(0),
  grossLateReturn: real("gross_late_return").notNull().default(0),
  platformFee: real("platform_fee").notNull().default(0),
  sst: real("sst").notNull().default(0),
  netReturn: real("net_return").notNull().default(0),
  walletCredit: real("wallet_credit").notNull().default(0),
  status: text("status", { enum: ["PAID", "FAILED"] }).notNull().default("PAID"),
});

export const heldFunds = sqliteTable("held_funds", {
  id: id(),
  facilityId: text("facility_id")
    .notNull()
    .references(() => financingFacilities.id),
  sourcePaymentId: text("source_payment_id")
    .notNull()
    .references(() => facilityPayments.id),
  holdType: text("hold_type", { enum: ["SINKING_FUND", "PENDING_INSTRUCTION", "OTHER"] })
    .notNull()
    .default("OTHER"),
  originalAmount: real("original_amount").notNull(),
  usedAmount: real("used_amount").notNull().default(0),
  refundedAmount: real("refunded_amount").notNull().default(0),
  reason: text("reason"),
  status: text("status", { enum: ["HELD", "PARTIALLY_APPLIED", "APPLIED"] }).notNull().default("HELD"),
  approvedBy: text("approved_by").references(() => users.id),
  ...timestamps,
});

export const chargeAdjustments = sqliteTable("charge_adjustments", {
  id: id(),
  facilityId: text("facility_id")
    .notNull()
    .references(() => financingFacilities.id),
  installmentId: text("installment_id")
    .notNull()
    .references(() => repaymentInstallments.id),
  component: text("component", { enum: ["fees", "tawidh", "deferredProfit", "lateInterest", "profit", "principal"] }).notNull(),
  type: text("type", {
    enum: ["FULL_WAIVER", "PARTIAL_WAIVER", "REPLACE_AMOUNT", "INCREASE", "CORRECTION", "RESET"],
  }).notNull(),
  amount: real("amount").notNull().default(0),
  calculatedAmount: real("calculated_amount").notNull(),
  effectiveAmount: real("effective_amount").notNull(),
  reason: text("reason").notNull(),
  effectiveDate: text("effective_date").notNull(),
  approvedBy: text("approved_by")
    .notNull()
    .references(() => users.id),
  status: text("status", { enum: ["APPROVED", "SUPERSEDED"] }).notNull().default("APPROVED"),
  ...timestamps,
});

// One row per governed schedule change - installmentsJson is a full
// snapshot of the facility's installments at that version, mirroring the
// prototype's scheduleVersions.
export const scheduleVersions = sqliteTable("schedule_versions", {
  id: id(),
  facilityId: text("facility_id")
    .notNull()
    .references(() => financingFacilities.id),
  version: integer("version").notNull(),
  type: text("type").notNull(),
  effectiveDate: text("effective_date").notNull(),
  reason: text("reason").notNull(),
  approvedBy: text("approved_by")
    .notNull()
    .references(() => users.id),
  installmentsJson: text("installments_json").notNull(),
  ...timestamps,
});

export const earlySettlements = sqliteTable("early_settlements", {
  id: id(),
  facilityId: text("facility_id")
    .notNull()
    .unique()
    .references(() => financingFacilities.id),
  settlementDate: text("settlement_date").notNull(),
  actualPaymentDate: text("actual_payment_date").notNull(),
  principalOutstanding: real("principal_outstanding").notNull(),
  accruedReturn: real("accrued_return").notNull(),
  // Sum of the three columns below - kept as-is for anything already
  // reading a single lump late-charge figure.
  lateCharges: real("late_charges").notNull().default(0),
  // Stage 3c: full settlementPreview breakdown - separate components rather
  // than only the lump total above.
  deferredProfitCharges: real("deferred_profit_charges").notNull().default(0),
  tawidhCharges: real("tawidh_charges").notNull().default(0),
  lateInterestCharges: real("late_interest_charges").notNull().default(0),
  otherFees: real("other_fees").notNull().default(0),
  waiverAmount: real("waiver_amount").notNull().default(0),
  additionalCharges: real("additional_charges").notNull().default(0),
  finalSettlementAmount: real("final_settlement_amount").notNull(),
  status: text("status", { enum: ["APPROVED", "COMPLETED"] }).notNull().default("APPROVED"),
  reason: text("reason").notNull(),
  approvedBy: text("approved_by")
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

export const feePolicyHistory = sqliteTable("fee_policy_history", {
  id: id(),
  facilityId: text("facility_id")
    .notNull()
    .references(() => financingFacilities.id),
  // Which rate this entry changed - defaults to the only rate Stage 2c
  // actually overrides today, but keeps the table able to record an SST-rate
  // change later without a migration.
  policyField: text("policy_field", { enum: ["platformFeeBps", "sstRateBps"] })
    .notNull()
    .default("platformFeeBps"),
  previousRateBps: integer("previous_rate_bps"),
  newRateBps: integer("new_rate_bps").notNull(),
  reason: text("reason").notNull(),
  effectiveDate: text("effective_date").notNull(),
  approvedBy: text("approved_by")
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

// One row per admin-issued goodwill/compensation credit - mirrors the
// prototype's bonusCredits, but always posts a real wallet-crediting
// transaction (see adminBonusCredits.ts) rather than a fake ledger line.
export const bonusCredits = sqliteTable("bonus_credits", {
  id: id(),
  investorId: text("investor_id")
    .notNull()
    .references(() => users.id),
  bonusType: text("bonus_type", {
    enum: ["REFERRAL", "GOODWILL", "COMPENSATION", "PROMOTIONAL", "OTHER"],
  }).notNull(),
  amount: real("amount").notNull(),
  effectiveDate: text("effective_date").notNull(),
  reference: text("reference"),
  relatedInvestorId: text("related_investor_id").references(() => users.id),
  facilityId: text("facility_id").references(() => financingFacilities.id),
  reason: text("reason").notNull(),
  approvedBy: text("approved_by")
    .notNull()
    .references(() => users.id),
  transactionId: text("transaction_id").references(() => transactions.id),
  ...timestamps,
});

// One row per admin broadcast - recipientIdsJson snapshots exactly who was
// resolved as the audience at send time, mirroring the *Json convention used
// elsewhere (allocationJson, installmentsJson).
export const communications = sqliteTable("communications", {
  id: id(),
  facilityId: text("facility_id").references(() => financingFacilities.id),
  audience: text("audience", {
    enum: ["ALL_INVESTORS", "FACILITY_INVESTORS", "SPECIFIC_INVESTOR"],
  }).notNull(),
  specificInvestorId: text("specific_investor_id").references(() => users.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  sendDate: text("send_date").notNull(),
  sender: text("sender")
    .notNull()
    .references(() => users.id),
  recipientIdsJson: text("recipient_ids_json").notNull(),
  recipientCount: integer("recipient_count").notNull().default(0),
  ...timestamps,
});

// One row per operational event worth surfacing in the admin Notification
// Centre (Stage 3b) - mirrors the prototype's notification feed, but derived
// from real mutating actions (payment recorded, payout completed, charge
// adjustment approved, etc.) rather than emitted by a fake-data simulation.
export const notifications = sqliteTable("notifications", {
  id: id(),
  facilityId: text("facility_id").references(() => financingFacilities.id),
  investorId: text("investor_id").references(() => users.id),
  type: text("type", {
    enum: [
      "PAYMENT_RECORDED",
      "PAYMENT_ALLOCATED",
      "PAYOUT_COMPLETED",
      "CHARGE_ADJUSTMENT_APPROVED",
      "SCHEDULE_ADJUSTED",
      "HELD_FUNDS_CREATED",
      "HELD_FUNDS_APPLIED",
      "EARLY_SETTLEMENT_APPROVED",
      "PLATFORM_FEE_POLICY_UPDATED",
      "BONUS_CREDIT_ISSUED",
      "COMMUNICATION_SENT",
    ],
  }).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
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
  source: text("source", { enum: ["manual", "auto"] }).notNull().default("manual"),
  // Shared corporate holdings still set investorId to the maker who proposed
  // the investment (audit trail) - this is the real ownership key for those.
  corporateAccountId: text("corporate_account_id").references(() => corporateAccounts.id),
  ...timestamps,
});

// ---- Auto Invest: one rule per investor, matched against new/open notes ----

export const autoInvestRules = sqliteTable("auto_invest_rules", {
  investorId: text("investor_id")
    .primaryKey()
    .references(() => users.id),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  minRatePct: real("min_rate_pct"),
  maxTenorDays: integer("max_tenor_days"),
  riskTiers: text("risk_tiers"), // comma-separated, e.g. "A,B+" - null/empty means any tier
  amountPerNote: real("amount_per_note").notNull().default(100),
  budgetCap: real("budget_cap"), // null means unlimited
  totalInvested: real("total_invested").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
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
  corporateAccountId: text("corporate_account_id").references(() => corporateAccounts.id),
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
    enum: ["Investor Verification", "Issuer Verification", "New Note Listing", "Large Withdrawal"],
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
  // ---- KYC Engine (Barrier 2): mock confidence scoring + CTOS pull,
  // deterministic per-user so results are stable rather than random noise.
  // Drives the KYC Review Queue / CTOS Screening Record pages - display
  // layer only, kycStatus/kybStatus above remain the authoritative
  // Pending/Verified/Rejected state everything else already depends on.
  confidenceScore: integer("confidence_score"),
  flaggedReason: text("flagged_reason"),
  ctosResultJson: text("ctos_result_json"),
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
  corporateAccountId: text("corporate_account_id").references(() => corporateAccounts.id),
  ...timestamps,
  readyAt: integer("ready_at", { mode: "timestamp" }),
});

// Backing data for line charts (retail cumulative profit, admin AUM, etc.).
// accountId loosely references either a users.id or a corporate_accounts.id
// depending on metricKey - not FK-constrained since D1 doesn't enforce FKs
// by default and this table is shared across owner types.
export const metricsSnapshots = sqliteTable("metrics_snapshots", {
  id: id(),
  accountId: text("account_id"),
  metricKey: text("metric_key").notNull(),
  snapshotDate: text("snapshot_date").notNull(),
  value: real("value").notNull(),
});

// ---- Alerts: system-generated deal announcements, newest first ----

export const alerts = sqliteTable("alerts", {
  id: id(),
  message: text("message").notNull(),
  facilityId: text("facility_id").references(() => financingFacilities.id),
  ...timestamps,
});

// ---- Corporate accounts (Phase 2): a company with separate maker/checker logins ----

export const corporateAccounts = sqliteTable("corporate_accounts", {
  id: id(),
  companyName: text("company_name").notNull(),
  deployedFunds: real("deployed_funds").notNull().default(0),
  nav: real("nav").notNull().default(0),
  weightedYield: real("weighted_yield").notNull().default(0),
  collectionRate: real("collection_rate").notNull().default(0),
  realised: real("realised").notNull().default(0),
  performing: real("performing").notNull().default(0),
  overdue: real("overdue").notNull().default(0),
  defaulted: real("defaulted").notNull().default(0),
  watchlist: real("watchlist").notNull().default(0),
  makerCheckerEnabled: integer("maker_checker_enabled", { mode: "boolean" }).notNull().default(true),
  approvalThreshold: real("approval_threshold").notNull().default(50000),
  orderLimit: real("order_limit").notNull().default(150000),
  cashBalance: real("cash_balance").notNull().default(0),
  ...timestamps,
});

export const corporateUsers = sqliteTable("corporate_users", {
  id: id(),
  corporateAccountId: text("corporate_account_id")
    .notNull()
    .references(() => corporateAccounts.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  corpRole: text("corp_role", { enum: ["maker", "checker"] }).notNull(),
});

export const subwallets = sqliteTable("subwallets", {
  id: id(),
  corporateAccountId: text("corporate_account_id")
    .notNull()
    .references(() => corporateAccounts.id),
  name: text("name").notNull(),
  deployedAmount: real("deployed_amount").notNull().default(0),
  performancePct: real("performance_pct").notNull().default(0),
});

export const orders = sqliteTable("orders", {
  id: id(),
  corporateAccountId: text("corporate_account_id")
    .notNull()
    .references(() => corporateAccounts.id),
  subwalletId: text("subwallet_id").references(() => subwallets.id),
  amount: real("amount").notNull(),
  type: text("type", { enum: ["Allocation", "Investment", "Withdrawal", "SecondaryPurchase"] })
    .notNull()
    .default("Allocation"),
  facilityId: text("facility_id").references(() => financingFacilities.id),
  secondaryListingId: text("secondary_listing_id").references(() => secondaryListings.id),
  units: real("units"),
  reason: text("reason"),
  decisionNote: text("decision_note"),
  status: text("status", { enum: ["Pending Checker", "Approved", "Rejected"] })
    .notNull()
    .default("Pending Checker"),
  createdBy: text("created_by")
    .notNull()
    .references(() => corporateUsers.id),
  approvedBy: text("approved_by").references(() => corporateUsers.id),
  ...timestamps,
  decidedAt: integer("decided_at", { mode: "timestamp" }),
});

// ---- Issuer accounts (Phase 4) ----

export const issuerProfiles = sqliteTable("issuer_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  companyName: text("company_name").notNull(),
  registrationNumber: text("registration_number"),
  sector: text("sector"),
  contactPerson: text("contact_person"),
  contactEmail: text("contact_email"),
  registeredAddress: text("registered_address"),
  kybStatus: text("kyb_status").notNull().default("Pending"),
  availableLine: real("available_line").notNull().default(0),
  onTimeRate: real("on_time_rate").notNull().default(100),
  // ---- Regulatory reporting: SC RMO P2P Report [02000] Profile of Issuer -
  // supplementary company detail the platform doesn't otherwise capture,
  // entered by an admin via the Issuer Regulatory Data page. ----
  issuerIdCode: text("issuer_id_code"),
  dateOfIncorporation: text("date_of_incorporation"),
  dateOfCommencement: text("date_of_commencement"),
  countryOfIncorporation: text("country_of_incorporation").default("Malaysia"),
  typeOfCompany: text("type_of_company"),
  registeredAddressState: text("registered_address_state"),
  registeredAddressPostcode: text("registered_address_postcode"),
  businessAddress: text("business_address"),
  businessAddressState: text("business_address_state"),
  businessAddressPostcode: text("business_address_postcode"),
  phoneNumber: text("phone_number"),
  website: text("website"),
  companyActivities: text("company_activities"),
});

// One row per director/management team member per issuer - SC RMO P2P
// Report [06000]. Entered by an admin via the Issuer Regulatory Data page.
export const issuerBoardMembers = sqliteTable("issuer_board_members", {
  id: id(),
  issuerUserId: text("issuer_user_id")
    .notNull()
    .references(() => issuerProfiles.userId),
  name: text("name").notNull(),
  salutation: text("salutation"),
  identityPrefix: text("identity_prefix", { enum: ["NRIC", "Passport"] }).default("NRIC"),
  identityNumber: text("identity_number"),
  dob: text("dob"),
  gender: text("gender"),
  nationality: text("nationality"),
  address: text("address"),
  addressState: text("address_state"),
  addressPostcode: text("address_postcode"),
  designation: text("designation"),
  designationOther: text("designation_other"),
  appointmentDate: text("appointment_date"),
  resignationDate: text("resignation_date"),
  ...timestamps,
});

// One row per shareholder per issuer - SC RMO P2P Report [05000].
export const issuerShareholders = sqliteTable("issuer_shareholders", {
  id: id(),
  issuerUserId: text("issuer_user_id")
    .notNull()
    .references(() => issuerProfiles.userId),
  shareholderType: text("shareholder_type", { enum: ["Individual", "Company"] })
    .notNull()
    .default("Individual"),
  shareholderName: text("shareholder_name").notNull(),
  salutation: text("salutation"),
  identityPrefix: text("identity_prefix", { enum: ["NRIC", "Passport", "Company Registration No."] }).default("NRIC"),
  identityNumber: text("identity_number"),
  dob: text("dob"),
  gender: text("gender"),
  nationality: text("nationality"),
  address: text("address"),
  addressState: text("address_state"),
  addressPostcode: text("address_postcode"),
  shareType: text("share_type"),
  shareTypeOther: text("share_type_other"),
  shareholdingUnits: real("shareholding_units"),
  shareholdingAmount: real("shareholding_amount"),
  shareholdingPercentage: real("shareholding_percentage"),
  ...timestamps,
});

// One row per reporting period per issuer (balance sheet + P&L combined,
// since both are issuer-level period figures) - SC RMO P2P Report
// [09000]/[09100].
export const issuerFinancials = sqliteTable("issuer_financials", {
  id: id(),
  issuerUserId: text("issuer_user_id")
    .notNull()
    .references(() => issuerProfiles.userId),
  periodLabel: text("period_label").notNull(), // e.g. "FY2025"
  assetsCurrentRM: real("assets_current_rm"),
  assetsNonCurrentRM: real("assets_non_current_rm"),
  liabCurrentBorrowingRM: real("liab_current_borrowing_rm"),
  liabCurrentNonBorrowingRM: real("liab_current_non_borrowing_rm"),
  liabNonCurrentLoanRM: real("liab_non_current_loan_rm"),
  liabNonCurrentNonLoanRM: real("liab_non_current_non_loan_rm"),
  equityCapitalRM: real("equity_capital_rm"),
  equityShareApplicationRM: real("equity_share_application_rm"),
  equitySharePremiumRM: real("equity_share_premium_rm"),
  equityAccumulatedProfitRM: real("equity_accumulated_profit_rm"),
  equityMinorityInterestRM: real("equity_minority_interest_rm"),
  totalRevenueRM: real("total_revenue_rm"),
  operatingCostRM: real("operating_cost_rm"),
  administrativeCostRM: real("administrative_cost_rm"),
  interestCostRM: real("interest_cost_rm"),
  otherCostRM: real("other_cost_rm"),
  profitLossBeforeTaxRM: real("profit_loss_before_tax_rm"),
  profitLossAfterTaxRM: real("profit_loss_after_tax_rm"),
  minorityInterestRM: real("minority_interest_rm"),
  netDividendRM: real("net_dividend_rm"),
  ...timestamps,
});

// One row per facility - SC RMO P2P Report [04500] Campaign Settlement.
export const campaignSettlements = sqliteTable("campaign_settlements", {
  id: id(),
  facilityId: text("facility_id")
    .notNull()
    .unique()
    .references(() => financingFacilities.id),
  paymentTo: text("payment_to", { enum: ["Issuer", "Investor"] }),
  fundDisbursementDate: text("fund_disbursement_date"),
  settlementAmount: real("settlement_amount"),
  fundRefundedDate: text("fund_refunded_date"),
  remark: text("remark"),
  ...timestamps,
});

// One row per R&R note, linked to the original facility - SC RMO P2P
// Position Report [04000] / P2P Report equivalent. Not derivable from
// existing data since the platform has no reschedule/restructure concept.
export const rescheduleRestructureNotes = sqliteTable("reschedule_restructure_notes", {
  id: id(),
  facilityId: text("facility_id")
    .notNull()
    .references(() => financingFacilities.id),
  rrCampaignId: text("rr_campaign_id"),
  interestRatePct: real("interest_rate_pct"),
  tenureOriginalMonths: integer("tenure_original_months"),
  tenureRRMonths: integer("tenure_rr_months"),
  commencementDateRR: text("commencement_date_rr"),
  financingAmountOriginal: real("financing_amount_original"),
  rrAmountRevised: real("rr_amount_revised"),
  rrPaymentStructure: text("rr_payment_structure"),
  ...timestamps,
});

// ---- Campaign Manager / Platform Operator: proposal lifecycle (Functional
// Handbook v1.0 s.2.1/4.3) - deliberately separate from `approvals` (which
// remains the KYC/KYB/note-listing compliance queue). A proposal is the
// commercial-terms package an operator prepares against a facility the
// issuer already applied for; financing amount/tenor/rate/repayment
// structure stay on financingFacilities (single source of truth for the
// repayment-schedule generator) - this table only holds the proposal-
// specific risk/security/fee/launch fields layered on top.
export const proposals = sqliteTable("proposals", {
  id: id(), // e.g. IIF2075-16072026 - product prefix + sequence + creation date
  facilityId: text("facility_id")
    .notNull()
    .references(() => financingFacilities.id),
  preparedBy: text("prepared_by")
    .notNull()
    .references(() => users.id),
  status: text("status", { enum: ["Drafted", "Submitted", "Scheduled", "Launched"] }).notNull().default("Drafted"),
  riskMethod: text("risk_method"),
  riskValue: text("risk_value"),
  securitiesJson: text("securities_json"),
  corporateGuaranteeSource: text("corporate_guarantee_source"),
  corporateGuaranteeOther: text("corporate_guarantee_other"),
  collateralDetails: text("collateral_details"),
  otherSecurityDetails: text("other_security_details"),
  processingFee: real("processing_fee").notNull().default(0),
  platformFee: real("platform_fee").notNull().default(0),
  documentsJson: text("documents_json"),
  noteName: text("note_name"),
  noteMessage: text("note_message"),
  recallReason: text("recall_reason"),
  promotionalStart: integer("promotional_start", { mode: "timestamp" }),
  launchStart: integer("launch_start", { mode: "timestamp" }),
  launchEnd: integer("launch_end", { mode: "timestamp" }),
  ...timestamps,
  submittedAt: integer("submitted_at", { mode: "timestamp" }),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  launchedAt: integer("launched_at", { mode: "timestamp" }),
});

// ---- KYC Engine / CIF architecture (Barrier 1 + Barrier 2) ----

// One row per user, captured at Barrier 1 signup from the (mocked) IC-scan
// OCR result and selfie/liveness check. Distinct from investor_profiles/
// issuer_profiles: this is the *person's* raw identity capture, independent
// of which sub-profile (if any) they later activate at Barrier 2.
export const kycProfiles = sqliteTable("kyc_profiles", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  fullName: text("full_name").notNull(),
  icNumber: text("ic_number"),
  dob: text("dob"),
  nationality: text("nationality"),
  address: text("address"),
  gender: text("gender"),
  ocrOverridden: integer("ocr_overridden", { mode: "boolean" }).notNull().default(false),
  faceMatchScore: integer("face_match_score"),
  livenessPassed: integer("liveness_passed", { mode: "boolean" }),
  jpnVerified: integer("jpn_verified", { mode: "boolean" }),
  amlConfidenceScore: integer("aml_confidence_score"),
  ...timestamps,
  verifiedAt: integer("verified_at", { mode: "timestamp" }),
});

// One wallet per activated sub-profile (Barrier 2). cif_id mirrors the
// individual's IC number or a company's registration number depending on
// cif_type - a real company can hold two wallets (investor + issuer) under
// the same cif_id, matching the prototype's CIF architecture. Addresses are
// mock-generated (deterministic per user, see lib/kycMock.ts) - there is no
// real chain behind this demo.
export const wallets = sqliteTable("wallets", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  cifId: text("cif_id").notNull(),
  cifType: text("cif_type", { enum: ["INDIVIDUAL", "CORPORATE", "ISSUER"] }).notNull(),
  walletType: text("wallet_type", { enum: ["INVESTOR", "ISSUER"] }).notNull(),
  walletAddress: text("wallet_address").notNull().unique(),
  chainId: text("chain_id").notNull().default("Arbitrum"),
  status: text("status", { enum: ["ACTIVE", "FROZEN", "CLOSED"] }).notNull().default("ACTIVE"),
  ...timestamps,
});

// Immutable decision trail for KYC/KYB cases - written whenever a compliance
// officer decides a case from the CTOS Screening Record page. Separate from
// the general-purpose audit_log above since these are specifically
// kyc_status transitions with a reason code, mirroring the prototype's own
// kyc_audit_log table.
export const kycAuditLog = sqliteTable("kyc_audit_log", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  statusFrom: text("status_from"),
  statusTo: text("status_to").notNull(),
  actorType: text("actor_type", { enum: ["SYSTEM", "ADMIN"] }).notNull(),
  actorId: text("actor_id").references(() => users.id),
  reasonCode: text("reason_code"),
  notes: text("notes"),
  ...timestamps,
});
