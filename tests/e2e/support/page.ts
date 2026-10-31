import { expect, type Page } from "@playwright/test";

/**
 * The page does not scroll sideways: on a phone that is the first sign that something spilled out
 * of the screen. Polled, because a screen that has just changed may still be moving.
 */
export async function expectNoSidewaysScroll(page: Page, what: string) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
      message: `${what} should not scroll sideways`,
    })
    .toBeLessThanOrEqual(0);
}

/** The six digits a local API shows on the sign-in and sign-up pages instead of emailing them. */
export async function shownCode(page: Page): Promise<string> {
  const line = page.getByText(/\b\d{6}\b/).first();
  await expect(line).toBeVisible();
  const code = (await line.innerText()).match(/\b(\d{6})\b/)?.[1];
  expect(code, "a six digit code on the page").toBeTruthy();
  return code!;
}

/** Escapes text so it can be matched exactly inside a regular expression. */
export function exact(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}
