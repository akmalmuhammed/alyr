import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// The client portal runs on Cloudflare Workers. No page uses the incremental cache, so the
// default (no cache) is enough; add an R2 cache here only when a page needs one.
export default defineCloudflareConfig();
