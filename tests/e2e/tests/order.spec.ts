import { expect, test, visitor } from "../support/test";
import { customerLink, customerPhone, newApi, signUp } from "../support/api";
import { placeOrder } from "../support/customer";
import { expectNoSidewaysScroll } from "../support/page";

// Journey D: a customer places an order on the order page, and the owner sees it in Orders.
// The customer starts where a customer starts, with the word "menu" to the shop's WhatsApp
// (the simulator channel), and opens the link the shop answers with. The shop is a new bakery
// made the way sign-up makes it; it takes cash on collection, so no payment provider is involved.
// Runs on a laptop and at 390 px.

test("a customer orders from the order page and the owner sees the order in Orders @phone", async ({ page, browser }) => {
  const api = await newApi(test.info());
  const shop = await signUp(api, { type: "bakery" });
  const item = `Date cake ${shop.slug.slice(-6)}`;
  const made = await api.post("/api/items", { data: { name: item, name_ar: "كعكة التمر", price: 4000, status: "live" } });
  expect(made.status(), "the owner puts an item on sale").toBeLessThan(300);
  // What the sign-up's "Pickup, delivery and payment" step saves by default: cash or transfer on collection.
  const pays = await api.patch("/api/onboarding/steps/payments", { data: { choice: "cash_transfer" } });
  expect(pays.status(), "the owner chooses how customers pay").toBe(200);

  // The customer, on a phone of their own, with no sign-in.
  const link = await customerLink(api, { shop: shop.slug, phone: customerPhone(), say: "menu" });
  const customer = await visitor(browser, test.info());
  const customerPage = await customer.newPage();
  const number = await placeOrder(customerPage, link.path, item);
  await expectNoSidewaysScroll(customerPage, "the order page");
  await customer.close();

  // The owner, signed in, finds it in Orders.
  const owner = await visitor(browser, test.info(), { storageState: await api.storageState() });
  const ownerPage = await owner.newPage();
  await ownerPage.goto("/app/orders");
  await expect(ownerPage.getByRole("heading", { name: "Orders", level: 1 })).toBeVisible();
  const row = ownerPage.getByRole("row").filter({ hasText: `#${number}` });
  await expect(row, "the new order is in the list").toBeVisible();
  await expect(row).toContainText(`1 × ${item}`);
  await expect(row).toContainText("QAR 40");
  await expect(row).toContainText("New");
  await expectNoSidewaysScroll(ownerPage, "the Orders list");
  await owner.close();
  await api.dispose();
});
