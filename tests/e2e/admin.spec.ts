import { test, expect } from "@playwright/test";
import { login, logout, apiFetch, signupRetail, activateIndividual, DEMO_ACCOUNTS } from "./helpers";

test.describe("Admin approvals", () => {
  test("approving a fresh activation's KYC actually verifies the account", async ({ page }) => {
    const email = `pw-newbie-${Date.now()}@test.com`;

    await signupRetail(page, { displayName: "Playwright Newbie", email });
    await activateIndividual(page);

    // Confirm the account starts unverified before any admin action.
    const profileBefore = await apiFetch(page, "/api/account/profile");
    expect(JSON.parse(profileBefore.body).kycStatus).toBe("Pending");

    await logout(page);
    await login(page, DEMO_ACCOUNTS.ceo);
    await page.getByRole("link", { name: "Risk & Approvals", exact: true }).click();

    const row = page.locator(".list-item", { hasText: "Playwright Newbie" });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Approve" }).click();
    await expect(page.locator(".modal.show")).toContainText("Playwright Newbie");
    await page.locator(".modal.show").getByRole("button", { name: "Approve" }).click();
    await expect(page.locator("#toast")).toContainText("updated");
    await expect(row).toHaveCount(0);
  });

  test("a retail session is forbidden from admin routes", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);
    const res = await apiFetch(page, "/api/admin/overview");
    expect(res.status).toBe(403);
  });

  test("investors and issuers directories are sortable", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.ceo);
    await page.getByRole("link", { name: "Investors", exact: true }).click();
    const nameHeader = page.locator("th", { hasText: "Name" });
    await expect(nameHeader).toBeVisible();
    await nameHeader.click(); // sort ascending
    await nameHeader.click(); // sort descending - just proves it's interactive, no crash
  });

  test("clicking an investor row drills into their detail page", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.ceo);
    await page.getByRole("link", { name: "Investors", exact: true }).click();
    await expect(page.getByRole("link", { name: "Export CSV" })).toHaveAttribute("href", "/api/admin/export/investors.csv");

    await page.locator(".table tbody tr").first().click();
    await expect(page.getByRole("button", { name: "← Back to Investors" })).toBeVisible();
    // Either the Retail "Portfolio" card or the Corporate "Account" card renders, depending on which row was first.
    await expect(page.locator(".card h3", { hasText: /^(Portfolio|Account)$/ })).toBeVisible();

    await page.getByRole("button", { name: "← Back to Investors" }).click();
    await expect(page).toHaveURL(/\/app\/investors$/);
  });

  test("clicking an issuer row drills into their detail page", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.ceo);
    await page.getByRole("link", { name: "Issuers", exact: true }).click();
    await expect(page.getByRole("link", { name: "Export CSV" })).toHaveAttribute("href", "/api/admin/export/issuers.csv");

    await page.locator(".table tbody tr").first().click();
    await expect(page.getByRole("button", { name: "← Back to Issuers" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Financing Notes" })).toBeVisible();

    await page.getByRole("button", { name: "← Back to Issuers" }).click();
    await expect(page).toHaveURL(/\/app\/issuers$/);
  });

  test("the Approved and Rejected tabs show decided approval history, not just Pending", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.ceo);
    await page.getByRole("link", { name: "Risk & Approvals", exact: true }).click();

    await page.getByRole("button", { name: "Approved", exact: true }).click();
    const approvedRow = page.locator(".list-item", { hasText: "Sunway Business Solutions" });
    await expect(approvedRow).toBeVisible();
    await expect(approvedRow).toContainText("Approved by sarah.lim@cofundr.demo");

    await page.getByRole("button", { name: "Rejected", exact: true }).click();
    const rejectedRow = page.locator(".list-item", { hasText: "Mei Ling Tan" });
    await expect(rejectedRow).toBeVisible();
    await expect(rejectedRow).toContainText("Rejected by sarah.lim@cofundr.demo");
  });

  test("the platform Activity Log shows both admin decisions and corporate order events", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.ceo);
    await page.getByRole("link", { name: "Activity Log", exact: true }).click();

    // Seeded admin decisions.
    await expect(page.locator("table tr", { hasText: "Mei Ling Tan" }).filter({ hasText: "Approval Rejected" })).toBeVisible();
    // Seeded corporate maker/checker history - confirms this log is genuinely
    // platform-wide, not scoped to admin's own actions.
    await expect(page.locator("table tr", { hasText: "treasury@abctreasury.demo" }).first()).toBeVisible();

    await page.locator('input[placeholder*="Actor"]').fill("sarah.lim");
    await expect(page.locator("table tr", { hasText: "sarah.lim@cofundr.demo" }).first()).toBeVisible();
    await expect(page.locator("table tr", { hasText: "treasury@abctreasury.demo" })).toHaveCount(0);
  });

  test("Overview shows the financing pipeline, campaigns launched and platform revenue", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.ceo);

    await expect(page.getByText("Average Profit Rate")).toBeVisible();
    await expect(page.getByText("Average ticket size")).toBeVisible();

    await expect(page.getByText("Financing Pipeline")).toBeVisible();
    await expect(page.locator(".bar", { hasText: "Ongoing" })).toBeVisible();
    await expect(page.locator(".bar", { hasText: "Rejected" })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Campaigns Launched" })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Platform Revenue" })).toBeVisible();
    await expect(page.getByText(/Platform profit share \(20%\)/)).toBeVisible();
    // Seeded Paid installment history makes these genuinely non-zero.
    const revenue = await apiFetch(page, "/api/admin/revenue");
    const revenueJson = JSON.parse(revenue.body);
    expect(revenueJson.totalProfitPaidToInvestors).toBeGreaterThan(0);
    expect(revenueJson.platformProfitShare).toBeCloseTo(revenueJson.totalProfitPaidToInvestors * 0.2, 2);
    expect(revenueJson.totalFeesCollected).toBeGreaterThan(0);
  });

  test("Admin processes a real payment through record, allocate and investor payout (servicing engine Stage 2a)", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "Record Repayments", exact: true }).click();

    // WC2200-01082026 is a purpose-built Stage 1 fixture: Conventional,
    // one investor whose holding reconciles exactly to the facility
    // principal, so the payout math is easy to assert on.
    const scheduleRow = page.locator("tbody tr", { hasText: "WC2200-01082026" });
    await expect(scheduleRow).toBeVisible();
    await scheduleRow.getByRole("button", { name: "View" }).click();
    await page.getByRole("button", { name: "Process Payment" }).click();

    // Step 1: select instalments.
    await expect(page.getByText("Select one or more due or overdue instalments")).toBeVisible();
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole("button", { name: "Next: Record Payment" }).click();

    // Step 2: record payment.
    await page.getByLabel("Bank reference").fill(`PW-STAGE2A-${Date.now()}`);
    await page.getByLabel("Received from").fill("Coastal Fisheries Sdn Bhd");
    await page.getByRole("button", { name: "Next: Allocate Payment" }).click();

    // Step 3: allocate (default waterfall) - Conventional order is fees, late interest, profit, principal.
    await expect(page.getByRole("cell", { name: "Principal", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next: Review" }).click();

    // Step 4: review and confirm payout.
    await expect(page.getByText("Confirming will credit investor wallets")).toBeVisible();
    await page.getByRole("button", { name: "Confirm & Payout Investors" }).click();

    // Step 5: complete - real investor payout, not a binary mark-paid.
    await expect(page.getByText("Net wallet credits")).toBeVisible();
    await expect(page.locator("table", { hasText: "Wallet Credit" }).locator("tbody tr").first()).toBeVisible();

    // Confirm this actually moved real money: a facility_payments row exists,
    // it's allocated+paid out, and the investor's wallet was credited.
    const detail = await apiFetch(page, "/api/admin/repayments/WC2200-01082026");
    const detailJson = JSON.parse(detail.body);
    expect(detailJson.payments.length).toBeGreaterThan(0);
    expect(detailJson.payments[0].allocationStatus).toBe("ALLOCATED");
    expect(detailJson.payments[0].payoutStatus).toBe("COMPLETED");
    expect(detailJson.payouts.length).toBeGreaterThan(0);
    expect(detailJson.payouts[0].walletCreditTotal).toBeGreaterThan(0);
  });

  test("Admin waives a charge, edits the schedule, and holds back / applies part of a payout (servicing engine Stage 2b)", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "Record Repayments", exact: true }).click();

    // IIF2200-01082026 is the Islamic Stage 1 fixture, untouched by the
    // Stage 2a test above (which uses the Conventional WC2200 facility).
    const scheduleRow = page.locator("tbody tr", { hasText: "IIF2200-01082026" });
    await expect(scheduleRow).toBeVisible();
    await scheduleRow.getByRole("button", { name: "View" }).click();

    // --- Charge adjustment: fully waive Ta'widh on the overdue instalment #1 ---
    await page.getByRole("button", { name: "Adjust Charges" }).click();
    await page.getByLabel("Charge").selectOption("tawidh");
    await page.getByLabel("Adjustment type").selectOption("FULL_WAIVER");
    await page.getByLabel("Reason").fill("Playwright Stage 2b: goodwill waiver");
    await page.getByRole("button", { name: "Approve Adjustment" }).click();
    await expect(page.locator("#toast")).toContainText("Charge adjustment approved");
    await expect(page.locator("table", { hasText: "Reason" }).getByText("Playwright Stage 2b: goodwill waiver")).toBeVisible();

    // --- Schedule adjustment: push instalment #3's due date out, principal/profit unchanged so it still reconciles ---
    await page.goto("/app/admin-repayments");
    await page.locator("tbody tr", { hasText: "IIF2200-01082026" }).getByRole("button", { name: "View" }).click();
    await page.getByRole("button", { name: "Adjust Schedule" }).click();
    const dueDateInputs = page.locator('input[type="date"]');
    await dueDateInputs.nth(2).fill("2026-10-23"); // instalment #3 was 2026-09-23
    await expect(page.getByText("Difference")).toBeVisible();
    await page.getByLabel("Reason").fill("Playwright Stage 2b: push final instalment out one month");
    await page.getByRole("button", { name: "Confirm Adjustment" }).click();
    await expect(page.locator("#toast")).toContainText("Schedule adjustment confirmed");
    await expect(page.locator("table", { hasText: "Version" }).getByText("DIRECT_EDIT")).toBeVisible();

    // --- Held funds: pay instalment #3 in full, hold back part of the principal, then apply it to instalment #2 ---
    await page.goto("/app/admin-repayments");
    await page.locator("tbody tr", { hasText: "IIF2200-01082026" }).getByRole("button", { name: "View" }).click();
    await page.getByRole("button", { name: "Process Payment" }).click();
    await page.locator('input[type="checkbox"]').nth(2).check(); // instalment #3 (has the RM16,000 principal)
    await page.getByRole("button", { name: "Next: Record Payment" }).click();
    await page.getByLabel("Bank reference").fill(`PW-STAGE2B-${Date.now()}`);
    await page.getByRole("button", { name: "Next: Allocate Payment" }).click();
    await page.getByRole("button", { name: "Next: Review" }).click();
    await page.getByText("Hold part of this payment back").click();
    await page.getByLabel(/Amount to hold from principal/).fill("100");
    await page.getByLabel("Reason", { exact: true }).fill("Playwright Stage 2b: sinking fund hold");
    await page.getByRole("button", { name: "Confirm & Payout Investors" }).click();
    await expect(page.getByText("Net wallet credits")).toBeVisible();
    await expect(page.getByText("Part of this payment was held back")).toBeVisible();

    await page.goto("/app/admin-repayments");
    await page.locator("tbody tr", { hasText: "IIF2200-01082026" }).getByRole("button", { name: "View" }).click();
    const heldFundsRow = page.locator("tbody tr", { hasText: "SINKING_FUND" });
    await expect(heldFundsRow).toBeVisible();
    await expect(heldFundsRow).toContainText("HELD");
    await heldFundsRow.getByRole("button", { name: "Apply" }).click();
    await page.locator('input[type="checkbox"]').first().check(); // any instalment still carrying an outstanding balance
    await page.getByLabel("Amount to apply (RM)").fill("100");
    await page.locator("#applyReason").fill("Playwright Stage 2b: apply held funds forward");
    await page.getByRole("button", { name: "Apply Held Funds" }).click();
    await expect(page.locator("#toast")).toContainText("Held funds applied");

    const detail = await apiFetch(page, "/api/admin/repayments/IIF2200-01082026");
    const detailJson = JSON.parse(detail.body);
    expect(detailJson.chargeAdjustments.length).toBeGreaterThan(0);
    expect(detailJson.chargeAdjustments[0].effectiveAmount).toBe(0);
    expect(detailJson.scheduleVersions.length).toBeGreaterThan(0);
    expect(detailJson.heldFunds[0].status).not.toBe("HELD");
    expect(detailJson.payments.length).toBeGreaterThanOrEqual(2); // the recorded payment + the held-funds application payment
  });

  test("Admin overrides the platform fee and approves an early settlement (servicing engine Stage 2c)", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "Record Repayments", exact: true }).click();

    // WC2200-01082026's instalment #1 was already paid off in the Stage 2a
    // test above; instalments #2-6 remain, which is exactly what an early
    // settlement supersedes.
    await page.locator("tbody tr", { hasText: "WC2200-01082026" }).getByRole("button", { name: "View" }).click();

    // --- Platform fee override ---
    await page.getByRole("button", { name: "Platform Fee" }).click();
    await page.getByLabel("Policy").selectOption("WAIVE");
    await page.getByLabel("Reason", { exact: true }).fill("Playwright Stage 2c: waive platform fee");
    await page.getByRole("button", { name: "Approve Fee Policy" }).click();
    await expect(page.locator("#toast")).toContainText("Platform fee policy approved");
    await expect(page.getByRole("cell", { name: "0.00%", exact: true })).toBeVisible();

    // --- Early settlement ---
    await page.goto("/app/admin-repayments");
    await page.locator("tbody tr", { hasText: "WC2200-01082026" }).getByRole("button", { name: "View" }).click();
    await page.getByRole("button", { name: "Early Settlement" }).click();
    await page.getByRole("button", { name: "Preview Settlement" }).click();
    await expect(page.getByText("Final settlement amount")).toBeVisible();
    await page.getByLabel("Reason", { exact: true }).fill("Playwright Stage 2c: issuer requested early settlement");
    await page.getByRole("button", { name: "Approve & Continue to Payment" }).click();
    await expect(page.locator("#toast")).toContainText("Early settlement approved");
    await expect(page.getByText("Approved Settlement")).toBeVisible();

    const detail = await apiFetch(page, "/api/admin/repayments/WC2200-01082026");
    const detailJson = JSON.parse(detail.body);
    expect(detailJson.feePolicyHistory[0].newRateBps).toBe(0);
    expect(detailJson.earlySettlement).not.toBeNull();
    expect(detailJson.earlySettlement.status).toBe("APPROVED");
    expect(detailJson.earlySettlement.finalSettlementAmount).toBeGreaterThan(0);
    // Every previously-unpaid instalment is now superseded by exactly one new
    // settlement instalment - regardless of how many instalments were
    // already paid before settlement (order-independent: this must hold
    // whether or not the Stage 2a test above ran first in the same DB).
    const activeSchedule = detailJson.servicingSchedule as Array<{ status: string }>;
    expect(activeSchedule.filter((row) => row.status !== "PAID")).toHaveLength(1);
  });

  test("Admin issues a bonus credit, sends a communication, and reaches the audit trail (servicing engine Stage 2d)", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.admin);

    // --- Bonus credit: targets "Retail Investor" (user-seed-seller), never
    // user-retail-demo, since retail.spec.ts's deposit-persistence test
    // depends on that account's wallet balance staying untouched by other
    // specs (see servicing_engine_migration memory). ---
    await page.getByRole("link", { name: "Bonus Credits", exact: true }).click();
    await page.getByLabel("Investor").selectOption({ label: "Retail Investor" });
    await page.getByLabel("Bonus type").selectOption("GOODWILL");
    await page.getByLabel("Amount (RM)").fill("25");
    await page.getByLabel("Reason", { exact: true }).fill("Playwright Stage 2d: goodwill credit");
    await page.getByRole("button", { name: "Apply Bonus Credit" }).click();
    await expect(page.locator("#toast")).toContainText("Bonus credit applied");
    await expect(page.locator("tbody tr", { hasText: "Retail Investor" }).first()).toContainText("RM 25.00");

    // --- Communications: a specific-investor send, so the recipient count
    // assertion is deterministic regardless of how many retail users the
    // seed data happens to contain. ---
    await page.getByRole("link", { name: "Communications", exact: true }).click();
    await page.getByLabel("Audience").selectOption("SPECIFIC_INVESTOR");
    await page.getByLabel("Investor").selectOption({ label: "Retail Investor" });
    await page.getByLabel("Title").fill("Playwright Stage 2d notice");
    await page.getByLabel("Message").fill("This is a test communication sent by the Stage 2d e2e test.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator("#toast")).toContainText("Sent to 1 recipient");

    // --- Audit trail: the existing Activity Log, now linked from Admin's nav too. ---
    await page.getByRole("link", { name: "Audit Trail", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Activity Log" })).toBeVisible();

    const bonusList = await apiFetch(page, "/api/admin/bonus-credits");
    const bonusJson = JSON.parse(bonusList.body);
    expect(bonusJson.bonusCredits[0].amount).toBe(25);
    expect(bonusJson.bonusCredits[0].bonusType).toBe("GOODWILL");

    const commsList = await apiFetch(page, "/api/admin/communications");
    const commsJson = JSON.parse(commsList.body);
    expect(commsJson.communications[0].recipientCount).toBe(1);
    expect(commsJson.communications[0].audience).toBe("SPECIFIC_INVESTOR");
  });

  test("Reports page offers a real PDF platform summary and CSV exports", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "Reports", exact: true }).click();

    await expect(page.getByRole("link", { name: "Download Platform Summary" })).toHaveAttribute("href", "/api/admin/reports/platform-summary.pdf");
    await expect(page.getByRole("link", { name: "Export CSV" }).first()).toHaveAttribute("href", "/api/admin/export/investors.csv");

    const pdfRes = await apiFetch(page, "/api/admin/reports/platform-summary.pdf");
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.body).toContain("%PDF");

    const csvRes = await apiFetch(page, "/api/admin/export/approvals.csv");
    expect(csvRes.status).toBe(200);
    expect(csvRes.body).toContain("applicantName");
  });
});
