import { siteMetadata } from "../../_site/document";
import { LegalPage } from "../../_site/LegalPage";

export const metadata = siteMetadata("en", "refund");

export default function Page() {
  return <LegalPage locale="en" page="refund" />;
}
