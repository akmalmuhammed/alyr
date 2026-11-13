// Tests for scripts/ui-check.mjs (Product UI foundation): the ratchet over off-scale sizes, radii
// and gaps, the one-button-system rule, the banned words and the hard rules inside _ui. Each case
// builds a small fixture checkout in a temp folder and runs the script on it with --root.
// Run with `node --test` from apps/web.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const script = join(repo, "scripts", "ui-check.mjs");
const made = [];
after(() => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** A checkout with the real tokens, the given files and the given ratchet, run through the script. */
function run(files, ratchet = {}, flags = []) {
  const dir = mkdtempSync(join(tmpdir(), "ui-check-"));
  made.push(dir);
  mkdirSync(join(dir, "design"), { recursive: true });
  cpSync(join(repo, "design", "tokens.json"), join(dir, "design", "tokens.json"));
  writeFileSync(join(dir, "design", "ui-ratchet.json"), JSON.stringify({ files: ratchet }));
  for (const [path, text] of Object.entries(files)) {
    const full = join(dir, "apps", "web", "app", path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  const result = spawnSync(process.execPath, [script, "--root", dir, ...flags], { encoding: "utf8" });
  return { dir, code: result.status, out: result.stdout, err: result.stderr, ratchet: () => JSON.parse(readFileSync(join(dir, "design", "ui-ratchet.json"), "utf8")).files };
}

const P = "apps/web/app/(product)";

test("an empty product passes", () => {
  assert.equal(run({}).code, 0);
});

test("values on the scales, written as tokens or as listed steps, are not counted", () => {
  const css = `.a { padding: var(--ui-space-12) 16px; gap: 8px; border-radius: 50%; font-size: var(--ui-small); }
.b { border-radius: 6px; padding-inline: 0; margin: 3px; font-size: 13px; }`;
  const result = run({ "(product)/x/x.css": css });
  assert.equal(result.code, 0, result.err);
});

test("an off-scale font size, radius or gap in a new file fails, and the message says where", () => {
  const css = `.a {\n  padding: 18px 5px;\n  border-radius: 14px;\n  font-size: 17px;\n  gap: 3px;\n}`;
  const result = run({ "(product)/x/x.css": css });
  assert.equal(result.code, 1);
  assert.match(result.err, /font-size 0 -> 1/);
  assert.match(result.err, /radius 0 -> 1/);
  assert.match(result.err, /space 0 -> 3/);
  assert.match(result.err, /line 2: padding: 18px/);
});

test("the ratchet lets today's count stand, fails when it rises, and asks to be lowered when it falls", () => {
  const css = `.a { padding: 18px; }\n.b { padding: 18px; }`;
  const file = `${P}/x/x.css`;
  assert.equal(run({ "(product)/x/x.css": css }, { [file]: { space: 2 } }).code, 0);
  const up = run({ "(product)/x/x.css": css }, { [file]: { space: 1 } });
  assert.equal(up.code, 1);
  assert.match(up.err, /space 1 -> 2/);
  const down = run({ "(product)/x/x.css": css }, { [file]: { space: 3 } });
  assert.equal(down.code, 1);
  assert.match(down.err, /went down/);
  assert.match(down.err, /--update/);
});

test("--update lowers counts and writes them, one file to a line", () => {
  const file = `${P}/x/x.css`;
  const result = run({ "(product)/x/x.css": ".a { padding: 18px; }" }, { [file]: { space: 3 }, [`${P}/gone.css`]: { radius: 2 } }, ["--update"]);
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(result.ratchet(), { [file]: { space: 1 } });
  const text = readFileSync(join(result.dir, "design", "ui-ratchet.json"), "utf8");
  assert.match(text, /^ {4}".*x\.css": \{ "space": 1 \}$/m);
});

test("--update never raises a count", () => {
  const file = `${P}/x/x.css`;
  const result = run({ "(product)/x/x.css": ".a { padding: 18px; padding: 22px; }" }, { [file]: { space: 1 } }, ["--update"]);
  assert.equal(result.code, 1);
  assert.match(result.err, /only lowers/);
});

test("a new button system fails; the one in _ui is not counted", () => {
  const css = `.new-btn { border: 0; }\n.sh .btn.primary:hover { color: red; }`;
  const result = run({ "(product)/x/x.css": css });
  assert.equal(result.code, 1);
  assert.match(result.err, /btn 0 -> 2/);
  const ui = run({ "_ui/ui.css": ".ui-btn { border: var(--rule-hairline) solid var(--control-line); }" });
  assert.equal(ui.code, 0, ui.err);
});

test("a class that only contains the letters btn is not a button system", () => {
  const result = run({ "(product)/x/x.css": ".subtle-block { color: var(--text); }\n.btnlike { color: var(--text); }" });
  assert.equal(result.code, 0, result.err);
});

test("banned words in a new screen's copy fail, in either language where the list has one", () => {
  const files = {
    "(product)/x/copy.ts": `export const T = {\n  en: { ask: "Ask ALYR", free: "Free replies allowed", ai: "Your AI helper", soon: "Coming soon", at: "At risk" },\n  ar: { tool: "أداة ذكي" },\n};`,
  };
  const result = run(files);
  assert.equal(result.code, 1);
  for (const rule of ["ask-alyr", "free-replies", "ai-word", "coming-soon", "at-risk", "ai-word-ar"]) assert.match(result.err, new RegExp(`${rule} 0 -> [1-9]`), rule);
});

test("a banned word in a comment, or inside a longer word, is not a hit", () => {
  const code = `// Ask ALYR was renamed\n/* smart */\nexport const a = "Chair is available";\nexport const b = "https://example.com/ai";\nexport const c = "السلام مساعدة";`;
  const result = run({ "(product)/x/copy.ts": code });
  assert.equal(result.code, 0, result.err);
});

test("an em dash as the empty value, and money ending in .00, are caught", () => {
  const code = `export const a = value || "—";\nexport const b = <td>{x ?? "—"}</td>;\nexport const c = "QAR 3,110.00";`;
  const result = run({ "(product)/x/Row.tsx": code });
  assert.equal(result.code, 1);
  assert.match(result.err, /em-dash-placeholder 0 -> 2/);
  assert.match(result.err, /money-00 0 -> 1/);
});

test("inside _ui a hex, a px length, a colour function or a banned word is a hard failure", () => {
  const css = `.a { color: #fff; padding: 12px; border: 1px solid var(--line); background: rgb(0 0 0 / .5); }`;
  const result = run({ "_ui/ui.css": css });
  assert.equal(result.code, 1);
  assert.match(result.err, /hard problem/);
  assert.match(result.err, /12px in padding/);
  assert.match(result.err, /1px in border/);
  assert.match(result.err, /colour literal in color/);
  assert.match(result.err, /colour literal in background/);

  const code = `const style = { width: "16px", color: "#15171a" };\nconst s = "Ask ALYR";\nconst n = "—";\nconst m = "QAR 3.00";\nconst r = "rgb(0 0 0)";`;
  const ts = run({ "_ui/Thing.tsx": code });
  assert.equal(ts.code, 1);
  assert.match(ts.err, /16px in _ui/);
  assert.match(ts.err, /hex colour in _ui/);
  assert.match(ts.err, /banned wording \(ask-alyr\)/);
  assert.match(ts.err, /em dash in _ui/);
  assert.match(ts.err, /colour function in _ui/);
});

test("inside _ui tokens, zero, percent, unitless values and breakpoints are fine", () => {
  const css = `@media (max-width: 720px) { .a { gap: var(--ui-space-8); } }
.a { padding: 0; width: 100%; line-height: 1.45; border: var(--rule-hairline) solid var(--control-line); min-height: var(--ui-size-touch); margin: calc(var(--ui-space-4) * -1); }`;
  const ts = `export const label = "09:40";\nexport const pad = "var(--ui-space-12)";\nexport const unit = "12 px wide is prose";`;
  const result = run({ "_ui/ui.css": css, "_ui/x.ts": ts });
  assert.equal(result.code, 0, result.err);
});

test("test files are not read", () => {
  const result = run({ "_ui/x.test.mjs": `assert.equal(a, "Ask ALYR"); const c = "#fff", w = "16px";` });
  assert.equal(result.code, 0, result.err);
});

test("the real repository passes its own ratchet", () => {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
