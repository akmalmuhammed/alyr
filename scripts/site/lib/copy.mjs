// Load the site's words (apps/web/app/_site/copy.ts) in plain Node, for the checks and for
// the machine-readable files (llms.txt, the markdown copies of each page).
//
// copy.ts is TypeScript with extensionless imports, so Node cannot import it as it is. This
// transpiles copy.ts and every file it imports, relatively, with the TypeScript compiler the
// web app already depends on, into a temporary folder, then imports the result. It reads the
// copy; it never changes it.
//
// site.ts reads NEXT_PUBLIC_* variables when it is imported, so `offer` and `env` set them
// first, the way the build would.

import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REPO = resolve(import.meta.dirname, "../../..");
export const WEB = join(REPO, "apps/web");
export const SITE_DIR = join(WEB, "app/_site");

const require = createRequire(join(WEB, "package.json"));

const IMPORT = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"']+)\2/g;

function resolveSource(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      /* try the next */
    }
  }
  throw new Error(`copy loader: cannot find ${spec} imported from ${fromFile}`);
}

/**
 * Import a TypeScript module of the site with everything it imports relatively.
 * @param {string} entry absolute path of the .ts file
 * @param {{ offer?: boolean, env?: Record<string, string> }} options
 */
export async function importSiteModule(entry, { offer = false, env = {} } = {}) {
  const ts = require("typescript");
  const saved = { ...process.env };
  process.env.NEXT_PUBLIC_ALYR_OFFER = offer ? "on" : "";
  Object.assign(process.env, env);
  const dir = mkdtempSync(join(tmpdir(), "alyr-copy-"));
  try {
    const done = new Map();
    const queue = [entry];
    while (queue.length) {
      const file = queue.pop();
      if (done.has(file)) continue;
      const rel = relative(WEB, file).replace(/\.(tsx?|json)$/, "");
      const outFile = join(dir, `${rel}.mjs`);
      done.set(file, outFile);
      if (file.endsWith(".json")) {
        writeFileSync(outFile, `export default ${readFileSync(file, "utf8")};`);
        continue;
      }
      const source = readFileSync(file, "utf8");
      const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve },
        fileName: file,
      }).outputText;
      const rewritten = js.replace(IMPORT, (_, lead, quote, spec) => {
        const target = spec.endsWith(".json") ? resolve(dirname(file), spec) : resolveSource(file, spec);
        queue.push(target);
        const targetRel = relative(WEB, target).replace(/\.(tsx?|json)$/, "");
        let path = relative(dirname(join(dir, rel)), join(dir, targetRel)).replaceAll("\\", "/");
        if (!path.startsWith(".")) path = `./${path}`;
        return `${lead}${quote}${path}.mjs${quote}`;
      });
      mkdirSync(dirname(outFile), { recursive: true });
      writeFileSync(outFile, rewritten);
    }
    return await import(`${pathToFileURL(done.get(entry)).href}?t=${Date.now()}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

/** The site's words and facts: `copy` ({ en, ar }) and site.ts's exports. */
export async function loadSite(options = {}) {
  const copyModule = await importSiteModule(join(SITE_DIR, "copy.ts"), options);
  const site = await importSiteModule(join(SITE_DIR, "site.ts"), options);
  return { copy: copyModule.copy, fill: copyModule.fill, site };
}

/**
 * Every string in a copy object, with its path ("home.hero.title", "faq.items[3].a").
 * `visit(path, value, parents)` gets the chain of objects above the value.
 */
export function walk(value, visit, path = "", parents = []) {
  if (typeof value === "string") {
    visit(path, value, parents);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, `${path}[${index}]`, [...parents, value]));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) walk(item, visit, path ? `${path}.${key}` : key, [...parents, value]);
  }
}

/** A dotted path against a list of patterns where `*` is one segment and `**` any number. */
export function matchPath(path, pattern) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\[\*\\\]/g, "\\[\\d+\\]")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^.\\[]+")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`).test(path);
}
