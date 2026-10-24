import { copy } from "../../_site/copy";
import { cardSize, cardTitle, socialCard } from "../../_site/socialCard";

// ALYR Bookings's card: its name and state as the eyebrow (the page's opening shows the state alone), headline and first two facts.
const hero = copy.en.pages.bookings.hero;
const title = cardTitle(hero.title);

export const alt = `ALYR Bookings. ${title.join(" ")}`;
export const size = cardSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return socialCard({ eyebrow: `${copy.en.products.items.bookings.name} · ${hero.eyebrow}`, title, facts: hero.facts.slice(0, 2) });
}
