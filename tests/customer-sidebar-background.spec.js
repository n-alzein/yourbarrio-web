import { test, expect } from "@playwright/test";

const customerEmail = process.env.E2E_CUSTOMER_EMAIL;
const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;

const loginCustomer = async (page) => {
  await page.goto("/?returnUrl=/customer/home");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.locator("#customer-login-email").fill(customerEmail);
  await page.locator("#customer-login-password").fill(customerPassword);
  await page.locator("form").getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/customer\/home/);
};

const readInertState = (page) =>
  page.evaluate(() => {
    const root =
      document.querySelector('[data-testid="customer-page-root"]') ||
      document.querySelector(".app-shell-root") ||
      document.querySelector("main");
    if (!root) return { found: false, inert: false };
    return {
      found: true,
      inert: Boolean(root.inert),
      ariaHidden: root.getAttribute("aria-hidden"),
    };
  });

test.describe("Customer sidebar inert background", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });

  test("background becomes inert while mobile sidebar is open and restores after close", async ({
    page,
  }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await loginCustomer(page);
    await page.getByRole("button", { name: "Open menu" }).click();

    await expect.poll(() => readInertState(page)).toMatchObject({
      found: true,
      inert: true,
      ariaHidden: "true",
    });

    await page.getByRole("button", { name: /close menu/i }).click();
    await expect
      .poll(() => readInertState(page))
      .toMatchObject({ found: true, inert: false, ariaHidden: null });
  });

  test("logout does not click-through to category route and inert clears after shield", async ({
    page,
  }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    const visitedPaths = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        visitedPaths.push(new URL(frame.url()).pathname);
      }
    });

    await loginCustomer(page);
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect.poll(() => readInertState(page)).toMatchObject({
      found: true,
      inert: true,
      ariaHidden: "true",
    });

    await page.getByRole("button", { name: /log out/i }).click();

    await expect
      .poll(() => {
        const pathname = new URL(page.url()).pathname;
        return pathname.startsWith("/customer");
      })
      .toBe(false);

    await page.waitForTimeout(500);

    expect(
      visitedPaths.some((pathname) => pathname.startsWith("/customer/category/"))
    ).toBeFalsy();

    await expect
      .poll(() => readInertState(page))
      .toMatchObject({ found: true, inert: false, ariaHidden: null });
  });
});
