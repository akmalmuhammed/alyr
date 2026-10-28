import { siteMetadata } from "../../../_site/document";
import { GuidesIndex } from "../../../_site/GuidePage";

export const metadata = siteMetadata("ar", "guides");

export default function Page() {
  return <GuidesIndex locale="ar" />;
}
