import { test, expect } from "@playwright/test";
import { login, logout, apiFetch, DEMO_ACCOUNTS } from "./helpers";

test.describe("Self-service onboarding wizard", () => {
  test("a retail investor completes the wizard with full KYC-lite details and lands with a real profile + pending approval", async ({ page }) => {
    const email = `pw-onboard-investor-${Date.now()}@test.com`;

    await page.goto("/signup");
    await page.getByRole("button", { name: "Investor" }).click();

    await page.getByLabel("Full name").fill("Onboarding Investor");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mobile number").fill("+60 12-345 6789");
    await page.getByLabel("Password", { exact: true }).fill("testpassword123");
    await page.getByLabel("Re-enter password").fill("testpassword123");
    await expect(page.getByText(/Password strength:/)).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByLabel("Identification type").selectOption("NRIC");
    await page.getByLabel("NRIC number").fill("900101-14-5566");
    await page.getByLabel("Source of funds").selectOption("Employment income");
    await page.getByLabel("Nature of job").selectOption("Employed");
    await page.getByLabel("Gross annual income").selectOption("RM50,000 - RM100,000");
    await page.getByRole("button", { name: "Next" }).click();

    // Agreements are mandatory - submitting before checking them must not proceed.
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/accept the Terms of Service/)).toBeVisible();

    await page.getByText("I agree to the Terms of Service.").click();
    await page.getByText("I agree to the Privacy Policy.").click();
    await page.getByText("I acknowledge the General Risk Statement.").click();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/app/overview");

    const profile = await apiFetch(page, "/api/account/profile");
    const profileJson = JSON.parse(profile.body);
    expect(profileJson.kycStatus).toBe("Pending");
    expect(profileJson.identificationNumber).toBe("900101-14-5566");
    expect(profileJson.jobType).toBe("Employed");

    await logout(page);
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "Risk & Approvals", exact: true }).click();
    await expect(page.locator(".list-item", { hasText: "Onboarding Investor" })).toBeVisible();
  });

  test("an issuer completes the wizard with company details and lands with a real issuer profile + pending KYB approval", async ({ page }) => {
    const email = `pw-onboard-issuer-${Date.now()}@test.com`;

    await page.goto("/signup");
    await page.getByRole("button", { name: "Issuer" }).click();

    await page.getByLabel("Full name").fill("Onboarding Issuer Contact");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("testpassword123");
    await page.getByLabel("Re-enter password").fill("testpassword123");
    await page.getByRole("button", { name: "Next" }).click();

    // Company name is required - Next must refuse to advance without it.
    // (Both the blocking banner and the inline field hint show the same
    // message, by design, so scope to the banner specifically.)
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.locator(".banner-notice")).toContainText("Company name is required.");

    await page.getByLabel("Company name *").fill("Playwright Onboarding Sdn Bhd");
    await page.getByLabel("Registration number").fill("SSM 202601234567");
    await page.getByLabel("Sector").selectOption("Technology");
    await page.getByLabel("Registered address").fill("Level 5, Menara PW, Kuala Lumpur");
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByText("I agree to the Terms of Service.").click();
    await page.getByText("I agree to the Privacy Policy.").click();
    await page.getByText("I acknowledge the General Risk Statement.").click();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/app/overview");

    const overview = await apiFetch(page, "/api/issuer/overview");
    const overviewJson = JSON.parse(overview.body);
    expect(overviewJson.profile.companyName).toBe("Playwright Onboarding Sdn Bhd");
    expect(overviewJson.profile.kybStatus).toBe("Pending");
    expect(overviewJson.profile.sector).toBe("Technology");

    await logout(page);
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "Risk & Approvals", exact: true }).click();
    await expect(page.locator(".list-item", { hasText: "Playwright Onboarding Sdn Bhd" })).toBeVisible();
  });

  test("choosing a role, then going Back, returns to role selection and preserves nothing stale", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: "Issuer" }).click();
    await expect(page.getByRole("heading", { name: "Issuer Onboarding" })).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("button", { name: "Investor" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Issuer" })).toBeVisible();
  });
});
