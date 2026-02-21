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

test.describe("Customer nearby map behavior", () => {
  test("selected business remains selected after hover-off and recenter", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await installStableLocation(page);
    await loginCustomer(page);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/customer/nearby");

    const cards = page.locator('[data-testid="nearby-results-list"] article button');
    await expect(cards.first()).toBeVisible();

    await cards.first().click();
    await expect(cards.first()).toHaveAttribute("aria-pressed", "true");

    const popup = page.locator(".mapboxgl-popup");
    if (await page.locator("#mapbox-map").count()) {
      await expect(popup.first()).toBeVisible();
    }

    if ((await cards.count()) > 1) {
      await cards.nth(1).hover();
      await page.mouse.move(4, 4);
    }
    await expect(cards.first()).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: /recenter to my location/i }).click();
    await expect(cards.first()).toHaveAttribute("aria-pressed", "true");
  });

  test("mobile map fills pane in map mode", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await installStableLocation(page);
    await loginCustomer(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/customer/nearby");

    await page.getByTestId("nearby-toggle-map").tap();
    const mobilePane = page.getByTestId("nearby-map-mobile-pane");
    await expect(mobilePane).toBeVisible();

    const paneBox = await mobilePane.boundingBox();
    expect(paneBox).toBeTruthy();
    expect((paneBox?.height || 0) / 844).toBeGreaterThan(0.7);

    if (await page.locator("#mapbox-map").count()) {
      const mapBox = await page.locator("#mapbox-map").boundingBox();
      expect(mapBox).toBeTruthy();
      expect((mapBox?.height || 0) / (paneBox?.height || 1)).toBeGreaterThan(0.8);
    }
  });
});
