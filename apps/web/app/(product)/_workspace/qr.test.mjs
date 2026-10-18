// The QR codes the Catalog's Share sheet makes (ALY-112) are read back with an independent
// decoder (jsQR), so a code that looks right but does not scan fails here. Run with `node
// --test` from apps/web (Node 22.18 or newer reads the .ts files as they are).

import assert from "node:assert/strict";
import { test } from "node:test";
import jsQR from "jsqr";
import { color } from "../../_tokens/tokens.ts";
import { QUIET, ascii, encode, pixels, svg } from "./qr.ts";

const colours = { dark: color.brand.carbon, light: color.ink.white };
const BASE = "https://shop.example.test/s/test-kitchen";

const links = [
  BASE,
  `${BASE}?table=7`,
  `${BASE}?table=A12`,
  `${BASE}?item=0a1f0000-0000-4000-8000-00000000cafe`,
  `${BASE}?cat=${encodeURIComponent("Desserts and sweets")}`,
  `${BASE}?cat=${encodeURIComponent("المشروبات الباردة")}`,
  `${BASE}?cat=${encodeURIComponent("الحلويات الشرقية والمعجنات")}&table=12`,
  `https://a.example.test/s/${"x".repeat(180)}`,
  "http://localhost:3181/s/al-noor",
];

function read(link, scale) {
  const { width, height, data } = pixels(link, scale, colours);
  return jsQR(data, width, height, { inversionAttempts: "dontInvert" });
}

test("every code reads back as exactly the link it was made from", () => {
  for (const link of links) {
    for (const scale of [4, 8]) {
      const found = read(link, scale);
      assert.ok(found, `no code found for ${link} at ${scale}`);
      assert.equal(found.data, ascii(link), link);
    }
  }
});

test("a code has a quiet zone of four modules and dark ink on a light ground", () => {
  const scale = 6;
  const m = encode(BASE);
  const { width, data } = pixels(BASE, scale, colours);
  assert.equal(width, (m.size + QUIET * 2) * scale);
  const at = (x, y) => [data[(y * width + x) * 4], data[(y * width + x) * 4 + 1], data[(y * width + x) * 4 + 2]];
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const inside = x >= QUIET * scale && x < width - QUIET * scale && y >= QUIET * scale && y < width - QUIET * scale;
      if (!inside) assert.deepEqual(at(x, y), [255, 255, 255], `margin at ${x},${y}`);
    }
  }
  // The top-left finder pattern's corner is dark ink, not black and not the paper.
  assert.deepEqual(at(QUIET * scale, QUIET * scale), [0x15, 0x17, 0x1a]);
});

test("the SVG draws the same modules as the code", () => {
  const link = `${BASE}?table=7`;
  const m = encode(link);
  const text = svg(link, colours);
  assert.match(text, new RegExp(`viewBox="0 0 ${m.size + QUIET * 2} ${m.size + QUIET * 2}"`));
  const drawn = Array.from({ length: m.size }, () => Array(m.size).fill(false));
  for (const [, x, y, run] of text.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let k = 0; k < Number(run); k++) drawn[Number(y) - QUIET][Number(x) - QUIET + k] = true;
  }
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) assert.equal(drawn[r][c], m.dark(r, c), `module ${r},${c}`);
  assert.ok(text.includes(`fill="${color.brand.carbon}"`) && text.includes(`fill="${color.ink.white}"`));
  assert.ok(text.length < 20_000, "an SVG of a short link stays small");
});

test("a link with Arabic in it is carried as its percent-encoded ASCII", () => {
  const link = `${BASE}?cat=${encodeURIComponent("مشروبات")}`;
  assert.ok(/^[\x20-\x7e]+$/.test(ascii(link)));
  assert.equal(read(link, 6).data, ascii(link));
  // Typed with the Arabic letters themselves, it is the same code.
  assert.equal(ascii(`${BASE}?cat=مشروبات`), ascii(link));
});
