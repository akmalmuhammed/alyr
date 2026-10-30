import type { Metadata } from "next";

// The sales link's page (ALY-216, D-105). The address carries a signed token, so the page keeps
// it to itself: it is not mounted under the sign-up layout (no analytics script is loaded here),
// it is not indexed, and it sends no referrer, so the terms pages it links to never see it.
export const metadata: Metadata = {
  title: "Your offer · ALYR",
  description: "The offer ALYR prepared for your business.",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
