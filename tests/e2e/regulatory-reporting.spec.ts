import { test, expect } from "@playwright/test";
import { login, apiFetch, DEMO_ACCOUNTS } from "./helpers";

test.describe("Regulatory Reporting", () => {
  test("admin can enter supplementary issuer and campaign data, and it appears in the generated reports and CSV exports", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.admin);

    // ---- Issuer Regulatory Data: profile + board member ----
    await page.getByRole("link", { name: "Issuer Regulatory Data", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Extended Company Profile" })).toBeVisible();

    await page.getByLabel("Issuer ID Code").fill("ISSR-PW-001");
    await page.getByRole("button", { name: "Save Profile" }).click();
    await expect(page.locator("#toast")).toContainText("Profile updated");

    const boardName = `PW Director ${Date.now()}`;
    await page.getByLabel("Name", { exact: true }).fill(boardName);
    await page.getByLabel("Designation").fill("Chief Executive Officer");
    await page.getByRole("button", { name: "Add Board Member" }).click();
    await expect(page.locator("#toast")).toContainText("Board member added");
    await expect(page.locator(".list-item", { hasText: boardName })).toBeVisible();

    // ---- Campaign Regulatory Data: campaign field + settlement ----
    await page.getByRole("link", { name: "Campaign Regulatory Data", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Campaign & Financing Detail" })).toBeVisible();

    await page.getByLabel("Campaign Sector").fill("Renewable Energy");
    await page.getByRole("button", { name: "Save Campaign Detail" }).click();
    await expect(page.locator("#toast")).toContainText("Campaign fields updated");

    await page.getByLabel("Settlement Amount (RM)").fill("50000");
    await page.getByRole("button", { name: "Save Settlement" }).click();
    await expect(page.locator("#toast")).toContainText("Settlement record saved");

    // ---- Regulatory Reporting: both entries show up in the P2P report ----
    await page.getByRole("link", { name: "Regulatory Reporting", exact: true }).click();
    await page.getByRole("button", { name: "P2P Report (6.0)" }).click();

    await expect(page.locator(".table-wrap", { hasText: "Company Activities" })).toContainText("ISSR-PW-001");
    await expect(page.locator(".table-wrap", { hasText: "Designation" })).toContainText(boardName);

    // ---- CSV exports return real content (unpaginated, unlike the on-screen
    // tables above - the platform seeds more than one page of financing
    // facilities, so the edited note's row isn't guaranteed to be on the
    // first page of the on-screen Financing Details 1 table). Column headers
    // match the real SC RMO template text exactly, not camelCase field names. ----
    const csvRes = await apiFetch(page, "/api/admin/regulatory/export/board.csv");
    expect(csvRes.status).toBe(200);
    expect(csvRes.body).toContain(boardName);

    const financingCsvRes = await apiFetch(page, "/api/admin/regulatory/export/financing-1.csv");
    expect(financingCsvRes.status).toBe(200);
    expect(financingCsvRes.body).toContain("Renewable Energy");

    const settlementCsvRes = await apiFetch(page, "/api/admin/regulatory/export/campaign-settlement.csv");
    expect(settlementCsvRes.status).toBe(200);
    expect(settlementCsvRes.body).toContain("Settlement Amount (RM)");
  });

  test("a retail session is forbidden from regulatory reporting routes", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);
    const res = await apiFetch(page, "/api/admin/regulatory/position-report");
    expect(res.status).toBe(403);
  });
});
