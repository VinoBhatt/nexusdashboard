import { test, expect } from "@playwright/test";
import { login, apiFetch, DEMO_ACCOUNTS } from "./helpers";

test.describe("Cross-cutting security behaviour", () => {
  test("the demo role-switcher is forbidden for a non-demo-reviewer account", async ({ page }) => {
    const email = `pw-switcher-${Date.now()}@test.com`;
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Switch Tester");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("testpassword123");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/app/overview");

    // A real signup never gets the role-switch grid at all.
    await expect(page.locator(".role-switch-grid")).toHaveCount(0);

    const res = await apiFetch(page, "/api/auth/switch-role", { method: "POST", body: { role: "admin" } });
    expect(res.status).toBe(403);
  });

  test("clicking Approve in the list alone does not decide anything - only confirming the dialog does", async ({ page }) => {
    // Create a fresh, dedicated approval rather than relying on shared
    // seed state that other specs in this run may have already consumed.
    const email = `pw-dialog-guard-${Date.now()}@test.com`;
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Dialog Guard Tester");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("testpassword123");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/app/overview");

    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "Risk & Approvals", exact: true }).click();

    const row = page.locator(".list-item", { hasText: "Dialog Guard Tester" });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Approve" }).click();
    await expect(page.locator(".modal.show")).toBeVisible();

    // Dismiss without confirming - the row must still be pending.
    await page.locator(".modal.show").getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".modal.show")).toHaveCount(0);
    await expect(row).toBeVisible();
  });

  test("Escape closes a confirmation dialog without deciding anything", async ({ page }) => {
    const email = `pw-escape-guard-${Date.now()}@test.com`;
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Escape Guard Tester");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("testpassword123");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/app/overview");

    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "Risk & Approvals", exact: true }).click();

    const row = page.locator(".list-item", { hasText: "Escape Guard Tester" });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Approve" }).click();
    await expect(page.locator(".modal.show")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".modal.show")).toHaveCount(0);
    await expect(row).toBeVisible();
  });

  test("a failed query surfaces a toast instead of loading forever", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);
    await page.route("**/api/investor/overview", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "server_error" }) }));

    await page.reload();
    await expect(page.locator("#toast")).toContainText("server_error");
  });
});
