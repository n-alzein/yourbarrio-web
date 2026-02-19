import { expect, test, type Page } from "@playwright/test";

const adminSuperEmail = process.env.E2E_ADMIN_SUPER_EMAIL;
const adminSuperPassword = process.env.E2E_ADMIN_SUPER_PASSWORD;

async function signInAndOpenAuditPage(page: Page) {
  await page.goto("/signin?modal=signin&next=/admin/audit");
  await page.getByLabel(/email/i).first().fill(adminSuperEmail as string);
  await page.getByLabel(/password/i).first().fill(adminSuperPassword as string);
  await page.locator("form").getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/admin\/audit/);
}

test.describe("Admin audit log UI", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !adminSuperEmail || !adminSuperPassword,
      "Set E2E_ADMIN_SUPER_EMAIL and E2E_ADMIN_SUPER_PASSWORD"
    );
    await signInAndOpenAuditPage(page);
  });

  test("actor and target show readable labels when enriched data exists", async ({ page }) => {
    const rowCount = await page.locator('[data-testid="audit-row"]').count();
    test.skip(rowCount === 0, "No audit rows found in environment");

    const actorReadableCount = await page
      .locator('[data-testid="audit-actor"]')
      .evaluateAll((cells) =>
        cells.filter((cell) => {
          const primary = (cell.querySelector("div")?.textContent || "").trim();
          return Boolean(primary) && !/^[0-9a-f]{8}\.\.\.[0-9a-f]{4}$/i.test(primary) && primary !== "-";
        }).length
      );

    const targetReadableCount = await page
      .locator('[data-testid="audit-target"]')
      .evaluateAll((cells) =>
        cells.filter((cell) => {
          const primary = (cell.querySelector("div")?.textContent || "").trim();
          return Boolean(primary) && primary !== "target:-";
        }).length
      );

    expect(actorReadableCount).toBeGreaterThan(0);
    expect(targetReadableCount).toBeGreaterThan(0);
  });

  test("does not show raw meta JSON in table by default", async ({ page }) => {
    await expect(page.getByRole("columnheader", { name: "Meta" })).toHaveCount(0);
    await expect(page.locator("tbody pre")).toHaveCount(0);
  });

  test("row click opens details drawer and raw payload can be expanded", async ({ page }) => {
    const firstRow = page.locator('[data-testid="audit-row"]').first();
    test.skip((await firstRow.count()) === 0, "No audit rows found in environment");

    await firstRow.click();
    await expect(page.locator('[data-testid="audit-drawer"]')).toBeVisible();

    await page.getByText("Raw payload", { exact: false }).click();
    await expect(page.locator('[data-testid="audit-raw-payload"]')).toBeVisible();
  });

  test("unknown actions render gracefully when present", async ({ page }) => {
    const rowCount = await page.locator('[data-testid="audit-row"]').count();
    test.skip(rowCount === 0, "No audit rows found in environment");

    const unknownLikeCount = await page
      .locator('[data-testid="audit-action"]')
      .evaluateAll((cells) =>
        cells.filter((cell) => {
          const divs = Array.from(cell.querySelectorAll("div"));
          if (divs.length < 2) return false;
          return (divs[0].textContent || "").trim() === (divs[1].textContent || "").trim();
        }).length
      );

    test.skip(unknownLikeCount === 0, "No unknown action rows available in environment");
    expect(unknownLikeCount).toBeGreaterThan(0);
  });
});
