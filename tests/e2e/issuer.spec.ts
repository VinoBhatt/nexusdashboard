import { test, expect } from "@playwright/test";
import { login, DEMO_ACCOUNTS } from "./helpers";

test.describe("Issuer -> admin -> retail cross-role story", () => {
  test("a financing application activates with a real schedule and reaches the marketplace", async ({ browser }) => {
    const issuerCtx = await browser.newContext();
    const adminCtx = await browser.newContext();
    const retailCtx = await browser.newContext();
    const issuerPage = await issuerCtx.newPage();
    const adminPage = await adminCtx.newPage();
    const retailPage = await retailCtx.newPage();

    const marker = `PW-${Date.now().toString(36).toUpperCase()}`;

    await login(issuerPage, DEMO_ACCOUNTS.issuer);
    await issuerPage.getByRole("link", { name: "Financing", exact: true }).click();
    await issuerPage.locator("textarea").fill(marker);
    await issuerPage.locator('input[type=number]').fill("55000");
    await issuerPage.getByRole("button", { name: "Submit Application" }).click();
    await expect(issuerPage.locator("#toast")).toContainText("submitted for review");

    await login(adminPage, DEMO_ACCOUNTS.admin);
    await adminPage.getByRole("link", { name: "Risk & Approvals", exact: true }).click();
    const row = adminPage.locator(".list-item", { hasText: "Sunway Business Solutions" }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Approve" }).click();
    await adminPage.locator(".modal.show").getByRole("button", { name: "Approve" }).click();
    await expect(adminPage.locator("#toast")).toContainText("updated");

    await login(retailPage, DEMO_ACCOUNTS.retail);
    await retailPage.getByRole("link", { name: "Notes Available", exact: true }).click();
    // The newly approved facility must be investable, not just listed.
    await expect(retailPage.locator(".note").first()).toBeVisible();

    await issuerCtx.close();
    await adminCtx.close();
    await retailCtx.close();
  });
});
