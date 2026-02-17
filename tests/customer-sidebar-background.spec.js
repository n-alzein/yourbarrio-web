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

const readShellState = async (page) =>
  page.evaluate(() => {
    const pick = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const style = window.getComputedStyle(el);
      return {
        className: el.className,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        opacity: style.opacity,
        display: style.display,
      };
    };

    const root = document.querySelector('[data-testid="customer-page-root"]');
    return {
      rootClass: root?.className || null,
      bodyBackgroundColor: window.getComputedStyle(document.body).backgroundColor,
      shell: pick(".app-shell-root"),
      shellSolid: pick(".app-shell-bg-solid"),
      shellGradient: pick(".app-shell-bg-gradient"),
      animatedBg: pick(".animated-bg"),
    };
  });

test.describe("Customer sidebar background", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });

  test("opening mobile sidebar keeps page background unchanged", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    await loginCustomer(page);
    await expect(page.getByTestId("customer-page-root")).toBeVisible();

    const beforeOpen = await readShellState(page);

    await page.getByRole("button", { name: "Open menu" }).click();
    const overlay = page.getByTestId("mobile-sidebar-overlay");
    await expect(overlay).toBeVisible();

    const overlayClass = (await overlay.getAttribute("class")) || "";
    expect(overlayClass).toContain("pointer-events-auto");
    expect(overlayClass).not.toMatch(/primary|purple|hsl\(var\(--primary\)\)/i);

    const overlayBg = await overlay.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(overlayBg).not.toBe("rgba(0, 0, 0, 0)");

    const afterOpen = await readShellState(page);
    expect(afterOpen).toEqual(beforeOpen);

    await page.getByRole("button", { name: /close menu/i }).click();
    await expect(overlay).not.toBeVisible();

    const afterClose = await readShellState(page);
    expect(afterClose).toEqual(beforeOpen);
  });

  test("logout from mobile sidebar does not click through to category routes", async ({ page }) => {
    test.skip(!customerEmail || !customerPassword, "Set E2E_CUSTOMER_* env vars");

    const visitedPaths = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        visitedPaths.push(new URL(frame.url()).pathname);
      }
    });

    await loginCustomer(page);
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("button", { name: /log out/i }).click();

    await expect
      .poll(() => {
        const pathname = new URL(page.url()).pathname;
        return pathname.startsWith("/customer");
      })
      .toBe(false);

    expect(visitedPaths.some((pathname) => pathname.startsWith("/customer/category/"))).toBeFalsy();

    await page.goto("/customer/home");
    await expect(page).not.toHaveURL(/\/customer\/home/);
  });
});
