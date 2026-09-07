import { test, expect } from "@playwright/test";
import { login, apiFetch, DEMO_ACCOUNTS } from "./helpers";

test.describe("MyCIF Quarterly Report", () => {
  test("admin can enter MyCIF co-investment/impact data and it appears in the generated report and CSV exports", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.admin);

    await page.getByRole("link", { name: "Campaign Regulatory Data", exact: true }).click();
    await expect(page.getByRole("heading", { name: "MyCIF Co-Investment & Impact" })).toBeVisible();

    await page.getByLabel("Type of MyCIF Scheme").fill("Environmental & Social Impact Scheme");
    const problemStatement = `PW impact problem ${Date.now()}`;
    await page.getByLabel("Problem Statement").fill(problemStatement);
    await page.getByLabel("Total Amount of MyCIF Co-Investment (RM)").fill("25000");
    await page.getByRole("button", { name: "Save MyCIF Fields" }).click();
    await expect(page.locator("#toast")).toContainText("MyCIF fields updated");

    await page.getByRole("link", { name: "MyCIF Quarterly Report", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Declaration" })).toBeVisible();

    await expect(page.locator(".table-wrap", { hasText: "Problem Statement" })).toContainText(problemStatement);
    await expect(page.locator(".table-wrap", { hasText: "Problem Statement" })).toContainText("25000");

    const impactCsvRes = await apiFetch(page, "/api/admin/mycif/export/impact-reporting.csv");
    expect(impactCsvRes.status).toBe(200);
    expect(impactCsvRes.body).toContain(problemStatement);
    expect(impactCsvRes.body).toContain("Total amount of MyCIF Co-investment (RM)");

    const statusCsvRes = await apiFetch(page, "/api/admin/mycif/export/status-reporting.csv");
    expect(statusCsvRes.status).toBe(200);
    expect(statusCsvRes.body).toContain("Status update of investment notes or Islamic investment notes at the time of reporting");
  });

  test("a retail session is forbidden from MyCIF reporting routes", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);
    const res = await apiFetch(page, "/api/admin/mycif/report");
    expect(res.status).toBe(403);
  });
});
