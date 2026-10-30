// What is left to go live is counted once on the workspace home (CJ-24 of the go-live audit). The
// banner lists the go-live check's steps that are not done; "Needs you now" used to add a row of
// its own, "2 setup steps left for ALYR Chat", counted from the products' steps, so the home gave
// two different numbers for the same work. While the banner shows, that row is left out, and the
// banner says its count. Plain TypeScript with no React, so `goLive.test.mjs` runs it under Node.

type Check = { status: string };

/** The go-live check's steps not done yet: the banner lists these and counts these. */
export function checksLeft<C extends Check>(checks: readonly C[] | null | undefined): C[] {
  return (checks ?? []).filter((c) => c.status !== "done");
}

/** "3 steps left", in the words and the agreement of each language. */
export const STEPS_LEFT = {
  en: (n: number) => `${n} ${n === 1 ? "step" : "steps"} left`,
  ar: (n: number) => (n === 1 ? "خطوة واحدة متبقية" : n === 2 ? "خطوتان متبقيتان" : `${n} ${n <= 10 ? "خطوات" : "خطوة"} متبقية`),
};

type Needs = { needs: { items: { key: string }[] } };

/** The Agent's view for the home, without its row of product setup steps while the go-live banner
 * is showing (that row counts a different list; see above). Otherwise the view as it is. */
export function withoutSetupRow<V extends Needs>(view: V, bannerShown: boolean): V {
  if (!bannerShown) return view;
  return { ...view, needs: { ...view.needs, items: view.needs.items.filter((item) => item.key !== "setup") } };
}
