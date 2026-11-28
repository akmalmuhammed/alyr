"use client";

// "N more things only you can change": what ALYR does not change for the owner. ALYR never writes
// to an owner's own website (DECISIONS #8), so a website difference is a step the owner takes: the
// exact text to put on the page, a Copy button, and "I changed it" (the next check looks). Another
// owner's task (claim the listing, add photos) says what is needed in the API's words.

import { useState } from "react";
import type { Finding } from "../discoveryApi";
import type { OnlyYou } from "./adapter";
import { T, type D2Lang } from "./copy";
import { Ic } from "./icons";
import { Ltr, Say } from "./parts";

export function OnlyYouList({ lang, items, busyId, onDone }: {
  lang: D2Lang;
  items: OnlyYou[];
  busyId: string | null;
  onDone?: (f: Finding) => void;
}) {
  const t = T[lang];
  const [copied, setCopied] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 3);
  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); } catch { setCopied(null); }
  };
  return (
    <section className="d2-onlyyou" aria-labelledby="d2-onlyyou-title">
      <h2 className="d2-section" id="d2-onlyyou-title"><Say lang={lang}>{t.onlyYou(items.length)}</Say></h2>
      <p className="d2-small d2-muted d2-onlyyou-sub">{t.onlyYouSub}</p>
      <ul className="d2-changes">
        {shown.map(({ f, steps }) => (
          <li key={f.id}>
            <div>
              <div className="d2-what"><Say lang={lang}>{f.title}</Say>{f.location?.name ? <span className="d2-onlyyou-place"> · <Say lang={lang}>{f.location.name}</Say></span> : null}</div>
              {steps.length ? steps.map((s, i) => {
                const key = `${f.id}-${i}`;
                return (
                  <div className="d2-step" key={key}>
                    <span className="d2-step-k"><Ic name="person" size="xs" /><Say lang={lang}>{`${t.onWebsite} · ${s.field_label}`}</Say></span>
                    <div className="d2-copyrow">
                      <span className="d2-copy-lab">{t.exactText}</span>
                      <code className="d2-copytext"><Ltr>{s.after.text}</Ltr></code>
                      <button className="d2-btn d2-btn-quiet d2-btn-sm" type="button" onClick={() => void copy(key, s.after.text)} aria-label={t.copyAria(s.field_label)}>
                        <Ic name={copied === key ? "check" : "file"} size="xs" />{copied === key ? t.copied : t.copy}
                      </button>
                    </div>
                  </div>
                );
              }) : (
                <div className="d2-step">
                  <span className="d2-step-k"><Ic name="person" size="xs" />{t.onYourOwn}</span>
                  {f.what_is_needed ? <p className="d2-small"><Say lang={lang}>{f.what_is_needed}</Say></p> : null}
                </div>
              )}
            </div>
            <div className="d2-act">
              {onDone ? (
                <button className="d2-btn d2-btn-line d2-btn-sm" type="button" disabled={busyId !== null} onClick={() => onDone(f)}>{t.markChanged}</button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {items.length > 3 ? (
        <button className="d2-btn d2-btn-quiet d2-btn-sm d2-onlyyou-more" type="button" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          <Ic name="down" size="xs" /><Say lang={lang}>{all ? t.showFewer : t.showAll(items.length)}</Say>
        </button>
      ) : null}
    </section>
  );
}
