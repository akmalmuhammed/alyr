import { copy } from "../../../_site/copy";
import { GUIDES, type GuideKey } from "../../../_site/site";
import { cardSize, cardWrap, socialCard } from "../../../_site/socialCard";

// A guide's card: "Guide · ALYR team", its title, and its date (ALY-233).
const g = copy.en.guides;

export const alt = g.card;
export const size = cardSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ guide }));
}

export default async function OpenGraphImage({ params }: { params: Promise<{ guide: string }> }) {
  const { guide } = await params;
  const d = g.items[guide as GuideKey];
  return socialCard({ eyebrow: `${g.kind} · ${g.by}`, title: cardWrap(d.title, 24), facts: [d.date] });
}
