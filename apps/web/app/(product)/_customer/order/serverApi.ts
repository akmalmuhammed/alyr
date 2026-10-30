// The web app's server asking the API on a visitor's behalf (ALY-265).
//
// The edge Worker writes who the visitor is into two headers on every request it passes to this
// app: `x-alyr-client-ip` (the address, from Cloudflare) and `x-alyr-client-ip-sig` (the edge's
// signature of it). The API counts its per-address limits by that address, and believes it only
// with that signature. So when this server asks the API for something while answering a visitor,
// the two headers go along: without them every visitor would look like this server.
//
// This server holds no key and checks nothing. It cannot make a signature, and a caller who
// reached it without passing the edge has none to pass on; the API refuses such an address and
// counts it as nobody's. What the browser asks of `/api/*` is forwarded by Next's rewrite, which
// carries every request header (checked by hand, docs/runbooks/client-address.md); this is for
// the calls the server makes itself.

export const VISITOR_HEADERS = ["x-alyr-client-ip", "x-alyr-client-ip-sig"] as const;

/** The two headers, copied from the request the server is answering; nothing else is copied. */
export function visitorHeaders(incoming: { get(name: string): string | null }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of VISITOR_HEADERS) {
    const value = incoming.get(name);
    if (value) out[name] = value;
  }
  return out;
}

type Asked<T> = { status: number; body: T | null };

/** GET `path` from the API. `token` is a customer's own link, sent in a header so that the API's
 *  request log holds none; `visitor` is `visitorHeaders(await headers())` of the page. */
export async function askApi<T>(
  api: string,
  path: string,
  options: { token?: string | null; visitor?: Record<string, string> } = {},
): Promise<Asked<T>> {
  try {
    const headers: Record<string, string> = { ...options.visitor };
    if (options.token) headers["x-order-link"] = options.token;
    const response = await fetch(`${api}${path}`, { cache: "no-store", headers });
    return { status: response.status, body: response.ok ? ((await response.json()) as T) : null };
  } catch {
    return { status: 0, body: null };
  }
}
