import { expect, test } from "@playwright/test";

async function readHeroMetrics(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const navbarEl = document.querySelector("nav.yb-navbar");
    const heroEl = document.querySelector('[data-testid="home-hero"]');
    const contentEl = heroEl?.querySelector(".mx-auto.flex.w-full.max-w-6xl");
    const ctaEl = Array.from(document.querySelectorAll("a")).find((element) =>
      /explore local businesses/i.test(element.textContent || "")
    );
    const featuredEl = Array.from(document.querySelectorAll("h2, h3")).find((element) =>
      /Featured in Long Beach/.test(element.textContent || "")
    );

    if (!navbarEl || !heroEl || !contentEl || !ctaEl || !featuredEl) {
      return null;
    }

    const navbarBox = navbarEl.getBoundingClientRect();
    const navbarAfter = window.getComputedStyle(navbarEl, "::after");
    const navbarDividerBottom =
      navbarAfter.content !== "none" && navbarAfter.display !== "none"
        ? navbarBox.bottom - (Number.parseFloat(navbarAfter.bottom || "0") || 0)
        : navbarBox.bottom;
    const heroBox = heroEl.getBoundingClientRect();
    const contentBox = contentEl.getBoundingClientRect();
    const ctaBox = ctaEl.getBoundingClientRect();
    const featuredBox = featuredEl.getBoundingClientRect();

    return {
      viewportHeight: window.innerHeight,
      navbarHeight: navbarBox.height,
      navbarBottom: navbarBox.bottom,
      navbarDividerBottom,
      heroHeight: heroBox.height,
      heroTop: heroBox.top,
      heroBottom: heroBox.bottom,
      contentTop: contentBox.top,
      contentHeight: contentBox.height,
      ctaTop: ctaBox.top,
      featuredTop: featuredBox.top,
    };
  });
}

test.describe("homepage hero rendered height", () => {
  test("desktop hero stays compact below the navbar", async ({ page }) => {
    await page.goto("/");

    const navbar = page.locator("nav.yb-navbar").first();
    const hero = page.getByTestId("home-hero");
    const cta = page.getByRole("link", { name: /explore local businesses/i }).first();
    const featuredHeading = page.getByText("Featured in Long Beach").first();

    await expect(navbar).toBeVisible();
    await expect(hero).toBeVisible();
    await expect(cta).toBeVisible();
    await expect(featuredHeading).toBeVisible();

    const metrics = await readHeroMetrics(page);

    expect(metrics).toBeTruthy();
    console.log("homepage-hero-metrics", JSON.stringify(metrics));

    expect(Math.abs((metrics?.heroTop ?? 999) - (metrics?.navbarHeight ?? 0))).toBeLessThanOrEqual(2);
    expect(metrics?.heroHeight ?? 0).toBeGreaterThanOrEqual(300);
    expect(metrics?.heroHeight ?? 999).toBeLessThanOrEqual(320);
    expect(metrics?.ctaTop ?? -1).toBeGreaterThanOrEqual((metrics?.navbarBottom ?? 0) + 8);
    expect(metrics?.contentHeight ?? 999).toBeLessThanOrEqual(250);
    expect(metrics?.featuredTop ?? 999).toBeLessThanOrEqual(430);
  });

  test("mobile hero stays compact below the navbar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const hero = page.getByTestId("home-hero");
    const featuredHeading = page.getByText("Featured in Long Beach").first();

    await expect(hero).toBeVisible();
    await expect(featuredHeading).toBeVisible();

    const metrics = await readHeroMetrics(page);

    expect(metrics).toBeTruthy();
    console.log("homepage-hero-metrics-mobile", JSON.stringify(metrics));

    expect(Math.abs((metrics?.heroTop ?? 999) - (metrics?.navbarDividerBottom ?? 0))).toBeLessThanOrEqual(1);
    expect(metrics?.heroHeight ?? 0).toBeGreaterThanOrEqual(280);
    expect(metrics?.heroHeight ?? 999).toBeLessThanOrEqual(320);
    expect(metrics?.featuredTop ?? 999).toBeLessThanOrEqual(450);
  });

  test("mobile hero remains flush after returning from cart", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByTestId("home-hero")).toBeVisible();
    await page.locator('a[href="/cart"]').first().click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.locator("nav.yb-navbar").first()).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("home-hero")).toBeVisible();

    const metrics = await readHeroMetrics(page);
    expect(metrics).toBeTruthy();
    expect(Math.abs((metrics?.heroTop ?? 999) - (metrics?.navbarDividerBottom ?? 0))).toBeLessThanOrEqual(1);

    const gapProbe = await page.evaluate(() => {
      const navbarEl = document.querySelector("nav.yb-navbar");
      const heroEl = document.querySelector('[data-testid="home-hero"]');
      const publicShell = document.querySelector('[data-testid="public-shell-content"]');
      if (!navbarEl || !heroEl) return null;
      const navbarBox = navbarEl.getBoundingClientRect();
      const navbarAfter = window.getComputedStyle(navbarEl, "::after");
      const navbarDividerBottom =
        navbarAfter.content !== "none" && navbarAfter.display !== "none"
          ? navbarBox.bottom - (Number.parseFloat(navbarAfter.bottom || "0") || 0)
          : navbarBox.bottom;
      const heroBox = heroEl.getBoundingClientRect();
      const heroStyle = window.getComputedStyle(heroEl);
      const midpointX = Math.floor(window.innerWidth / 2);
      const midpointY = Math.floor((navbarDividerBottom + heroBox.top) / 2);
      const element = document.elementFromPoint(midpointX, midpointY);
      return {
        gap: heroBox.top - navbarDividerBottom,
        publicShellPaddingTop: publicShell ? window.getComputedStyle(publicShell).paddingTop : null,
        heroMarginTop: heroStyle.marginTop,
        heroPaddingTop: heroStyle.paddingTop,
        elementTag: element?.tagName || null,
        elementTestId: element?.getAttribute?.("data-testid") || null,
        elementBackground: element ? window.getComputedStyle(element).backgroundColor : null,
      };
    });

    expect(gapProbe).toBeTruthy();
    expect(Math.abs(gapProbe?.gap ?? 999)).toBeLessThanOrEqual(1);
    expect(gapProbe?.publicShellPaddingTop).toMatch(/^(80|81|82)px$/);
    expect(gapProbe?.heroMarginTop).toBe("0px");
    expect(gapProbe?.heroPaddingTop).toBe("0px");
    expect(gapProbe?.elementTestId).not.toBe("public-shell-content");
  });

  test("mobile hero is flush on first frame when returning from cart by logo", async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto("/cart");
    await expect(page.locator("nav.yb-navbar").first()).toBeVisible();

    await page.locator('a[aria-label="Go to home"]').first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("home-hero")).toBeVisible();

    const gapProbe = await page.evaluate(() => {
      const navbarEl = document.querySelector("nav.yb-navbar");
      const heroEl = document.querySelector('[data-testid="home-hero"]');
      const publicShell = document.querySelector('[data-testid="public-shell-content"]');
      if (!navbarEl || !heroEl || !publicShell) return null;
      const navbarBox = navbarEl.getBoundingClientRect();
      const navbarAfter = window.getComputedStyle(navbarEl, "::after");
      const navbarDividerBottom =
        navbarAfter.content !== "none" && navbarAfter.display !== "none"
          ? navbarBox.bottom - (Number.parseFloat(navbarAfter.bottom || "0") || 0)
          : navbarBox.bottom;
      const heroBox = heroEl.getBoundingClientRect();
      const shellStyle = window.getComputedStyle(publicShell);
      const midpointY = Math.floor((navbarDividerBottom + heroBox.top) / 2);
      const element = document.elementFromPoint(Math.floor(window.innerWidth / 2), midpointY);

      return {
        gap: heroBox.top - navbarDividerBottom,
        shellGap: publicShell.getAttribute("data-shell-gap"),
        shellPaddingTop: shellStyle.paddingTop,
        publicShellGapVar: shellStyle.getPropertyValue("--public-shell-gap").trim(),
        elementTestId: element?.getAttribute?.("data-testid") || null,
      };
    });

    expect(gapProbe).toBeTruthy();
    expect(Math.abs(gapProbe?.gap ?? 999)).toBeLessThanOrEqual(1);
    expect(gapProbe?.shellGap).toBe("none");
    expect(gapProbe?.publicShellGapVar).toBe("0px");
    expect(gapProbe?.elementTestId).not.toBe("public-shell-content");
  });

  test("mobile homepage uses one shell offset and no hero offset", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByTestId("home-hero")).toBeVisible();

    const invariant = await page.evaluate(() => {
      const navbarEl = document.querySelector("nav.yb-navbar");
      const shellEl = document.querySelector('[data-testid="public-shell-content"]');
      const heroEl = document.querySelector('[data-testid="home-hero"]');
      if (!navbarEl || !shellEl || !heroEl) return null;
      const navbarBox = navbarEl.getBoundingClientRect();
      const navbarAfter = window.getComputedStyle(navbarEl, "::after");
      const navbarDividerBottom =
        navbarAfter.content !== "none" && navbarAfter.display !== "none"
          ? navbarBox.bottom - (Number.parseFloat(navbarAfter.bottom || "0") || 0)
          : navbarBox.bottom;
      const heroBox = heroEl.getBoundingClientRect();
      const shellStyle = window.getComputedStyle(shellEl);
      const heroStyle = window.getComputedStyle(heroEl);
      return {
        navbarBottom: navbarBox.bottom,
        navbarDividerBottom,
        heroTop: heroBox.top,
        shellPaddingTop: shellStyle.paddingTop,
        heroMarginTop: heroStyle.marginTop,
        heroPaddingTop: heroStyle.paddingTop,
      };
    });

    expect(invariant).toBeTruthy();
    expect(Math.abs((invariant?.heroTop ?? 999) - (invariant?.navbarDividerBottom ?? 0))).toBeLessThanOrEqual(1);
    expect(invariant?.shellPaddingTop).toMatch(/^(80|81|82)px$/);
    expect(invariant?.heroMarginTop).toBe("0px");
    expect(invariant?.heroPaddingTop).toBe("0px");
  });

  for (const width of [390, 430]) {
    test(`mobile homepage hero starts at navbar divider bottom at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 932 });
      await page.goto("/");
      await expect(page.getByTestId("home-hero")).toBeVisible();

      const invariant = await page.evaluate(() => {
        const navbarEl = document.querySelector("nav.yb-navbar");
        const heroEl = document.querySelector('[data-testid="home-hero"]');
        if (!navbarEl || !heroEl) return null;
        const navbarBox = navbarEl.getBoundingClientRect();
        const navbarAfter = window.getComputedStyle(navbarEl, "::after");
        const navbarDividerBottom =
          navbarAfter.content !== "none" && navbarAfter.display !== "none"
            ? navbarBox.bottom - (Number.parseFloat(navbarAfter.bottom || "0") || 0)
            : navbarBox.bottom;
        const heroBox = heroEl.getBoundingClientRect();
        const elementAtBoundary = document.elementFromPoint(
          Math.floor(window.innerWidth / 2),
          Math.floor(navbarDividerBottom)
        );

        return {
          navbarBottom: navbarBox.bottom,
          navbarDividerBottom,
          heroTop: heroBox.top,
          delta: heroBox.top - navbarDividerBottom,
          elementTestId: elementAtBoundary?.getAttribute?.("data-testid") || null,
          elementClassName:
            typeof elementAtBoundary?.className === "string"
              ? elementAtBoundary.className
              : null,
        };
      });

      expect(invariant).toBeTruthy();
      expect(Math.abs(invariant?.delta ?? 999)).toBeLessThanOrEqual(1);
      expect(invariant?.elementTestId).not.toBe("public-shell-content");
    });
  }
});
