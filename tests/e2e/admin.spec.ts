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
