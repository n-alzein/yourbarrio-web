import { test, expect } from "@playwright/test";

const customerEmail = process.env.E2E_CUSTOMER_EMAIL;
const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;

const installGeoProbe = async (page, { shouldSucceed }) => {
  await page.addInitScript((opts) => {
    window.__geoCallCount = 0;
    const geolocation = {
      getCurrentPosition(success) {
        window.__geoCallCount += 1;
        if (opts.shouldSucceed) {
          setTimeout(() => {
            success?.({
              coords: {
                latitude: 33.7701,
                longitude: -118.1937,
                accuracy: 10,
              },
            });
          }, 0);
          return;
        }
        throw new Error("geolocation should not be called on this route");
      },
      watchPosition() {
        window.__geoCallCount += 1;
        return 1;
      },
      clearWatch() {},
    };
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: geolocation,
    });
  }, { shouldSucceed });
};

const loginCustomer = async (page) => {
  await page.goto("/?returnUrl=/customer/home");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.locator("#customer-login-email").fill(customerEmail);
  await page.locator("#customer-login-password").fill(customerPassword);
  await page.locator("form").getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/customer\/home/);
};

test.describe("Customer geolocation boundary", () => {
  test("does not invoke geolocation on /customer/home", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");
    await installGeoProbe(page, { shouldSucceed: false });
    await loginCustomer(page);
    await page.waitForTimeout(1200);
    const calls = await page.evaluate(() => window.__geoCallCount || 0);
    expect(calls).toBe(0);
  });

  test("invokes geolocation once on /customer/nearby", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");
    await installGeoProbe(page, { shouldSucceed: true });
    await loginCustomer(page);
    await page.goto("/customer/nearby");
    await expect
      .poll(async () => page.evaluate(() => window.__geoCallCount || 0))
      .toBe(1);
  });
});

