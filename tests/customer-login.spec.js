import { test, expect } from "@playwright/test";

const customerEmail = process.env.E2E_CUSTOMER_EMAIL;
const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;

test.describe("Customer login", () => {
  test("lands on customer home and stays there without loop", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await page.goto("/");
    await page.getByRole("button", { name: /log in/i }).click();

    await page.locator("#customer-login-email").fill(customerEmail);
    await page.locator("#customer-login-password").fill(customerPassword);
    await page.locator("form").getByRole("button", { name: /log in/i }).click();

    await expect(page).toHaveURL(/\/customer\/home/);
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/customer\/home/);
  });

  test("redirects to returnUrl after successful login", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await page.goto("/?returnUrl=/customer/settings");
    await page.getByRole("button", { name: /log in/i }).click();

    await page.locator("#customer-login-email").fill(customerEmail);
    await page.locator("#customer-login-password").fill(customerPassword);
    await page.locator("form").getByRole("button", { name: /log in/i }).click();

    await expect(page).toHaveURL(/\/customer\/settings/);
    await expect(page.getByRole("button", { name: /sign in/i })).toHaveCount(0);
  });

  test("clears loading state on invalid credentials", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /log in/i }).click();

    await page.locator("#customer-login-email").fill("invalid@example.com");
    await page.locator("#customer-login-password").fill("wrong-password");
    const submit = page.locator("form").getByRole("button", { name: /log in/i });
    await submit.click();

    await expect(submit).toHaveText(/log in/i);
  });
});
