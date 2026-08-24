import { test, expect } from "@playwright/test";
import { login, logout, apiFetch, signupRetail, DEMO_ACCOUNTS } from "./helpers";

test.describe("Barrier 1: signup", () => {
  test("the 6-step wizard creates a real, browse-only account with a captured KYC profile", async ({ page }) => {
    const email = `pw-barrier1-${Date.now()}@test.com`;

    await page.goto("/signup");

    // Step 1: Email & Password
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("testpassword123");
    await page.getByLabel("Re-enter password").fill("testpassword123");
    await expect(page.getByText(/Password strength:/)).toBeVisible();
    await page.getByLabel("Verify you are human").click();
    for (let i = 0; i < 6; i++) await page.locator(`#otp-${i}`).fill(String((i % 9) + 1));
    await page.getByRole("button", { name: "Continue →" }).click();

    // Step 2: Scan IC - required before continuing.
    await page.getByRole("button", { name: "Continue →" }).click();
    await expect(page.getByText("MyKad number is required.")).toBeVisible();
    await page.getByLabel("MyKad number").fill("880214-14-5677");
    await page.getByRole("button", { name: "Continue →" }).click();

    // Step 3: Selfie & Liveness (mock result, no input needed)
    await expect(page.getByText("face_match_score (mock result)")).toBeVisible();
    await page.getByRole("button", { name: "Continue →" }).click();

    // Step 4: Review Data - full name required, IC number carried over read-only.
    await expect(page.getByLabel("MyKad number (read-only)")).toHaveValue("880214-14-5677");
    await page.getByLabel("Full name").fill("Barrier One Tester");
    await page.getByRole("button", { name: "Continue →" }).click();

    // Step 5: T&C - all three required before Create my account is meaningful.
    await page.getByLabel(/I have read and agree to the Terms of Service/).click();
    await page.getByLabel(/general risk statement/).click();
    await page.getByLabel(/PDPA/).click();
    await page.getByRole("button", { name: "Create my account" }).click();

    // Step 6: Done
    await expect(page.getByText("Welcome to Cofundr!")).toBeVisible();
    await page.getByRole("button", { name: "Explore marketplace" }).click();
    await page.waitForURL("**/app/overview");

    // Browse-only: no sub-profile activated yet, so Overview shows the CTA.
    await expect(page.getByText("You're signed in - browse-only for now")).toBeVisible();
    await expect(page.getByRole("link", { name: "Start investing →", exact: true })).toBeVisible();

    const status = await apiFetch(page, "/api/activate/status");
    const statusJson = JSON.parse(status.body);
    expect(statusJson.kycProfile.fullName).toBe("Barrier One Tester");
    expect(statusJson.kycProfile.icNumber).toBe("880214-14-5677");
    expect(statusJson.activated).toEqual({ individual: false, corporate: false, issuer: false });
  });
});

test.describe("Barrier 2: activation", () => {
  test("activating Individual Investor creates a real profile and a compliance case with a mock CTOS pull", async ({ page }) => {
    const email = `pw-activate-individual-${Date.now()}@test.com`;
    await signupRetail(page, { displayName: "Activate Individual Tester", email });

    await page.goto("/app/activate");
    await page.getByLabel("Occupation").selectOption("Employed");
    await page.getByLabel("Employer / company name").fill("Petronas Bhd");
    await page.getByLabel("Gross annual income").selectOption("RM50,000 - RM100,000");
    await page.getByLabel("Total net worth").selectOption("RM100,000 - RM250,000");
    await page.getByLabel("Source of funds").selectOption("Employment income");
    await page.getByRole("button", { name: "Activate investor profile" }).click();
    await page.waitForURL("**/app/overview");

    const profile = await apiFetch(page, "/api/account/profile");
    const profileJson = JSON.parse(profile.body);
    expect(profileJson.kycStatus).toBe("Pending");
    expect(profileJson.jobType).toBe("Employed");
    expect(profileJson.companyName).toBe("Petronas Bhd");
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(profileJson.riskProfileTier);
    expect(profileJson.annualReviewDue).toBeTruthy();

    // Revisiting Activate afterwards shows the already-activated guard.
    await page.goto("/app/activate");
    await expect(page.getByText("You're already activated")).toBeVisible();

    // Shows up as a real, reviewable compliance case for the admin.
    await logout(page);
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "KYC Review Queue", exact: true }).click();
    const row = page.locator("tr", { hasText: "Activate Individual Tester" });
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: "Review" }).click();

    await expect(page.getByText("CTOS Screening Record")).toBeVisible();
    await expect(page.locator(".code-block")).toContainText("request_id");
    await expect(page.locator(".code-block")).toContainText("credit_score");
  });

  test("activating Issuer creates a real issuer profile and KYB compliance case", async ({ page }) => {
    const email = `pw-activate-issuer-${Date.now()}@test.com`;
    await signupRetail(page, { displayName: "Activate Issuer Tester", email });

    await page.goto("/app/activate");
    await page.getByRole("button", { name: "Issuer", exact: true }).click();
    await page.getByLabel("Company name *").fill("Playwright Activation Sdn Bhd");
    await page.getByLabel("Company registration number").fill("REG-PW-010");
    await page.getByLabel("Amount to raise (RM)").fill("500000");
    await page.getByRole("button", { name: "Submit issuer application" }).click();
    await page.waitForURL("**/app/overview");

    const overview = await apiFetch(page, "/api/issuer/overview");
    const overviewJson = JSON.parse(overview.body);
    expect(overviewJson.profile.companyName).toBe("Playwright Activation Sdn Bhd");
    expect(overviewJson.profile.kybStatus).toBe("Pending");

    await logout(page);
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "Risk & Approvals", exact: true }).click();
    await expect(page.locator(".list-item", { hasText: "Playwright Activation Sdn Bhd" })).toBeVisible();
  });

  test("activating Corporate Investor creates a real self-service corporate account", async ({ page }) => {
    const email = `pw-activate-corporate-${Date.now()}@test.com`;
    await signupRetail(page, { displayName: "Activate Corporate Tester", email });

    await page.goto("/app/activate");
    await page.getByRole("button", { name: "Corporate Investor", exact: true }).click();
    await page.getByLabel("Company name *").fill("Playwright Treasury Sdn Bhd");
    await page.getByLabel("Company registration number").fill("REG-CORP-010");
    await page.getByRole("button", { name: "Activate corporate investor profile" }).click();
    await page.waitForURL("**/app/overview");

    // Role genuinely flips to corporate - the corporate nav should now show.
    await expect(page.getByRole("link", { name: "Notes Available", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Activity Log", exact: true })).toBeVisible();

    await logout(page);
    await login(page, DEMO_ACCOUNTS.admin);
    await page.getByRole("link", { name: "Investors", exact: true }).click();
    // A fresh, zero-portfolio account sorts to the bottom of the (paginated,
    // portfolio-sorted) list, so search for it rather than assuming page 1.
    await page.getByLabel("Search investor").fill("Playwright Treasury");
    await expect(page.locator("table", { hasText: "Playwright Treasury Sdn Bhd" })).toBeVisible();
  });
});
