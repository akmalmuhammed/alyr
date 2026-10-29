"use client";

// Shown at the top of the workspace to the owner (and an admin) when their ALYR plan needs them
// (ALY-218, spec 040, D-080): a payment is overdue, ALYR's automatic messages are paused until
// it is paid, or the plan is ending or has ended. It says what is owed and how to pay. Nothing
// else in the workspace changes: everything stays open and nothing is deleted (D-033, D-053).

import { useEffect, useState } from "react";
import { COPY, type Lang } from "./billingCopy";
import "./terms.css";

type Plan = {
  state: string; paid_through: string | null; owed_text: string;
  pause_on: string | null; cancels_on: string | null;
};
type Payment = { reference: string; bank: string; subscription: Plan | null };

function day(iso: string | null, lang: Lang): string {
  if (!iso) return "";
  // A date with no time: read at noon UTC so no time zone moves it to another day.
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === "ar" ? "ar-QA-u-nu-latn" : "en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function BillingBanner({ lang, canSee }: { lang: Lang; canSee: boolean }) {
  const t = COPY[lang];
  const [payment, setPayment] = useState<Payment | null>(null);

  useEffect(() => {
    if (!canSee) return;
    const first = setTimeout(async () => {
      const response = await fetch("/api/onboarding/payment", { cache: "no-store" }).catch(() => null);
      if (response?.ok) setPayment(await response.json().catch(() => null));
    }, 0);
    return () => clearTimeout(first);
  }, [canSee]);

  const plan = payment?.subscription;
  if (!canSee || !payment || !plan) return null;
  let title = "";
  let sub = "";
  let pay = false;
  if (plan.state === "cancelled") {
    title = t.ended.title; sub = t.ended.sub;
  } else if (plan.state === "suspended") {
    title = t.paused.title; sub = t.paused.sub(plan.owed_text, day(plan.paid_through, lang)); pay = true;
  } else if (plan.state === "past_due") {
    title = t.due.title; sub = t.due.sub(plan.owed_text, day(plan.pause_on, lang)); pay = true;
  } else if (plan.cancels_on) {
    title = t.ending.title(day(plan.cancels_on, lang)); sub = t.ending.sub;
  } else {
    return null;
  }

  return (
    <section className={`tm-banner${plan.state === "suspended" || plan.state === "cancelled" ? " tm-alert" : ""}`}
      role="region" aria-label={t.region}>
      <div className="tm-text">
        <h2>{title}</h2>
        <p>{sub}</p>
        {pay && <p>{payment.bank ? t.pay(payment.bank, payment.reference) : t.payNoBank(payment.reference)} {t.recorded}</p>}
      </div>
    </section>
  );
}
