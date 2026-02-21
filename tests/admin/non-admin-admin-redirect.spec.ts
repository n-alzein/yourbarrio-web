import { expect, test, type Page } from "@playwright/test";

const adminSuperEmail = process.env.E2E_ADMIN_SUPER_EMAIL;
const adminSuperPassword = process.env.E2E_ADMIN_SUPER_PASSWORD;
const customerEmail = process.env.E2E_CUSTOMER_EMAIL;
const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;

async function signInWithCustomerModal(page: Page, email: string, password: string, next = "/") {
  await page.goto(`/signin?modal=signin&next=${encodeURIComponent(next)}`);
  await page.locator("#customer-login-email").fill(email);
  await page.locator("#customer-login-password").fill(password);
  await page.locator("form").getByRole("button", { name: /log in/i }).click();
}

function isAdminPath(url: string) {
  return new URL(url).pathname.startsWith("/admin");
}

test.describe("Admin redirect hardening", () => {
  test("admin logout clears stale admin redirect before customer login", async ({ page }) => {
    test.skip(
      !adminSuperEmail || !adminSuperPassword || !customerEmail || !customerPassword,
      "Set E2E_ADMIN_SUPER_* and E2E_CUSTOMER_* env vars"
    );

    await signInWithCustomerModal(
      page,
      adminSuperEmail as string,
      adminSuperPassword as string,
      "/admin"
    );
    await expect(page).toHaveURL(/\/admin/);

    await page.locator('button[data-admin-logout="1"]').first().click();
    await expect(page).toHaveURL(/\/(\?loggedOut=1)?$/);

    await signInWithCustomerModal(
      page,
      customerEmail as string,
      customerPassword as string,
      "/admin"
    );

    await expect
      .poll(() => isAdminPath(page.url()), { timeout: 10_000 })
      .toBe(false);
  });

  test("customer navigating to /admin gets redirected out", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await signInWithCustomerModal(
      page,
      customerEmail as string,
      customerPassword as string,
      "/"
    );
    await expect
      .poll(() => isAdminPath(page.url()), { timeout: 10_000 })
      .toBe(false);

    await page.goto("/admin");
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 1_500 })
      .toMatch(/^\/($|customer\/home$)/);
  });
});
