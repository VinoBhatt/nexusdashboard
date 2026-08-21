import { test, expect } from "@playwright/test";
import { login, DEMO_ACCOUNTS } from "./helpers";

test.describe("Statements", () => {
  test("viewing a ready statement shows its real summary and transactions", async ({ page }) => {
    await login(page, DEMO_ACCOUNTS.retail);
    await page.getByRole("link", { name: "Statements", exact: true }).click();

    // Only "View" is offered in the list - Download lives inside the view.
    await expect(page.locator(".list").getByRole("link", { name: "Download" })).toHaveCount(0);

    await page.getByRole("button", { name: "View" }).first().click();
    await expect(page.locator(".modal.show")).toContainText("Statement");
    await expect(page.locator(".modal.show")).toContainText("Cash Balance");
    await expect(page.locator(".modal.show .table")).toBeVisible();

    const downloadLink = page.locator(".modal.show").getByRole("link", { name: "Download PDF" });
    const href = await downloadLink.getAttribute("href");
    expect(href).toMatch(/\/api\/statements\/.+\/download/);

    // page.request doesn't carry the Secure session cookie over local http
    // (see the comment on apiFetch in helpers.ts) - fetch from inside the
    // page instead, same as every other authenticated check in this suite.
    const result = await page.evaluate(async (url) => {
      const res = await fetch(url, { credentials: "include" });
      const text = await res.text();
      return { contentType: res.headers.get("content-type"), head: text.slice(0, 5) };
    }, href!);
    expect(result.contentType).toBe("application/pdf");
    expect(result.head).toBe("%PDF-");
  });
});
