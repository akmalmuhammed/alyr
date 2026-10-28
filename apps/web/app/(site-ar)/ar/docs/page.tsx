import { siteMetadata } from "../../../_site/document";
import { DocsPage } from "../../../_site/DocsPage";

export const metadata = siteMetadata("ar", "docs");

export default function Page() {
  return <DocsPage locale="ar" />;
}
