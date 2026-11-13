"use client";

// What the workspace's working screens (Inbox, Credit accounts, Orders, Bookings list, Team)
// share: the kinds of thing they read, the two fetch helpers, the "Handled by" menu, the facts
// about the shop they all ask for (who is signed in, the team, who may manage, the shop's name),
// the filter ALYR Agent's links set, and the frame every screen sits in. Moved out of Screens.tsx
// unchanged when that file was split into one file per screen.

import { useCallback, useState, type ReactNode } from "react";
import type { Lang } from "../lang";
import { usePolling } from "../poll";
import { asksLedgerSummary, type ShopNames } from "../shopLedger";

export type Person = { id: string; name: string };
export type Me = { signed_in: boolean; id: string | null; name: string; email: string; role: string };
export type Member = { id: string; name: string; email: string; role: string };
export type DocumentRef = { id: string; kind: string; number: string; status: string };
export type Buckets = { d0_30: number; d31_60: number; d61_90: number; d90_plus: number };
export type Customer = {
  id: string; name: string; phone: string | null; balance: number; balance_text: string;
  oldest_days: number; buckets: Buckets; over_limit: boolean; promised_until: string | null;
  opted_out: boolean; assigned: Person | null;
  last_reminded_at?: string | null; promise_passed?: boolean;
};
export type Summary = {
  shop: { name: string; name_ar: string };
  outstanding_text: string; outstanding: number; buckets: Buckets;
  customers_owing: number; customers: Customer[];
  collected_by_link_text: string; payments_by_link: number;
};

export type WorkspaceTab = "inbox" | "ledger" | "orders" | "bookings" | "team";

/** The lists ALYR Agent links to (`/app/orders?show=unconfirmed`): exactly the rows its rule
 * counted, so "Show me" lands on them. */
export const SHOWS: Record<string, { tab: WorkspaceTab; en: string; ar: string }> = {
  waiting: { tab: "inbox", en: "Customers waiting for an answer", ar: "عملاء بانتظار الرد" },
  unconfirmed: { tab: "orders", en: "Orders not confirmed", ar: "طلبات لم تُؤكَّد بعد" },
  ready: { tab: "orders", en: "Orders ready, not collected", ar: "طلبات جاهزة لم تُستلم" },
  unpaid: { tab: "orders", en: "Orders with a payment link still open", ar: "طلبات برابط دفع مفتوح" },
  paid: { tab: "orders", en: "Orders paid by link", ar: "طلبات مدفوعة عبر الرابط" },
  unmarked: { tab: "bookings", en: "Visits not marked yet", ar: "زيارات لم تُسجَّل بعد" },
  no_show: { tab: "bookings", en: "No-shows", ar: "حالات الغياب" },
  repeat_no_show: { tab: "bookings", en: "Booked again after missing twice", ar: "محجوزون بعد غياب مرتين" },
  overdue: { tab: "ledger", en: "Owed 30+ days, no promise, no reminder in 7 days", ar: "مستحق منذ 30 يوماً أو أكثر دون وعد ودون تذكير خلال 7 أيام" },
  promised: { tab: "ledger", en: "Promised to pay", ar: "وعدوا بالسداد" },
  promise_passed: { tab: "ledger", en: "Promised date passed, nothing paid", ar: "مضى موعد الوعد ولم يُدفع شيء" },
  over_limit: { tab: "ledger", en: "Over their credit limit", ar: "تجاوزوا حد الائتمان" },
};
export const DAY_MS = 86_400_000;

/** Like getJson, but a module the shop has not switched on (403) gives `fallback`. */
export async function maybe<R>(url: string, fallback: R): Promise<R> {
  const response = await fetch(url, { cache: "no-store" });
  if (response.status === 403) return fallback;
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

export async function getJson<R>(url: string, init?: RequestInit): Promise<R> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

/** Who is responsible for one item. Changing it is recorded in the item's history. */
export function AssignSelect({ value, members, label, nobody, onChange }: {
  value: Person | null; members: Member[]; label: string; nobody: string;
  onChange: (userId: string | null) => void;
}) {
  return (
    <select className="assign-select" aria-label={label} value={value?.id ?? ""}
      onChange={(e) => onChange(e.target.value || null)} onClick={(e) => e.stopPropagation()}>
      <option value="">{nobody}</option>
      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
}

/** Gives a row to a person (or takes it back with null); the caller looks again afterwards. */
export async function giveRow(path: string, userId: string | null) {
  await getJson(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
}

/** What every working screen is given by the shell. */
export type ScreenProps = {
  lang: Lang;
  /** Shown under the screen's title, before its own content (the shell's team report). */
  intro?: ReactNode;
  /** A filter from ALYR Agent (`?show=`), and how to clear it. */
  show?: string | null;
  onClearShow?: () => void;
  /** What is switched on for this shop, and its names (the workspace's own state). A shop without
   * the credit accounts module is not asked for their summary, which would only be refused. */
  modules?: readonly string[];
  business?: ShopNames;
};

/**
 * Who is signed in, the team for the "Handled by" menus, who may manage, and the shop's name
 * over every screen change rarely: asked at the start and every 5 minutes, not with every
 * look at the lists.
 */
export function useShopFacts(modules: readonly string[] | undefined) {
  const ledgerOn = asksLedgerSummary(modules);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [canManage, setCanManage] = useState(false);
  const loadShop = useCallback(async () => {
    await Promise.all([
      getJson<Me>("/api/auth/me").then(setMe),
      getJson<{ members: Member[]; can_manage: boolean }>("/api/team").then((team) => {
        setMembers(team.members);
        setCanManage(team.can_manage);
      }),
      ledgerOn ? maybe<Summary | null>("/api/ledger/summary", null).then(setSummary) : null,
    ]);
  }, [ledgerOn]);
  usePolling(loadShop, 300_000);
  return { me, members, canManage, summary, setSummary };
}

/** The `?show=` filter that applies to this screen, if any (a filter for another screen is ignored). */
export function activeFilter(show: string | null | undefined, tab: WorkspaceTab): string | null {
  return show && SHOWS[show] && SHOWS[show].tab === tab ? show : null;
}

/** The line that says which rows ALYR Agent's link asked for, and the way back to all of them. */
export function ShowFilter({ filter, lang, onClearShow }: { filter: string | null; lang: Lang; onClearShow?: () => void }) {
  if (!filter) return null;
  return (
    <p className="show-filter" role="status">
      <span>{SHOWS[filter][lang]}</span>
      {onClearShow && <button type="button" className="btn small" onClick={onClearShow}>{lang === "ar" ? "اعرض الكل" : "Show all"}</button>}
    </p>
  );
}

/** The frame of a working screen inside the shell: its title, the shop's name and what the screen is for. */
export function ScreenFrame({ lang, error, title, shop, sub, intro, children }: {
  lang: Lang; error: string; title: string; shop: string; sub: string; intro?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className="shell">
      <div className="panes embedded">
        <main className="work" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
          {error && <div className="error" dir="ltr">{error}</div>}
          <div className="work-head">
            <div>
              <h1 className="work-title">{title}</h1>
              <p>
                {shop} · {sub}
              </p>
            </div>
            <span className="spacer" />
          </div>

          {intro}

          {children}
        </main>
      </div>
    </div>
  );
}
