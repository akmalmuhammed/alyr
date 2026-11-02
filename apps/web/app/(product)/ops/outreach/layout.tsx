import type { Metadata } from "next";
import { OutreachFrame } from "./Frame";

export const metadata: Metadata = {
  title: "Outreach · ALYR console",
  description: "ALYR's own outreach: prospects, drafts for approval, replies and the send gateway. Staff only.",
};

export default function OutreachLayout({ children }: { children: React.ReactNode }) {
  return <OutreachFrame>{children}</OutreachFrame>;
}
