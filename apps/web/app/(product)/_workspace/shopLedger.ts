// The workspace's screens ask `/api/ledger/summary` for the credit accounts and, as a side effect,
// the shop's name. Only a shop with the credit accounts module may ask: any other is refused 403
// (seen in the end-to-end test of 30 Oct), a failed request on every load that showed nothing. So the screens
// ask only where the module is on, and the shop's name comes from the workspace for the rest.
// Plain TypeScript with no React, so `shopLedger.test.mjs` runs it under Node.

export type ShopNames = { name: string; name_ar?: string | null };

/** Whether to ask for the credit accounts summary. `modules` is the workspace's list of what is on
 * for this shop; the sales demo (which has no such list) has every module and always asks. */
export function asksLedgerSummary(modules: readonly string[] | undefined): boolean {
  return modules === undefined || modules.includes("ledger");
}

/** The shop's name in the language on screen: the summary's when the shop has one, else the
 * workspace's. Arabic falls back to the English name where no Arabic one was written. */
export function shopNameShown(
  lang: "en" | "ar", summaryShop: ShopNames | undefined, business: ShopNames | undefined,
): string {
  const shop = summaryShop ?? business;
  if (!shop) return "";
  return (lang === "ar" ? shop.name_ar : null) || shop.name;
}
