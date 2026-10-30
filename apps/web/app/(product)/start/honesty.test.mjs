// The sign-up screens and the inbox say only what runs today (ALY-273,
// .claude/skills/alyr-design/honesty.md): no AI words, in English or Arabic, and none of the
// claims the honesty list rules out while no shop can connect its own number or payment
// account. The site has its own check (scripts/site/banned-words.mjs); this covers the copy of
// /start and the workspace's inbox. Run with `pnpm test`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const HERE = import.meta.dirname;
const REPO = join(HERE, "../../../../..");
const read = (path) => readFileSync(path, "utf8");

/** Every string literal in a piece of source: "…", '…' and the text of `…`. */
function strings(source) {
  const found = [];
  for (const m of source.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    found.push(m[1] ?? m[2] ?? m[3]);
  }
  return found;
}

/** The AI words of honesty.md section 1, as scripts/site/banned-words.mjs reads them. */
function aiWords() {
  const lines = read(join(REPO, ".claude/skills/alyr-design/honesty.md")).split(/\r?\n/);
  const bullet = (label) => {
    const start = lines.findIndex((line) => line.startsWith(`- **${label}:**`));
    assert.ok(start >= 0, `honesty.md has no "- **${label}:**" bullet`);
    let text = lines[start].slice(`- **${label}:**`.length);
    for (let i = start + 1; i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*- /.test(lines[i]); i += 1) {
      text += ` ${lines[i].trim()}`;
    }
    return text.replace(/\([^)]*\)/g, "").split(/[,،]/).map((w) => w.replace(/["“”.]/g, "").trim()).filter(Boolean);
  };
  return { en: bullet("Words"), ar: bullet("Arabic") };
}

// The page a sales link opens (ALY-216) says the same things in its own copy file.
const startCopy = [...strings(read(join(HERE, "copy.ts"))), ...strings(read(join(HERE, "../join/copy.ts")))];
const screens = read(join(HERE, "../_workspace/Screens.tsx"));
const inboxCopy = strings(screens.slice(screens.indexOf("const T = {"), screens.indexOf("\n};\n", screens.indexOf("const T = {"))));
// "Assistant" is the name the activity record keeps for automatic replies (core/team.py); the
// screens compare against it and show "Auto-reply" instead.
const everything = [...startCopy, ...inboxCopy].filter((text) => text !== "Assistant");

// Arabic words are compared whole, with or without «ال»: «مساعدة» (help) is not «مساعد».
const arabicTokens = (text) => text.split(/[\s.,،؛:!?؟«»"()]+/).filter(Boolean).map((w) => w.replace(/^ال/, ""));

test("no AI words in the sign-up screens or the inbox", () => {
  const { en, ar } = aiWords();
  for (const text of everything) {
    for (const word of en) {
      assert.doesNotMatch(text, new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), `"${word}" in: ${text}`);
    }
    const tokens = arabicTokens(text);
    for (const word of ar) assert.ok(!tokens.includes(word.replace(/^ال/, "")), `«${word}» in: ${text}`);
  }
});

test("no promise of the shop's own number, app or payment provider", () => {
  const ruled = [
    /keep your number/i, /number (?:your customers |you )?already use/i, /chat you already use/i, /keep(?:s)? (?:your|the) app/i, /paid straight/i,
    /licensed/i, /SkipCash|SADAD|Dibsy|NAPS|Apple Pay/, /move from the chat/i,
    /رقمك وتطبيقك/, /كما هما/, /مباشرة إلى حسابك/, /مرخّص/,
  ];
  const offered = [...startCopy.filter((s) => !s.startsWith("Move my number") && !s.startsWith("انقل رقمي"))];
  for (const text of offered) {
    // The "move my number" choice is ALYR's to set up with the owner (ALY-217); its words are
    // the founder's to change, and it is not one of the audit's lines.
    if (/^Customers keep the number they know|^يبقى عملاؤك على الرقم/.test(text)) continue;
    for (const pattern of ruled) assert.doesNotMatch(text, pattern, text);
  }
});
