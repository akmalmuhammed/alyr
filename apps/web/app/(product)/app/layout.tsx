import { ProductAnalytics } from "../../_analytics/ProductAnalytics";

// The workspace counts which sections owners open (D-070); see _analytics/posthog.ts for
// what is never sent.
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<ProductAnalytics /></>;
}
