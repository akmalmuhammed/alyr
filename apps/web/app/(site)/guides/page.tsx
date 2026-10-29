import { siteMetadata } from "../../_site/document";
import { GuidesIndex } from "../../_site/GuidePage";

export const metadata = siteMetadata("en", "guides");

export default function Page() {
  return <GuidesIndex locale="en" />;
}
