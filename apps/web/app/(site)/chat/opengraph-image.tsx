import { copy } from "../../_site/copy";
import { cardSize, cardTitle, socialCard } from "../../_site/socialCard";

// ALYR Chat's card: its own eyebrow, headline and first two facts.
const p = copy.en.product;
const title = cardTitle([p.title]);

export const alt = `ALYR Chat. ${title.join(" ")}`;
export const size = cardSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return socialCard({ eyebrow: p.eyebrow, title, facts: p.facts.slice(0, 2).map((fact) => fact.title) });
}
