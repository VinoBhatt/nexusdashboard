import { test, expect } from "@playwright/test";
import { login, apiFetch, DEMO_ACCOUNTS } from "./helpers";

function parseMoney(text: string): number {
  return Number(text.replace(/[^\d.]/g, ""));
}

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
    // The checker sees a prominent callout naming what's waiting on them.
    await expect(checkerPage.getByText(/awaiting your approval/)).toBeVisible();
    await checkerPage.reload();

    await checkerPage.locator("table tr", { hasText: "Allocation" }).first().getByRole("button", { name: "Approve" }).click();
    // ConfirmDialog renders a plain .modal.show div, not a native <dialog>.
    await checkerPage.locator(".modal.show").getByRole("button", { name: "Approve" }).click();
    await expect(checkerPage.locator("#toast")).toContainText("Order approved");

    await makerCtx.close();
    await checkerCtx.close();
  });

  test("maker proposes an investment; checker approves it; the holding shows up for both", async ({ browser }) => {
    const makerCtx = await browser.newContext();
    const checkerCtx = await browser.newContext();
    const makerPage = await makerCtx.newPage();
    const checkerPage = await checkerCtx.newPage();

    await login(makerPage, DEMO_ACCOUNTS.corporateMaker);
    await makerPage.getByRole("link", { name: "Notes Available", exact: true }).click();
    await makerPage.getByRole("button", { name: "Propose Investment" }).first().click();
    await makerPage.locator(".modal.show").getByRole("button", { name: "Propose Investment" }).click();
    await expect(makerPage.locator("#toast")).toContainText("Investment proposed, pending checker approval");

    await login(checkerPage, DEMO_ACCOUNTS.corporateChecker);
    await checkerPage.getByRole("link", { name: "Overview", exact: true }).click();
    await checkerPage.locator("table tr", { hasText: "Investment" }).first().getByRole("button", { name: "Approve" }).click();
    await checkerPage.locator(".modal.show").getByRole("button", { name: "Approve" }).click();
    await expect(checkerPage.locator("#toast")).toContainText("Order approved");

    await checkerPage.getByRole("link", { name: "On-Going Notes", exact: true }).click();
    await expect(checkerPage.locator(".table tbody tr, table tr")).not.toHaveCount(0);

    await makerCtx.close();
    await checkerCtx.close();
  });

  test("maker proposes a withdrawal; checker rejects it; treasury cash is unchanged", async ({ browser }) => {
    const makerCtx = await browser.newContext();
    const checkerCtx = await browser.newContext();
    const makerPage = await makerCtx.newPage();
    const checkerPage = await checkerCtx.newPage();

    await login(makerPage, DEMO_ACCOUNTS.corporateMaker);
    const cashBefore = parseMoney(await makerPage.locator(".chip", { hasText: "Treasury cash" }).locator("strong").innerText());

    await makerPage.getByRole("link", { name: "Withdrawal", exact: true }).click();
    await makerPage.locator('input[type=number]').fill("2500");
    await makerPage.getByRole("button", { name: "Submit Withdrawal Request" }).click();
    await expect(makerPage.locator("#toast")).toContainText("pending checker approval");

    await login(checkerPage, DEMO_ACCOUNTS.corporateChecker);
    await checkerPage.getByRole("link", { name: "Overview", exact: true }).click();
    await checkerPage.locator("table tr", { hasText: "Withdrawal" }).first().getByRole("button", { name: "Reject" }).click();
    await checkerPage.locator(".modal.show textarea").fill("Treasury needs this cash for an upcoming repayment obligation.");
    await checkerPage.locator(".modal.show").getByRole("button", { name: "Reject Order" }).click();
    await expect(checkerPage.locator("#toast")).toContainText("Order rejected");
    // The rejection reason is visible to both roles in the queue, not just logged silently.
    await expect(checkerPage.locator("table tr", { hasText: "Withdrawal" }).first()).toContainText("upcoming repayment obligation");

    await makerPage.getByRole("link", { name: "Overview", exact: true }).click();
    await makerPage.reload();
    const cashAfter = parseMoney(await makerPage.locator(".chip", { hasText: "Treasury cash" }).locator("strong").innerText());
    expect(cashAfter).toBe(cashBefore);
    await expect(makerPage.locator("table tr", { hasText: "Withdrawal" }).first()).toContainText("upcoming repayment obligation");

    await makerCtx.close();
    await checkerCtx.close();
  });

  test("maker deposit into the treasury is instant, no checker step", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.corporateMaker);
    const cashBefore = parseMoney(await page.locator(".chip", { hasText: "Treasury cash" }).locator("strong").innerText());

    await page.getByRole("link", { name: "Deposit", exact: true }).click();
    // Wait for the Maker branch (form) to actually be up before filling -
    // the page briefly shows a role-check fallback with no input at all
    // while /api/corporate/overview is still resolving.
    const depositButton = page.getByRole("button", { name: "Deposit to Treasury" });
    await expect(depositButton).toBeVisible();
    const amountInput = page.locator('input[type=number]');
    await amountInput.fill("5000");
    await expect(amountInput).toHaveValue("5000");
    await depositButton.click();
    await expect(page.locator("#toast")).toContainText("Treasury credited");

    await page.getByRole("link", { name: "Overview", exact: true }).click();
    const cashAfter = parseMoney(await page.locator(".chip", { hasText: "Treasury cash" }).locator("strong").innerText());
    expect(cashAfter).toBeCloseTo(cashBefore + 5000, 1);
  });

  test("a maker cannot approve their own investment order, even by calling the API directly", async ({ page }) => {
    // Create and approve are gated to opposite corpRoles - a maker is
    // rejected at that role check before the server ever gets to the
    // separate same-person self-approval check, since no seeded corporate
    // user holds both roles. Both gates matter; this confirms the role gate
    // still applies to the new Investment order type, not just Allocation.
    await login(page, DEMO_ACCOUNTS.corporateMaker);
    const created = await apiFetch(page, "/api/corporate/orders", {
      method: "POST",
      body: { type: "Investment", facilityId: "MBIBG-26070005", amount: 100, subwalletId: "wallet-treasury-pool" },
    });
    expect(created.status).toBe(201);
    const { id } = JSON.parse(created.body) as { id: string };

    const approveAttempt = await apiFetch(page, `/api/corporate/orders/${id}/approve`, { method: "POST" });
    expect(approveAttempt.status).toBe(403);
    expect(approveAttempt.body).toContain("Only the Checker can approve orders");
  });

  test("the Activity Log shows who created and decided each order", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.corporateMaker);
    await page.getByRole("link", { name: "Activity Log", exact: true }).click();
    await expect(page.locator("table tr", { hasText: "ORD-2039" }).filter({ hasText: "Approved" })).toBeVisible();
    await expect(page.locator("table tr", { hasText: "ORD-2039" }).filter({ hasText: "Created" })).toBeVisible();
    const rejectedRow = page.locator("table tr", { hasText: "ORD-2040" }).filter({ hasText: "Rejected" });
    await expect(rejectedRow).toBeVisible();
    await expect(rejectedRow).toContainText("rebalancing budget");
  });

  test("maker lists a corporate holding for sale instantly, no checker step needed", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.corporateMaker);
    await page.getByRole("link", { name: "On-Going Notes", exact: true }).click();
    await expect(page.getByText("Sell / Liquidate Investment")).toBeVisible();
    await page.getByRole("button", { name: "List for Sale" }).click();
    await expect(page.locator("#toast")).toContainText("Holding listed at RM");
  });

  test("a corporate checker cannot list a holding for sale", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.corporateChecker);
    await page.getByRole("link", { name: "On-Going Notes", exact: true }).click();
    await expect(page.getByText("Sell / Liquidate Investment")).toHaveCount(0);
  });

  test("maker proposes a secondary purchase; checker approves it; a new holding appears", async ({ browser }) => {
    const makerCtx = await browser.newContext();
    const checkerCtx = await browser.newContext();
    const makerPage = await makerCtx.newPage();
    const checkerPage = await checkerCtx.newPage();

    await login(makerPage, DEMO_ACCOUNTS.corporateMaker);
    await makerPage.getByRole("link", { name: "Notes Available", exact: true }).click();
    await makerPage.getByRole("button", { name: "Investor Liquidation Marketplace" }).click();
    await makerPage.getByRole("button", { name: "Propose Purchase" }).first().click();
    await makerPage.locator(".modal.show").getByRole("button", { name: "Propose Purchase" }).click();
    await expect(makerPage.locator("#toast")).toContainText("Secondary purchase proposed, pending checker approval");

    await login(checkerPage, DEMO_ACCOUNTS.corporateChecker);
    await checkerPage.getByRole("link", { name: "Overview", exact: true }).click();
    await checkerPage.locator("table tr", { hasText: "Secondary Purchase" }).first().getByRole("button", { name: "Approve" }).click();
    await checkerPage.locator(".modal.show").getByRole("button", { name: "Approve" }).click();
    await expect(checkerPage.locator("#toast")).toContainText("Order approved");

    await checkerPage.getByRole("link", { name: "On-Going Notes", exact: true }).click();
    await expect(checkerPage.locator(".table tbody tr, table tr")).not.toHaveCount(0);

    await makerCtx.close();
    await checkerCtx.close();
  });

  test("the checker demo persona is reachable from the login screen", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Corporate Investor - Checker" }).click();
    await page.waitForURL("**/app/overview");
    await expect(page.getByText("Signed in as Checker")).toBeVisible();
  });
});
