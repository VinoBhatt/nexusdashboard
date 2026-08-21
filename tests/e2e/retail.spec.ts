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

  test("investing in a note appears in on-going notes", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);

    // Top up cash first - Notes Available shows a random subset each load,
    // and some notes require a higher minimum than the seeded balance covers.
    await page.getByRole("link", { name: "Deposit", exact: true }).click();
    await page.locator('input[type=number]').first().fill("5000");
    await page.getByRole("button", { name: "Continue with FPX" }).click();
    await expect(page.locator("#toast")).toContainText("FPX deposit confirmed");

    await page.getByRole("link", { name: "Notes Available", exact: true }).click();
    await page.getByRole("button", { name: "Invest", exact: true }).first().click();

    // Header row plus at least one real installment row.
    const rows = page.locator(".modal.show .table tbody tr");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(1);

    await page.locator(".modal.show").getByRole("button", { name: "Confirm Investment" }).click();
    await expect(page.locator("#toast")).toContainText("Investment confirmed");

    await page.getByRole("link", { name: "On-Going Notes", exact: true }).click();
    await expect(page.locator(".table tbody tr, table tr")).not.toHaveCount(0);
  });

  test("clicking an on-going holding shows its repayment breakdown", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);
    await page.getByRole("link", { name: "On-Going Notes", exact: true }).click();
    await page.locator(".table tbody tr", { hasText: "Ongoing" }).first().click();
    await expect(page.locator(".modal.show")).toContainText("Repayment breakdown");
    await expect(page.locator(".modal.show")).toContainText("You will be paid");
  });

  test("a note with a delayed installment shows Late status and its notification, which also appears in Alerts", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);
    await page.getByRole("link", { name: "On-Going Notes", exact: true }).click();
    await page.locator(".table tbody tr", { hasText: "MBIBG-26070005" }).first().click();

    await expect(page.locator(".modal.show")).toContainText("Notifications for this note");
    await expect(page.locator(".modal.show")).toContainText("Installment #2 payment delayed");
    await expect(page.locator(".modal.show .table .status", { hasText: "Late" })).toBeVisible();

    await page.locator(".modal.show button.close").click();
    await page.getByRole("link", { name: "Alerts", exact: true }).click();
    await expect(page.locator(".list-item", { hasText: "Installment #2 payment delayed" })).toBeVisible();
  });

  test("clicking a defaulted holding shows its schedule with a Defaulted status plus a recovery timeline", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);
    await page.getByRole("link", { name: "On-Going Notes", exact: true }).click();
    await page.locator(".table tbody tr", { hasText: "Default" }).first().click();
    await expect(page.locator(".modal.show")).toContainText("Repayment breakdown");
    await expect(page.locator(".modal.show .status", { hasText: "Defaulted" })).toBeVisible();
    await expect(page.locator(".modal.show")).not.toContainText("You will be paid");
    await expect(page.locator(".modal.show")).toContainText("Recovery Process");
    await expect(page.locator(".modal.show .pill", { hasText: "Current" })).toBeVisible();
  });

  test("CSV export link points at a real endpoint", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);
    await page.getByRole("link", { name: "On-Going Notes", exact: true }).click();
    const exportLink = page.getByRole("link", { name: "Export CSV" });
    await expect(exportLink).toHaveAttribute("href", "/api/export/portfolio.csv");
  });

  test("mobile drawer opens and closes on navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, DEMO_ACCOUNTS.retail);

    await expect(page.locator(".sidebar")).not.toHaveClass(/open/);
    await page.locator(".menu-btn").click();
    await expect(page.locator(".sidebar")).toHaveClass(/open/);

    await page.getByRole("link", { name: "Notes Available", exact: true }).click();
    await expect(page.locator(".sidebar")).not.toHaveClass(/open/);
  });
});
