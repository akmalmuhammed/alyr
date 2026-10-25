import { copy } from "../../_site/copy";
import { cardSize, cardWrap, socialCard } from "../../_site/socialCard";

// The guides' index card (ALY-233): its title and the three guides' names.
const g = copy.en.guides;

export const alt = `ALYR: ${g.title}`;
export const size = cardSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return socialCard({ eyebrow: g.crumb, title: cardWrap(g.title, 24), facts: [] });
}
