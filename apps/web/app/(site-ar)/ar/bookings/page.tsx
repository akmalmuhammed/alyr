import { siteMetadata } from "../../../_site/document";
import { BookingsPage } from "../../../_site/BookingsPage";

export const metadata = siteMetadata("ar", "bookings");

export default function Page() {
  return <BookingsPage locale="ar" />;
}
