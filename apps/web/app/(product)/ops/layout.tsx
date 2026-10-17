import type { Metadata } from "next";
import { Shell } from "./Shell";

export const metadata: Metadata = {
  title: "ALYR console",
  description: "ALYR's internal console for clients, prices and onboarding. Staff only.",
};

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
