#!/usr/bin/env bash
# Builds the client portal as plain files with demo data and no backend (ALY-246).
# Output: apps/web/out-demo, served by the Worker `alyr-portal-demo` (apps/web/wrangler.demo.jsonc).
# Runbook: docs/runbooks/portal-demo.md.
#
# The real screens are built unchanged. What differs: a stage copy of apps/web keeps only the
# workspace and sign-up routes, the build is a static export, and NEXT_PUBLIC_ALYR_DEMO=1 turns
# on app/(product)/_demo, which answers every /api call from the recorded files in apps/web/demo
# (made by scripts/demo-portal/*.mjs from the fictional demo shops).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
web="$root/apps/web"
stage="$web/.demo-stage"

rm -rf "$stage" "$web/out-demo"
mkdir -p "$stage"
(cd "$web" && tar --exclude=./node_modules --exclude='./.next*' --exclude='./out*' --exclude=./.demo-stage \
  --exclude=./site-worker.js -cf - .) | tar -xf - -C "$stage"
ln -s "$web/node_modules" "$stage/node_modules"

cd "$stage"
# Only the workspace and sign-up are in the demo. The customer pages, the back office and the
# public site need a server or are not part of this showing.
rm -rf "app/(site)" "app/(site-ar)" app/opengraph-image.tsx app/sitemap.ts app/robots.ts
for route in s b t d pay ops whatsapp login agent-sample; do rm -rf "app/(product)/$route"; done

# The workspace page is a client page with one optional segment; a static export needs the
# segments listed, so it is wrapped by a small server page.
mv "app/(product)/app/[[...section]]/page.tsx" "app/(product)/app/[[...section]]/Workspace.tsx"
cat > "app/(product)/app/[[...section]]/page.tsx" <<'TSX'
import Workspace from "./Workspace";

export function generateStaticParams() {
  const sections = ["inbox", "bookings", "orders", "ledger", "products", "connections", "team", "catalog", "documents", "connect"];
  return [{ section: [] }, ...sections.map((s) => ({ section: [s] }))];
}

export default function Page() {
  return <Workspace />;
}
TSX
cat > "app/(product)/page.tsx" <<'TSX'
import Landing from "./_demo/Landing";

export default function Page() {
  return <Landing />;
}
TSX

cat > next.config.ts <<'TS'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "out-demo",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
TS

# The recorded answers are served as files, and so are the shop pictures, at the address the
# screens ask for (/api/media/file/...), because a picture is loaded by the page, not by fetch.
mkdir -p public/demo
cp demo/*.json public/demo/
if [ -d demo/media ]; then
  for file in demo/media/*; do
    [ -f "$file" ] || continue
    name="$(basename "$file")"
    target="public/api/$(echo "$name" | sed "s#__#/#g")"
    mkdir -p "$(dirname "$target")"
    cp "$file" "$target"
  done
fi

NEXT_PUBLIC_ALYR_DEMO=1 pnpm exec next build
cp -R out-demo "$web/out-demo"
# A short note for whoever opens the folder, and a stamp of the commit that was built.
sha="$(git -C "$root" rev-parse --short HEAD 2>/dev/null || echo unknown)"
printf 'ALYR portal demo, commit %s, built %s\nSample data only.\n' "$sha" "$(date -u +%FT%TZ)" > "$web/out-demo/version.txt"
cd "$root"
rm -rf "$stage"
echo "built apps/web/out-demo ($(find apps/web/out-demo -type f | wc -l) files, $(du -sh apps/web/out-demo | cut -f1))"
