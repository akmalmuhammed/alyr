import { siteMetadata } from "../../../_site/document";
import { ProductPage } from "../../../_site/ProductPage";

export const metadata = siteMetadata("ar", "chat");

export default function Page() {
  return <ProductPage locale="ar" />;
}
