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

test.describe("Nearby UI polish", () => {
  test("header spacing is tight and split view occupies viewport", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await installStableLocation(page);
    await loginCustomer(page);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/customer/nearby");

    const header = page.getByTestId("nearby-header");
    await expect(header).toBeVisible();

    const sectionClasses = (await page.getByTestId("nearby-page-root").getAttribute("class")) || "";
    expect(sectionClasses).not.toContain("pt-10");
    expect(sectionClasses).not.toContain("pt-8");

    const splitView = page.getByTestId("nearby-splitview");
    const splitBox = await splitView.boundingBox();
    expect(splitBox).toBeTruthy();
    expect((splitBox?.height || 0) / 900).toBeGreaterThan(0.6);
  });

  test("recenter button exists and popup description is clamped", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await installStableLocation(page);
    await loginCustomer(page);
    await page.goto("/customer/nearby");

    await expect(page.getByTestId("recenter-map")).toBeVisible();

    const firstCard = page.locator('[data-testid="nearby-results-list"] article button').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();

    const popupDescription = page.getByTestId("map-popup-description").first();
    const hasPopupDescription = (await popupDescription.count()) > 0;
    test.skip(!hasPopupDescription, "No popup description available in current fixture data");

    const webkitClamp = await popupDescription.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("-webkit-line-clamp")
    );
    expect(webkitClamp.trim()).toBe("3");
  });

  test("mobile map view shows recenter button", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await installStableLocation(page);
    await loginCustomer(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/customer/nearby");

    await page.getByTestId("nearby-toggle-map").tap();
    await expect(page.getByTestId("recenter-map")).toBeVisible();
  });
});
