import { expect, test, type Page } from "@playwright/test";

const adminSuperEmail = process.env.E2E_ADMIN_SUPER_EMAIL;
const adminSuperPassword = process.env.E2E_ADMIN_SUPER_PASSWORD;

async function signInAndOpenAdminHome(page: Page) {
  await page.goto("/signin?modal=signin&next=/admin");
  await page.getByLabel(/email/i).first().fill(adminSuperEmail as string);
  await page.getByLabel(/password/i).first().fill(adminSuperPassword as string);
  await page.locator("form").getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/admin/);
}

test.describe("Admin logout latency", () => {
  test("redirects to public home quickly and blocks admin route after logout", async ({ page }) => {
    test.skip(
      !adminSuperEmail || !adminSuperPassword,
      "Set E2E_ADMIN_SUPER_EMAIL and E2E_ADMIN_SUPER_PASSWORD"
    );

    await signInAndOpenAdminHome(page);

    await page.locator('button[data-admin-logout="1"]').first().click();
    await expect(page).toHaveURL(/\/(\?loggedOut=1)?$/, { timeout: 1500 });

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/signin/);
  });
});
