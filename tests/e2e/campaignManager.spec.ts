import { test, expect } from "@playwright/test";
import { login, apiFetch, DEMO_ACCOUNTS } from "./helpers";

test.describe("Campaign Manager", () => {
  test("a Drafted proposal is invisible to the issuer, but a Submitted one is visible read-only", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.campaignManager);
    await page.getByRole("link", { name: "Proposals", exact: true }).click();
    await page.getByRole("button", { name: "Drafted", exact: true }).click();
    await expect(page.locator(".list-item", { hasText: "CWC2091-14082026" })).toBeVisible();

    await page.getByRole("button", { name: "Submitted", exact: true }).click();
    await expect(page.locator(".list-item", { hasText: "IIF2090-12082026" })).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await login(page, DEMO_ACCOUNTS.issuer);
    await page.getByRole("link", { name: "Proposals", exact: true }).click();
    await expect(page.locator(".list-item", { hasText: "CWC2091-14082026" })).toHaveCount(0);
    const submittedRow = page.locator(".list-item", { hasText: "IIF2090-12082026" });
    await expect(submittedRow).toBeVisible();
    await submittedRow.click();
    await expect(page.getByText("Payment Risk Rating: B")).toBeVisible();
    await expect(page.getByRole("button", { name: "Recall" })).toHaveCount(0);
  });

  test("campaign manager disburses an Open note and records a repayment on an Ongoing note", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.campaignManager);
    await page.getByRole("link", { name: "Notes", exact: true }).click();

    const openRow = page.locator("tbody tr", { hasText: "Open" }).first();
    await expect(openRow).toBeVisible();
    const noteId = await openRow.locator("td").first().innerText();
    await openRow.getByRole("button", { name: "View" }).click();
    await expect(page.getByRole("heading", { name: noteId })).toBeVisible();
    await page.getByRole("button", { name: "Confirm Disbursement" }).click();
    await expect(page.locator("#toast")).toContainText("disbursed");
    await expect(page.locator(".status", { hasText: "Ongoing" })).toBeVisible();

    // MBIBG-26080001 (not MBIBG-26070005 - that one's installment #2 is a
    // deliberately-unpaid "Overdue" fixture other specs depend on) has a
    // real seeded Upcoming schedule ready to be marked paid here.
    await page.getByRole("button", { name: "Back to Notes" }).click();
    const scheduleRow = page.locator("tbody tr", { hasText: "MBIBG-26080001" });
    await expect(scheduleRow).toBeVisible();
    await scheduleRow.getByRole("button", { name: "View" }).click();
    const upcomingRow = page.locator("tr", { hasText: "Upcoming" }).first();
    await expect(upcomingRow).toBeVisible();
    await upcomingRow.getByRole("button", { name: "Mark as Paid" }).click();
    await expect(page.locator("#toast")).toContainText("Payment recorded");
    await expect(page.locator("tr", { hasText: "Paid" }).first()).toBeVisible();
  });

  test("a proposal row is keyboard-navigable, not just clickable", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.campaignManager);
    await page.getByRole("link", { name: "Proposals", exact: true }).click();
    await page.getByRole("button", { name: "Submitted", exact: true }).click();

    const row = page.locator(".list-item", { hasText: "IIF2090-12082026" });
    await expect(row).toBeVisible();
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "IIF2090-12082026" })).toBeVisible();
  });

  test("Reports page offers a real regulatory PDF and CSV exports", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.campaignManager);
    await page.getByRole("link", { name: "Reports", exact: true }).click();

    await expect(page.getByRole("link", { name: "Download Regulatory Summary" })).toHaveAttribute("href", "/api/campaign-manager/reports/regulatory-summary.pdf");
    await expect(page.getByRole("link", { name: "Export CSV" }).first()).toHaveAttribute("href", "/api/campaign-manager/export/notes.csv");

    const pdfRes = await apiFetch(page, "/api/campaign-manager/reports/regulatory-summary.pdf");
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.body).toContain("%PDF");
    expect(pdfRes.body).toContain("REGULATORY SUMMARY REPORT");

    const csvRes = await apiFetch(page, "/api/campaign-manager/export/repayments.csv");
    expect(csvRes.status).toBe(200);
    expect(csvRes.body).toContain("issuerName");
  });
});
