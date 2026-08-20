import { test, expect } from "@playwright/test";
import { login, DEMO_ACCOUNTS } from "./helpers";

test.describe("Auto Invest", () => {
  test("enabling a rule immediately invests in a matching open note", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);

    // Top up cash first so this test is self-contained regardless of what
    // other specs have done to this account's balance.
    await page.getByRole("link", { name: "Deposit", exact: true }).click();
    await page.locator('input[type=number]').first().fill("500");
    await page.getByRole("button", { name: "Continue with FPX" }).click();
    await expect(page.locator("#toast")).toContainText("FPX deposit confirmed");

    await page.getByRole("link", { name: "Auto Invest", exact: true }).click();
    await page.locator('input[type=checkbox]').check();
    await page.getByRole("button", { name: "Save Auto Invest Rule" }).click();
    await expect(page.locator("#toast")).toContainText("Auto Invest rule saved");

    // MBIBG-26080001 is open, not already held by this account in the
    // seed data, and unrestricted criteria match it - it should appear in
    // the Auto Invest history immediately, without a page reload.
    await expect(page.locator(".table", { hasText: "MBIBG-26080001" })).toBeVisible();

    await page.getByRole("link", { name: "On-Going Notes", exact: true }).click();
    await expect(page.locator(".table", { hasText: "MBIBG-26080001" })).toBeVisible();
  });
});
