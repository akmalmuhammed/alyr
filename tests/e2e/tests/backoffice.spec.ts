import { expect, test, visitor } from "../support/test";
import { newApi, signUp } from "../support/api";
import { AUTH } from "../support/env";

// Journey F: the back office (/ops) is for ALYR staff. Someone who is not staff meets a closed
// door; staff see the Today queue, and a business that has just signed up is on it, waiting for
// its price.

test.describe("someone who is not ALYR staff", () => {
  test("a visitor who is signed out meets the door and a way to sign in", async ({ browser }) => {
    const stranger = await visitor(browser, test.info());
    const page = await stranger.newPage();
    await page.goto("/ops");
    await expect(page.getByRole("heading", { name: "ALYR console", level: 1 })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Sign in with your ALYR staff email" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=/ops");
    await expect(page.getByRole("navigation", { name: "Console" }), "no console menu is shown").toHaveCount(0);
    expect((await stranger.request.get("/api/admin/today")).status(), "and the console's data is refused").toBe(401);
    await stranger.close();
  });

  test("a signed-in owner meets the same door, and the console's data is refused", async ({ browser }) => {
    const api = await newApi(test.info());
    await signUp(api, { type: "salon" });
    const owner = await visitor(browser, test.info(), { storageState: await api.storageState() });
    const page = await owner.newPage();
    await page.goto("/ops");
    await expect(page.getByRole("alert").filter({ hasText: "This console is for ALYR staff only" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Console" })).toHaveCount(0);
    expect((await owner.request.get("/api/admin/today")).status()).toBe(403);
    expect((await owner.request.get("/api/admin/clients")).status()).toBe(403);
    await owner.close();
    await api.dispose();
  });
});

test.describe("ALYR staff", () => {
  test.use({ storageState: AUTH.staff });

  test("the Today queue shows a business that has just signed up, waiting for a price", async ({ page }) => {
    const api = await newApi(test.info());
    const shop = await signUp(api, { type: "bakery" });
    await api.dispose();

    await page.goto("/ops");
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Console" })).toBeVisible();
    const waiting = page.getByRole("listitem").filter({ hasText: `Price ${shop.name}` });
    await expect(waiting, "the new business is on the queue").toBeVisible();
    await expect(waiting).toContainText("To price");
    await expect(waiting).toContainText("the owner sees “preparing your price”");

    await waiting.getByRole("link", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/ops\/clients\?client=/);
    await expect(page.getByText(shop.name).first()).toBeVisible();
  });
});
