import type { Lang } from "../../_workspace/lang";

/** Reads the address fragment of the one-time sign-in link in the "your workspace is ready"
 *  email: `#t=<token>&l=ar`. The fragment never reaches a server, a log or a Referer header. A
 *  token that cannot be one of ours is dropped, so the page says the link is incomplete. */
export function fromHash(hash: string): { token: string; lang: Lang | null } {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("t") ?? "";
  const lang = params.get("l");
  return {
    token: /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : "",
    lang: lang === "ar" || lang === "en" ? lang : null,
  };
}
