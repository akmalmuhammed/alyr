"use client";

// Share and QR codes (ALY-112): a link to the whole menu, to one category or to one item;
// the link copied or sent on WhatsApp; a QR code for the counter; and a code for every table,
// with the table number in the link so staff see it on the order. Pasted into WhatsApp or
// Instagram, a link shows the photo, name and price (the order page's own preview).
//
// A shared link is public: it carries no customer. A customer who opens it is sent to the
// shop's WhatsApp number to get a link of their own. The library that draws the codes loads
// only when this sheet opens, so the Catalog's list does not carry it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { color } from "../../_tokens/tokens";
import { api, sayError, type Item, type ShareBase } from "./catalogApi";
import { COPY, type Lang } from "./catalogCopy";
import { CodeList } from "./CatalogCode";
import { Field, Icon, Sheet, type Toast } from "./CatalogUi";

type Push = (text: string, options?: { tone?: Toast["tone"]; undo?: () => void }) => number;
export type Target = { kind: "shop" } | { kind: "category"; name: string } | { kind: "item"; id: string; name: string };
type Qr = typeof import("./qr");

// Ink on paper, always: a code on a dark theme is still dark on white, or it will not scan.
const INK = { dark: color.brand.carbon, light: color.ink.white };
const MAX_TABLES = 200;

/** "1-12, A1, A2" as ["1", ..., "12", "A1", "A2"]; null if something in it is not a table. */
export function parseTables(text: string): string[] | null {
  const labels: string[] = [];
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const range = /^(\d{1,3})-(\d{1,3})$/.exec(part);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (to < from || to - from + 1 > MAX_TABLES) return null;
      for (let n = from; n <= to; n++) labels.push(String(n));
    } else if (/^[\p{L}\p{N}]{1,8}$/u.test(part)) labels.push(part.toUpperCase());
    else return null;
    if (labels.length > MAX_TABLES * 2) return null;
  }
  const unique = [...new Set(labels)];
  return unique.length >= 1 && unique.length <= MAX_TABLES ? unique : null;
}

/** +974 5555 0100, for people. */
function phone(digits: string): string {
  return digits.startsWith("974") && digits.length === 11
    ? `+974 ${digits.slice(3, 7)} ${digits.slice(7)}` : `+${digits}`;
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const slug = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "code";

type Card = { label: string; link: string; svg: string; code?: number | null };

/** The sheet that is printed: one card for the counter, or one for each table. Shown only to the printer. */
function PrintSheet({ cards, base, lang, onDone }: { cards: Card[]; base: ShareBase; lang: Lang; onDone: () => void }) {
  const en = COPY.en;
  const ar = COPY.ar;
  useEffect(() => {
    const done = () => onDone();
    window.addEventListener("afterprint", done, { once: true });
    const wait = setTimeout(() => window.print(), 250);
    return () => { clearTimeout(wait); window.removeEventListener("afterprint", done); };
  }, [onDone]);
  return createPortal(
    <div className="ct-printsheet" lang={lang}>
      {cards.map((card) => (
        <article key={card.label || "counter"} className="ct-pcard">
          <header>
            <b dir="auto">{base.name}</b>
            <b dir="rtl" lang="ar">{base.name_ar || base.name}</b>
          </header>
          {/* eslint-disable-next-line @next/next/no-img-element -- a drawn code, not a photo */}
          <img className="ct-pqr" alt="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(card.svg)}`} />
          {card.label && <p className="ct-ptable"><span>{en.tableName(card.label)}</span><span dir="rtl" lang="ar">{ar.tableName(card.label)}</span></p>}
          {card.code != null && (
            <div className="ct-pcode">
              <p lang="en"><b className="num" dir="ltr">{en.printCode(card.code)}</b>{base.whatsapp && <span>{en.printSend(card.code, phone(base.whatsapp))}</span>}</p>
              <p lang="ar" dir="rtl"><b className="num">{ar.printCode(card.code)}</b>{base.whatsapp && <span>{ar.printSend(card.code, `⁦${phone(base.whatsapp)}⁩`)}</span>}</p>
            </div>
          )}
          <div className="ct-ptext">
            <p lang="en"><b>{en.printScan}</b><span>{en.printHow}</span></p>
            <p lang="ar" dir="rtl"><b>{ar.printScan}</b><span>{ar.printHow}</span></p>
          </div>
          <small className="ct-plink" dir="ltr">{card.link}</small>
          <footer><span>{en.printFoot}</span><span dir="rtl" lang="ar">{ar.printFoot}</span></footer>
        </article>
      ))}
    </div>,
    document.body,
  );
}

export function CatalogShare({
  lang, target, categories, push, onClose, onSettings, links = true, codes = true,
}: {
  lang: Lang; target: Target; categories: { name: string; name_ar: string }[]; push: Push;
  onClose: () => void; onSettings: () => void;
  /** The shop's features (ALY-148): item and category links, and QR codes for counter and tables. */
  links?: boolean; codes?: boolean;
}) {
  const t = COPY[lang];
  const [base, setBase] = useState<ShareBase | null>(null);
  const [failure, setFailure] = useState("");
  const [qr, setQr] = useState<Qr | null>(null);
  const [choice, setChoice] = useState<string>(target.kind === "item" ? "item" : target.kind === "category" ? `cat:${target.name}` : "shop");
  const [tables, setTables] = useState("");
  const [tableList, setTableList] = useState<string[] | null>(null);
  const [tablesError, setTablesError] = useState("");
  const [printing, setPrinting] = useState<Card[] | null>(null);
  const [itemCode, setItemCode] = useState<number | null>(null);
  const itemId = target.kind === "item" ? target.id : null;

  // The item's code goes on its printed card.
  useEffect(() => {
    if (!itemId) return;
    api<Item>(`/api/items/${itemId}`).then((item) => setItemCode(item.code)).catch(() => undefined);
  }, [itemId]);

  useEffect(() => {
    api<ShareBase>("/api/items/share").then(setBase).catch((e) => setFailure(sayError(e, lang, t)));
    import("./qr").then(setQr).catch(() => setFailure(t.failed));
  }, [lang, t]);

  const link = useMemo(() => {
    if (!base?.url) return "";
    if (choice === "item" && target.kind === "item") return `${base.url}?item=${target.id}`;
    if (choice.startsWith("cat:")) return `${base.url}?cat=${encodeURIComponent(choice.slice(4))}`;
    return base.url;
  }, [base, choice, target]);

  const what = choice === "item" && target.kind === "item" ? target.name
    : choice.startsWith("cat:") ? choice.slice(4) : t.shareMenu;
  const draw = useCallback((address: string) => (qr ? qr.svg(address, INK) : ""), [qr]);
  const counter = useMemo(() => (link && qr ? draw(link) : ""), [link, qr, draw]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      push(t.copied);
    } catch {
      push(t.copyFailed, { tone: "bad" });
    }
  }

  function makeTables() {
    const list = parseTables(tables);
    if (!list) { setTablesError(t.tablesBad); setTableList(null); return; }
    setTablesError("");
    setTableList(list);
  }

  const tableLink = (label: string) => (base ? `${base.url}?table=${encodeURIComponent(label)}` : "");
  const cardFor = (label: string, address: string, code?: number | null): Card => ({ label, link: address, svg: draw(address), code });
  const scope = choice === "item" && target.kind === "item" ? { kind: "item" as const, id: target.id }
    : choice.startsWith("cat:") ? { kind: "category" as const, name: choice.slice(4) } : { kind: "shop" as const };

  return (
    <>
      <Sheet title={t.shareTitle} subtitle={what} onClose={onClose} closeLabel={t.close} wide>
        {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}

        {(target.kind !== "shop") && links && (
          <Field label={t.shareWhat}>
            <select className="ct-select" value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="shop">{t.shareMenu}</option>
              {target.kind === "item" && <option value="item">{t.shareItem(target.name)}</option>}
              {categories.map((c) => (
                <option key={c.name} value={`cat:${c.name}`}>{t.shareCategory(lang === "ar" && c.name_ar ? c.name_ar : c.name)}</option>
              ))}
            </select>
          </Field>
        )}

        {links && <section className="ct-share" aria-labelledby="ct-share-link">
          <h3 id="ct-share-link">{t.shareLink}</h3>
          <div className="ct-linkrow">
            <input className="ct-linkbox" readOnly value={link} dir="ltr" aria-label={t.shareLink}
              onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn ct-btn" disabled={!link} onClick={() => void copy()}><Icon name="copy" />{t.copyLink}</button>
          </div>
          <a className={`btn ct-btn ${link ? "" : "disabled"}`} aria-disabled={!link} target="_blank" rel="noopener noreferrer"
            href={link ? `https://wa.me/?text=${encodeURIComponent(link)}` : undefined}><Icon name="share" />{t.shareWhatsApp}</a>
          <p className="ct-hint">{t.shareHint}</p>
          {base && (base.whatsapp
            // The number is read left to right, whatever the sentence around it.
            ? <p className="ct-hint">{t.shareOrderTo(`⁦${phone(base.whatsapp)}⁩`)}</p>
            : (
              <p className="ct-alert">
                <Icon name="warn" /><span>{t.shareNoNumber}{" "}
                  <button type="button" className="ct-linkbtn" onClick={() => { onClose(); onSettings(); }}>{t.shareSettings}</button></span>
              </p>
            ))}
        </section>}

        <CodeList lang={lang} t={t} scope={scope} push={push} />

        {codes && <section className="ct-share" aria-labelledby="ct-share-qr">
          <h3 id="ct-share-qr">{t.qrTitle}</h3>
          <div className="ct-qrbox">
            {counter
              // eslint-disable-next-line @next/next/no-img-element -- a drawn code, not a photo
              ? <img className="ct-qr" alt={t.qrAlt(what)} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(counter)}`} />
              : <span className="ct-qr empty" />}
          </div>
          <p className="ct-hint">{t.qrHint}</p>
          <div className="ct-btnrow">
            <button type="button" className="btn ct-btn" disabled={!counter}
              onClick={() => save(new Blob([counter], { type: "image/svg+xml" }), `${slug(what)}.svg`)}><Icon name="download" />{t.downloadSvg}</button>
            <button type="button" className="btn ct-btn" disabled={!counter || !qr}
              onClick={() => { void qr?.png(link, INK).then((b) => save(b, `${slug(what)}.png`)).catch(() => push(t.failed, { tone: "bad" })); }}><Icon name="download" />{t.downloadPng}</button>
            <button type="button" className="btn ct-btn" disabled={!counter} onClick={() => setPrinting([cardFor("", link, scope.kind === "item" ? itemCode : null)])}><Icon name="printer" />{t.print}</button>
          </div>
        </section>}

        {codes && <section className="ct-share" aria-labelledby="ct-share-tables">
          <h3 id="ct-share-tables">{t.tablesTitle}</h3>
          <p className="ct-hint">{t.tablesHint}</p>
          <form className="ct-tablesform" noValidate onSubmit={(e) => { e.preventDefault(); makeTables(); }}>
            <Field label={t.tablesField} hint={t.tablesExample} error={tablesError}>
              <input value={tables} onChange={(e) => setTables(e.target.value)} dir="ltr" inputMode="text" autoComplete="off" />
            </Field>
            <button type="submit" className="btn ct-btn" disabled={!base || !qr}><Icon name="qr" />{t.tablesMake}</button>
          </form>
          {tableList && (
            <>
              <p className="ct-hint" role="status">{t.tablesMade(tableList.length)}</p>
              <ul className="ct-tablegrid">
                {tableList.map((label) => {
                  const address = tableLink(label);
                  const svg = draw(address);
                  return (
                    <li key={label} className="ct-tablecard">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a drawn code, not a photo */}
                      <img className="ct-qr small" alt={t.qrAlt(t.tableName(label))} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} />
                      <b dir="auto">{t.tableName(label)}</b>
                      <span className="ct-tablebtns">
                        <button type="button" className="sh-iconbtn" aria-label={`${t.downloadSvg}: ${t.tableName(label)}`}
                          onClick={() => save(new Blob([svg], { type: "image/svg+xml" }), `table-${slug(label)}.svg`)}><Icon name="download" /></button>
                        <button type="button" className="sh-iconbtn" aria-label={`${t.downloadPng}: ${t.tableName(label)}`}
                          onClick={() => { void qr?.png(address, INK).then((b) => save(b, `table-${slug(label)}.png`)); }}><Icon name="image" /></button>
                        <button type="button" className="sh-iconbtn" aria-label={`${t.print}: ${t.tableName(label)}`}
                          onClick={() => setPrinting([cardFor(label, address)])}><Icon name="printer" /></button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <button type="button" className="btn primary ct-btn" onClick={() => setPrinting(tableList.map((label) => cardFor(label, tableLink(label))))}>
                <Icon name="printer" />{t.printAll}
              </button>
            </>
          )}
        </section>}
      </Sheet>
      {printing && base && <PrintSheet cards={printing} base={base} lang={lang} onDone={() => setPrinting(null)} />}
    </>
  );
}
