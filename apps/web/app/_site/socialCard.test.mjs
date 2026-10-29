// A link preview never points at localhost (CJ-19). An image file (opengraph-image or
// twitter-image) at the top of app/ is read for every page, the product's among them, before
// any layout has set the site's address, so a shared link to /start, /pay or a shop's page
// showed an image at http://localhost. The homepage's card is a plain route instead
// (app/opengraph-image/route.tsx), named by the pages that want it. Run with `pnpm test`.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("..", import.meta.url));

test("no image file sits at the top of app/, where every page would read it", () => {
  const files = readdirSync(app, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
  const images = files.filter((name) => /^(opengraph|twitter)-image\d*\.\w+$/.test(name));
  assert.deepEqual(images, [], "move the card into app/opengraph-image/route.tsx; see that file for why");
});
