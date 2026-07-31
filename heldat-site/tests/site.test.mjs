import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../public/", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const productionWranglerUrl = new URL(
  "../wrangler.jsonc",
  import.meta.url
);

const requiredFiles = [
  "index.html",
  "privacy/index.html",
  "terms/index.html",
  "support/index.html",
  "delete-account/index.html",
  "security/index.html",
  "auth/callback/index.html",
  "callback/index.html",
  "reset-password/index.html",
  "join/index.html",
  ".well-known/security.txt",
  ".well-known/assetlinks.json",
  "robots.txt",
  "sitemap.xml",
  "styles.css",
  "site.js",
  "return-to-app.0398ea7561f4.js",
  "404.html",
  "favicon.svg"
];

test("all public launch and compliance files exist", async () => {
  for (const file of requiredFiles) {
    const contents = await read(file);
    assert.ok(contents.length > 0, `${file} must not be empty`);
  }
});

test("public HTML has a title, language and viewport", async () => {
  const htmlFiles = requiredFiles.filter((file) => file.endsWith(".html"));
  for (const file of htmlFiles) {
    const html = await read(file);
    assert.match(html, /<html lang="en" dir="ltr">/);
    assert.match(html, /<meta name="viewport"/);
    assert.match(html, /<title>[^<]+<\/title>/);
  }
});

test("privacy notice covers every declared native data class", async () => {
  const privacy = (await read("privacy/index.html")).toLowerCase();
  const requiredConcepts = [
    "email address",
    "user identifier",
    "device identifier",
    "precise or approximate locations",
    "photos",
    "documents",
    "values",
    "diagnostic",
    "product interactions",
    "delete",
    "export"
  ];
  for (const concept of requiredConcepts) {
    assert.ok(privacy.includes(concept), `privacy notice must cover ${concept}`);
  }
});

test("legal and support pages expose stable Heldat contacts", async () => {
  const joined = await Promise.all([
    read("privacy/index.html"),
    read("terms/index.html"),
    read("support/index.html"),
    read("security/index.html")
  ]);
  const content = joined.join("\n");
  for (const address of [
    "support@heldat.app",
    "privacy@heldat.app",
    "security@heldat.app"
  ]) {
    assert.ok(content.includes(address), `${address} must be published`);
  }
});

test("Android app links publish only the verified Heldat identity", async () => {
  const apple = JSON.parse(
    await readFile(
      new URL("../association-templates/apple-app-site-association.json", import.meta.url),
      "utf8"
    )
  );
  const android = JSON.parse(
    await readFile(
      new URL("../association-templates/assetlinks.json", import.meta.url),
      "utf8"
    )
  );
  const publishedAndroid = JSON.parse(
    await read(".well-known/assetlinks.json")
  );
  assert.equal(
    apple.applinks.details[0].appIDs[0],
    "APPLE_TEAM_ID.app.heldat.mobile"
  );
  assert.equal(
    apple.webcredentials.apps[0],
    "APPLE_TEAM_ID.app.heldat.mobile"
  );
  assert.equal(android[0].target.package_name, "app.heldat.mobile");
  assert.deepEqual(publishedAndroid, android);
  assert.match(
    android[0].target.sha256_cert_fingerprints[0],
    /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/u
  );
});

test("no unresolved public placeholders or legacy public product name remain", async () => {
  const walk = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...(await walk(path)));
      else files.push(path);
    }
    return files;
  };
  const files = await walk(fileURLToPath(root));
  for (const file of files.filter((path) => /\.(html|txt|xml|js|css)$/.test(path))) {
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(content, /\[(?:TODO|PLACEHOLDER|APPLE_TEAM_ID|SHA256)[^\]]*\]/i);
    assert.doesNotMatch(content, /\bALYR\b/);
    assert.doesNotMatch(content, /alyr:\/\//);
    assert.doesNotMatch(content, /com\.alyr\.continuity/);
  }
});

test("worker sets baseline security headers and canonical www redirect", async () => {
  const worker = await readFile(
    new URL("../src/worker.js", import.meta.url),
    "utf8"
  );
  for (const header of [
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "Permissions-Policy",
    "Cross-Origin-Opener-Policy"
  ]) {
    assert.ok(worker.includes(header), `worker must set ${header}`);
  }
  assert.match(worker, /url\.protocol !== "https:"/);
  assert.match(worker, /url\.protocol = "https:"/);
  assert.match(worker, /url\.hostname === "www\.heldat\.app"/);
  assert.match(worker, /Response\.redirect\(url\.toString\(\), 308\)/);
  assert.match(
    worker,
    /script-src 'self' https:\/\/static\.cloudflareinsights\.com/,
    "CSP must allow only the Cloudflare performance beacon injected at the edge"
  );
  assert.match(worker, /ACCOUNT_CONTINUATION_CACHE = "no-store, no-transform"/);
  assert.match(worker, /"Referrer-Policy", "no-referrer"/);
  assert.match(worker, /"X-Robots-Tag", "noindex, nofollow, noarchive"/);
  assert.doesNotMatch(
    worker,
    /max-age=31536000, immutable/,
    "unversioned public assets must not be cached immutably"
  );
  assert.match(worker, /ACCOUNT_CONTINUATION_SCRIPT/);
  assert.match(worker, /headers\.set\("Cache-Control", "no-store"\)/);
});

test("production observability excludes automatic request invocation logs", async () => {
  const wrangler = JSON.parse(
    await readFile(productionWranglerUrl, "utf8")
  );
  assert.equal(wrangler.observability?.enabled, true);
  assert.equal(wrangler.observability?.logs?.enabled, true);
  assert.equal(
    wrangler.observability?.logs?.invocation_logs,
    false,
    "query strings and request metadata must not enter automatic invocation logs"
  );
});

test("account fallback pages preserve signed continuation parameters", async () => {
  const pages = [
    ["callback/index.html", "heldat://callback"],
    ["auth/callback/index.html", "heldat://callback"],
    ["reset-password/index.html", "heldat://reset-password"],
    ["join/index.html", "heldat://join"]
  ];
  for (const [file, deepLink] of pages) {
    const html = await read(file);
    assert.match(
      html,
      /<script src="\/return-to-app\.0398ea7561f4\.js" defer><\/script>/
    );
    assert.ok(
      html.includes(`data-heldat-deep-link="${deepLink}"`),
      `${file} must declare its reviewed deep-link base`
    );
  }

  const script = await read("return-to-app.0398ea7561f4.js");
  assert.match(script, /window\.location\.search/);
  assert.match(script, /window\.location\.hash/);
  assert.match(script, /continuation\.length > 8192/);
  assert.doesNotMatch(script, /window\.location\s*=/);
});
