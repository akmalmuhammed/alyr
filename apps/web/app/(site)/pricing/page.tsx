import { siteMetadata } from "../../_site/document";
import { PricingPage } from "../../_site/PricingPage";

export const metadata = siteMetadata("en", "pricing");

export default function Page() {
  return <PricingPage locale="en" />;
}
