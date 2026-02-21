import { expect, test } from "@playwright/test";

const customerEmail = process.env.E2E_CUSTOMER_EMAIL;
const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;

const installStableLocation = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    const value = JSON.stringify({
      source: "manual",
      city: "Long Beach",
      region: "CA",
      country: "US",
      lat: 33.7701,
      lng: -118.1937,
      label: "Long Beach, CA",
      updatedAt: Date.now(),
    });
    localStorage.setItem("yb-location", value);
    localStorage.setItem("yb-city", "Long Beach");
  });
};

const loginCustomer = async (page: import("@playwright/test").Page) => {
  await page.goto("/?returnUrl=/customer/home");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.locator("#customer-login-email").fill(customerEmail || "");
  await page.locator("#customer-login-password").fill(customerPassword || "");
  await page.locator("form").getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/customer\/home/);
};

test.describe("Nearby hover scroll stability", () => {
  test("hovering panes does not jump document scroll and recenter control is visible", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await installStableLocation(page);
    await loginCustomer(page);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/customer/nearby");

    const headerPadding = await page.getByTestId("nearby-header").evaluate((el) =>
      getComputedStyle(el).paddingTop
    );
    expect(parseFloat(headerPadding)).toBeLessThanOrEqual(20);

    await expect(page.getByTestId("recenter-map")).toBeVisible();

    await page.mouse.wheel(0, 200);
    const startY = await page.evaluate(() => window.scrollY);

    await page.getByTestId("nearby-results-scroll-pane").hover();
    const afterResultsHover = await page.evaluate(() => window.scrollY);
    expect(Math.abs(afterResultsHover - startY)).toBeLessThanOrEqual(2);

    await page.getByTestId("nearby-map-pane").hover();
    const afterMapHover = await page.evaluate(() => window.scrollY);
    expect(Math.abs(afterMapHover - startY)).toBeLessThanOrEqual(2);
  });

  test("mobile map view shows recenter control", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await installStableLocation(page);
    await loginCustomer(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/customer/nearby");

    await page.getByTestId("nearby-toggle-map").tap();
    await expect(page.getByTestId("recenter-map")).toBeVisible();
  });
});
