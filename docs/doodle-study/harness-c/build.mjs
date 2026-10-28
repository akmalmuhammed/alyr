// Transpile the Framer component for the local harness (TypeScript from apps/web's node_modules).
//   node docs/doodle-study/harness-c/build.mjs
// Run it from a short path if Node complains about a long working directory (we used C:\t\doodle).
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(existsSync(join(here, "../../../apps/web/node_modules/typescript")) ? join(here, "../../../apps/web/package.json") : "D:/alyr whatsapp/apps/web/package.json")
const ts = require("typescript")
const out = ts.transpileModule(readFileSync(join(here, "BgSignal.tsx"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } })
writeFileSync(join(here, "site/BgSignal.js"), out.outputText)
console.log("built", out.outputText.length)
