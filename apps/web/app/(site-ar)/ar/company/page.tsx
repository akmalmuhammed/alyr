import { siteMetadata } from "../../../_site/document";
import { CompanyPage } from "../../../_site/CompanyPage";

export const metadata = siteMetadata("ar", "company");

export default function Page() {
  return <CompanyPage locale="ar" />;
}
