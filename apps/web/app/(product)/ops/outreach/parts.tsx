"use client";

// Pieces every outreach screen uses: the pill, the designed empty state, the error with its
// retry, a check result, and a draft read with its numbered sources.

import Link from "next/link";
import { FINDING, W } from "./copy";
import { annotate, numberSources, shortUrl, words, type Tone } from "./outreachLogic";
import type { CheckResult, Claim, Draft } from "./types";

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`sh-pill ${tone}`}>{children}</span>;
}

/** An empty screen in its real shape: dashed slots saying what will appear, and how to start. */
export function Empty({ title, text, slots = 2, action }: { title: string; text: string; slots?: number; action?: { href: string; label: string } }) {
  return (
    <section className="or-empty">
      <div className="or-empty-slots" aria-hidden="true">
        {Array.from({ length: slots }, (_, i) => <span key={i}><i /><i /><i /></span>)}
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action && <Link className="btn small" href={action.href}>{action.label}</Link>}
    </section>
  );
}

export function Failed({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="or-failed" role="alert">
      <p className="ops-error">{message || W.loadError}</p>
      <button type="button" className="btn small" onClick={retry}>{W.retry}</button>
    </div>
  );
}

/** A critic or lint result: one pill for the whole, then each finding that failed, then (folded)
 *  the ones that passed. */
export function Checks({ title, result }: { title: string; result: CheckResult | null }) {
  if (!result) {
    return <div className="or-checks"><span className="or-checks-name">{title}</span><Pill tone="idle">{W.review.notRun}</Pill></div>;
  }
  const failed = result.findings.filter((f) => !f.ok);
  const passed = result.findings.filter((f) => f.ok);
  return (
    <div className="or-checks">
      <span className="or-checks-name">{title}</span>
      <Pill tone={result.ok ? "active" : "bad"}>{result.ok ? W.review.passed : W.review.failed}</Pill>
      {failed.length > 0 && (
        <ul className="or-findings">
          {failed.map((f) => <li key={f.key} className="bad"><b>{FINDING[f.key] ?? f.key}</b>{f.note && <> · {f.note}</>}</li>)}
        </ul>
      )}
      {passed.length > 0 && (
        <details className="or-passed">
          <summary>{passed.length} {W.review.passed.toLowerCase()}</summary>
          <ul className="or-findings">
            {passed.map((f) => <li key={f.key}>{FINDING[f.key] ?? f.key}{f.note && <> · {f.note}</>}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

/** A draft as the recipient would read it, each sentence followed by the numbers of the claims it
 *  rests on, and the sources below: the claim, the words quoted from the page, and the page. */
export function DraftView({ draft, claims, sources = true }: { draft: Draft; claims: Claim[]; sources?: boolean }) {
  const numbered = numberSources(draft.sentences, claims);
  const { pieces, unplaced } = annotate(draft.body, draft.sentences, numbered);
  const anchor = (n: number) => `src-${draft.id}-${n}`;
  return (
    <div className="or-draft">
      <p className="or-subject"><span>{W.review.subject}</span> <b dir="auto">{draft.subject}</b></p>
      <div className="or-body" dir={draft.language === "ar" ? "rtl" : "ltr"} lang={draft.language}>
        {pieces.map((p, i) => (
          <span key={i}>
            {p.text}
            {p.refs.map((n) => <sup key={n}><a href={`#${anchor(n)}`} aria-label={`Source ${n}`}>{n}</a></sup>)}
          </span>
        ))}
      </div>
      <p className="or-meta">{W.review.words(words(draft.body))}</p>
      {numbered.missing.length > 0 && <p className="ops-error">{W.review.missing(numbered.missing)}</p>}
      {unplaced.length > 0 && (
        <div className="or-unplaced">
          <span>{W.review.unplaced}</span>
          <ul>{unplaced.map((s, i) => <li key={i} dir="auto">{s.text}</li>)}</ul>
        </div>
      )}
      {sources && (
        <div className="or-sources">
          <h3>{W.review.sources}</h3>
          {numbered.list.length === 0 ? <p className="sh-note">{W.review.noSources}</p> : (
            <ol>
              {numbered.list.map(({ n, claim }) => (
                <li key={claim.id} id={anchor(n)}>
                  <span className="or-src-n num" aria-hidden="true">{n}</span>
                  <div>
                    <p dir="auto">{claim.text}</p>
                    <blockquote dir="auto"><span className="ops-sr">{W.review.quoted}: </span>“{claim.quote}”</blockquote>
                    <a href={claim.url} target="_blank" rel="noopener noreferrer nofollow" className="or-src-url">{shortUrl(claim.url)}</a>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
