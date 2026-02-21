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

test.describe("Customer nearby split view", () => {
  test("desktop shows split view with sticky map", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await installStableLocation(page);
    await loginCustomer(page);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/customer/nearby");

    const desktopSplit = page.getByTestId("nearby-split-desktop");
    const resultsPane = page.getByTestId("nearby-results-scroll-pane");
    const mapPane = page.getByTestId("nearby-map-pane");

    await expect(desktopSplit).toBeVisible();
    await expect(resultsPane).toBeVisible();
    await expect(mapPane).toBeVisible();

    const before = await mapPane.boundingBox();
    await resultsPane.evaluate((el) => {
      el.scrollTo({ top: 900, behavior: "instant" });
    });
    const after = await mapPane.boundingBox();

    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    expect(Math.abs((after?.y || 0) - (before?.y || 0))).toBeLessThanOrEqual(2);
  });

  test("mobile toggles between list and map", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await installStableLocation(page);
    await loginCustomer(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/customer/nearby");

    const listToggle = page.getByTestId("nearby-toggle-list");
    const mapToggle = page.getByTestId("nearby-toggle-map");

    await expect(listToggle).toBeVisible();
    await expect(mapToggle).toBeVisible();

    await mapToggle.tap();
    await expect(page.getByTestId("nearby-map-mobile-pane")).toBeVisible();
    await expect(page.getByTestId("nearby-results-list")).toBeHidden();

    await listToggle.tap();
    await expect(page.getByTestId("nearby-results-list")).toBeVisible();
    await expect(page.getByTestId("nearby-map-mobile-pane")).toBeHidden();
  });
});
