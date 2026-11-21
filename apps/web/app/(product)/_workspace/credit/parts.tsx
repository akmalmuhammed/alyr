"use client";

import { Avatar, Status, Tag } from "../../../_ui";
import { counted, formatDate, money, none } from "../../../_ui/format";
import { copy, type Lang } from "./copy";
import { ageTone, promiseState, type CreditAccountRow } from "./logic";

/** An amount of money in a sentence or a cell: the shared formatter, kept in one run in Arabic. */
export function Amount({ value, lang }: { value: number; lang: Lang }) {
  return <bdi>{money(value, lang)}</bdi>;
}

/** A number of days as a tag: "25 days", grey to 30, amber to 60, red over 60. Nothing when there is no debt. */
export function AgeTag({ days, lang }: { days: number; lang: Lang }) {
  const t = copy(lang);
  if (days <= 0) return <span className="crd-quiet">{none(lang)}</span>;
  return <Tag tone={ageTone(days)} dot={false}>{counted(days, t.nounDay, lang)}</Tag>;
}

/** A team member as a small avatar and a name, or "None". */
export function Person({ name, lang }: { name: string | null | undefined; lang: Lang }) {
  if (!name) return <span className="crd-quiet">{none(lang)}</span>;
  return (
    <span className="crd-person">
      <Avatar name={name} size={20} />
      <bdi>{name}</bdi>
    </span>
  );
}

/** The promise column: passed (amber), by a date (grey dot), or none. */
export function PromiseCell({ row, lang }: { row: Pick<CreditAccountRow, "promisedUntil" | "promisePassed" | "promisePassedOn">; lang: Lang }) {
  const t = copy(lang);
  const state = promiseState(row);
  if (state === "none") return <span className="crd-quiet">{none(lang)}</span>;
  if (state === "passed") {
    const on = row.promisePassedOn ? formatDate(row.promisePassedOn, lang) : null;
    return <Status tone="warn">{t.promisePassed(on)}</Status>;
  }
  return <Status tone="n">{t.promiseBy(formatDate(row.promisedUntil, lang))}</Status>;
}

/** Tags that come with a name: over the limit, said STOP. */
export function AccountTags({ row, lang }: { row: Pick<CreditAccountRow, "overLimit" | "optedOut">; lang: Lang }) {
  const t = copy(lang);
  return (
    <>
      {row.overLimit ? <Tag tone="bad" dot={false}>{t.tagOverLimit}</Tag> : null}
      {row.optedOut ? <Tag tone="n" dot={false}>{t.tagStop}</Tag> : null}
    </>
  );
}
