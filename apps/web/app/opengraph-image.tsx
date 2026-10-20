import { copy } from "./_site/copy";
import { OFFER_LIVE } from "./_site/site";
import { cardSize, cardTitle, socialCard } from "./_site/socialCard";

// The homepage's card, which every page without its own also uses (the Arabic pages among
// them: see socialCard.tsx for why the card is in English).
const t = copy.en.home.hero;
const title = cardTitle(t.title);

export const alt = `ALYR. ${title.join(" ")}`;
export const size = cardSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return socialCard({ eyebrow: t.eyebrow, title, facts: OFFER_LIVE ? t.facts : t.factsNoOffer });
}
