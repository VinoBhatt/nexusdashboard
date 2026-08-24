import { test, expect } from "@playwright/test";
import { login, DEMO_ACCOUNTS } from "./helpers";

test.describe("Admin KYC/compliance surface", () => {
  test("KYC Review Queue shows stats and can filter by status", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "KYC Review Queue", exact: true }).click();

    await expect(page.getByText("Manual review pending")).toBeVisible();
    await expect(page.getByText("Auto-cleared cases")).toBeVisible();

    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.locator("table")).toBeVisible();
    await page.getByRole("button", { name: "Pending", exact: true }).click();
    await expect(page.locator("table")).toBeVisible();
  });

  test("Investor Risk Profiles page renders with working search and tier filter", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "Investor Risk Profiles", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Investor Risk Profiles" })).toBeVisible();
    await expect(page.locator("table")).toBeVisible();

    await page.getByLabel("Risk profile").selectOption("LOW");
    await expect(page.locator("table")).toBeVisible();
    await page.getByLabel("Risk profile").selectOption("All");

    await page.getByLabel("Search investor").fill("zzz-no-such-investor-zzz");
    await expect(page.getByText("No matching investors.")).toBeVisible();
  });

  test("KYC Engine docs page switches tabs and the Simulate KYC run demo transitions state", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "KYC Engine", exact: true }).click();

    const simulateBox = page.locator(".banner-notice", { hasText: "Try it:" });
    await expect(simulateBox.getByText("PENDING_SUBMISSION")).toBeVisible();
    await simulateBox.getByRole("button", { name: "Simulate KYC run" }).click();
    await expect(simulateBox.getByText(/IN_PROCESSING/)).toBeVisible();
    await expect(simulateBox.getByText(/APPROVED · Sub-profile form unlocked/)).toBeVisible({ timeout: 3000 });

    await page.getByRole("button", { name: "Confidence Scoring", exact: true }).click();
    await page.getByRole("button", { name: "Risk Profile Matrix", exact: true }).click();
    await expect(page.locator(".card")).not.toHaveCount(0);
  });

  test("Wallet & CIF Architecture docs page shows the identity hierarchy and recent wallets", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "Wallet & CIF", exact: true }).click();

    await expect(page.getByText("Identity hierarchy")).toBeVisible();
    await expect(page.locator(".tree")).toContainText("user_id (UUID v4)");
    await expect(page.getByText("Recently activated wallets")).toBeVisible();
  });

  test("DB Schema reference docs page renders schema code blocks", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "DB Schema", exact: true }).click();

    await expect(page.getByText("users (root)")).toBeVisible();
    await expect(page.getByText("kyc_profiles")).toBeVisible();
    await expect(page.locator(".code-block")).not.toHaveCount(0);
  });
});

test.describe("Retail account pages", () => {
  test("Withdrawal page submits a request against the real cash balance", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);

    // Top up first so the withdrawal has cash to draw against.
    await page.getByRole("link", { name: "Deposit", exact: true }).click();
    await page.locator("input[type=number]").first().fill("500");
    await page.getByRole("button", { name: "Continue with FPX" }).click();
    await expect(page.locator("#toast")).toContainText("FPX deposit confirmed");

    await page.getByRole("link", { name: "Withdrawal", exact: true }).click();
    await expect(page.getByText("Available Cash")).toBeVisible();

    await page.getByLabel("Amount (min RM1)").fill("50");
    await page.locator('input[type=file]').setInputFiles("package.json");
    await page.getByRole("button", { name: "Submit Withdrawal" }).click();
    await expect(page.locator("#toast")).toContainText(/[Ww]ithdrawal/);
  });

  test("Account Balance shows the real transaction ledger and CSV export link", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);
    await page.getByRole("link", { name: "Account Balance", exact: true }).click();

    await expect(page.getByText("Current Balance")).toBeVisible();
    await expect(page.getByText("Total Deposits")).toBeVisible();
    await expect(page.getByRole("link", { name: "Export CSV" })).toHaveAttribute("href", "/api/export/transactions.csv");
    await expect(page.locator("table")).toBeVisible();
  });

  test("Completed Notes page renders the matured-holdings table", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);
    await page.getByRole("link", { name: "Completed Notes", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Completed Notes" })).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
    await expect(page.getByRole("link", { name: "Export CSV" })).toHaveAttribute("href", "/api/export/portfolio.csv");
  });
});
