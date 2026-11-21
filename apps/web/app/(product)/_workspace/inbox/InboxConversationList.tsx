"use client";

import { Avatar, Banner, Button, Chip, Icon, Search, Skeleton, Status, Tabs } from "../../../_ui";
import { copy, type Lang } from "./copy";
import { InboxFilteredEmpty, InboxNoOpen } from "./InboxStates";
import { phoneGroups, pickText, rowMark, rowStamp, type Chip as ChipId, type ConversationItem, type InboxCounts, type InboxFilters } from "./logic";

export type ListProps = {
  items: readonly ConversationItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filters: InboxFilters;
  onFilters: (next: Partial<InboxFilters>) => void;
  counts: InboxCounts;
  lang: Lang;
  now: number;
  loading: boolean;
  /** The list could not be loaded; what is shown is the last answer, if any. */
  error: boolean;
  onRetry: () => void;
  onSeeClosed: () => void;
  /** A thread was opened by a phone: the list is the first screen, so it shows its two groups. */
  grouped?: boolean;
};

const CHIPS: { id: ChipId; key: "chipWaiting" | "chipMine" | "chipUnassigned" | "chipNotDelivered" | "chipWindowClosed"; count: (c: InboxCounts) => number | undefined }[] = [
  { id: "waiting", key: "chipWaiting", count: (c) => c.waiting },
  { id: "mine", key: "chipMine", count: (c) => c.mine },
  { id: "unassigned", key: "chipUnassigned", count: (c) => c.unassigned },
  { id: "not_delivered", key: "chipNotDelivered", count: (c) => c.not_delivered },
  { id: "window_closed", key: "chipWindowClosed", count: (c) => c.window_closed },
];

function Row({ item, selected, onSelect, lang, now }: { item: ConversationItem; selected: boolean; onSelect: (id: string) => void; lang: Lang; now: number }) {
  const t = copy(lang);
  const mark = rowMark(item, now);
  const words = pickText(item.last.body, lang);
  const automatic = item.last.direction === "out" && item.last.by === "auto";
  const snippet = automatic ? `${t.autoPrefix}: ${words}` : item.last.direction === "out" && item.last.by ? `${item.last.by}: ${words}` : words;
  const who = item.assigned ? item.assigned.name : automatic ? t.automaticReplies : t.nobodyYet;
  return (
    <li>
      <button type="button" className="ibx-row" aria-current={selected ? "true" : undefined} onClick={() => onSelect(item.id)}>
        <Avatar name={item.name} size={36} />
        <span className="ibx-row-main">
          <span className="ibx-row-top">
            <span className="ibx-row-name"><bdi>{item.name}</bdi></span>
            <span className="ibx-row-time u-mono"><bdi>{rowStamp(item.last.created_at, lang, now)}</bdi></span>
          </span>
          <span className="ibx-row-snip">
            <span className={item.unread > 0 ? "ibx-row-text ibx-row-text--unread" : "ibx-row-text"} dir="auto">{snippet}</span>
            {item.unread > 0 ? <span className="ibx-badge u-mono" aria-label={t.unreadBadge(item.unread)}>{item.unread}</span> : null}
          </span>
          <span className="ibx-row-bot">
            <span className="ibx-row-who">{who}</span>
            {mark?.kind === "waiting" ? <Status tone="warn">{t.waitingFor(mark.minutes)}</Status> : null}
            {mark?.kind === "not_delivered" ? <Status tone="bad">{t.rowNotDelivered}</Status> : null}
            {mark?.kind === "template_only" ? (
              <span className="ibx-lock"><Icon name="lock" />{t.templateOnly}</span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

/** The list while it loads: a row's own shape (an avatar and two lines), so nothing moves when the rows arrive. */
function RowSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" className="ibx-skel">
      <span className="u-sr">{label}</span>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="ibx-skel-row" aria-hidden="true">
          <Skeleton round width="calc(var(--ui-space-32) + var(--ui-space-4))" height="calc(var(--ui-space-32) + var(--ui-space-4))" />
          <div className="ibx-skel-lines">
            <Skeleton width={i % 2 ? 56 : 72} />
            <Skeleton width={i % 3 ? 88 : 64} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InboxConversationList(props: ListProps) {
  const { items, selectedId, onSelect, filters, onFilters, counts, lang, now, loading, error, onRetry, onSeeClosed, grouped } = props;
  const t = copy(lang);
  const q = filters.q ?? "";
  const filtered = Boolean(filters.chip) || q.trim() !== "";
  const groups = grouped ? phoneGroups(items, now) : null;
  const rows = (list: readonly ConversationItem[]) => (
    <ul className="ibx-rowlist">
      {list.map((item) => <Row key={item.id} item={item} selected={item.id === selectedId} onSelect={onSelect} lang={lang} now={now} />)}
    </ul>
  );

  return (
    <div className="ibx-list">
      <header className="ibx-list-head">
        <h1 className="ibx-title">{t.title}</h1>
        {!loading && counts.unread > 0 ? <span className="ibx-unread u-mono" aria-live="polite">{t.unreadCount(counts.unread)}</span> : null}
        <Tabs
          className="ibx-tabs"
          label={t.tabsLabel}
          items={[{ id: "open", label: t.tabOpen, count: loading ? undefined : counts.open }, { id: "closed", label: t.tabClosed }]}
          value={filters.tab}
          onChange={(id) => onFilters({ tab: id as "open" | "closed", chip: null })}
        />
      </header>

      <div className="ibx-tools">
        <Search
          label={t.searchConversations}
          placeholder={t.searchConversations}
          clearLabel={t.clearSearch}
          value={q}
          onChange={(value) => onFilters({ q: value })}
        />
        <div className="ibx-chips" role="group" aria-label={t.chipsLabel}>
          {CHIPS.map((chip) => (
            <Chip key={chip.id} on={filters.chip === chip.id} count={loading ? undefined : chip.count(counts)} onClick={() => onFilters({ chip: filters.chip === chip.id ? null : chip.id })}>
              {t[chip.key]}
            </Chip>
          ))}
        </div>
      </div>

      {error ? (
        <Banner tone="bad" action={<Button kind="quiet" size="xs" onClick={onRetry}>{t.states.tryNow}</Button>}>{t.states.loadError}</Banner>
      ) : null}

      <div className="ibx-rows">
        {loading ? (
          <RowSkeleton label={t.states.loading} />
        ) : items.length === 0 ? (
          filtered ? (
            <InboxFilteredEmpty lang={lang} query={q} onClear={() => onFilters({ chip: null, q: "" })} />
          ) : filters.tab === "open" ? (
            <InboxNoOpen lang={lang} onSeeClosed={onSeeClosed} />
          ) : (
            <InboxNoOpen lang={lang} onSeeClosed={onSeeClosed} closed />
          )
        ) : groups ? (
          <>
            {groups.waiting.length > 0 ? (
              <>
                <p className="u-label ibx-group">{t.phoneWaitingGroup(groups.waiting.length, groups.oldest)}</p>
                {rows(groups.waiting)}
              </>
            ) : null}
            <p className="u-label ibx-group">{t.phoneRestGroup(groups.rest.length)}</p>
            {rows(groups.rest)}
          </>
        ) : (
          rows(items)
        )}
      </div>
    </div>
  );
}

