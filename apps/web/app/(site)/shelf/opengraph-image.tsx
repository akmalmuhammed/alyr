import { copy } from "../../_site/copy";
import { cardSize, cardTitle, socialCard } from "../../_site/socialCard";

// ALYR Shelf's card: its name and state as the eyebrow (the page's opening shows the state alone), headline and two facts. No price. The eyebrow already
// says "With every product", so the card's facts are the count and the last one.
const hero = copy.en.pages.shelf.hero;
const title = cardTitle(hero.title);

export const alt = `ALYR Shelf. ${title.join(" ")}`;
export const size = cardSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return socialCard({ eyebrow: `${copy.en.products.items.shelf.name} · ${hero.eyebrow}`, title, facts: [hero.facts[2], hero.facts[1]] });
}
