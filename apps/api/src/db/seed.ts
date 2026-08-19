// Generates seed.sql from the same data the legacy prototype used for
// its retail demo, plus the 4 seeded demo/reviewer identities. Run via
// `npm run db:seed:local` (see apps/api/package.json) - this script
// only *generates* SQL (Node has no D1 binding); wrangler applies it.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashPassword } from "../auth/password";

function sqlStr(v: string | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}
function sqlNum(v: number): string {
  return String(v);
}
function sqlBool(v: boolean): string {
  return v ? "1" : "0";
}
function sqlTs(date: Date): string {
  return String(Math.floor(date.getTime() / 1000));
}

const DEMO_PASSWORD = "demopassword";

async function main() {
  const statements: string[] = [];
  const now = new Date();

  // ---- Demo users (one per role, is_demo_reviewer = 1 so the role
  // switcher and "Try the demo" login buttons work for them) ----
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const demoUsers = [
    { id: "user-retail-demo", email: "joshua@cofundr.demo", displayName: "Joshua Kuan Chung Shearn", role: "retail" },
    { id: "user-corporate-demo", email: "treasury@abctreasury.demo", displayName: "ABC Treasury Sdn Bhd", role: "corporate" },
    { id: "user-admin-demo", email: "sarah.lim@cofundr.demo", displayName: "Datin Sarah Lim", role: "admin" },
    { id: "user-issuer-demo", email: "finance@sunwaybiz.demo", displayName: "Sunway Business Solutions", role: "issuer" },
  ] as const;

  for (const u of demoUsers) {
    statements.push(
      `INSERT INTO users (id, email, password_hash, role, display_name, is_demo_reviewer, created_at, updated_at) VALUES (${sqlStr(u.id)}, ${sqlStr(u.email)}, ${sqlStr(passwordHash)}, ${sqlStr(u.role)}, ${sqlStr(u.displayName)}, 1, ${sqlTs(now)}, ${sqlTs(now)});`
    );
  }

  const retailId = "user-retail-demo";

  // ---- Retail investor profile (from legacy state.profile) ----
  statements.push(
    `INSERT INTO investor_profiles (user_id, cash_balance, total_deposits, total_withdrawals, total_invested, annualised_yield, expected_returns, expected_this_month, overdue_this_month, outstanding, defaulted, kyc_status, job_type, income_range, net_worth, source_of_funds, objective, risk_appetite) VALUES (${sqlStr(retailId)}, 57.78, 29001.09, 80.69923, 178780, 6.64, 1089.36, 122.22, 17.50, 2704.65, 4.65, 'Verified', 'Employed', 'RM5k - RM10k', 'RM100k - RM500k', 'Employment income', 'Balanced return', 'Balanced');`
  );

  // ---- Financing facilities (from legacy state.notes + facilities only referenced by holdings) ----
  const facilities = [
    { id: "MBSG-25080014", group: "Guaranteed Investment Note", type: "Invoice Financing", tier: "B+", rate: 6, tenor: 30, min: 100, max: 2700, progress: 100, amount: 27300, service: 30, issuer: "Sunway Business Solutions", status: "Completed" },
    { id: "MBSG-25080015", group: "Guaranteed Investment Note", type: "Contract Financing", tier: "B+", rate: 6, tenor: 30, min: 100, max: 1400, progress: 100, amount: 14000, service: 30, issuer: "Evergreen Capital Sdn Bhd", status: "Completed" },
    { id: "MBSG-25080016", group: "Guaranteed Investment Note", type: "Working Capital", tier: "A", rate: 8, tenor: 30, min: 100, max: 4000, progress: 100, amount: 40200, service: 30, issuer: "Growth Ventures MY", status: "Completed" },
    { id: "MBSG-25080017", group: "Guaranteed Investment Note", type: "Invoice Financing", tier: "A", rate: 6, tenor: 30, min: 100, max: 1200, progress: 100, amount: 12700, service: 30, issuer: "KMT Jaya Sdn Bhd", status: "Completed" },
    { id: "MBIBG-26070005", group: "Invoice Financing", type: "Invoice Financing", tier: "B+", rate: 7, tenor: 540, min: 100, max: 5000, progress: 74, amount: 620000, service: 8, issuer: "Issuer ID - 1933891", status: "Ongoing", first: "2026-08-08", last: "2028-01-08" },
    { id: "MBIBG-26080001", group: "Contract Financing", type: "Contract Financing", tier: "A", rate: 8.5, tenor: 90, min: 500, max: 20000, progress: 62, amount: 245000, service: 5, issuer: "Issuer ID - 1645911", status: "Ongoing", first: "2026-09-08", last: "2026-11-30" },
    { id: "MBIBG-26070003", group: "Invoice Financing", type: "Invoice Financing", tier: "B+", rate: 7, tenor: 540, min: 100, max: 5000, progress: 100, amount: 500000, service: 8, issuer: "Issuer ID - 1932340", status: "Ongoing" },
    { id: "MBIDG-26070001", group: "Invoice Financing", type: "Invoice Financing", tier: "C+", rate: 7, tenor: 540, min: 100, max: 5000, progress: 100, amount: 300000, service: 8, issuer: "Issuer ID - 1933227", status: "Default" },
    { id: "WC1881-08082024", group: "Working Capital", type: "Working Capital", tier: "C+", rate: 10, tenor: 120, min: 100, max: 5000, progress: 100, amount: 50000, service: 10, issuer: "The Livestock & Meat Supplier", status: "Default" },
  ];
  for (const f of facilities) {
    statements.push(
      `INSERT INTO financing_facilities (id, product_group, financing_type, risk_tier, rate_pct, tenor_days, days_elapsed, min_investment, max_investment, funding_progress_pct, principal_amount, service_fee_pct, issuer_name, status, first_payment_date, last_payment_date, created_at) VALUES (${sqlStr(f.id)}, ${sqlStr(f.group)}, ${sqlStr(f.type)}, ${sqlStr(f.tier)}, ${sqlNum(f.rate)}, ${sqlNum(f.tenor)}, 0, ${sqlNum(f.min)}, ${sqlNum(f.max)}, ${sqlNum(f.progress)}, ${sqlNum(f.amount)}, ${sqlNum(f.service)}, ${sqlStr(f.issuer)}, ${sqlStr(f.status)}, ${sqlStr(f.first ?? null)}, ${sqlStr(f.last ?? null)}, ${sqlTs(now)});`
    );
  }

  // 18-installment schedule for the facility the demo investor holds (mirrors legacy buildSchedule()).
  const scheduleFacilityId = "MBIBG-26070005";
  for (let i = 0; i < 18; i++) {
    const dueDate = new Date(2026, 7 + i, 8).toISOString().slice(0, 10);
    const isLast = i === 17;
    statements.push(
      `INSERT INTO repayment_installments (id, facility_id, installment_no, due_date, principal_due, profit_due, fee_due, status) VALUES (${sqlStr(`${scheduleFacilityId}-${i + 1}`)}, ${sqlStr(scheduleFacilityId)}, ${i + 1}, ${sqlStr(dueDate)}, ${isLast ? 100 : 0}, ${isLast ? 0.64 : 0.58}, ${isLast ? 0.09 : 0.08}, ${sqlStr(i === 0 ? "Paid" : "Upcoming")});`
    );
  }

  // ---- Retail holdings (from legacy state.holdings) ----
  const holdings = [
    { id: "holding-1", facility: "MBIBG-26070005", status: "Ongoing", invested: 100, expected: 110.50, actual: 0.58, eligible: true },
    { id: "holding-2", facility: "MBIBG-26070003", status: "Ongoing", invested: 100, expected: 110.50, actual: 0.58, eligible: true },
    { id: "holding-3", facility: "MBIDG-26070001", status: "Default", invested: 100, expected: 110.50, actual: 0, eligible: false },
    { id: "holding-4", facility: "WC1881-08082024", status: "Default", invested: 4.65, expected: 0, actual: 0, eligible: false },
    { id: "holding-5", facility: "MBSG-25080014", status: "Completed", invested: 100, expected: 100.50, actual: 100.50, eligible: false },
  ];
  for (const h of holdings) {
    statements.push(
      `INSERT INTO holdings (id, investor_id, facility_id, status, amount_invested, expected_return, actual_return, eligible_for_sale, created_at) VALUES (${sqlStr(h.id)}, ${sqlStr(retailId)}, ${sqlStr(h.facility)}, ${sqlStr(h.status)}, ${sqlNum(h.invested)}, ${sqlNum(h.expected)}, ${sqlNum(h.actual)}, ${sqlBool(h.eligible)}, ${sqlTs(now)});`
    );
  }

  // ---- Secondary listings: seed a second lightweight seller so these
  // are genuinely other investors' listings, matching the legacy demo ----
  statements.push(
    `INSERT INTO users (id, email, password_hash, role, display_name, is_demo_reviewer, created_at, updated_at) VALUES ('user-seed-seller', 'seed-seller@cofundr.demo', ${sqlStr(passwordHash)}, 'retail', 'Retail Investor', 0, ${sqlTs(now)}, ${sqlTs(now)});`
  );
  statements.push(
    `INSERT INTO investor_profiles (user_id, kyc_status) VALUES ('user-seed-seller', 'Verified');`
  );
  statements.push(
    `INSERT INTO holdings (id, investor_id, facility_id, status, amount_invested, expected_return, actual_return, eligible_for_sale, created_at) VALUES ('holding-seed-1', 'user-seed-seller', 'MBSG-25080014', 'Completed', 2200, 2270, 2270, 1, ${sqlTs(now)});`
  );
  statements.push(
    `INSERT INTO holdings (id, investor_id, facility_id, status, amount_invested, expected_return, actual_return, eligible_for_sale, created_at) VALUES ('holding-seed-2', 'user-seed-seller', 'MBSG-25080016', 'Completed', 5100, 5508, 5508, 1, ${sqlTs(now)});`
  );
  statements.push(
    `INSERT INTO secondary_listings (id, holding_id, seller_id, units, price_per_unit, status, listed_at) VALUES ('SEC-1021', 'holding-seed-1', 'user-seed-seller', 2200, 0.997, 'Open', ${sqlTs(now)});`
  );
  statements.push(
    `INSERT INTO secondary_listings (id, holding_id, seller_id, units, price_per_unit, status, listed_at) VALUES ('SEC-1054', 'holding-seed-2', 'user-seed-seller', 5100, 0.994, 'Open', ${sqlTs(now)});`
  );

  // ---- Activities / transactions (from legacy state.activities) ----
  const activities = [
    { type: "Deposit", amount: 500, status: "Confirmed", date: "2026-08-18 09:16" },
    { type: "Investment", amount: -100, status: "Confirmed", date: "2026-08-17 15:42" },
    { type: "Repayment", amount: 0.58, status: "Paid", date: "2026-08-16 12:37" },
    { type: "Withdrawal", amount: -50, status: "Pending", date: "2026-08-15 11:32" },
    { type: "Deposit", amount: 300, status: "Confirmed", date: "2026-08-14 18:54" },
    { type: "Investment", amount: -200, status: "Confirmed", date: "2026-08-13 10:20" },
    { type: "Deposit", amount: 100, status: "Pending", date: "2026-08-09 18:48" },
  ];
  for (const [i, a] of activities.entries()) {
    const occurredAt = Math.floor(new Date(a.date.replace(" ", "T") + ":00Z").getTime() / 1000);
    statements.push(
      `INSERT INTO transactions (id, account_id, type, amount, status, occurred_at) VALUES (${sqlStr(`txn-seed-${i + 1}`)}, ${sqlStr(retailId)}, ${sqlStr(a.type)}, ${sqlNum(a.amount)}, ${sqlStr(a.status)}, ${occurredAt});`
    );
  }

  // ---- Statements (from legacy state.statements) ----
  const stmts = [
    { id: "stmt-1", period: "July 2026", type: "Monthly", status: "Ready" },
    { id: "stmt-2", period: "June 2026", type: "Monthly", status: "Ready" },
    { id: "stmt-3", period: "FY 2025", type: "Annual", status: "Ready" },
  ];
  for (const s of stmts) {
    statements.push(
      `INSERT INTO statements (id, owner_id, period_label, type, status, created_at, ready_at) VALUES (${sqlStr(s.id)}, ${sqlStr(retailId)}, ${sqlStr(s.period)}, ${sqlStr(s.type)}, ${sqlStr(s.status)}, ${sqlTs(now)}, ${sqlTs(now)});`
    );
  }

  // ---- Cumulative profit chart (from legacy state.lineRetail) ----
  const lineRetail = [13750, 13920, 14100, 14285, 14470, 14680, 14835, 14910, 14995, 15040, 15090, 15135];
  for (const [i, v] of lineRetail.entries()) {
    const snapshotDate = new Date(2025, 8 + i, 1).toISOString().slice(0, 10);
    statements.push(
      `INSERT INTO metrics_snapshots (id, account_id, metric_key, snapshot_date, value) VALUES (${sqlStr(`snap-retail-${i + 1}`)}, ${sqlStr(retailId)}, 'cumulative_profit', ${sqlStr(snapshotDate)}, ${sqlNum(v)});`
    );
  }

  // ---- Corporate account: ABC Treasury Sdn Bhd (from legacy state.corporate) ----
  // user-corporate-demo (the seeded demo/reviewer login) is the Maker.
  // A second, non-demo-reviewer Checker login is seeded so the two roles
  // are genuinely separate accounts - real maker/checker collaboration,
  // not a client-side toggle like the legacy prototype had.
  const corpAccountId = "corp-abc-treasury";
  const corpMakerUserId = "user-corporate-demo";
  const corpCheckerUserId = "user-corporate-checker-demo";
  const corpMakerId = "corpuser-maker-1";
  const corpCheckerId = "corpuser-checker-1";

  statements.push(
    `INSERT INTO users (id, email, password_hash, role, display_name, is_demo_reviewer, created_at, updated_at) VALUES (${sqlStr(corpCheckerUserId)}, 'checker@abctreasury.demo', ${sqlStr(passwordHash)}, 'corporate', 'ABC Treasury Checker', 0, ${sqlTs(now)}, ${sqlTs(now)});`
  );
  statements.push(
    `INSERT INTO corporate_accounts (id, company_name, deployed_funds, nav, weighted_yield, collection_rate, realised, performing, overdue, defaulted, watchlist, maker_checker_enabled, approval_threshold, order_limit, created_at) VALUES (${sqlStr(corpAccountId)}, 'ABC Treasury Sdn Bhd', 8950000, 9370000, 12.45, 96.72, 471000, 8180000, 485000, 285000, 485000, 1, 50000, 150000, ${sqlTs(now)});`
  );
  statements.push(
    `INSERT INTO corporate_users (id, corporate_account_id, user_id, corp_role) VALUES (${sqlStr(corpMakerId)}, ${sqlStr(corpAccountId)}, ${sqlStr(corpMakerUserId)}, 'maker');`
  );
  statements.push(
    `INSERT INTO corporate_users (id, corporate_account_id, user_id, corp_role) VALUES (${sqlStr(corpCheckerId)}, ${sqlStr(corpAccountId)}, ${sqlStr(corpCheckerUserId)}, 'checker');`
  );

  const walletDefs = [
    { id: "wallet-treasury-pool", name: "Treasury Pool", deployed: 3400000, perf: 98 },
    { id: "wallet-client-fund-a", name: "Client Fund A", deployed: 2600000, perf: 94 },
    { id: "wallet-client-fund-b", name: "Client Fund B", deployed: 1800000, perf: 91 },
    { id: "wallet-high-yield", name: "High Yield Mandate", deployed: 1150000, perf: 88 },
  ];
  for (const w of walletDefs) {
    statements.push(
      `INSERT INTO subwallets (id, corporate_account_id, name, deployed_amount, performance_pct) VALUES (${sqlStr(w.id)}, ${sqlStr(corpAccountId)}, ${sqlStr(w.name)}, ${sqlNum(w.deployed)}, ${sqlNum(w.perf)});`
    );
  }

  const orderDefs = [
    { id: "ORD-2041", wallet: "wallet-treasury-pool", amount: 75000 },
    { id: "ORD-2042", wallet: "wallet-client-fund-a", amount: 52000 },
  ];
  for (const o of orderDefs) {
    statements.push(
      `INSERT INTO orders (id, corporate_account_id, subwallet_id, amount, status, created_by, created_at) VALUES (${sqlStr(o.id)}, ${sqlStr(corpAccountId)}, ${sqlStr(o.wallet)}, ${sqlNum(o.amount)}, 'Pending Checker', ${sqlStr(corpMakerId)}, ${sqlTs(now)});`
    );
  }

  // ---- Corporate NAV trend chart (from legacy state.lineCorp, in millions) ----
  const lineCorp = [8.4, 8.5, 8.58, 8.63, 8.71, 8.76, 8.84, 8.92, 9.01, 9.12, 9.24, 9.37];
  for (const [i, v] of lineCorp.entries()) {
    const snapshotDate = new Date(2025, 8 + i, 1).toISOString().slice(0, 10);
    statements.push(
      `INSERT INTO metrics_snapshots (id, account_id, metric_key, snapshot_date, value) VALUES (${sqlStr(`snap-corp-${i + 1}`)}, ${sqlStr(corpAccountId)}, 'nav_trend', ${sqlStr(snapshotDate)}, ${sqlNum(v * 1_000_000)});`
    );
  }

  // ---- Platform AUM trend (admin overview chart) ----
  const lineAUM = [36.1, 36.9, 37.6, 38.4, 39.1, 39.8, 40.6, 41.2, 41.8, 42.1, 42.4, 42.6];
  for (const [i, v] of lineAUM.entries()) {
    const snapshotDate = new Date(2025, 8 + i, 1).toISOString().slice(0, 10);
    statements.push(
      `INSERT INTO metrics_snapshots (id, account_id, metric_key, snapshot_date, value) VALUES (${sqlStr(`snap-platform-${i + 1}`)}, NULL, 'platform_aum', ${sqlStr(snapshotDate)}, ${sqlNum(v * 1_000_000)});`
    );
  }

  // Run from the apps/api workspace root (see the db:seed:generate script).
  writeFileSync(join(process.cwd(), "src/db/seed.sql"), statements.join("\n") + "\n");
  console.log(`Wrote ${statements.length} statements to apps/api/src/db/seed.sql`);
  console.log(`Demo login password for all seeded accounts: ${DEMO_PASSWORD}`);
}

main();
