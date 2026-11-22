import { notFoundMetadata } from "../../_site/document";
import { NotFoundPage } from "../../_site/NotFoundPage";

// Not an address of the site: scripts/build-site.sh publishes this page's HTML as `404.html`.
export const metadata = notFoundMetadata("en");

export default function Page() {
  return <NotFoundPage locale="en" />;
}
