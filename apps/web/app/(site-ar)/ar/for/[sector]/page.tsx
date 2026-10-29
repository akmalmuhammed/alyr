import { notFound } from "next/navigation";
import { siteMetadata } from "../../../../_site/document";
import { SectorPage } from "../../../../_site/SectorPage";
import { SECTORS, sectorPage, type SectorKey } from "../../../../_site/site";

// The sector pages (ALY-232, D-057): /ar/for/bakeries ... /ar/for/fashion, each written out at
// build time; any other address under /for is not a page.
export const dynamicParams = false;
export function generateStaticParams() {
  return SECTORS.map((sector) => ({ sector }));
}

type Props = { params: Promise<{ sector: string }> };
const known = (value: string): value is SectorKey => (SECTORS as readonly string[]).includes(value);

export async function generateMetadata({ params }: Props) {
  const { sector } = await params;
  return known(sector) ? siteMetadata("ar", sectorPage(sector)) : {};
}

export default async function Page({ params }: Props) {
  const { sector } = await params;
  if (!known(sector)) notFound();
  return <SectorPage locale="ar" sector={sector} />;
}
