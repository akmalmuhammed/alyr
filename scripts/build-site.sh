#!/usr/bin/env bash
# Build the public ALYR site as plain files that any static host can serve.
#
# Only the public pages are published: the homepage and the six product pages (/chat,
# /bookings, /agent, /accounts, /shelf, /docs), each in English and Arabic (/ar, /ar/chat, ...). The
# workspace, sign-in, payment and order pages need the API and are not part of this
# output, so nothing here can reach customer data.
#
#   scripts/build-site.sh            -> apps/web/out-site/
#
# The pages are prerendered by `next build`; this script copies their HTML, the assets
# they load, and the metadata files into one folder.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/apps/web"

rm -rf .next out-site
# The design tokens (design/tokens.json) generate the CSS and TypeScript the pages read.
node "$root/scripts/tokens-build.mjs"
# The published site has no workspace behind it, so the footer shows no staff link.
NEXT_PUBLIC_ALYR_WORKSPACE_URL="" pnpm build >/dev/null

app=".next/server/app"
mkdir -p out-site/_next
pages="chat bookings agent accounts shelf docs"
cp "$app/index.html" out-site/index.html
cp "$app/ar.html" out-site/ar.html
mkdir -p out-site/ar
for page in $pages; do
  cp "$app/$page.html" "out-site/$page.html"
  cp "$app/ar/$page.html" "out-site/ar/$page.html"
done
cp "$app/_not-found.html" out-site/404.html
cp "$app/robots.txt.body" out-site/robots.txt
cp "$app/sitemap.xml.body" out-site/sitemap.xml
cp "$app/icon.svg.body" out-site/icon.svg
cp "$app/opengraph-image.body" out-site/opengraph-image
# each English product page has its own card, which Next names with a hash
for page in $pages; do
  for card in "$app/$page"/opengraph-image-*.body; do
    [ -e "$card" ] || { echo "no social card for /$page" >&2; exit 1; }
    name="$(basename "$card" .body)"
    mkdir -p "out-site/$page"
    cp "$card" "out-site/$page/$name"
  done
done
cp -r .next/static out-site/_next/static

# The pages are drawn first and the framework's scripts start after the first paint
# (scripts/site-defer-scripts.mjs says why). It fails the build if Next's markup changes.
node "$root/scripts/site-defer-scripts.mjs" out-site/index.html out-site/ar.html out-site/404.html \
  $(for page in $pages; do echo "out-site/$page.html out-site/ar/$page.html"; done)

# Cloudflare Pages reads these two files. The link-preview image has no file extension,
# so its type is stated; hashed assets never change, so browsers may keep them.
cat > out-site/_headers <<'EOF'
/opengraph-image
  Content-Type: image/png
/version.txt
  Cache-Control: no-cache
/_next/static/*
  Cache-Control: public, max-age=31536000, immutable
/*
  Strict-Transport-Security: max-age=31536000
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'
EOF

# The site for machines: llms.txt, llms-full.txt and a markdown copy of each page (index.md,
# chat.md, ar/chat.md, ...), made from copy.ts, with no prices and the samples labelled. It adds their
# types to _headers, so it runs after _headers is written.
node "$root/scripts/site/llms.mjs" out-site

# Every build names the commit it came from: out-site/version.txt and a <meta name="alyr-build">
# in each page, so what is live can be traced to git (docs/runbooks/site-deploy.md).
node "$root/scripts/site/stamp.mjs" out-site

# Fail loudly if a product page or an API address slipped into the output.
if grep -rlE "127\.0\.0\.1|/sim/|/api/ledger" out-site/*.html out-site/ar/*.html >/dev/null 2>&1; then
  echo "build-site: the output refers to the API or the simulator; refusing to continue." >&2
  exit 1
fi
echo "Public site built: $(find out-site -type f | wc -l) files, $(du -sh out-site | cut -f1) in apps/web/out-site"
