import { expect, test } from "../support/test";
import type { Page } from "@playwright/test";
import { newApi, signUp } from "../support/api";
import { SEEDED } from "../support/env";
import { COPY } from "../../../apps/web/app/(product)/login/copy.ts";

// Journey B: sign in at /login, and land where the page that sent you there wanted you.
// Starts signed out, and signs in through the page (the code a local API shows is typed in).

test.use({ storageState: { cookies: [], origins: [] } });

const t = COPY.en;

async function signInAt(page: Page, address: string, email: string) {
  await page.goto(address);
  await page.getByLabel(t.email).fill(email);
  await page.getByRole("button", { name: t.send }).click();
  const code = (await page.locator("b", { hasText: /^\d{6}$/ }).innerText()).trim();
  await page.getByLabel(t.code, { exact: true }).fill(code);
  await page.getByRole("button", { name: t.signIn, exact: true }).click();
}

test("ALYR staff who are sent to sign in from the back office come back to that page", async ({ page }) => {
  await signInAt(page, "/login?next=/ops/clients", SEEDED.staff);
  await expect(page).toHaveURL(/\/ops\/clients$/);
  await expect(page.getByRole("heading", { name: "Clients", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Console" })).toBeVisible();
});

// The two tests below sign a new owner in (a new address each time, so the per-email limit on
// codes never sees the same one twice).
test("an owner who is not ALYR staff lands in their workspace, not at the closed door", async ({ page }) => {
  const shop = await signUp(await newApi(test.info()), { type: "salon" });
  await signInAt(page, "/login?next=/ops/clients", shop.email);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("navigation", { name: shop.name })).toBeVisible();
});

test("a ?next= that points off the site is ignored", async ({ page, baseURL }) => {
  const shop = await signUp(await newApi(test.info()), { type: "salon" });
  await signInAt(page, "/login?next=https://evil.example/ops", shop.email);
  await expect(page).toHaveURL(/\/app$/);
  expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
});
