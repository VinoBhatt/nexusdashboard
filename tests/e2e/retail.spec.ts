import { test, expect } from "@playwright/test";
import { login, DEMO_ACCOUNTS } from "./helpers";

test.describe("Retail investor", () => {
  test("deposit persists across a full reload", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);

    const cashBefore = await page.locator(".chip", { hasText: "Balance cash" }).locator("strong").innerText();
    const before = Number(cashBefore.replace(/[^\d.]/g, ""));

    await page.getByRole("link", { name: "Deposit", exact: true }).click();
    await page.locator('input[type=number]').first().fill("250");
    await page.getByRole("button", { name: "Continue with FPX" }).click();
    await expect(page.locator("#toast")).toContainText("FPX deposit confirmed");

    // Full navigation, not client-side - proves the balance is real
    // server state, not an in-memory object that would reset.
    await page.goto("/app/overview");
    const cashAfter = await page.locator(".chip", { hasText: "Balance cash" }).locator("strong").innerText();
    const after = Number(cashAfter.replace(/[^\d.]/g, ""));
    expect(after).toBeCloseTo(before + 250, 1);
  });

  test("investing in a note appears in the portfolio", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);
    await page.getByRole("link", { name: "Marketplace", exact: true }).click();
    const investButton = page.getByRole("button", { name: /^Invest RM/ }).first();
    await investButton.click();
    await expect(page.locator("#toast")).toContainText("Investment confirmed");

    await page.getByRole("link", { name: "Portfolio", exact: true }).click();
    await expect(page.locator(".table tbody tr, table tr")).not.toHaveCount(0);
  });

  test("CSV export link points at a real endpoint", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);
    await page.getByRole("link", { name: "Portfolio", exact: true }).click();
    const exportLink = page.getByRole("link", { name: "Export CSV" });
    await expect(exportLink).toHaveAttribute("href", "/api/export/portfolio.csv");
  });

  test("mobile drawer opens and closes on navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, DEMO_ACCOUNTS.retail);

    await expect(page.locator(".sidebar")).not.toHaveClass(/open/);
    await page.locator(".menu-btn").click();
    await expect(page.locator(".sidebar")).toHaveClass(/open/);

    await page.getByRole("link", { name: "Marketplace", exact: true }).click();
    await expect(page.locator(".sidebar")).not.toHaveClass(/open/);
  });
});
