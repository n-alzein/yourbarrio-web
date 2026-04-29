import { test, expect } from "@playwright/test";

test.describe("cart navbar sticky behavior", () => {
  test("cart keeps the shared customer navbar pinned while scrolling", async ({ page }) => {
    await page.goto("/cart");

    const navbar = page.locator('nav[data-testid="customer-navbar"]');
    await expect(navbar).toBeVisible();
    await expect(navbar).toHaveAttribute("data-nav-sticky", "1");

    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.setAttribute("data-test-scroll-spacer", "1");
      spacer.style.height = "2000px";
      document.body.appendChild(spacer);
    });

    const before = await navbar.boundingBox();
    expect(before).toBeTruthy();

    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(200);

    const after = await navbar.boundingBox();
    expect(after).toBeTruthy();
    expect(Math.abs(after.y)).toBeLessThanOrEqual(1);
  });
});
