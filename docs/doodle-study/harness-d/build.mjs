// Transpile BgExplainer.tsx for the local harness (TypeScript from the main checkout's apps/web).
//   node docs/doodle-study/harness-d/build.mjs
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire("D:/alyr whatsapp/apps/web/package.json")
const ts = require("typescript")
const out = ts.transpileModule(readFileSync(join(here, "BgExplainer.tsx"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React }, reportDiagnostics: true })
if (out.diagnostics?.length) console.log(out.diagnostics.map((d) => d.messageText).join("\n"))
writeFileSync(join(here, "site/BgExplainer.js"), out.outputText)
console.log("built", out.outputText.length)
