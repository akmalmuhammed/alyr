import { siteMetadata } from "../../../_site/document";
import { LegalPage } from "../../../_site/LegalPage";

export const metadata = siteMetadata("ar", "refund");

export default function Page() {
  return <LegalPage locale="ar" page="refund" />;
}
