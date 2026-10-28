// Transpile BgPlan.tsx for the local harness (TypeScript from the main checkout's apps/web).
//   node docs/doodle-study/harness-a/build.mjs
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire("D:/alyr whatsapp/apps/web/package.json")
const ts = require("typescript")
const src = readFileSync(join(here, "BgPlan.tsx"), "utf8")
if (src.includes("\r")) throw new Error("BgPlan.tsx has CR line endings; Framer's diff needs LF")
const out = ts.transpileModule(src, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } })
for (const d of out.diagnostics || []) console.log("diag", ts.flattenDiagnosticMessageText(d.messageText, "\n"))
writeFileSync(join(here, "site/BgPlan.js"), out.outputText)
console.log("built", out.outputText.length)
