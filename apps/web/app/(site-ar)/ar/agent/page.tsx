import { siteMetadata } from "../../../_site/document";
import { AgentPage } from "../../../_site/AgentPage";

export const metadata = siteMetadata("ar", "agent");

export default function Page() {
  return <AgentPage locale="ar" />;
}
