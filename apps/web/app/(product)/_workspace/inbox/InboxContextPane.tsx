"use client";

import { Avatar, Button, Icon, IconButton, KV, KVList, SkeletonText, Status } from "../../../_ui";
import { formatDate, formatTime, money } from "../../../_ui/format";
import { copy, type Lang } from "./copy";
import { daysBetween, pickText } from "./logic";
import type { Agreement, CustomerContext } from "./types";

export type ContextProps = {
  data: CustomerContext | null;
  lang: Lang;
  now: number;
  loading: boolean;
  /** A phone shows this pane as a screen of its own, with a way back to the conversation. */
  onBack?: () => void;
  /** Where "Credit account", "Open booking" and "All orders" go: the workspace's own sections. */
  hrefs: { credit: string; bookings: string; orders: string };
};

function agreementText(a: Agreement, lang: Lang): string {
  const t = copy(lang);
  if (a.state === "agreed") return t.agreed(a.at ? formatDate(a.at, lang, { weekday: false, year: "always" }) : null);
  return a.state === "not_agreed" ? t.notAgreed : t.notAsked;
}

export function InboxContextPane({ data, lang, now, loading, onBack, hrefs }: ContextProps) {
  const t = copy(lang);
  if (loading || !data) {
    return (
      <div className="ibx-ctx" aria-busy="true">
        <div className="ibx-ctx-sec"><SkeletonText lines={3} /></div>
      </div>
    );
  }

  const owes = data.balanceOwed;
  const days = data.owedSince ? Math.max(0, daysBetween(data.owedSince, now)) : 0;
  const booking = data.nextBooking;

  return (
    <div className="ibx-ctx">
      {onBack ? (
        <div className="ibx-ctx-back">
          <IconButton bare icon={<Icon name="left" />} label={t.backToConversation} onClick={onBack} />
          <span className="ibx-ctx-backtitle">{t.contextLabel}</span>
        </div>
      ) : null}

      <section className="ibx-ctx-sec" aria-label={data.name}>
        <div className="ibx-ctx-id">
          <Avatar name={data.name} size={44} />
          <div className="ibx-ctx-who">
            <h2 className="ibx-ctx-name"><bdi>{data.name}</bdi></h2>
            <p className="ibx-ctx-phone u-mono"><bdi>{data.phone}</bdi></p>
          </div>
        </div>
        <dl className="ibx-stats">
          <div><dt>{t.stats.visits}</dt><dd className="u-mono">{data.visits}</dd></div>
          {data.spent12mo !== undefined ? <div><dt>{t.stats.spent}</dt><dd className="u-mono"><bdi>{money(data.spent12mo, lang)}</bdi></dd></div> : null}
          {data.since ? <div><dt>{t.stats.since}</dt><dd className="u-mono"><bdi>{formatDate(data.since, lang, { weekday: false, year: "always" })}</bdi></dd></div> : null}
        </dl>
      </section>

      {owes !== undefined ? (
        <section className="ibx-ctx-sec" aria-labelledby="ibx-owes">
          <div className="ibx-ctx-sechead">
            <h3 className="u-label" id="ibx-owes">{t.owes}</h3>
            <a className="u-link ibx-ctx-link" href={hrefs.credit}>{t.creditAccount}</a>
          </div>
          {owes > 0 ? (
            <p className="ibx-owes">
              <span className="ibx-owes-amount u-fig"><bdi>{money(owes, lang)}</bdi></span>
              {days > 0 ? <span className="ibx-owes-for">{t.owesFor(days)}</span> : null}
            </p>
          ) : (
            <p className="ibx-ctx-strong">{t.nothingOwed}</p>
          )}
        </section>
      ) : null}

      <section className="ibx-ctx-sec" aria-labelledby="ibx-next">
        <div className="ibx-ctx-sechead">
          <h3 className="u-label" id="ibx-next">{t.nextBooking}</h3>
          {booking ? <span className="ibx-ctx-aside u-mono">{t.bookingNo(booking.number)}</span> : null}
        </div>
        {booking ? (
          <>
            <div className="ibx-booking">
              <p className="ibx-booking-top">
                <span className="ibx-booking-when u-mono"><bdi>{formatDate(booking.startsAt, lang, { now })} {formatTime(booking.startsAt, lang)}</bdi></span>
                <Status tone={booking.status === "pending" ? "warn" : "ok"}>{t.bookingStatus[booking.status]}</Status>
              </p>
              <p className="ibx-booking-line">{pickText(booking.service, lang)}{booking.length ? ` · ${t.lengthHours(booking.length)}` : ""}</p>
              {booking.depositPaid ? <p className="ibx-booking-dep u-mono"><bdi>{t.depositPaid(money(booking.depositPaid, lang), booking.receipt)}</bdi></p> : null}
            </div>
            <div className="ibx-ctx-actions"><Button kind="quiet" size="xs" href={hrefs.bookings}>{t.openBooking}</Button></div>
          </>
        ) : (
          <>
            <p className="ibx-ctx-strong">{t.noBookingAhead}</p>
            {data.lastVisit ? <p className="ibx-ctx-note">{t.lastVisit(pickText(data.lastVisit.service, lang), formatDate(data.lastVisit.at, lang, { now }))}</p> : null}
            <div className="ibx-ctx-actions"><Button kind="line" size="xs" href={hrefs.bookings}>{t.bookForThem}</Button></div>
          </>
        )}
      </section>

      <section className="ibx-ctx-sec" aria-labelledby="ibx-orders">
        <div className="ibx-ctx-sechead">
          <h3 className="u-label" id="ibx-orders">{t.lastOrders}</h3>
          {data.ordersTotal && data.ordersTotal > data.orders.length ? <a className="u-link ibx-ctx-link" href={hrefs.orders}>{t.allOrders(data.ordersTotal)}</a> : null}
        </div>
        {data.orders.length === 0 ? (
          <p className="ibx-ctx-note">{t.noOrders}</p>
        ) : (
          <ul className="ibx-orders">
            {data.orders.map((o) => (
              <li key={o.number}>
                <span className="ibx-order-main">
                  <span className="ibx-order-name">{o.items ? pickText(o.items, lang) : `#${o.number}`}</span>
                  <span className="ibx-order-sub u-mono"><bdi>{t.orderLine(o.number, formatDate(o.at, lang, { weekday: false, now }), o.paid)}</bdi></span>
                </span>
                <span className="ibx-order-total u-mono"><bdi>{money(o.total, lang)}</bdi></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ibx-ctx-sec" aria-labelledby="ibx-allowed">
        <h3 className="u-label" id="ibx-allowed">{t.messagesAllowed}</h3>
        <KVList>
          <KV k={t.purposeService}>{agreementText(data.consent.service, lang)}</KV>
          <KV k={t.purposeOffers}>{agreementText(data.consent.offers, lang)}</KV>
          {data.consent.backInStock ? <KV k={t.purposeBackInStock}>{agreementText(data.consent.backInStock, lang)}</KV> : null}
          {data.priceGroup ? <KV k={t.priceGroup}>{pickText(data.priceGroup, lang)}</KV> : null}
          {data.writesIn?.length ? <KV k={t.writesInLabel}>{t.languageNames(data.writesIn.includes("ar"), data.writesIn.includes("en"))}</KV> : null}
        </KVList>
      </section>
    </div>
  );
}
