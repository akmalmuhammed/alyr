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

export default worker;
