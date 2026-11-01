import { test as base, expect, type Browser, type BrowserContext, type TestInfo } from "@playwright/test";

// The API limits sign-in codes, sign-ups, orders and bookings per visitor address (core/ratelimit.py,
// ALY-116), and every browser here comes from one machine, so one address would couple the tests:
// the eleventh business made in an hour would be refused, and a retry would eat into the next
// test's allowance. The e2e API is started with ALYR_CLIENT_IP_HEADER=x-e2e-address (the setting
// that says where a visitor's address is read from, with no signing keys: fine on a throwaway local
// stack) and every test writes its own address in that header. The limits stay on and are still
// what they are in production; they just count each test as a visitor of its own.

export const ADDRESS_HEADER = "x-e2e-address";

type ContextOptions = NonNullable<Parameters<Browser["newContext"]>[0]>;

/** A visitor address that is the same for one attempt of one test and different for every other. */
export function addressFor(info: Pick<TestInfo, "testId" | "retry" | "repeatEachIndex" | "project">): string {
  let hash = 2166136261;
  for (const char of `${info.testId}/${info.project.name}/${info.retry}/${info.repeatEachIndex}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return `10.${(hash >>> 16) & 255}.${(hash >>> 8) & 255}.${hash & 255}`;
}

/** A browser of someone else (a customer, a visitor, a second person), as this test's visitor, signed in only if `storageState` says so. */
export async function visitor(
  browser: Browser,
  info: TestInfo,
  options: { storageState?: ContextOptions["storageState"] } = {},
): Promise<BrowserContext> {
  return browser.newContext({
    ...info.project.use,
    storageState: options.storageState,
    extraHTTPHeaders: { [ADDRESS_HEADER]: addressFor(info) },
  });
}

// Every page of every test, and its `request`, is that test's visitor.
export const test = base.extend<{ asVisitor: void }>({
  asVisitor: [
    async ({ context }, use, info) => {
      await context.setExtraHTTPHeaders({ [ADDRESS_HEADER]: addressFor(info) });
      await use();
    },
    { auto: true },
  ],
});

export { expect };
