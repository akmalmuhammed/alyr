import type { Metadata } from "next";

// A customer's own document link is in the address (`?t=`). The page it opens is not to be
// indexed, and a link on the page must not carry the token away in a referrer.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true },
};

export default function DocumentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
