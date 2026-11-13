"use client";

// Orders: placed through the order link, with their payment and the next step. Moved out of
// Screens.tsx unchanged when that file was split into one file per screen.

import { useCallback, useState } from "react";
import { fmtQtyUnit, lineUnit } from "../../_customer/qty";
import { formatPrice } from "../../_customer/price";
import type { Fulfilment } from "../../_customer/fulfil";
import { OrderMargin, useOrderMargins } from "../Margin";
import { OrderSum } from "../OrderSum";
import { MarkPaid, PayWays } from "../OrderPay";
import { FulfilDetails, FulfilFilters, FulfilPill, matchesFilter, type FulfilFilter } from "../OrderFulfil";
import { DELIVERY } from "../deliveryCopy";
import { PRICING } from "../pricingCopy";
import { usePolling } from "../poll";
import { shopNameShown } from "../shopLedger";
import { T } from "../screensCopy";
import {
  AssignSelect, ScreenFrame, ShowFilter, activeFilter, getJson, giveRow, maybe, useShopFacts,
  type DocumentRef, type Person, type ScreenProps,
} from "./shared";
import "../pricing.css";

// What an order was given off (ALY-150): only on an order that had a discount, so an order
// without one has none of these keys and is drawn exactly as before.
type OrderDiscount = {
  kind: "coupon" | "auto"; code: string; name: string; name_ar: string; text: string; text_ar: string;
  amount: number; amount_text: string; returned: boolean;
};
type OrderRow = {
  id: string; number: number; status: string; payment: string; total: number; total_text: string;
  subtotal?: number; discount_total?: number; discounts?: OrderDiscount[];
  // How it reaches the customer (ALY-150 part 2): only on an order made while Delivery and pickup was on.
  fulfilment?: Fulfilment;
  customer: string; items: { name: string; quantity: number; unit?: string; unit_shown?: boolean; line_text: string; sku?: string; discount?: number }[];
  assigned: Person | null;
  // The table the order is for, from a QR code on a table ("" for none).
  table?: string;
  // The owner's own test order from the test line (ALY-168): marked, never counted, cannot be paid.
  test?: boolean;
  // The price group the order was charged under, as named then (null for orders before groups).
  price_group?: { name: string; name_ar: string; is_default: boolean } | null;
  // The receipt or invoice the order made, for a shop with Documents on (ALY-146).
  document?: DocumentRef;
};

const NEXT_STATUS: Record<string, string> = { new: "confirmed", confirmed: "ready", ready: "done" };

export function OrdersScreen({ lang, intro, show = null, onClearShow, modules, business }: ScreenProps) {
  const { members, canManage, summary } = useShopFacts(modules);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [fulfilFilter, setFulfilFilter] = useState<FulfilFilter>("all");
  // The estimated margin of each order (ALY-150): only for an owner or admin of a shop that keeps costs.
  const orderMargins = useOrderMargins(canManage, orders);
  const [error, setError] = useState("");
  const t = T[lang];
  const filter = activeFilter(show, "orders");
  const filterLine = <ShowFilter filter={filter} lang={lang} onClearShow={onClearShow} />;

  const refresh = useCallback(async () => {
    try {
      await maybe<{ orders: OrderRow[] }>("/api/orders", { orders: [] }).then((o) => setOrders(o.orders));
      setError("");
    } catch {
      setError(t.unreachable);
    }
  }, [t]);

  // Every 10 s while the screen is on show, and at once when the person comes back to the tab.
  usePolling(refresh, 10_000);

  async function advance(order: OrderRow) {
    await getJson(`/api/orders/${order.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: NEXT_STATUS[order.status] }),
    });
    refresh();
  }

  async function giveTo(path: string, userId: string | null) {
    await giveRow(path, userId);
    refresh();
  }

  const shownOrders = orders.filter((o) => {
    if (!matchesFilter(o, fulfilFilter)) return false;
    if (filter === "unconfirmed") return o.status === "new";
    if (filter === "ready") return o.status === "ready";
    if (filter === "unpaid") return o.payment === "unpaid" && !["cancelled", "done"].includes(o.status);
    if (filter === "paid") return o.payment === "paid";
    return true;
  });

  return (
    <ScreenFrame lang={lang} error={error} title={t.tabOrders} shop={shopNameShown(lang, summary?.shop, business)} sub={t.ordersSub} intro={intro}>
      {canManage && <PayWays lang={lang} />}
      {filterLine}
      <FulfilFilters value={fulfilFilter} onChange={setFulfilFilter} lang={lang} show={orders.some((o) => o.fulfilment)} />
      {shownOrders.length === 0 ? (
          <p className="empty-note">{orders.length > 0 && fulfilFilter !== "all" ? DELIVERY[lang].order.none : t.noOrders}</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>{t.orderNo}</th>
                  <th>{t.items}</th>
                  <th className="r">{t.total}</th>
                  <th>{t.payment}</th>
                  <th>{t.assignedTo}</th>
                  <th>{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {shownOrders.map((o) => (
                  <tr key={o.id} className="norow">
                    <td>
                      <b className="num">#{o.number}</b><br />{o.customer}
                      {o.price_group && !o.price_group.is_default && (
                        <><br /><span className="pill none">{lang === "ar" ? o.price_group.name_ar || o.price_group.name : o.price_group.name}</span></>
                      )}
                      {o.table && <><br /><span className="pill p1">{t.table(o.table)}</span></>}
                      {o.test && <><br /><span className="pill p1">{t.testOrder}</span></>}
                      {o.document && canManage && (
                        <><br /><a className="doc-link" href={`/app/documents?d=${o.document.id}`}>{t.docLink(o.document.kind, o.document.number, o.document.status)}</a></>
                      )}
                      {o.fulfilment && <><br /><FulfilPill fulfilment={o.fulfilment} lang={lang} /></>}
                    </td>
                    <td>{o.items.map((i, k) => (
                      <div key={k}><bdi>{fmtQtyUnit(i.quantity, lineUnit(i.quantity, i.unit ?? "piece", Boolean(i.unit_shown)), lang)}</bdi> × {i.name}{i.sku ? <> <small className="mono" dir="ltr">{i.sku}</small></> : null}
                        {i.discount ? <small className="pr-lineoff">{PRICING[lang].order.lineOff(formatPrice(i.discount, lang))}</small> : null}</div>
                    ))}
                      {o.fulfilment && <FulfilDetails fulfilment={o.fulfilment} lang={lang} />}
                      {o.discount_total || o.fulfilment?.mode === "delivery" ? <OrderSum order={o} lang={lang} /> : null}
                      {orderMargins && <OrderMargin lang={lang} margin={orderMargins[o.id]} />}</td>
                    <td className="r num" dir="ltr">{o.total_text}</td>
                    <td>
                      <span className={`pill ${o.payment === "unpaid" ? "p1" : "p0"}`}>{t.pay[o.payment]}</span>
                      {o.payment === "unpaid" && o.status !== "cancelled" && canManage && !o.test && (
                        <MarkPaid orderId={o.id} lang={lang} onDone={refresh} />
                      )}
                    </td>
                    <td>
                      <AssignSelect value={o.assigned} members={members} label={t.assignedTo} nobody={t.nobody}
                        onChange={(id) => giveTo(`/api/orders/${o.id}/assign`, id)} />
                    </td>
                    <td>
                      <span className="pill none">{t.st[o.status]}</span>
                      {NEXT_STATUS[o.status] && (
                        <button className="btn small" onClick={() => advance(o)}>{t.next[o.status]}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </ScreenFrame>
  );
}
