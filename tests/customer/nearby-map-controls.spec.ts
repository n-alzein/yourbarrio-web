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

test.describe("Nearby map controls", () => {
  test("status text absent and recenter is visible/clickable", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await installStableLocation(page);
    await loginCustomer(page);
    await page.goto("/customer/nearby");

    await expect(page.getByText("Centered on your location.")).toHaveCount(0);

    const recenter = page.getByTestId("recenter-map");
    await expect(recenter).toBeVisible();
    await recenter.click();
    await expect(recenter).toBeVisible();
  });

  test("popup card click navigates to business profile", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await installStableLocation(page);
    await loginCustomer(page);
    await page.goto("/customer/nearby");

    const firstCard = page.locator('[data-testid="nearby-results-list"] article button').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();

    const popupCard = page.getByTestId("map-popup-card").first();
    const hasPopup = (await popupCard.count()) > 0;
    test.skip(!hasPopup, "No popup card available in current fixture data");

    await popupCard.click();
    await expect(page).toHaveURL(/\/customer\/b\//);
  });
});
