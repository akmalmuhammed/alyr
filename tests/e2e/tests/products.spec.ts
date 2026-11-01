import { expect, test } from "../support/test";
import { AUTH, SEEDED } from "../support/env";

// Journey C: the owner's Products screen lists the six ALYR products, and switching one off hides
// its screens but keeps every record; switching it back on brings the same records back.
//
// The one test that changes the demo shop's switches. It uses ALYR Accounts (the credit ledger,
// which nothing else in these journeys reads) and puts it back on whatever happens.

test.use({ storageState: AUTH.owner });

const PRODUCTS = ["ALYR Chat", "ALYR Bookings", "ALYR Agent", "ALYR Accounts", "ALYR Shelf", "ALYR Docs"];

test.afterEach(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, storageState: AUTH.owner });
  const restored = await api.post("/api/workspace/products/accounts/enable");
  expect(restored.status(), "ALYR Accounts is put back on for the next run").toBeLessThan(300);
  await api.dispose();
});

test("the Products screen lists all six products, and switching one off keeps its records", async ({ page }) => {
  await page.goto("/app/products");
  await expect(page.getByRole("heading", { name: "Products", level: 1 })).toBeVisible();
  for (const name of PRODUCTS) {
    await expect(page.getByRole("heading", { name, level: 2 }), `${name} is listed`).toBeVisible();
  }
  // Agent comes with every business and has no switch; the other five do.
  await expect(page.getByRole("switch")).toHaveCount(PRODUCTS.length - 1);

  // The records, as the owner sees them now.
  const ledger = page.getByRole("navigation", { name: SEEDED.shopName }).getByRole("link", { name: "Credit accounts" });
  await ledger.click();
  await expect(page.getByRole("heading", { name: "Credit ledger", level: 1 })).toBeVisible();
  const owed = page.getByText(/customers? owe money/);
  await expect(owed).toBeVisible();
  const before = (await owed.innerText()).trim();
  expect(before).toMatch(/^\d+ customers? owe money$/);
  const rows = await page.getByRole("row").count();
  expect(rows, "the ledger has customers in it").toBeGreaterThan(1);

  // Switch ALYR Accounts off: it asks first, then its screen leaves the menu and the owner's way in is closed.
  await page.goto("/app/products");
  await page.getByRole("switch", { name: "ALYR Accounts" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Nothing is deleted");
  await confirm.getByRole("button", { name: "Switch off" }).click();
  await expect(page.getByRole("switch", { name: "ALYR Accounts" })).toHaveAttribute("aria-checked", "false");
  await expect(ledger, "its screen is gone from the menu").toHaveCount(0);
  await page.goto("/app/ledger");
  await expect(page.getByRole("heading", { name: "Credit ledger", level: 1 }), "and its address does not open it").toHaveCount(0);

  // Switch it on again: the same records are there.
  await page.goto("/app/products");
  await page.getByRole("switch", { name: "ALYR Accounts" }).click();
  await expect(page.getByRole("switch", { name: "ALYR Accounts" })).toHaveAttribute("aria-checked", "true");
  await expect(ledger).toBeVisible();
  await ledger.click();
  await expect(page.getByText(/customers? owe money/)).toHaveText(before);
  expect(await page.getByRole("row").count(), "no customer was lost").toBe(rows);
});
