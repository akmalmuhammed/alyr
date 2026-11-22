import { NotFoundPage } from "../_site/NotFoundPage";

// For a `notFound()` thrown inside the English public pages. An address no page matches is
// answered by 404.html (see not-found-page/page.tsx and scripts/build-site.sh).
export default function NotFound() {
  return <NotFoundPage locale="en" />;
}
