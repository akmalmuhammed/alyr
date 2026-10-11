import { SiteDocument, siteMetadata, siteViewport } from "../_site/document";

export const metadata = siteMetadata("ar");
export const viewport = siteViewport;

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SiteDocument locale="ar">{children}</SiteDocument>;
}
