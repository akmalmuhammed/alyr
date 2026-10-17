import { siteMetadata } from "../../_site/document";
import { AgentPage } from "../../_site/AgentPage";

export const metadata = siteMetadata("en", "agent");

export default function Page() {
  return <AgentPage locale="en" />;
}
