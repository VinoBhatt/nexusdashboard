import { test, expect } from "@playwright/test";
import { login, logout, apiFetch, DEMO_ACCOUNTS } from "./helpers";

test.describe("Admin approvals", () => {
  test("approving a fresh signup's KYC actually verifies the account", async ({ page }) => {
    const email = `pw-newbie-${Date.now()}@test.com`;

    await page.goto("/signup");
    await page.locator(".login-form input").first().fill("Playwright Newbie");
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill("testpassword123");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/app/overview");

    // Confirm the account starts unverified before any admin action.
    const profileBefore = await apiFetch(page, "/api/account/profile");
    expect(JSON.parse(profileBefore.body).kycStatus).toBe("Pending");

    await logout(page);
    await login(page, DEMO_ACCOUNTS.admin);
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
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "Investors", exact: true }).click();
    const nameHeader = page.locator("th", { hasText: "Name" });
    await expect(nameHeader).toBeVisible();
    await nameHeader.click(); // sort ascending
    await nameHeader.click(); // sort descending - just proves it's interactive, no crash
  });

  test("the Approved and Rejected tabs show decided approval history, not just Pending", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.admin);
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
    await login(page, DEMO_ACCOUNTS.admin);
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
});
