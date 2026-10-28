"use client";

// Item codes in the workspace (ALY-136): the item's short number with a copy button (the edit
// sheet), and the list of codes the share sheet shows beside each item. A code is set by the
// database when the item is made and never changes, so there is nothing to edit here: an owner
// reads it, copies it, and tells customers, who send it in the chat to order the item.

import { useEffect, useState } from "react";
import { api, nameOf, sayError, type Item } from "./catalogApi";
import type { Copy, Lang } from "./catalogCopy";
import { Icon, type Toast } from "./CatalogUi";

type Push = (text: string, options?: { tone?: Toast["tone"]; undo?: () => void }) => number;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The code, large, with what it is for and a button that copies it. */
export function CodeBox({ code, name, t, push }: { code: number; name: string; t: Copy; push: Push }) {
  return (
    <section className="ct-codebox" aria-labelledby="ct-code-title">
      <div className="ct-codehead">
        <h3 id="ct-code-title">{t.codeLabel}</h3>
        <b className="num ct-codenum" dir="ltr">{code}</b>
        <button type="button" className="btn small" aria-label={t.codeCopyOf(code, name)}
          onClick={() => void copyText(String(code)).then((ok) => push(ok ? t.codeCopied : t.codeCopyFailed, ok ? undefined : { tone: "bad" }))}>
          <Icon name="copy" />{t.codeCopy}
        </button>
      </div>
      <p className="ct-hint">{t.codeHint}</p>
    </section>
  );
}

const SHOWN = 40;

/** The codes of the items being shared: one item, a category, or the first of the whole menu. */
export function CodeList({
  lang, t, scope, push,
}: {
  lang: Lang; t: Copy; scope: { kind: "item"; id: string } | { kind: "category"; name: string } | { kind: "shop" }; push: Push;
}) {
  // What was read last, and for which scope: a different scope shows nothing until it arrives.
  const [loaded, setLoaded] = useState<{ key: string; rows: Item[]; total: number; failure: string } | null>(null);
  const key = scope.kind === "item" ? `item:${scope.id}` : scope.kind === "category" ? `cat:${scope.name}` : "shop";
  const here = loaded && loaded.key === key ? loaded : null;
  const rows = here ? here.rows : null;
  const total = here ? here.total : 0;
  const failure = here ? here.failure : "";

  useEffect(() => {
    let live = true;
    const load = scope.kind === "item"
      ? api<Item>(`/api/items/${scope.id}`).then((item) => ({ items: [item], total: 1 }))
      : api<{ items: Item[]; total: number }>(
        `/api/items?status=live&limit=${SHOWN}${scope.kind === "category" ? `&category=${encodeURIComponent(scope.name)}` : ""}`,
      );
    load.then((answer) => {
      if (live) setLoaded({ key, rows: answer.items.filter((i) => i.code !== null), total: answer.total, failure: "" });
    }).catch((error) => { if (live) setLoaded({ key, rows: [], total: 0, failure: sayError(error, lang, t) }); });
    return () => { live = false; };
    // `scope` is rebuilt on every render; `key` says when it really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lang, t]);

  return (
    <section className="ct-share" aria-labelledby="ct-share-codes">
      <h3 id="ct-share-codes">{t.shareCodesTitle}</h3>
      <p className="ct-hint">{t.shareCodesHint}</p>
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      {rows !== null && rows.length === 0 && !failure && <p className="ct-hint">{t.shareCodesEmpty}</p>}
      {rows !== null && rows.length > 0 && (
        <ul className="ct-codelist">
          {rows.map((item) => {
            const name = nameOf(item, lang);
            return (
              <li key={item.id}>
                <span className="ct-codename" dir="auto">{name}</span>
                <b className="num ct-codenum small" dir="ltr">{item.code}</b>
                <button type="button" className="sh-iconbtn" aria-label={t.codeCopyOf(item.code as number, name)}
                  onClick={() => void copyText(String(item.code)).then((ok) => push(ok ? t.codeCopied : t.codeCopyFailed, ok ? undefined : { tone: "bad" }))}>
                  <Icon name="copy" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {rows !== null && total > rows.length && <p className="ct-hint">{t.shareCodesMore(total - rows.length)}</p>}
    </section>
  );
}
