import { expect, test } from "@playwright/test";

const businessEmail = process.env.E2E_BUSINESS_EMAIL;
const businessPassword = process.env.E2E_BUSINESS_PASSWORD;

const ROUTES = [
  { path: "/business/listings", heading: /Catalog|No listings yet/i },
  { path: "/business/messages", heading: /Messages/i },
  { path: "/business/settings", heading: /Settings/i },
];

const VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

async function loginBusiness(page) {
  await page.goto("/business-auth/login");
  await page.locator("#business-login-email").fill(businessEmail);
  await page.locator("#business-login-password").fill(businessPassword);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/business\/dashboard/);
}

test.describe("business navbar clearance", () => {
  test.skip(
    !businessEmail || !businessPassword,
    "Set E2E_BUSINESS_* env vars for business navbar clearance coverage"
  );

  for (const viewport of VIEWPORTS) {
    test.describe(viewport.name, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const route of ROUTES) {
        test(`${route.path} content starts below the fixed navbar`, async ({ page }) => {
          await loginBusiness(page);
          await page.goto(route.path);

          const navbar = page.locator('nav[data-business-navbar="1"]').first();
          await expect(navbar).toBeVisible();

          const heading = page.getByRole("heading", { name: route.heading }).first();
          await expect(heading).toBeVisible();

          const geometry = await page.evaluate(() => {
            const nav = document.querySelector('nav[data-business-navbar="1"]');
            const shell = document.querySelector('[data-testid="business-route-shell"]');
            const heading = document.querySelector("h1, h2");
            if (!nav || !shell || !heading) return null;
            const navRect = nav.getBoundingClientRect();
            const shellRect = shell.getBoundingClientRect();
            const headingRect = heading.getBoundingClientRect();
            return {
              navBottom: navRect.bottom,
              shellTop: shellRect.top,
              shellPaddingTop: window.getComputedStyle(shell).paddingTop,
              headingTop: headingRect.top,
            };
          });

          expect(geometry).toBeTruthy();
          expect(geometry.headingTop).toBeGreaterThanOrEqual(geometry.navBottom + 8);
          expect(geometry.shellPaddingTop).toMatch(/^(9[6-9]|1[0-1][0-9])px$/);
        });
      }
    });
  }
});
