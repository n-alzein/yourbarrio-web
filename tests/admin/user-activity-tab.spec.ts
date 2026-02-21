import { expect, test, type Page } from "@playwright/test";

const adminSuperEmail = process.env.E2E_ADMIN_SUPER_EMAIL;
const adminSuperPassword = process.env.E2E_ADMIN_SUPER_PASSWORD;
const targetUserId =
  process.env.E2E_USER_DETAIL_TARGET_ID ||
  process.env.E2E_CUSTOMER_USER_ID ||
  process.env.E2E_BUSINESS_USER_ID ||
  process.env.E2E_ADMIN_USER_ID;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/signin?modal=signin&next=/admin");
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.locator("form").getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/admin/);
}

async function openActivityTab(page: Page) {
  await page.goto(`/admin/users/${encodeURIComponent(String(targetUserId))}`);
  await expect(page).toHaveURL(/\/admin\/users\//);
  await page.getByRole("button", { name: "Activity" }).click();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
}

test.describe("Admin user activity tab", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !adminSuperEmail || !adminSuperPassword || !targetUserId,
      "Set E2E_ADMIN_SUPER_* and target user id env vars"
    );

    await signIn(page, adminSuperEmail as string, adminSuperPassword as string);
    await openActivityTab(page);
  });

  test("renders activity list/empty state instead of placeholder", async ({ page }) => {
    await expect(
      page.getByText("Detailed per-user audit timeline is not available in this view yet.")
    ).toHaveCount(0);

    const hasRows = (await page.locator('[data-testid="user-activity-row"]').count()) > 0;
    if (!hasRows) {
      await expect(page.getByTestId("user-activity-empty")).toBeVisible();
    } else {
      await expect(page.locator('[data-testid="user-activity-row"]').first()).toBeVisible();
    }
  });

  test("shows relation badge and readable actor/target labels", async ({ page }) => {
    const rowCount = await page.locator('[data-testid="user-activity-row"]').count();
    test.skip(rowCount === 0, "No user activity rows found in environment");

    await expect(page.locator('[data-testid="user-activity-relation"]').first()).toBeVisible();

    const actorReadable = await page
      .locator('[data-testid="user-activity-actor"]')
      .evaluateAll((cells) => {
        return cells.some((cell) => {
          const primary = (cell.querySelector("div")?.textContent || "").trim();
          return Boolean(primary) && !/^[0-9a-f]{8}\.\.\.[0-9a-f]{4}$/i.test(primary) && primary !== "-";
        });
      });

    const targetReadable = await page
      .locator('[data-testid="user-activity-target"]')
      .evaluateAll((cells) => {
        return cells.some((cell) => {
          const primary = (cell.querySelector("div")?.textContent || "").trim();
          return Boolean(primary) && primary !== "target:-";
        });
      });

    expect(actorReadable).toBeTruthy();
    expect(targetReadable).toBeTruthy();
  });

  test("search filters activity results", async ({ page }) => {
    const rows = page.locator('[data-testid="user-activity-row"]');
    const initialCount = await rows.count();
    test.skip(initialCount === 0, "No user activity rows found in environment");

    const firstActionRaw =
      ((await page.locator('[data-testid="user-activity-action-raw"]').first().textContent()) || "")
        .trim()
        .toLowerCase();
    test.skip(!firstActionRaw, "Missing action text for filter test");

    const token = firstActionRaw.split(/[\s_.:-]+/).find(Boolean) || firstActionRaw;

    await page
      .locator('input[placeholder="Search action, actor, target"]')
      .fill(token);
    await page.getByTestId("activity-apply-filters").click();

    const filteredCount = await page.locator('[data-testid="user-activity-row"]').count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test("opens details drawer and keeps raw payload collapsed by default", async ({ page }) => {
    const firstRow = page.locator('[data-testid="user-activity-row"]').first();
    test.skip((await firstRow.count()) === 0, "No user activity rows found in environment");

    await firstRow.click();
    await expect(page.getByTestId("user-activity-drawer")).toBeVisible();
    await expect(page.getByTestId("user-activity-raw-payload")).toHaveCount(0);

    await page.getByText("Raw payload", { exact: false }).click();
    await expect(page.getByTestId("user-activity-raw-payload")).toBeVisible();
  });
});
