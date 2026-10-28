// Transpile BgSchematic.tsx for the local harness (Direction B). TypeScript comes from the main
// checkout's apps/web, because this worktree has no node_modules.
//   node docs/doodle-study/harness-b/build.mjs
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire("D:/alyr whatsapp/apps/web/package.json")
const ts = require("typescript")
const src = readFileSync(join(here, "BgSchematic.tsx"), "utf8")
const out = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React }, reportDiagnostics: true })
if (out.diagnostics?.length) console.log(out.diagnostics.map((d) => d.messageText).join("\n"))
writeFileSync(join(here, "site/BgSchematic.js"), out.outputText)
console.log("built", out.outputText.length)
