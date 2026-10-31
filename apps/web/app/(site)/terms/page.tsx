import { siteMetadata } from "../../_site/document";
import { LegalPage } from "../../_site/LegalPage";

export const metadata = siteMetadata("en", "terms");

export default function Page() {
  return <LegalPage locale="en" page="terms" />;
}
