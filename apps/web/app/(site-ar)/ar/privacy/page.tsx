import { siteMetadata } from "../../../_site/document";
import { PrivacyPage } from "../../../_site/PrivacyPage";

export const metadata = siteMetadata("ar", "privacy");

export default function Page() {
  return <PrivacyPage locale="ar" />;
}
