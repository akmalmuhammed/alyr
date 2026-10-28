import { copy } from "../../_site/copy";
import { cardSize, cardTitle, socialCard } from "../../_site/socialCard";

// ALYR Chat's card: its name and state as the eyebrow (the page's opening shows the state alone), headline and first two facts.
const p = copy.en.product;
const title = cardTitle([p.title]);

export const alt = `ALYR Chat. ${title.join(" ")}`;
export const size = cardSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return socialCard({ eyebrow: `${copy.en.products.items.chat.name} · ${p.eyebrow}`, title, facts: p.facts.slice(0, 2).map((fact) => fact.title) });
}
