import type { Metadata } from "next";
import { ProductAnalytics } from "../../_analytics/ProductAnalytics";

export const metadata: Metadata = {
  title: "Set up your business · ALYR",
  description: "Set up your business on ALYR: your services, your hours, then try it as a customer.",
};

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<ProductAnalytics /></>;
}
