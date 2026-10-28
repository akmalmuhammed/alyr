// app.alyr.qa and api.alyr.qa in front of Cloud Run in Doha (D-060, ALY-219).
//
// Cloud Run's own custom domains are refused in me-central1, so this Worker forwards each
// request unchanged to the service's run.app address and points redirects back at the
// public name. Nothing is stored here: no cache, no logs kept (observability is off).

type Env = { WEB_ORIGIN: string; API_ORIGIN: string };

const ORIGINS: Record<string, keyof Env> = {
  "app.alyr.qa": "WEB_ORIGIN",
  "api.alyr.qa": "API_ORIGIN",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = ORIGINS[url.hostname];
    if (!origin) return new Response("Not found", { status: 404 });
    const upstream = new URL(env[origin]);
    const target = new URL(url.pathname + url.search, upstream);

    const headers = new Headers(request.headers);
    // Who asked, as Cloud Run and the API's rate limits should see it.
    headers.set("X-Forwarded-Host", url.hostname);
    headers.set("X-Forwarded-Proto", "https");
    const client = request.headers.get("CF-Connecting-IP");
    if (client) headers.set("X-Forwarded-For", client);

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
