import { copy } from "../_site/copy";
import { OFFER_LIVE } from "../_site/site";
import { cardTitle, socialCard } from "../_site/socialCard";

// The homepage's card at /opengraph-image, which every public page without its own names
// (siteMetadata in _site/document.tsx; the Arabic pages among them: see socialCard.tsx for
// why the card is in English). It is a plain route, not the opengraph-image file convention:
// at the top of app/ that convention was read for every page, the product's among them, before
// any layout had set the site's address, so their link previews pointed at localhost (CJ-19).
// Inside (site) Next would name it with a hash, and the static site serves it by this name
// (scripts/build-site.sh). The product's pages that want the card name it (start/layout.tsx);
// a customer's link shows no ALYR card.
export const dynamic = "force-static";

const t = copy.en.home.hero;

export function GET() {
  return socialCard({ eyebrow: t.eyebrow, title: cardTitle(t.title), facts: OFFER_LIVE ? t.facts : t.factsNoOffer });
}
