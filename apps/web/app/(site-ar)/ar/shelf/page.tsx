import { siteMetadata } from "../../../_site/document";
import { ShelfPage } from "../../../_site/ShelfPage";

export const metadata = siteMetadata("ar", "shelf");

export default function Page() {
  return <ShelfPage locale="ar" />;
}
