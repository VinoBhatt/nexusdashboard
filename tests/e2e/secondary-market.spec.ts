import { test, expect } from "@playwright/test";
import { login, DEMO_ACCOUNTS } from "./helpers";

test.describe("Investor liquidation marketplace", () => {
  test("buying a partial amount of units shows a repayment breakdown and succeeds", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);

    // Top up cash first - secondary listings can be worth thousands, and
    // this test should be self-contained regardless of other specs' state.
    await page.getByRole("link", { name: "Deposit", exact: true }).click();
    await page.locator('input[type=number]').first().fill("10000");
    await page.getByRole("button", { name: "Continue with FPX" }).click();
    await expect(page.locator("#toast")).toContainText("FPX deposit confirmed");

    await page.getByRole("link", { name: "Notes Available", exact: true }).click();
    await page.getByRole("button", { name: "Investor Liquidation Marketplace" }).click();

    await page.getByRole("button", { name: "Buy Units" }).first().click();
    await page.waitForSelector(".modal.show");

    const unitsInput = page.locator(".modal.show input[type=number]");
    const max = Number(await unitsInput.getAttribute("max"));
    expect(max).toBeGreaterThan(1);
    const partial = Math.max(1, Math.floor(max / 2));
    await unitsInput.fill(String(partial));

    // Header row plus at least one real installment row.
    const rows = page.locator(".modal.show .table tbody tr");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(1);

    await page.locator(".modal.show").getByRole("button", { name: "Confirm Purchase" }).click();
    await expect(page.locator("#toast")).toContainText("Secondary purchase executed");

    await page.getByRole("link", { name: "On-Going Notes", exact: true }).click();
    await expect(page.locator(".table tbody tr, table tr")).not.toHaveCount(0);
  });
});
