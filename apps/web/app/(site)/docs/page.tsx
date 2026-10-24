import { siteMetadata } from "../../_site/document";
import { DocsPage } from "../../_site/DocsPage";

export const metadata = siteMetadata("en", "docs");

export default function Page() {
  return <DocsPage locale="en" />;
}
