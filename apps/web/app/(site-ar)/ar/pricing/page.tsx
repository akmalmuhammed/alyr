import { siteMetadata } from "../../../_site/document";
import { PricingPage } from "../../../_site/PricingPage";

export const metadata = siteMetadata("ar", "pricing");

export default function Page() {
  return <PricingPage locale="ar" />;
}
