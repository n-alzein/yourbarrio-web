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

test.describe("Nearby missed items", () => {
  test("search placeholder styling is readable and not white-forced", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await installStableLocation(page);
    await loginCustomer(page);
    await page.goto("/customer/nearby");

    const input = page.getByTestId("nearby-search-input");
    await expect(input).toBeVisible();

    const classes = (await input.getAttribute("class")) || "";
    expect(classes).not.toContain("placeholder:text-white");
    expect(classes).not.toContain(" text-white");
    expect(classes).toContain("placeholder:text-[var(--yb-text-muted)]");
  });

  test("selected card stays selected after hover leaves", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await installStableLocation(page);
    await loginCustomer(page);
    await page.goto("/customer/nearby");

    const firstCard = page.locator('[data-testid="nearby-results-list"] article[data-selected="false"] button').first();
    await expect(firstCard).toBeVisible();

    await firstCard.click();
    const selectedCard = page.locator('[data-testid="nearby-results-list"] article[data-selected="true"]').first();
    await expect(selectedCard).toBeVisible();

    await page.mouse.move(3, 3);
    await expect(selectedCard).toBeVisible();
    await expect(selectedCard.locator("button")).toHaveAttribute("aria-pressed", "true");
  });

  test("recenter button is visible in map view", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await installStableLocation(page);
    await loginCustomer(page);
    await page.goto("/customer/nearby");

    await expect(page.getByTestId("nearby-map-recenter")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("nearby-toggle-map").tap();
    await expect(page.getByTestId("nearby-map-recenter")).toBeVisible();
  });
});
