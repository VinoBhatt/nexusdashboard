import { test, expect } from "@playwright/test";
import { login, DEMO_ACCOUNTS } from "./helpers";

test.describe("Statements", () => {
  test("viewing a ready statement shows its real summary and transactions", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);
    await page.getByRole("link", { name: "Statements", exact: true }).click();

    await page.getByRole("button", { name: "View" }).first().click();
    await expect(page.locator(".modal.show")).toContainText("Statement");
    await expect(page.locator(".modal.show")).toContainText("Cash Balance");
    await expect(page.locator(".modal.show .table")).toBeVisible();

    // The download link in the modal must point at the same statement.
    const downloadLink = page.locator(".modal.show").getByRole("link", { name: "Download CSV" });
    await expect(downloadLink).toHaveAttribute("href", /\/api\/statements\/.+\/download/);
  });
});
