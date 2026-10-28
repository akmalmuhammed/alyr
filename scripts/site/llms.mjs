// The site for machines: llms.txt, llms-full.txt and a markdown copy of every page,
// written into apps/web/out-site by scripts/build-site.sh (docs/site-audit/03-ax.md A2, A3).
//
//   node scripts/site/llms.mjs apps/web/out-site
//
// Everything comes from the site's own words (apps/web/app/_site/copy.ts, read, never
// changed), except a few sentences a machine needs said once (scripts/site/machine-words.json).
//
// The rules:
// - **No prices.** The copies always use the offer-off words, even when the build shows prices.
// - **Samples are labelled.** No sample figure is copied: each drawing of a fictional business
//   becomes one line that says it is a sample of a fictional business, with made-up numbers.
// - **Only what the page says.** The questions are filtered as the page filters them (contact
//   state, offer).
//
// Addresses: / → /index.md, /ar → /ar.md, /chat → /chat.md, /ar/chat → /ar/chat.md. The page
// links to its copy (<link rel="alternate" type="text/markdown">, added by stamp.mjs), and
// _headers gives each copy its type and a canonical link back to the page.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadSite } from "./lib/copy.mjs";

const out = resolve(process.argv[2] ?? "apps/web/out-site");
const words = JSON.parse(readFileSync(join(import.meta.dirname, "machine-words.json"), "utf8"));
// Only to say where prices are; the words themselves are always the offer-off ones.
const offer = process.env.NEXT_PUBLIC_ALYR_OFFER === "on";
const { copy, fill, site } = await loadSite({ offer: false });
const SITE = site.SITE_URL.replace(/\/$/, "");
const problems = [];

/** The markdown file for a page path. */
export const twinPath = (path) => (path === "/" ? "/index.md" : `${path}.md`);

const flat = (text) => String(text ?? "").replace(/\s*\n\s*/g, " ").trim();
const title = (value) => flat(Array.isArray(value) ? value.join(" ") : value);
const has = (value) => value !== undefined && value !== null && value !== "";

/** A Markdown document built line by line; sections whose copy is missing are skipped. */
class Doc {
  constructor() {
    this.lines = [];
  }
  h(level, text) {
    if (has(text)) this.lines.push("", `${"#".repeat(level)} ${title(text)}`, "");
    return this;
  }
  p(text) {
    if (has(text)) this.lines.push(flat(text), "");
    return this;
  }
  list(items, render = (x) => x) {
    const rows = (items ?? []).map(render).filter(has);
    if (rows.length) this.lines.push(...rows.map((row) => `- ${flat(row)}`), "");
    return this;
  }
  numbered(items, render = (x) => x) {
    const rows = (items ?? []).map(render).filter(has);
    if (rows.length) this.lines.push(...rows.map((row, i) => `${i + 1}. ${flat(row)}`), "");
    return this;
  }
  text() {
    return `${this.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
  }
}

/** "**Title**: body", or "**Title.** body" when the title ends its own sentence. */
const titled = (item) => {
  if (typeof item === "string") return item;
  if (!has(item?.title)) return null;
  const head = flat(item.title);
  return /[.?!؟]$/.test(head) ? `**${head}** ${flat(item.body)}` : `**${head}**: ${flat(item.body)}`;
};

function contactLine(locale) {
  const w = words[locale].contact;
  if (site.CONTACT_STATE === "whatsapp") return fill(w.whatsapp, { link: `https://wa.me/${site.WHATSAPP_NUMBER}` });
  if (site.CONTACT_STATE === "email") return fill(w.email, { email: site.CONTACT_EMAIL });
  return w.pending;
}

/** The questions the page shows with the offer off: the same filter as HomePage.tsx and
 * ProductKit.tsx, so no priced answer is ever copied. */
const shownQuestions = (items) =>
  (items ?? []).filter((item) => (!item.state || item.state === site.CONTACT_STATE) && item.offer !== true);

function questions(doc, faq) {
  if (!faq?.items?.length) return;
  doc.h(2, faq.title ?? faq.eyebrow);
  for (const item of shownQuestions(faq.items)) doc.h(3, item.q).p(item.a);
}

const comma = (locale) => (locale === "ar" ? "، " : ", ");

function productName(t, key) {
  return t.products?.items?.[key]?.name ?? key;
}

function header(doc, locale, key, heading, lead) {
  const t = copy[locale];
  const meta = t.meta?.[key] ?? {};
  doc.h(1, heading ?? meta.title);
  doc.lines.push(`> ${flat(meta.descriptionNoOffer ?? meta.description)}`, "");
  doc.p(lead);
}

function footer(doc, locale, path) {
  const t = copy[locale];
  const other = Object.values(site.PATHS).find((p) => p.en === path || p.ar === path);
  doc.lines.push("---", "");
  doc.p(fill(words[locale].copyOf, { url: `${SITE}${path === "/" ? "" : path}` }));
  if (other) doc.p(fill(words[locale].languages, { en: `${SITE}${twinPath(other.en)}`, ar: `${SITE}${twinPath(other.ar)}` }));
  doc.p(t.footer?.disclaimer);
  doc.p(t.footer?.rights);
}

// ------------------------------------------------------------------ the homepage

function homeTwin(locale) {
  const t = copy[locale];
  const h = t.home;
  const doc = new Doc();
  header(doc, locale, "home", h.hero?.title, null);
  doc.p(h.hero?.eyebrow).p(h.hero?.lead);
  doc.list(h.hero?.factsNoOffer ?? h.hero?.facts);

  if (h.why) {
    doc.h(2, h.why.title).p(h.why.lead);
    const [big, today, alyr] = h.why.cols ?? [];
    doc.list(h.why.rows, (r) => `**${flat(r.topic)}**: ${big}: ${flat(r.big)}. ${today}: ${flat(r.today)}. ${alyr}: ${flat(r.alyr)}.`);
  }
  if (h.how) {
    doc.h(2, h.how.title).p(h.how.lead);
    doc.numbered(h.how.steps, titled);
    doc.p(h.how.again).p(h.how.note);
    if (h.how.need) doc.h(3, h.how.need.title).list(h.how.need.items);
    if (h.how.month) doc.h(3, h.how.month.title).list(h.how.month.items);
  }
  if (h.problems?.items) {
    doc.h(2, h.problems.title).p(h.problems.lead);
    doc.list(h.problems.items, (i) => `**${flat(i.problem)}** ${flat(i.fix)} (${productName(t, i.product)})`);
  }
  if (h.business?.rows) {
    doc.h(2, h.business.title);
    for (const row of h.business.rows) {
      doc.h(3, row.name);
      if (row.day?.length) doc.p(`${h.business.day}:`).list(row.day);
      if (row.with?.length) doc.p(`${h.business.with}:`).list(row.with);
      if (row.products?.length) doc.p(`${h.business.uses}: ${row.products.map((k) => productName(t, k)).join(comma(locale))}.`);
    }
    if (h.business.other) doc.h(3, h.business.other.title).p(h.business.other.body);
  }
  if (h.see) doc.h(2, h.see.title).p(h.see.body).p(words[locale].sample);
  if (h.spotlight) {
    doc.h(2, h.spotlight.title).p(h.spotlight.body).p(words[locale].sample);
    doc.p(`[${flat(h.spotlight.link)}](${SITE}${site.PATHS.agent[locale]})`);
  }
  if (h.suite) {
    doc.h(2, h.suite.title).p(h.suite.body);
    doc.list(site.PRODUCTS, (key) => {
      const row = h.suite.rows?.[key];
      const body = row?.body ?? t.products?.items?.[key]?.line;
      return `[${productName(t, key)}](${SITE}${site.PATHS[key][locale]}): ${flat(body)}`;
    });
  }
  questions(doc, h.faq);
  if (h.final) doc.h(2, h.final.title).p(h.final.body).p(contactLine(locale));
  footer(doc, locale, site.PATHS.home[locale]);
  return doc.text();
}

// ------------------------------------------------------------------ the company page

function companyTwin(locale) {
  const t = copy[locale];
  const c = t.company;
  const doc = new Doc();
  header(doc, locale, "company", c.title, null);
  doc.p(c.eyebrow).p(c.lead);
  doc.list(c.rows, (r) => `**${flat(r.name)}**: ${flat(r.value)}${r.note ? `. ${flat(r.note)}` : ""}`);
  doc.p(c.source);
  doc.h(2, c.contact.title).p(c.contact.body);
  footer(doc, locale, site.PATHS.company[locale]);
  return doc.text();
}

// ------------------------------------------------------------------ the privacy policy

function privacyTwin(locale) {
  const t = copy[locale];
  const v = t.privacy;
  const doc = new Doc();
  header(doc, locale, "privacy", v.title, null);
  doc.p(v.updated).p(v.lead);
  for (const s of v.sections) {
    doc.h(2, s.title);
    for (const para of s.paras) doc.p(para);
    if (s.list) doc.list(s.list);
    for (const para of s.after ?? []) doc.p(para);
  }
  footer(doc, locale, site.PATHS.privacy[locale]);
  return doc.text();
}

// ------------------------------------------------------------------ the product pages

function productTwin(locale, key) {
  const t = copy[locale];
  const doc = new Doc();
  const chat = key === "chat";
  const p = chat ? t.product : t.pages?.[key];
  if (!p) {
    problems.push(`${locale} ${key}: no copy found for this page`);
    return "";
  }
  if (chat) {
    header(doc, locale, key, p.title, null);
    doc.p(p.eyebrow).p(p.body);
    doc.list(p.facts, titled);
  } else {
    header(doc, locale, key, p.hero?.title, null);
    doc.p(p.hero?.eyebrow).p(p.hero?.lead);
    doc.list(p.hero?.facts);
  }
  // The demo in the opening (and /shelf's and /docs' signature figures) are samples.
  doc.p(words[locale].sample);

  if (p.flow) doc.h(2, p.flow.title).p(p.flow.body).p(`[${flat(p.flow.note ?? words[locale].sample)}]`);
  if (p.screen) doc.h(2, p.screen.title).p(p.screen.body).p(words[locale].sample);
  if (key === "agent") {
    if (p.how) doc.h(2, p.how.title).numbered(p.how.steps, titled);
    if (p.report) doc.h(2, p.report.title).p(p.report.body).p(words[locale].sample);
  }
  if (p.inside) {
    doc.h(2, p.inside.title);
    for (const group of p.inside.groups ?? []) doc.h(3, group.name).list(group.items, titled);
    if (p.inside.notYet?.items?.length) doc.h(3, p.inside.notYet.title).list(p.inside.notYet.items);
    doc.p(p.inside.note);
  }
  if (p.cr) doc.h(3, p.cr.title).p(p.cr.body);
  if (p.why) doc.h(2, p.why.eyebrow).p(p.why.statement).list(p.why.pillars, titled);
  if (p.who) {
    doc.h(2, p.who.title);
    doc.list(p.who.rows, (r) => {
      const tags = (r.tags ?? []).map((k) => productName(t, k)).join(comma(locale));
      return `**${flat(r.name)}**${has(r.body) ? `: ${flat(r.body)}` : ""}${tags ? ` (${tags})` : ""}`;
    });
    doc.p(p.who.other);
  }
  if (p.works?.rows) {
    doc.h(2, p.works.title);
    doc.list(
      site.PRODUCTS.filter((k) => k !== key && has(p.works.rows[k])),
      (k) => `[${productName(t, k)}](${SITE}${site.PATHS[k][locale]}): ${flat(p.works.rows[k])}`,
    );
  }
  questions(doc, p.faq);
  if (p.cta) doc.h(2, p.cta.title).p(p.cta.body).p(contactLine(locale));
  footer(doc, locale, site.PATHS[key][locale]);
  return doc.text();
}

// ------------------------------------------------------------------ llms.txt

function llmsTxt() {
  const t = copy.en;
  const w = words.en.llms;
  const lines = [`# ALYR`, "", `> ${flat(t.meta.home.descriptionNoOffer ?? t.meta.home.description)}`, ""];
  const steps = (t.home.how?.steps ?? []).map((s) => flat(s.title)).join(" ");
  const types = (t.home.business?.rows ?? []).map((r) => flat(r.name).toLowerCase()).join(", ");
  const shops = Object.values(t.agent?.samples ?? {}).map((s) => s.shop).filter(Boolean).join(", ");
  const facts = [
    w.new,
    types && fill(w.for, { types }),
    steps && fill(w.how, { steps }),
    w.noApp,
    t.footer?.disclaimer,
    w.money,
    offer ? w.pricesOn : w.pricesOff,
    contactLine("en"),
    shops && fill(w.samples, { shops }),
    w.markdown,
  ].filter(has);
  lines.push(...facts.map((f) => `- ${flat(f)}`), "", `## ${w.products}`, "");
  for (const key of site.PRODUCTS) {
    const meta = t.meta[key] ?? {};
    const caveat = w.caveats[key] ? ` ${w.caveats[key]}` : "";
    lines.push(`- [${productName(t, key)}](${SITE}${twinPath(site.PATHS[key].en)}): ${flat(meta.descriptionNoOffer ?? meta.description)}${caveat}`);
  }
  lines.push("", `## ${w.pages}`, "", `- [${w.home}](${SITE}${twinPath("/")}): ${w.homeLine}`, `- [${t.nav.company}](${SITE}${twinPath(site.PATHS.company.en)}): ${flat(t.meta.company.description)}`, `- [${t.nav.privacy}](${SITE}${twinPath(site.PATHS.privacy.en)}): ${flat(t.meta.privacy.description)}`, "", `## ${w.optional}`, "");
  const arabic = Object.entries(site.PATHS).map(([key, p]) => `[${key === "home" ? copy.ar.nav?.home ?? "ALYR" : key === "company" || key === "privacy" ? copy.ar.nav[key] : productName(copy.ar, key)}](${SITE}${twinPath(p.ar)})`);
  lines.push(`- ${w.arabic}: ${arabic.join(", ")}`, "");
  return lines.join("\n");
}

// ------------------------------------------------------------------ write

const written = [];
const twins = [];
for (const [key, paths] of Object.entries(site.PATHS)) {
  for (const locale of ["en", "ar"]) {
    const text = key === "home" ? homeTwin(locale) : key === "company" ? companyTwin(locale) : key === "privacy" ? privacyTwin(locale) : productTwin(locale, key);
    const file = twinPath(paths[locale]);
    if (!text.startsWith("# ") || text.length < 600) problems.push(`${file}: the copy came out too short (${text.length} characters); has copy.ts changed shape?`);
    mkdirSync(dirname(join(out, file)), { recursive: true });
    writeFileSync(join(out, file), text);
    written.push(file);
    twins.push({ locale, path: paths[locale], file, text });
  }
}
const llms = llmsTxt();
writeFileSync(join(out, "llms.txt"), llms);
const full = [
  llms.trim(),
  ...["en", "ar"].flatMap((locale) => twins.filter((tw) => tw.locale === locale).map((tw) => `\n---\n\n<!-- ${SITE}${tw.file} -->\n\n${tw.text.trim()}`)),
].join("\n");
writeFileSync(join(out, "llms-full.txt"), `${full}\n`);

// Types and canonical links, one rule per file (Cloudflare's _headers).
const headersFile = join(out, "_headers");
if (existsSync(headersFile)) {
  const rules = [
    ...twins.map((tw) => `${tw.file}\n  Content-Type: text/markdown; charset=utf-8\n  Link: <${SITE}${tw.path === "/" ? "" : tw.path}>; rel="canonical"`),
    `/llms.txt\n  Content-Type: text/plain; charset=utf-8`,
    `/llms-full.txt\n  Content-Type: text/plain; charset=utf-8`,
  ];
  appendFileSync(headersFile, `${rules.join("\n")}\n`);
}

if (problems.length) {
  console.error(`llms: ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`llms: llms.txt, llms-full.txt and ${written.length} markdown copies written (offer ${offer ? "on" : "off"}; no prices in them either way).`);
