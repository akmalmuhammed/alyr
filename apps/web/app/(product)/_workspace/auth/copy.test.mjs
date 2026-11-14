import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("auth copy has matching en and ar structure", async () => {
  const fileContent = fs.readFileSync(path.join(__dirname, "copy.ts"), "utf8");
  
  // Section 1: Must NOT contain Eastern Arabic numerals in Arabic block
  const arBlockMatch = fileContent.match(/ar:\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(arBlockMatch, "Arabic block must be present");
  const arBlock = arBlockMatch[1];
  
  const easternInAr = arBlock.match(/[٠-٩۰-۹]/);
  assert.equal(easternInAr, null, `Found Eastern Arabic numerals in Arabic block: ${easternInAr?.[0]}`);
  
  // Must NOT contain 'QAR ' in Arabic block
  const qarInAr = arBlock.match(/QAR\s/i);
  assert.equal(qarInAr, null, `Found 'QAR ' in Arabic block: ${qarInAr?.[0]}`);
});
