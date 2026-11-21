import { expect, test, visitor } from "../support/test";
import { customerLink, customerPhone, newApi, signUp } from "../support/api";
import { placeOrder } from "../support/customer";
import { expectNoSidewaysScroll } from "../support/page";

// Journey G: the redesigned workspace, behind a switch. Every visitor gets the classic shell; an owner
// who writes `?ui=2` on a section that has a redesigned screen gets the new shell and that screen,
// on the shop's real data, and the choice is remembered for that section on that device until they
// write `?ui=1` (or press "Classic view"). A section with no redesigned screen stays classic whatever
// the address says. The shop is a new bakery with one real order, made through the order page the
// way a customer makes one (journey D), so nothing here is sample data. Runs on a laptop and at 390 px.

test("the classic workspace is the default; ?ui=2 opens the redesigned sections on real data, is remembered, and can be undone @phone", async ({ browser }) => {
  test.setTimeout(180_000);
  const api = await newApi(test.info());
  const shop = await signUp(api, { type: "bakery" });
  const item = `Date cake ${shop.slug.slice(-6)}`;
  const made = await api.post("/api/items", { data: { name: item, name_ar: "كعكة التمر", price: 4000, status: "live" } });
  expect(made.status(), "the owner puts an item on sale").toBeLessThan(300);
  const pays = await api.patch("/api/onboarding/steps/payments", { data: { choice: "cash_transfer" } });
  expect(pays.status(), "the owner chooses how customers pay").toBe(200);

  const phone = customerPhone();
  const link = await customerLink(api, { shop: shop.slug, phone, say: "menu" });
  const customer = await visitor(browser, test.info());
  const customerPage = await customer.newPage();
  const number = await placeOrder(customerPage, link.path, item);
  await customer.close();

  const owner = await visitor(browser, test.info(), { storageState: await api.storageState() });
  const page = await owner.newPage();
  const onPhone = (page.viewportSize()?.width ?? 1280) < 768;
  const classic = page.locator(".sh");
  const redesigned = page.locator(".ns-frame");
  const remembered = () => page.evaluate(() => localStorage.getItem("alyr-ui-choice"));

  // 1. Nobody chose: the classic shell, and nothing remembered.
  await page.goto("/app/orders");
  await expect(classic, "the classic shell is the default").toBeVisible();
  await expect(redesigned).toHaveCount(0);
  expect(await remembered()).toBeNull();

  // 2. ?ui=2: the new shell, the new Orders screen, the order the customer placed.
  await page.goto("/app/orders?ui=2");
  await expect(redesigned, "the redesigned shell opens").toBeVisible();
  await expect(page.getByRole("heading", { name: "Orders", level: 1 })).toBeVisible();
  // A table row at desktop width, a card on a phone: the number, the item and the total are there either way.
  await expect(page.getByText(`#${number}`).first(), "the real order is in the redesigned list").toBeVisible();
  await expect(page.getByText(item).first()).toBeVisible();
  await expect(page.getByText("QAR 40").first()).toBeVisible();
  if (onPhone) await expect(page.locator(".ns-tabbar")).toBeVisible();
  else await expect(page.locator(".ns-side")).toBeVisible();
  await expectNoSidewaysScroll(page, "the redesigned Orders");
  expect(await remembered()).toContain('"orders":2');

  // 3. Remembered: the same section without the query is still the new look, another section is not.
  await page.goto("/app/orders");
  await expect(redesigned, "the choice is remembered for the section").toBeVisible();
  await page.goto("/app/products?ui=2");
  await expect(classic, "a section with no redesigned screen stays classic").toBeVisible();
  await expect(redesigned).toHaveCount(0);

  // 4. The other redesigned sections, on the shop's real data.
  await page.goto("/app/team?ui=2");
  await expect(redesigned).toBeVisible();
  await expect(page.locator("#ns-main").getByText(shop.ownerName).first(), "the real team is listed").toBeVisible();
  await expectNoSidewaysScroll(page, "the redesigned Team");

  await page.goto("/app/account?ui=2");
  await expect(redesigned).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();
  await expect(page.locator("#ns-main").getByText(shop.email).first(), "the real sign-in email is shown").toBeVisible();
  await page.goto("/app/account?view=privacy");
  await expect(page.getByRole("heading", { name: "Data and privacy", level: 1 })).toBeVisible();
  // The owner's "Close the account" has no route behind it, so no screen offers it.
  await expect(page.getByRole("button", { name: /close the account/i })).toHaveCount(0);
  await expectNoSidewaysScroll(page, "the redesigned Data and privacy");

  await page.goto("/app/inbox?ui=2");
  await expect(redesigned).toBeVisible();
  await expect(page.getByPlaceholder("Search name, number or message")).toBeVisible();
  await expectNoSidewaysScroll(page, "the redesigned Inbox");

  // 5. Back: "Classic view" (or ?ui=1) returns the section to the classic shell and it stays there.
  await page.goto("/app/orders");
  await expect(redesigned).toBeVisible();
  if (onPhone) {
    await page.goto("/app/orders?ui=1");
  } else {
    await page.getByRole("link", { name: "Classic view" }).click();
  }
  await expect(classic).toBeVisible();
  await expect(redesigned).toHaveCount(0);
  await page.goto("/app/orders");
  await expect(classic, "the classic look is remembered too").toBeVisible();

  await owner.close();
  await api.dispose();
});
