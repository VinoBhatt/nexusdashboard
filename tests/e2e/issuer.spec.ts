import { test, expect } from "@playwright/test";
import { login, DEMO_ACCOUNTS } from "./helpers";

test.describe("Issuer -> campaign manager -> retail cross-role story", () => {
  test("a financing application is reviewed, proposed, launched with a real schedule, and reaches the marketplace", async ({ browser }) => {
    const issuerCtx = await browser.newContext();
    const cmCtx = await browser.newContext();
    const retailCtx = await browser.newContext();
    const issuerPage = await issuerCtx.newPage();
    const cmPage = await cmCtx.newPage();
    const retailPage = await retailCtx.newPage();

    const marker = `PW-${Date.now().toString(36).toUpperCase()}`;

    // ---- Issuer: multi-step application wizard ----
    await login(issuerPage, DEMO_ACCOUNTS.issuer);
    await issuerPage.getByRole("link", { name: "Financing", exact: true }).click();
    await issuerPage.getByRole("button", { name: "New Application" }).click();
    await issuerPage.getByRole("button", { name: "Proceed" }).click();
    await expect(issuerPage.getByText("Sign, Stamp and Attach the CRA Consent Form")).toBeVisible();
    const formsStepFiles = issuerPage.locator('input[type=file]');
    const formsStepFileCount = await formsStepFiles.count();
    for (let i = 0; i < formsStepFileCount; i++) {
      await formsStepFiles.nth(i).setInputFiles("package.json");
    }
    await issuerPage.getByRole("button", { name: "Next" }).click();

    const field = (label: string) => issuerPage.locator(".field", { hasText: label });
    await field("Financing Amount Requested (RM)").locator("input").fill("55000");
    await field("Purpose").locator("textarea").fill(marker);
    await field("Do you have any form of business insurance?").locator("select").selectOption("Yes");
    await field("Has your company applied for financing with other P2P lending operators?").locator("select").selectOption("No");
    await field("Annual Sales / Turnover (RM)").locator("input").fill("2000000");
    await field("Number of Employees").locator("input").fill("20");
    await field("Number of Clients").locator("input").fill("10");
    await issuerPage.getByRole("button", { name: "Next" }).click();
    await expect(issuerPage.getByText("Company Statutory Form")).toBeVisible();

    const fileInputs = issuerPage.locator('input[type=file]');
    const fileCount = await fileInputs.count();
    for (let i = 0; i < fileCount; i++) {
      await fileInputs.nth(i).setInputFiles("package.json");
    }
    await issuerPage.getByRole("button", { name: "Submit Application" }).click();
    await expect(issuerPage.locator("#toast")).toContainText("Under Review");

    // ---- Campaign manager: review application, draft + submit + schedule + launch a proposal ----
    await login(cmPage, DEMO_ACCOUNTS.campaignManager);
    await cmPage.getByRole("link", { name: "Applications", exact: true }).click();
    const row = cmPage.locator("tbody tr", { hasText: "Sunway Business Solutions" }).filter({ hasText: "55,000.00" });
    await expect(row.first()).toBeVisible();
    await row.first().getByRole("button", { name: "View" }).click();
    await expect(cmPage.getByText(marker)).toBeVisible();
    await cmPage.getByRole("button", { name: "Create Proposal" }).click();

    // "Rating" is a substring of "Risk Rating Method", so match on the
    // field's own label text exactly rather than a plain substring.
    const cmField = (label: string) => cmPage.locator(".field").filter({ has: cmPage.locator("label", { hasText: new RegExp(`^${label}$`) }) });
    await cmField("Risk Rating Method").locator("select").selectOption("Payment Risk Rating");
    await cmField("Rating").locator("select").selectOption("A");
    await cmPage.getByRole("button", { name: "Save Draft" }).click();
    await expect(cmPage.locator("#toast")).toContainText("saved as Drafted");

    await cmPage.getByRole("button", { name: "Submit Proposal" }).click();
    await expect(cmPage.locator("#toast")).toContainText("submitted to the issuer");

    await cmPage.getByRole("button", { name: "Launch Note" }).click();
    const now = new Date();
    const toLocal = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const promotional = new Date(now.getTime() - 60 * 60 * 1000);
    const launchStart = new Date(now.getTime() - 30 * 1000); // already due -> auto-launches on next read
    const launchEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await cmPage.locator('input[type="datetime-local"]').nth(0).fill(toLocal(promotional));
    await cmPage.locator('input[type="datetime-local"]').nth(1).fill(toLocal(launchStart));
    await cmPage.locator('input[type="datetime-local"]').nth(2).fill(toLocal(launchEnd));
    await cmField("Note Name").locator("input").fill(`Cofundr Note ${marker}`);
    await cmPage.getByRole("button", { name: "Schedule Note Launch" }).click();
    await expect(cmPage.locator("#toast")).toContainText("scheduled for launch");

    // Reload triggers the lazy auto-launch check (launchStart already passed).
    await cmPage.reload();
    await expect(cmPage.getByText("Launched", { exact: true })).toBeVisible();

    // ---- Retail: the launched note is investable and alerted ----
    await login(retailPage, DEMO_ACCOUNTS.retail);
    await retailPage.getByRole("link", { name: "Notes Available", exact: true }).click();
    await expect(retailPage.locator(".note").first()).toBeVisible();

    await retailPage.getByRole("link", { name: "Alerts", exact: true }).click();
    await expect(retailPage.locator(".list-item", { hasText: "RM55,000" })).toBeVisible();

    await issuerCtx.close();
    await cmCtx.close();
    await retailCtx.close();
  });
});
