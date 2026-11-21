import test from "node:test";
import assert from "node:assert/strict";
import { inboundText } from "./inboxKinds.ts";

test("text and a tapped button are not labelled", () => {
  for (const kind of ["text", "interactive", "button", "", "template"]) assert.equal(inboundText(kind, "hello"), null);
});

test("a voice note says what it is and that it is not shown here yet, in both languages", () => {
  assert.deepEqual(inboundText("voice", ""), {
    en: "Voice note (not shown here yet)",
    ar: "رسالة صوتية (لا تظهر هنا بعد)",
  });
});

test("a photo keeps its caption after the label", () => {
  const said = inboundText("image", "like this, please");
  assert.equal(said.en, "Photo (not shown here yet) · like this, please");
  assert.equal(said.ar, "صورة (لا تظهر هنا بعد) · like this, please");
});

test("a reaction is shown as itself, with no promise about a file", () => {
  assert.deepEqual(inboundText("reaction", "\u{1F44D}"), { en: "Reaction: \u{1F44D}", ar: "تفاعل: \u{1F44D}" });
});

test("every kind the parser can produce has words, none with an ellipsis or an AI word", () => {
  for (const kind of ["voice", "audio", "image", "video", "document", "sticker", "location", "contacts", "reaction", "unsupported"]) {
    const said = inboundText(kind, "");
    assert.ok(said.en && said.ar, kind);
    for (const text of [said.en, said.ar]) {
      assert.ok(!text.includes("…") && !text.includes("..."), `${kind}: ${text}`);
      assert.ok(!/\b(AI|smart|assistant)\b/i.test(text), `${kind}: ${text}`);
    }
  }
});
