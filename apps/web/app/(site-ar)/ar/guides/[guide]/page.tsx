import { notFound } from "next/navigation";
import { siteMetadata } from "../../../../_site/document";
import { GuidePage } from "../../../../_site/GuidePage";
import { GUIDES, guidePage, type GuideKey } from "../../../../_site/site";

// The owner guides (ALY-233), each written out at build time.
export const dynamicParams = false;
export function generateStaticParams() {
  return GUIDES.map((guide) => ({ guide }));
}

type Props = { params: Promise<{ guide: string }> };
const known = (value: string): value is GuideKey => (GUIDES as readonly string[]).includes(value);

export async function generateMetadata({ params }: Props) {
  const { guide } = await params;
  return known(guide) ? siteMetadata("ar", guidePage(guide)) : {};
}

export default async function Page({ params }: Props) {
  const { guide } = await params;
  if (!known(guide)) notFound();
  return <GuidePage locale="ar" guide={guide} />;
}
