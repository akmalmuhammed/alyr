"use client";

import { Banner, Button, DashedSlot, Empty } from "../../../_ui";
import { copy, type Lang } from "./copy";

/** Nothing is open (or closed): one sentence and the way to the other list. */
export function InboxNoOpen({ lang, onSeeClosed, closed = false }: { lang: Lang; onSeeClosed: () => void; closed?: boolean }) {
  const t = copy(lang).states;
  return (
    <Empty
      className="ibx-empty"
      title={closed ? t.noClosedTitle : t.noOpenTitle}
      action={closed ? undefined : <Button kind="line" size="sm" onClick={onSeeClosed}>{t.seeClosed}</Button>}
    >
      {closed ? t.noClosedText : t.noOpenText}
    </Empty>
  );
}

/** A search or a filter found nothing. */
export function InboxFilteredEmpty({ lang, query, onClear }: { lang: Lang; query: string; onClear: () => void }) {
  const t = copy(lang).states;
  return (
    <Empty
      className="ibx-empty"
      title={t.nothingMatches(query.trim())}
      action={<Button kind="quiet" size="sm" onClick={onClear}>{query.trim() ? t.clear : t.clearFilters}</Button>}
    >
      {t.nothingMatchesText}
    </Empty>
  );
}

/** The shop has no conversation at all yet: a dashed slot for what will appear, no button (a customer starts it). */
export function InboxFirstRun({ lang }: { lang: Lang }) {
  const t = copy(lang).states;
  return (
    <div className="ibx-firstrun">
      <DashedSlot title={t.firstRunTitle}>{t.firstRunText}</DashedSlot>
    </div>
  );
}

/** The main pane when no conversation is chosen. */
export function InboxPick({ lang }: { lang: Lang }) {
  return <Empty className="ibx-empty ibx-empty--pane" title={copy(lang).states.pick} />;
}

/** The connection is gone: what is on screen is kept, and nothing is promised that does not happen. */
export function InboxOffline({ lang, time, onRetry }: { lang: Lang; time: string; onRetry: () => void }) {
  const t = copy(lang).states;
  return (
    <Banner tone="warn" action={<Button kind="quiet" size="xs" onClick={onRetry}>{t.tryNow}</Button>}>
      {t.offline(time)}
    </Banner>
  );
}
