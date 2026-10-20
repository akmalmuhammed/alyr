import { copy } from "../../_site/copy";
import { cardSize, cardTitle, socialCard } from "../../_site/socialCard";

// ALYR Docs's card: its own eyebrow, headline and first two facts. No price.
const hero = copy.en.pages.docs.hero;
const title = cardTitle(hero.title);

export const alt = `ALYR Docs. ${title.join(" ")}`;
export const size = cardSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return socialCard({ eyebrow: hero.eyebrow, title, facts: hero.facts.slice(0, 2) });
}
