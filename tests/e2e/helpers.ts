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

/** Drives the Barrier 1 signup wizard (Email & Password -> Scan IC ->
 * Selfie & Liveness -> Review Data -> T&C -> Done) through to a created,
 * logged-in, browse-only account. This is role-less - it does not activate
 * any Barrier 2 sub-profile, so the account lands on Overview's browse-only
 * prompt, not a fully populated dashboard. Use activateIndividual()/
 * activateIssuer() afterwards where a test needs a real investor/issuer
 * profile to exist. */
export async function signupRetail(page: Page, { displayName, email, password = "testpassword123" }: { displayName: string; email: string; password?: string }) {
  await page.goto("/signup");

  // Step 1: Email & Password
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Re-enter password").fill(password);
  await page.getByLabel("Verify you are human").click();
  for (let i = 0; i < 6; i++) await page.locator(`#otp-${i}`).fill(String((i % 9) + 1));
  await page.getByRole("button", { name: "Continue →" }).click();

  // Step 2: Scan IC
  // This exact IC number is deterministically seeded (see lib/kycMock.ts)
  // into the Medium confidence band, so the resulting compliance case
  // always stays Pending for a human to decide - important for tests that
  // exercise the admin approval flow, since a different IC number could
  // land in the auto-clear band and skip Pending entirely.
  await page.getByLabel("MyKad number").fill("900112-14-5677");
  await page.getByRole("button", { name: "Continue →" }).click();

  // Step 3: Selfie & Liveness (no fields - mock result is fixed)
  await page.getByRole("button", { name: "Continue →" }).click();

  // Step 4: Review Data
  await page.getByLabel("Full name").fill(displayName);
  await page.getByRole("button", { name: "Continue →" }).click();

  // Step 5: T&C
  await page.getByLabel(/I have read and agree to the Terms of Service/).click();
  await page.getByLabel(/general risk statement/).click();
  await page.getByLabel(/PDPA/).click();
  await page.getByRole("button", { name: "Create my account" }).click();

  // Step 6: Done
  await page.getByRole("button", { name: "Explore marketplace" }).click();
  await page.waitForURL("**/app/overview");
}

/** Activates the Individual Investor Barrier 2 sub-profile for whichever
 * account is currently logged in - leaves every optional field blank,
 * only used where a test needs a real investor_profiles row to exist. */
export async function activateIndividual(page: Page) {
  await page.goto("/app/activate");
  await page.getByRole("button", { name: "Activate investor profile" }).click();
  await page.waitForURL("**/app/overview");
}

/** Activates the Issuer Barrier 2 sub-profile for whichever account is
 * currently logged in. */
export async function activateIssuer(page: Page, { companyName }: { companyName: string }) {
  await page.goto("/app/activate");
  await page.getByRole("button", { name: "Issuer", exact: true }).click();
  await page.getByLabel("Company name *").fill(companyName);
  await page.getByRole("button", { name: "Submit issuer application" }).click();
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
