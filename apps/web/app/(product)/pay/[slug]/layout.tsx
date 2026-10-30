import type { Metadata } from "next";

// A customer's own payment link is in the address (`?t=`, SEC-8). The page it opens is not to be
// indexed, and a link on the page must not carry the token away in a referrer.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true },
};

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
