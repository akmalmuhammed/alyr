import type { Metadata } from "next";

// A customer's own booking link is in the address (`?t=`). No page it opens may be told it
// by the browser, and a link on the page (the shop's WhatsApp) must not carry it away.
export const metadata: Metadata = { referrer: "no-referrer" };

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
