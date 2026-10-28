// The public ALYR site's only server code: move plain connections to HTTPS, send every
// other address to the main one, then serve the static files. alyr.qa is the main address (a local Qatari domain);
// alyr.online and the www forms redirect to it so search engines see one site.
const MAIN = "alyr.qa";

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Never serve the site over a plain connection: browsers mark it "Not secure".
    if (url.protocol === "http:") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    // REDIRECT is "on" once the main address serves over HTTPS. Until then every address
    // serves the site itself, so nobody is sent to an address that does not answer yet.
    if (env.REDIRECT === "on" && url.hostname !== MAIN) {
      url.hostname = MAIN;
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    // Product analytics (D-070): visitors' browsers send page views and button presses to
    // alyr.qa/ingest, and this forwards them to PostHog's EU region without the visitor's
    // address (PostHog is set to discard IPs; the cookieless count uses its own daily salt).
    if (url.pathname.startsWith("/ingest/")) return forward(request, url);
    const response = await env.ASSETS.fetch(request);
    // A pull request's preview (a version URL on workers.dev) is never indexed: search
    // engines only ever see alyr.qa.
    if (env.PREVIEW === "on") {
      const preview = new Response(response.body, response);
      preview.headers.set("X-Robots-Tag", "noindex, nofollow");
      return preview;
    }
    return response;
  },
};

async function forward(request, url) {
  const assets = url.pathname.startsWith("/ingest/static/");
  const target = new URL(url.pathname.replace(/^\/ingest/, "") + url.search,
    assets ? "https://eu-assets.i.posthog.com" : "https://eu.i.posthog.com");
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  // The cookieless count needs the visitor's address for a moment; PostHog discards it.
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) headers.set("X-Forwarded-For", ip);
  return fetch(new Request(target, {
    method: request.method, headers, body: request.body, redirect: "manual",
  }));
}

export default worker;
