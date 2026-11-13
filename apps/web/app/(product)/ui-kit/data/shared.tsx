"use client";

import type { ReactNode } from "react";
import type { Words } from "./copy";

export type Lang = "en" | "ar";

export function Block({ title, note, children, id }: { title: string; note?: string; children: ReactNode; id?: string }) {
  return (
    <section className="u-kg-block" id={id}>
      <div className="u-kg-head">
        <h2 className="u-kg-h">{title}</h2>
        {note ? <p className="u-kg-note">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Cell({ cap, children, wide = false }: { cap: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "u-kg-cell u-kd-wide" : "u-kg-cell"}>
      <p className="u-kg-cap">{cap}</p>
      {children}
    </div>
  );
}

/** A figure that keeps its order inside Arabic text. */
export const Num = ({ children }: { children: ReactNode }) => <bdi>{children}</bdi>;

/** Two lines in a cell: a title over a muted line. */
export function Two({ a, b, mono = false }: { a: ReactNode; b: ReactNode; mono?: boolean }) {
  return (
    <span className="u-kd-two">
      <span className={mono ? "u-kd-two-a u-mono" : "u-kd-two-a"}>{a}</span>
      <span className="u-kd-two-b">{b}</span>
    </span>
  );
}

// ── the sample orders (Nuqta Car Care, Thursday 12 November 2026, Doha 09:40) ─────────────────────

export type PayState = "link" | "unpaid" | "account" | "paid";
export type OrderStatus = "new" | "confirmed" | "ready";

export type Order = {
  id: number;
  time: string;
  ago: number;
  customer: [string, string];
  items: [string, string];
  handover: "pickup" | "delivery";
  pay: PayState;
  by: string | null;
  status: OrderStatus;
  total: number;
};

export const ORDERS: readonly Order[] = [
  { id: 1042, time: "09:36", ago: 4, customer: ["Aisha Hamad", "عائشة حمد"], items: ["1 × Carnauba wax · 250 ml, 1 × Tyre shine, 1 × Air freshener · Oud", "1 × شمع كرنوبا · 250 مل، 1 × ملمّع إطارات، 1 × معطّر · عود"], handover: "pickup", pay: "link", by: null, status: "new", total: 110 },
  { id: 1041, time: "09:22", ago: 18, customer: ["Khalid Nasser", "خالد ناصر"], items: ["2 × Microfibre cloth pack, 1 × Glass cleaner", "2 × حزمة قطع قماش، 1 × منظف زجاج"], handover: "pickup", pay: "unpaid", by: null, status: "new", total: 72 },
  { id: 1040, time: "09:18", ago: 22, customer: ["Gulf Courier W.L.L.", "Gulf Courier W.L.L."], items: ["14 × Fleet wash plan · monthly, 14 × Air freshener · Citrus", "14 × خطة غسيل الأسطول · شهريًا، 14 × معطّر · حمضيات"], handover: "pickup", pay: "account", by: null, status: "new", total: 2730 },
  { id: 1039, time: "09:12", ago: 28, customer: ["Yousef Hassan", "يوسف حسن"], items: ["1 × Carnauba wax · 500 ml with applicator pad, 2 × Microfibre cloth pack", "1 × شمع كرنوبا · 500 مل مع إسفنجة، 2 × حزمة قطع قماش"], handover: "delivery", pay: "paid", by: "Salma", status: "confirmed", total: 185 },
  { id: 1038, time: "09:05", ago: 35, customer: ["Mariam Saleh", "مريم صالح"], items: ["1 × 5-wash card", "1 × بطاقة 5 غسلات"], handover: "pickup", pay: "paid", by: "Salma", status: "confirmed", total: 250 },
  { id: 1037, time: "08:58", ago: 42, customer: ["Fatima Darwish", "فاطمة درويش"], items: ["3 × Air freshener · Oud, 1 × Tyre shine", "3 × معطّر · عود، 1 × ملمّع إطارات"], handover: "delivery", pay: "unpaid", by: "Reem", status: "confirmed", total: 90 },
  { id: 1036, time: "08:47", ago: 53, customer: ["Omar Ali", "عمر علي"], items: ["1 × Carnauba wax · 250 ml, 1 × Microfibre cloth pack", "1 × شمع كرنوبا · 250 مل، 1 × حزمة قطع قماش"], handover: "pickup", pay: "paid", by: "Bilal", status: "confirmed", total: 90 },
  { id: 1035, time: "08:41", ago: 59, customer: ["Bayview School", "Bayview School"], items: ["6 × Glass cleaner, 4 × Microfibre cloth pack", "6 × منظف زجاج، 4 × حزمة قطع قماش"], handover: "delivery", pay: "account", by: "Reem", status: "confirmed", total: 232 },
  { id: 1033, time: "08:12", ago: 88, customer: ["Layla Farouk", "ليلى فاروق"], items: ["1 × 5-wash card, 1 × Air freshener · New car", "1 × بطاقة 5 غسلات، 1 × معطّر · سيارة جديدة"], handover: "pickup", pay: "paid", by: "Yusuf", status: "ready", total: 265 },
];

export const BY: Record<string, string> = { Salma: "سلمى", Reem: "ريم", Bilal: "بلال", Yusuf: "يوسف" };

/** The status tag tone of an order. */
export const STATUS_TONE: Record<OrderStatus, "ink" | "n" | "ok"> = { new: "ink", confirmed: "n", ready: "ok" };
export const PAY_TONE: Record<PayState, "warn" | "n" | "ok"> = { link: "warn", unpaid: "warn", account: "n", paid: "ok" };

export function payWord(t: Words, pay: PayState): string {
  return { link: t.payLink, unpaid: t.unpaid, account: t.onAccount, paid: t.paid }[pay];
}
export function statusWord(t: Words, status: OrderStatus): string {
  return { new: t.statusNew, confirmed: t.statusConfirmed, ready: t.statusReady }[status];
}
