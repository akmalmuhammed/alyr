import { expect, test } from "../support/test";
import type { Page } from "@playwright/test";
import { businessTypes, newApi, unique } from "../support/api";
import { placeBooking, placeOrder } from "../support/customer";
import { expectNoSidewaysScroll, shownCode } from "../support/page";
// The sign-up screens' own words, in both languages, so a rewording does not break a journey.
import { COPY, type Lang } from "../../../apps/web/app/(product)/start/copy.ts";

// Journey A: a new owner signs up on their own, and ends on the plan step saying ALYR is
// preparing their price. It is the way every self-serve client starts, so it runs in English on a
// laptop and on a phone (390 px, the `phone` project), and in Arabic, right to left. Nothing is
// made up: the code is read off the page (a local API shows it instead of emailing it), the test
// line is the real simulator channel, and the customer's order or booking goes through the real
// order and booking pages.

type Words = (typeof COPY)[Lang];

/** Signs up as a new owner: email, the code, the kind of business, the basics, the terms. */
async function signUpAs(page: Page, t: Words, { typeName, owner, business }: { typeName: string; owner: string; business: string }) {
  await page.goto("/start");
  await page.getByLabel(t.account.email).fill(`${unique("owner")}@shop.example`);
  await page.getByRole("button", { name: t.account.send }).click();

  await expect(page.getByRole("heading", { name: t.account.codeTitle })).toBeVisible();
  await page.getByLabel(t.account.code, { exact: true }).fill(await shownCode(page));
  await page.getByRole("button", { name: t.account.verify, exact: true }).click();

  await expect(page.getByRole("heading", { name: t.type.title })).toBeVisible();
  await page.getByRole("radio", { name: typeName }).click();
  await page.getByRole("button", { name: t.continue, exact: true }).click();

  await page.getByLabel(t.basics.owner, { exact: true }).fill(owner);
  await page.getByRole("textbox", { name: `${t.basics.name} ${t.basics.nameHint}`, exact: true }).fill(business);
  // The notices to accept arrive a moment after the form: wait for them, then tick every one.
  const terms = page.getByRole("group", { name: t.terms.legend });
  await expect(terms).toBeVisible();
  for (const box of await terms.getByRole("checkbox").all()) await box.check();
  await expectNoSidewaysScroll(page, "the basics step");
  await page.getByRole("button", { name: t.basics.create }).click();
}

/** The link a test line message was answered with, as a path the web app opens. */
async function linkInChat(page: Page, kind: "s" | "b"): Promise<string> {
  const link = page.getByRole("link", { name: new RegExp(`/${kind}/[\\w-]+\\?t=`) }).filter({ visible: true }).first();
  await expect(link, "the test line answers with the owner's own link").toBeVisible();
  const url = new URL((await link.getAttribute("href"))!);
  expect(url.searchParams.get("t"), "the link is signed, it carries no contact ID").toBeTruthy();
  return `${url.pathname}${url.search}`;
}

test("a new bakery owner signs up, orders on the test line and reaches the plan @phone", async ({ page, context }) => {
  const t = COPY.en;
  const bakery = (await businessTypes(await newApi(test.info()))).find((x) => x.key === "bakery")!;
  const business = unique("Bakery");
  const item = unique("Date cake");

  await signUpAs(page, t, { typeName: bakery.name.en, owner: "Hamad", business });

  // What you sell: the starter list is there; add one of the owner's own.
  await expect(page.getByRole("heading", { name: t.products.title })).toBeVisible();
  await page.getByRole("textbox", { name: t.products.newName, exact: true }).fill(item);
  await page.getByRole("textbox", { name: t.products.newNameAr, exact: true }).fill("كعكة التمر");
  await page.getByRole("textbox", { name: t.products.newPrice, exact: true }).fill("40");
  await page.getByRole("button", { name: t.products.addIt, exact: true }).click();
  await expect(page.getByRole("textbox", { name: `${t.products.price}: ${item}` })).toHaveValue("40");
  await expectNoSidewaysScroll(page, "what you sell");
  await page.getByRole("button", { name: t.continue, exact: true }).click();

  // Pickup, delivery and payment: the defaults are right for a bakery.
  await expect(page.getByRole("heading", { name: t.handover.title })).toBeVisible();
  await page.getByRole("button", { name: t.handover.save }).click();

  // The private test line: say "menu", open the link the shop answers with, order, come back.
  await expect(page.getByRole("heading", { name: t.tryOrder.title })).toBeVisible();
  await expect(page.getByRole("button", { name: t.continue, exact: true }), "Continue waits for a test order").toBeDisabled();
  await expectNoSidewaysScroll(page, "the test line");
  await page.getByRole("button", { name: t.tryOrder.suggestions[1], exact: true }).click();
  const customer = await context.newPage();
  const number = await placeOrder(customer, await linkInChat(page, "s"), item);
  await customer.close();

  // "It works. Order #1001 came in, …": the sentence up to where the amount starts.
  await expect(page.getByRole("status").filter({ hasText: t.tryOrder.worked(number, "AMOUNT").split("AMOUNT")[0].trim() })).toBeVisible();
  await page.getByRole("button", { name: t.continue, exact: true }).click();

  // The plan: a person at ALYR sets the price, and the screen says so.
  await expect(page.getByRole("heading", { name: t.plan.title })).toBeVisible();
  await expect(page.getByText(t.plan.preparing)).toBeVisible();
  await expectNoSidewaysScroll(page, "the plan step");
  const quote = await (await page.request.get("/api/onboarding/quote")).json();
  expect(quote.status, "the API agrees: no price is published yet").toBe("preparing");
});

test("a new salon owner signs up in Arabic, books on the test line and reaches the plan", async ({ page, context }) => {
  const t = COPY.ar;
  const salon = (await businessTypes(await newApi(test.info()))).find((x) => x.key === "salon")!;

  await page.goto("/start");
  // The page is hydrated once it has loaded its first step: only then does the language switch work.
  await expect(page.getByLabel(COPY.en.account.email)).toBeVisible();
  await page.getByRole("button", { name: COPY.en.lang }).click();
  await expect(page.getByLabel(t.account.email)).toBeVisible();
  await signUpAs(page, t, { typeName: salon.name.ar, owner: "فاطمة", business: unique("Salon") });

  // Everything the owner reads from here is Arabic and runs right to left.
  const heading = page.getByRole("heading", { name: t.services.title });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveCSS("direction", "rtl");
  await expectNoSidewaysScroll(page, "the services step");
  await page.getByRole("button", { name: t.continue, exact: true }).click();
  await expect(page.getByRole("heading", { name: t.hours.title })).toBeVisible();
  await page.getByRole("button", { name: t.continue, exact: true }).click();

  await expect(page.getByRole("heading", { name: t.try.title })).toBeVisible();
  await page.getByRole("button", { name: t.try.suggestions[2], exact: true }).click();
  const customer = await context.newPage();
  // The customer wrote to the shop in Arabic, so the booking page answers in Arabic.
  await placeBooking(customer, await linkInChat(page, "b"), "ar");
  await customer.close();

  // "يعمل. حجزت …": the sentence up to where what was booked starts.
  await expect(page.getByRole("status").filter({ hasText: t.try.worked("BOOKED").split("BOOKED")[0].trim() })).toBeVisible();
  await page.getByRole("button", { name: t.continue, exact: true }).click();

  const plan = page.getByRole("heading", { name: t.plan.title });
  await expect(plan).toBeVisible();
  await expect(plan).toHaveCSS("direction", "rtl");
  await expect(page.getByText(t.plan.preparing)).toBeVisible();
  await expectNoSidewaysScroll(page, "the plan step");
});
