import { expect, test } from "@playwright/test";

test("homepage hero headline is clear immediately without shifting the CTA", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  const shell = page.getByTestId("hero-headline-shell");
  const cta = page.getByRole("link", { name: "Explore local businesses" });
  const activeLayer = page.locator('[data-headline-state="active"]');
  const activeCopy = page.locator('[data-headline-state="active"] .yb-hero-headline-copy').first();
  const brandMeaningLine = page.getByText("YourBarrio — Long Beach marketplace");

  await expect(activeLayer).toHaveCount(1);
  await expect(activeCopy).toBeVisible();
  await expect(activeCopy).toContainText("Discover local shops you’ll love");
  await expect(brandMeaningLine).toBeVisible();
  await expect(page.getByText("Long Beach businesses, curated for you")).toHaveCount(0);

  const initialShellHeight = await shell.evaluate((element) => element.getBoundingClientRect().height);
  expect(initialShellHeight).toBeGreaterThan(0);

  const initialCtaBox = await cta.boundingBox();
  expect(initialCtaBox).not.toBeNull();

  await page.waitForTimeout(1200);
  await expect(activeLayer).toHaveCount(1);
  await expect(activeCopy).toContainText("Discover local shops you’ll love");

  const stableCtaBox = await cta.boundingBox();
  expect(stableCtaBox).not.toBeNull();
  expect(Math.abs((stableCtaBox?.y ?? 0) - (initialCtaBox?.y ?? 0))).toBeLessThan(1);

  const pageOverflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(pageOverflowX).toBe(false);
});
