// The sector pages and owner guides (ALY-232, ALY-233) keep their promises: each answers in
// its first lines, each guide in its first 100 words, every page has its words in both
// languages, and the structured data says no more than the page (an Article by the ALYR
// team, never a person; no price, offer or rating anywhere). Run with `pnpm test`.

import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { importSiteModule, loadSite, SITE_DIR } from "../../../../scripts/site/lib/copy.mjs";

const { copy, site } = await loadSite();
const { structuredData } = await importSiteModule(join(SITE_DIR, "structuredData.ts"));
const words = (text) => text.trim().split(/\s+/).length;

test("every sector page answers its question first, in both languages", () => {
  for (const locale of ["en", "ar"]) {
    for (const key of site.SECTORS) {
      const s = copy[locale].sectors.items[key];
      assert.ok(s, `${locale} ${key}: no copy`);
      assert.doesNotMatch(s.title, /[?؟]/, `${locale} ${key}: the H1 is a statement, no question mark`);
      assert.ok(words(s.answer) <= 80, `${locale} ${key}: the answer is ${words(s.answer)} words; keep it under 80`);
      assert.ok(copy[locale].meta[`for-${key}`]?.description, `${locale} ${key}: no meta description`);
      assert.ok(s.faq.items.length >= 3, `${locale} ${key}: at least three questions`);
      for (const row of s.products.rows) assert.ok(site.PRODUCTS.includes(row.key), `${locale} ${key}: unknown product ${row.key}`);
      // the figure: the homepage's row for this trade, or its own
      const day = s.row ? copy[locale].home.business.rows.find((r) => r.id === s.row) : s.day;
      assert.ok(day?.chats?.length && day?.orders?.length, `${locale} ${key}: no sample afternoon to draw`);
      assert.ok(site.GUIDES.includes(s.guide), `${locale} ${key}: unknown guide ${s.guide}`);
    }
  }
});

test("every guide answers in its first 100 words and is dated", () => {
  for (const locale of ["en", "ar"]) {
    const g = copy[locale].guides;
    for (const key of site.GUIDES) {
      const d = g.items[key];
      // the page opens with the title, the byline and "In short": the answer starts within
      // its first 20 words and is whole within 100 words of its start
      const before = words(d.title) + words(`${g.kind} ${g.by} ${d.date}`) + words(g.short);
      assert.ok(before <= 20, `${locale} ${key}: ${before} words before the answer starts`);
      assert.ok(words(d.short) <= 100, `${locale} ${key}: "In short" is ${words(d.short)} words`);
      assert.match(d.published, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+03:00$/, `${locale} ${key}: published needs a Doha time`);
      assert.ok(d.modified >= d.published, `${locale} ${key}: modified before published`);
      for (const k of d.sectors) assert.ok(site.SECTORS.includes(k), `${locale} ${key}: unknown sector ${k}`);
    }
  }
  // the two languages carry the same dates
  for (const key of site.GUIDES) assert.equal(copy.en.guides.items[key].published, copy.ar.guides.items[key].published);
});

test("structured data: an Article by the ALYR team, WebPage and FAQ for sectors, nothing priced", () => {
  for (const locale of ["en", "ar"]) {
    for (const page of Object.keys(site.PATHS)) {
      const json = JSON.stringify(structuredData(locale, page));
      assert.doesNotMatch(json, /"(offers|price|priceCurrency|aggregateRating|review)"/, `${locale} ${page}: priced or rated markup`);
      assert.doesNotMatch(json, /"@type":"Person"/, `${locale} ${page}: a person in the markup (D-043)`);
    }
    for (const key of site.GUIDES) {
      const graph = structuredData(locale, `guide-${key}`)["@graph"];
      const article = graph.find((node) => node["@type"] === "Article");
      assert.ok(article, `${locale} ${key}: no Article`);
      assert.deepEqual(article.author, { "@type": "Organization", name: copy[locale].guides.by, url: `${site.SITE_URL}${site.PATHS.guides[locale]}` });
      assert.equal(article.headline, copy[locale].guides.items[key].title);
    }
    for (const key of site.SECTORS) {
      const graph = structuredData(locale, `for-${key}`)["@graph"];
      const types = graph.map((node) => node["@type"]);
      for (const type of ["Organization", "WebPage", "BreadcrumbList", "FAQPage"]) assert.ok(types.includes(type), `${locale} ${key}: no ${type}`);
    }
  }
});
