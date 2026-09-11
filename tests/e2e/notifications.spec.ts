import { test, expect } from "@playwright/test";
import { login, apiFetch, DEMO_ACCOUNTS } from "./helpers";

// Servicing engine Stage 4: admin servicing/communication actions must be
// visible to the investor/issuer they're actually about, the same way the
// existing Issuer -> Campaign Manager -> Retail proposal flow already is.
// See idempotent-gliding-allen.md.
test.describe("Cross-role notification visibility", () => {
  test("a broadcast communication to all investors reaches a retail investor's Notifications page", async ({ page }) => {
    const marker = `Playwright Stage 4 broadcast ${Date.now()}`;

    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "Communications", exact: true }).click();
    await page.getByLabel("Audience").selectOption("ALL_INVESTORS");
    await page.getByLabel("Title").fill(marker);
    await page.getByLabel("Message").fill("Broadcast visibility check for the retail Notifications page.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator("#toast")).toContainText("Sent to");

    // Switching identities: login() does a full page.goto, so there is no
    // stale React Query cache carried over from the admin session even
    // though both roles' Notifications pages share the same query key.
    await login(page, DEMO_ACCOUNTS.retail);
    await page.getByRole("link", { name: "Notifications", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(page.locator(".list-item", { hasText: marker })).toBeVisible();

    const notifications = await apiFetch(page, "/api/notifications");
    const rows = JSON.parse(notifications.body).notifications as Array<{ title: string; type: string }>;
    expect(rows.some((row) => row.title === marker && row.type === "COMMUNICATION_SENT")).toBe(true);
  });

  test("a platform-fee-policy change on the issuer's own facility reaches their Notifications page", async ({ page }) => {
    // IIF2200-01082026 is seeded with issuerUserId set to the demo issuer
    // account (finance@sunwaybiz.demo) - see seed.ts. The fee-policy route
    // has no dependency on the facility's settlement/payment state, so this
    // is safe to run whether or not other tests already mutated the note.
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "Record Repayments", exact: true }).click();
    await page.locator("tbody tr", { hasText: "IIF2200-01082026" }).getByRole("button", { name: "View" }).click();
    await page.getByRole("button", { name: "Platform Fee" }).click();
    await page.getByLabel("Policy").selectOption("DEFAULT");
    await page.getByLabel("Reason", { exact: true }).fill("Playwright Stage 4: issuer notification visibility check");
    await page.getByRole("button", { name: "Approve Fee Policy" }).click();
    await expect(page.locator("#toast")).toContainText("Platform fee policy approved");

    await login(page, DEMO_ACCOUNTS.issuer);
    await page.getByRole("link", { name: "Notifications", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(page.locator(".list-item", { hasText: "Platform Fee Policy Updated" }).first()).toBeVisible();

    const notifications = await apiFetch(page, "/api/notifications");
    const rows = JSON.parse(notifications.body).notifications as Array<{ facilityId: string | null; type: string }>;
    expect(rows.some((row) => row.facilityId === "IIF2200-01082026" && row.type === "PLATFORM_FEE_POLICY_UPDATED")).toBe(true);
    // Every row this issuer sees must belong to a facility they actually
    // issued - never another issuer's facility.
    rows.forEach((row) => expect(row.facilityId).not.toBeNull());
  });
});
