// app.alyr.qa and api.alyr.qa in front of Cloud Run in Doha (D-060, ALY-219).
//
// Cloud Run's own custom domains are refused in me-central1, so this Worker forwards each
// request unchanged to the service's run.app address and points redirects back at the
// public name. Nothing is stored here: no cache, no logs kept (observability is off).
//
// It is also the only place that knows who the visitor is (ALY-265). The run.app addresses are
// public, so the API cannot believe a header just because it is there: this Worker writes the
// visitor's address from Cloudflare's own `CF-Connecting-IP` (never from anything the visitor
// sent) and signs it with a key only it and the API hold. The API believes an address only with
// a signature that matches; everything else it counts in one shared bucket.

type Env = { WEB_ORIGIN: string; API_ORIGIN: string; CLIENT_IP_KEY?: string };

const ORIGINS: Record<string, keyof Pick<Env, "WEB_ORIGIN" | "API_ORIGIN">> = {
  "app.alyr.qa": "WEB_ORIGIN",
  "api.alyr.qa": "API_ORIGIN",
};

const CLIENT_IP = "x-alyr-client-ip";
const CLIENT_IP_SIG = "x-alyr-client-ip-sig";
// Headers that say who the visitor is, which a visitor can write themselves: they are dropped
// and rewritten here, never forwarded. (uvicorn in the API would believe the first two.)
const ABOUT_THE_VISITOR = [CLIENT_IP, CLIENT_IP_SIG, "x-forwarded-for", "x-real-ip"];

// HMAC-SHA256 of the address, lower-case hex: what the API's `ratelimit.sign` makes, byte for
// byte (both are tested against the same three known values). A key pasted or piped with a
// newline on it is trimmed, as the API trims its own.
async function sign(key: string, address: string): Promise<string> {
  const text = new TextEncoder();
  const hmac = await crypto.subtle.importKey(
    "raw", text.encode(key.trim()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", hmac, text.encode(address)));
  return Array.from(mac, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = ORIGINS[url.hostname];
    if (!origin) return new Response("Not found", { status: 404 });
    const upstream = new URL(env[origin]);
    const target = new URL(url.pathname + url.search, upstream);

    const headers = new Headers(request.headers);
    for (const name of ABOUT_THE_VISITOR) headers.delete(name);
    headers.set("X-Forwarded-Host", url.hostname);
    headers.set("X-Forwarded-Proto", "https");
    // Who asked, as Cloud Run and the API's rate limits should see it. Without a key (not set
    // yet) the address goes unsigned, which an API that holds keys counts as nobody's.
    const client = request.headers.get("CF-Connecting-IP");
    if (client) {
      headers.set("X-Forwarded-For", client);
      headers.set(CLIENT_IP, client);
      const key = env.CLIENT_IP_KEY?.trim();
      if (key) headers.set(CLIENT_IP_SIG, await sign(key, client));
    }

    // The body is passed through byte for byte: Meta's webhook signature covers it.
    const answer = await fetch(target, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    });

    const response = new Response(answer.body, answer);
    const location = answer.headers.get("Location");
    if (location) {
      const moved = new URL(location, target);
      if (moved.host === upstream.host) {
        moved.protocol = "https:";
        moved.host = url.hostname;
        response.headers.set("Location", moved.toString());
      }
    }
    return response;
  },
} satisfies ExportedHandler<Env>;
