import { test, expect } from "@playwright/test";
import { login, DEMO_ACCOUNTS } from "./helpers";

test.describe("Corporate maker/checker", () => {
  test("checker approves a maker's order; maker cannot approve their own", async ({ browser }) => {
    const makerCtx = await browser.newContext();
    const checkerCtx = await browser.newContext();
    const makerPage = await makerCtx.newPage();
    const checkerPage = await checkerCtx.newPage();

    await login(makerPage, DEMO_ACCOUNTS.corporateMaker);
    await expect(makerPage.getByText("Signed in as Maker")).toBeVisible();

    // Maker has no approve/reject controls at all.
    await expect(makerPage.getByRole("button", { name: "Approve" })).toHaveCount(0);

    await makerPage.locator('input[type=number]').fill("42000");
    await makerPage.getByRole("button", { name: "Create Order" }).click();
    await expect(makerPage.locator("#toast")).toContainText("queued for checker approval");

    await login(checkerPage, DEMO_ACCOUNTS.corporateChecker);
    await expect(checkerPage.getByText("Signed in as Checker")).toBeVisible();
    await checkerPage.reload();

    await checkerPage.getByRole("button", { name: "Approve" }).first().click();
    // ConfirmDialog renders a plain .modal.show div, not a native <dialog>.
    await checkerPage.locator(".modal.show").getByRole("button", { name: "Approve" }).click();
    await expect(checkerPage.locator("#toast")).toContainText("Order approved");

    await makerCtx.close();
    await checkerCtx.close();
  });
});
