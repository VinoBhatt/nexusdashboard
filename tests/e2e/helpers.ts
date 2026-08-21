import type { Page } from "@playwright/test";

export const DEMO_PASSWORD = "demopassword";

export const DEMO_ACCOUNTS = {
  retail: "joshua@cofundr.demo",
  corporateMaker: "treasury@abctreasury.demo",
  corporateChecker: "checker@abctreasury.demo",
  admin: "sarah.lim@cofundr.demo",
  issuer: "finance@sunwaybiz.demo",
  campaignManager: "ops@cofundr.demo",
} as const;

/** The login page only exposes the 4 primary demo buttons now (no free-text
 * email/password form) - go through the API directly instead, the same way
 * those buttons do under the hood. This also covers accounts with no button
 * of their own, e.g. the corporate checker identity. */
export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.evaluate(
    async ({ email, password }) => {
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
    },
    { email, password }
  );
  await page.goto("/app/overview");
  await page.waitForURL("**/app/overview");
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL("**/login");
}

/** Playwright's page.request is a separate Node HTTP client that does
 * not apply the browser's loopback exception for Secure cookies over
 * plain http://127.0.0.1 (the real page correctly does - this is a
 * dev-server-only quirk, not an app bug: production always serves
 * over HTTPS). Use an in-page fetch so authenticated API checks go
 * through the real browser networking stack instead. */
export async function apiFetch(page: Page, path: string, init?: { method?: string; body?: unknown }) {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(path, {
        method: init?.method ?? "GET",
        headers: init?.body ? { "Content-Type": "application/json" } : undefined,
        body: init?.body ? JSON.stringify(init.body) : undefined,
        credentials: "include",
      });
      const text = await res.text();
      return { status: res.status, body: text };
    },
    { path, init }
  );
}
