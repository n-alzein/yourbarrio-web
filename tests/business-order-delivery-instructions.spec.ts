import { test, expect } from "@playwright/test";

const businessEmail = process.env.E2E_BUSINESS_EMAIL;
const businessPassword = process.env.E2E_BUSINESS_PASSWORD;

const seededInstructions = "Leave at side gate\nRing twice";

const seededOrders = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    order_number: "BIZ-1001",
    user_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    vendor_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    status: "requested",
    fulfillment_type: "delivery",
    contact_name: "Customer One",
    contact_phone: "(555) 111-2222",
    contact_email: "customer.one@example.com",
    delivery_address1: "101 Main St",
    delivery_address2: "Apt 2",
    delivery_city: "Austin",
    delivery_state: "TX",
    delivery_postal_code: "78701",
    delivery_instructions: seededInstructions,
    delivery_time: null,
    pickup_time: null,
    subtotal: 20,
    fees: 3,
    total: 23,
    created_at: "2026-02-20T12:00:00.000Z",
    order_items: [
      {
        id: "item-1",
        title: "Tacos",
        quantity: 2,
        unit_price: 10,
      },
    ],
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    order_number: "BIZ-1002",
    user_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    vendor_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    status: "requested",
    fulfillment_type: "delivery",
    contact_name: "Customer Two",
    contact_phone: "(555) 333-4444",
    contact_email: "customer.two@example.com",
    delivery_address1: "202 Oak Ave",
    delivery_address2: null,
    delivery_city: "Austin",
    delivery_state: "TX",
    delivery_postal_code: "78702",
    delivery_instructions: "   ",
    delivery_time: null,
    pickup_time: null,
    subtotal: 15,
    fees: 2,
    total: 17,
    created_at: "2026-02-21T12:00:00.000Z",
    order_items: [
      {
        id: "item-2",
        title: "Burrito",
        quantity: 1,
        unit_price: 15,
      },
    ],
  },
];

test.describe("Business order delivery instructions", () => {
  test("shows delivery instructions only when non-empty", async ({ page }) => {
    test.skip(
      !businessEmail || !businessPassword,
      "Set E2E_BUSINESS_* env vars"
    );

    await page.route("**/api/business/orders?tab=*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ orders: seededOrders }),
      });
    });

    await page.goto("/business-auth/login");
    await page.locator("#business-login-email").fill(businessEmail!);
    await page.locator("#business-login-password").fill(businessPassword!);
    await page.getByRole("button", { name: /log in/i }).click();

    await page.goto("/business/orders");

    const firstOrderRow = page.locator("tr", { hasText: "Order BIZ-1001" });
    await firstOrderRow.getByRole("button", { name: "View" }).click();

    await expect(page.getByRole("heading", { name: "Order BIZ-1001" })).toBeVisible();
    await expect(page.getByText("Delivery instructions", { exact: true })).toBeVisible();
    await expect(page.getByText(seededInstructions, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Close order details/i }).click();

    const secondOrderRow = page.locator("tr", { hasText: "Order BIZ-1002" });
    await secondOrderRow.getByRole("button", { name: "View" }).click();

    await expect(page.getByRole("heading", { name: "Order BIZ-1002" })).toBeVisible();
    await expect(page.getByText("Delivery instructions", { exact: true })).toHaveCount(0);
  });
});
