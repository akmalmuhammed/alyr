// The payment QR printed on an invoice (ALY-141) is made by the API's own small encoder
// (`apps/api/src/alyr/core/qr.py`), because the document engine draws with no network and no
// image library. Python cannot read a code back without a heavy library, so this is the proof
// that matters: every matrix the encoder makes (`qrVectors.json`, which the API's test insists
// is exactly what the encoder makes today) is drawn as pixels with the quiet zone the print rules
// ask for and read back by jsQR, an independent decoder. The text must come out byte for byte.
// Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import jsQR from "jsqr";

const vectors = JSON.parse(readFileSync(new URL("./qrVectors.json", import.meta.url), "utf8"));
const QUIET = 4;

function pixels(rows, scale) {
  const size = rows.length;
  const side = (size + QUIET * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (rows[r][c] !== "1") continue;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const at = (((r + QUIET) * scale + y) * side + (c + QUIET) * scale + x) * 4;
          data[at] = data[at + 1] = data[at + 2] = 21;
        }
      }
    }
  }
  return { data, width: side, height: side };
}

test("there are vectors, from the smallest version to the largest", () => {
  assert.ok(vectors.length >= 20, "too few vectors");
  const sizes = new Set(vectors.map((v) => v.rows.length));
  for (const size of [21, 25, 29, 33, 37, 41, 45, 49, 53, 57]) assert.ok(sizes.has(size), `no version with size ${size}`);
});

test("every code reads back as exactly the text it was made from", () => {
  for (const { text, rows } of vectors) {
    for (const scale of [4, 8]) {
      const { data, width, height } = pixels(rows, scale);
      const found = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
      assert.ok(found, `no code found for ${text.slice(0, 40)} (${rows.length} modules) at ${scale}`);
      assert.equal(found.data, text, `${rows.length} modules at ${scale}`);
    }
  }
});

test("a payment link as the API makes it reads back", () => {
  const link = vectors.find((v) => v.text.startsWith("http://localhost:3181/pay/"));
  assert.ok(link, "the localhost payment link is in the vectors");
  const { data, width, height } = pixels(link.rows, 6);
  assert.equal(jsQR(data, width, height, { inversionAttempts: "dontInvert" })?.data, link.text);
});
