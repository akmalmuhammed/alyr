// The QR code the founder shows during a visit (ALY-216) is read back with an independent decoder
// (jsQR), at the size a sales link really is: the join page's address with its signed token. A code
// that looks right but does not scan fails here. Run with `pnpm test` from apps/web.

import assert from "node:assert/strict";
import { test } from "node:test";
import jsQR from "jsqr";
import { color } from "../../_tokens/tokens.ts";
import { ascii, pixels } from "../_workspace/qr.ts";

const colours = { dark: color.brand.carbon, light: color.ink.white };
// A token is 30 characters of payload, a dot and 22 of signature (core/links.py). This one is
// built from a pattern, so it is the right shape and is not a real token.
const TOKEN = `${"AgcRE0J8".repeat(4).slice(0, 30)}.${"mayg3UyF".repeat(3).slice(0, 22)}`;
const links = [
  `https://app.alyr.qa/join#${TOKEN}`,
  `http://localhost:3216/join#${TOKEN}`,
  `https://ops.alyr.qa/join#${TOKEN.replace(/[A-Z]/g, "q")}`,
];

test("a sales link's QR code reads back as exactly the link, at phone sizes", () => {
  for (const link of links) {
    for (const scale of [3, 6, 10]) {
      const { width, height, data } = pixels(link, scale, colours);
      const found = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
      assert.ok(found, `no code for ${link} at ${scale}`);
      assert.equal(found.data, ascii(link));
    }
  }
});

test("the link carries a token, in the fragment, and nothing about the business", () => {
  for (const link of links) {
    const url = new URL(link);
    assert.equal(url.pathname, "/join");
    assert.equal(url.search, "", "no query string: a server would log it");
    assert.match(url.hash.slice(1), /^[A-Za-z0-9_-]{30}\.[A-Za-z0-9_-]{22}$/);
  }
});
