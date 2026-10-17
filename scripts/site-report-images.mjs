// The Sunday report cards on the public site, made small enough for the web (ALY-99).
//
// The API draws each sample card at 1080 x 566 (`python -m alyr.report_samples`, into
// apps/web/app/_agent/samples/report/). This turns each one into AVIF and WebP, with a
// recompressed PNG as the fallback, in apps/web/app/_site/report/, where the site imports
// them (so Next fingerprints them under /_next/static/media/ and build-site.sh copies them).
// It also writes report/index.ts, which imports every file and says which is which.
// Run it again whenever the samples are captured again:
//
//   node scripts/site-report-images.mjs
//
// It uses sharp, which Next already installs, and fails if any file is over 120 KB.
import { createRequire } from "node:module";
import { readdirSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps/web");
const require = createRequire(join(web, "package.json"));
const sharp = require(require.resolve("sharp", { paths: [dirname(require.resolve("next/package.json"))] }));

const from = join(web, "app/_agent/samples/report");
const to = join(web, "app/_site/report");
const LIMIT = 120 * 1024;
mkdirSync(to, { recursive: true });

let over = 0;
const cards = new Map();
for (const name of readdirSync(from).filter((f) => f.endsWith(".png")).sort()) {
  const base = name.replace(/\.png$/, "");
  const [key, lang, paper] = base.split(".");
  const id = `${key}.${lang}`;
  cards.set(id, { ...cards.get(id), [paper ? "paper" : "carbon"]: base });
  const source = sharp(join(from, name));
  const outputs = [
    [`${base}.avif`, source.clone().avif({ quality: 60, effort: 7 })],
    [`${base}.webp`, source.clone().webp({ quality: 82, effort: 6 })],
    [`${base}.png`, source.clone().png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })],
  ];
  const sizes = [];
  for (const [file, pipeline] of outputs) {
    await pipeline.toFile(join(to, file));
    const size = statSync(join(to, file)).size;
    if (size > LIMIT) over++;
    sizes.push(`${file.split(".").pop()} ${(size / 1024).toFixed(1)} KB`);
  }
  console.log(`${base}: ${sizes.join(", ")}`);
}
// report/index.ts: { "bakery.en": { carbon, paper }, ... }, each { avif, webp, png, width, height }
const ident = (base, ext) => `${base.replaceAll(".", "_")}_${ext}`;
const imports = [];
const entries = [];
for (const [id, themes] of [...cards].sort()) {
  const parts = [];
  for (const theme of ["carbon", "paper"]) {
    const base = themes[theme];
    for (const ext of ["avif", "webp", "png"]) imports.push(`import ${ident(base, ext)} from "./${base}.${ext}";`);
    const png = ident(base, "png");
    parts.push(`    ${theme}: { avif: ${ident(base, "avif")}.src, webp: ${ident(base, "webp")}.src, png: ${png}.src, width: ${png}.width, height: ${png}.height },`);
  }
  entries.push(`  "${id}": {\n${parts.join("\n")}\n  },`);
}
writeFileSync(
  join(to, "index.ts"),
  [
    "// Written by scripts/site-report-images.mjs from the API's sample cards. Do not edit by hand.",
    "",
    ...imports,
    "",
    "export type CardImage = { avif: string; webp: string; png: string; width: number; height: number };",
    "",
    '/** Each sample\'s card, by "{sample}.{language}": Carbon (dark) and Paper (light). */',
    "export const REPORT_IMAGES: Record<string, { carbon: CardImage; paper: CardImage }> = {",
    ...entries,
    "};",
    "",
  ].join("\n"),
);

if (over) {
  console.error(`${over} file(s) over 120 KB`);
  process.exit(1);
}
