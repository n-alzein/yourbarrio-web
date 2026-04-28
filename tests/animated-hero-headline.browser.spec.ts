import { expect, test } from "@playwright/test";

const HOLD_DURATIONS_MS = [2200, 3000, 2400] as const;
const TRANSITION_DURATION_MS = 1000;
const TRANSITION_FRAME_MS = 16;

test("homepage hero headline loops without shifting the CTA", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  const shell = page.getByTestId("hero-headline-shell");
  const cta = page.getByRole("link", { name: "Explore local businesses" });
  const activeLayer = page.locator('[data-headline-state="active"]');
  const activeCopy = page.locator('[data-headline-state="active"] .yb-hero-headline-copy').first();
  const helperLine = page.getByText("Long Beach businesses, curated for you");

  await expect(activeLayer).toHaveCount(1);
  await expect(activeCopy).toBeVisible();
  await expect(activeCopy).toContainText("Your Neighborhood");
  await expect(helperLine).toBeVisible();

  const initialShellHeight = await shell.evaluate((element) => element.getBoundingClientRect().height);
  expect(initialShellHeight).toBeGreaterThan(0);

  const initialCtaBox = await cta.boundingBox();
  expect(initialCtaBox).not.toBeNull();

  await page.waitForTimeout(HOLD_DURATIONS_MS[0] + TRANSITION_FRAME_MS + 200);
  await expect(page.locator(".yb-hero-headline-layer")).toHaveCount(2);
  await expect(page.locator('[data-headline-state="exiting"]')).toHaveCount(1);
  await expect(page.locator('[data-headline-state="active"]')).toHaveCount(1);

  await page.waitForTimeout(TRANSITION_DURATION_MS - 50);
  await expect(activeLayer).toHaveCount(1);
  await expect(page.locator('[data-headline-state="active"] .yb-hero-headline-copy').first()).toContainText("Your Barrio");

  const secondCtaBox = await cta.boundingBox();
  expect(secondCtaBox).not.toBeNull();
  expect(Math.abs((secondCtaBox?.y ?? 0) - (initialCtaBox?.y ?? 0))).toBeLessThan(1);

  await page.waitForTimeout(HOLD_DURATIONS_MS[1] + TRANSITION_FRAME_MS + TRANSITION_DURATION_MS + 150);
  await expect(activeLayer).toHaveCount(1);
  await expect(page.locator('[data-headline-state="active"] .yb-hero-headline-copy').first()).toContainText("Discover local shops you'll love");

  const thirdCtaBox = await cta.boundingBox();
  expect(thirdCtaBox).not.toBeNull();
  expect(Math.abs((thirdCtaBox?.y ?? 0) - (initialCtaBox?.y ?? 0))).toBeLessThan(1);

  await page.waitForTimeout(HOLD_DURATIONS_MS[2] + TRANSITION_FRAME_MS + TRANSITION_DURATION_MS + 150);
  await expect(activeLayer).toHaveCount(1);
  await expect(page.locator('[data-headline-state="active"] .yb-hero-headline-copy').first()).toContainText("Your Neighborhood");

  await page.waitForTimeout(HOLD_DURATIONS_MS[0] + TRANSITION_FRAME_MS + TRANSITION_DURATION_MS + HOLD_DURATIONS_MS[1] + TRANSITION_FRAME_MS + TRANSITION_DURATION_MS + HOLD_DURATIONS_MS[2] + TRANSITION_FRAME_MS + TRANSITION_DURATION_MS + 150);
  await expect(activeLayer).toHaveCount(1);
  await expect(page.locator('[data-headline-state="active"] .yb-hero-headline-copy').first()).toContainText("Your Neighborhood");

  const pageOverflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(pageOverflowX).toBe(false);
});
