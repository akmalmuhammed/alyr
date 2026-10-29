import type { Metadata } from "next";
import { ProductAnalytics } from "../../_analytics/ProductAnalytics";

const title = "Set up your business · ALYR";
const description = "Set up your business on ALYR: your services, your hours, then try it as a customer.";

// The sign-up link is the one product link an owner passes on, so its preview carries the
// homepage's card, by an address on the public site (app/opengraph-image/route.tsx says why).
export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website", siteName: "ALYR", title, description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "ALYR" }],
  },
  twitter: { card: "summary_large_image", title, description },
};

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<ProductAnalytics /></>;
}
