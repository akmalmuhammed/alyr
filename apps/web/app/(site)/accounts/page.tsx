import { siteMetadata } from "../../_site/document";
import { AccountsPage } from "../../_site/AccountsPage";

export const metadata = siteMetadata("en", "accounts");

export default function Page() {
  return <AccountsPage locale="en" />;
}
