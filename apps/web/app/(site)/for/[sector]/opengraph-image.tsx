import { copy } from "../../../_site/copy";
import { SECTORS, type SectorKey } from "../../../_site/site";
import { cardSize, cardWrap, socialCard } from "../../../_site/socialCard";

// A sector page's card: the trade as the eyebrow, its question as the headline, and the
// products the page names (ALY-232). English only, as every card (socialCard.tsx).
const t = copy.en;

export const alt = t.sectors.card;
export const size = cardSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return SECTORS.map((sector) => ({ sector }));
}

export default async function OpenGraphImage({ params }: { params: Promise<{ sector: string }> }) {
  const { sector } = await params;
  const s = t.sectors.items[sector as SectorKey];
  return socialCard({
    eyebrow: s.name,
    title: cardWrap(s.title),
    facts: s.products.rows.slice(0, 3).map((row) => t.products.items[row.key].name),
  });
}
