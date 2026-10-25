import { siteMetadata } from "../../_site/document";
import { ShelfPage } from "../../_site/ShelfPage";

export const metadata = siteMetadata("en", "shelf");

export default function Page() {
  return <ShelfPage locale="en" />;
}
