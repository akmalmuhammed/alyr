import { expect, test, visitor } from "../support/test";
import { customerLink, customerPhone, newApi, signUp } from "../support/api";
import { placeBooking } from "../support/customer";

// Journey E: a customer books on /b/<shop>, and the owner sees the booking. The customer starts
// with "I want to book" to the shop's WhatsApp (the simulator channel) and opens the link the
// shop answers with. The shop is a new salon made the way sign-up makes it, with the starter
// services and opening hours it gets.

test("a customer books on the booking page and the owner sees the booking", async ({ browser }) => {
  const api = await newApi(test.info());
  const shop = await signUp(api, { type: "salon" });

  const phone = customerPhone();
  const link = await customerLink(api, { shop: shop.slug, phone, say: "I want to book" });
  expect(link.path, "the link is for this shop's booking page").toMatch(new RegExp(`^/b/${shop.slug}\\?t=`));

  const customer = await visitor(browser, test.info());
  const customerPage = await customer.newPage();
  const booked = await placeBooking(customerPage, link.path);
  await expect(customerPage.getByText(booked.service)).toBeVisible();
  await customer.close();

  // The booking is tomorrow, so the owner opens tomorrow in the day view.
  const owner = await visitor(browser, test.info(), { storageState: await api.storageState() });
  const ownerPage = await owner.newPage();
  await ownerPage.goto("/app/bookings");
  await expect(ownerPage.getByRole("heading", { name: "Bookings", level: 1 })).toBeVisible();
  await ownerPage.getByRole("button", { name: "Next day" }).click();
  await expect(ownerPage.getByText("1 booking", { exact: true }), "tomorrow has the one booking").toBeVisible();
  await expect(ownerPage.getByText(booked.service).first(), "and it is the service the customer chose").toBeVisible();
  await owner.close();
  await api.dispose();
});
