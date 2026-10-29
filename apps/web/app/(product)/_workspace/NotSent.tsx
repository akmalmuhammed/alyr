"use client";

// The "Not sent" screen (specs/036, go-live checklist item 26): the messages of the last 14
// days that did not reach a customer, why, and a way to send one again. ALYR Agent's "Needs you
// now" opens it when a message failed. "Send again" appears only where the API says the
// message may go now; the API checks again when it is pressed, against the customer's consent
// and 24-hour window as they are then.

import { useCallback, useEffect, useState } from "react";
import { NS, type Lang, type Reason, type WhyNot } from "./notSentCopy";
import "./notSent.css";

type Entry = {
  id: string; contact_id: string; customer: string; phone: string; body: string;
  status: "failed" | "blocked"; reason: Reason; whatsapp_said: string | null; created_at: string;
  can_retry: boolean; why_not: WhyNot | null;
};

const when = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "ar" ? "ar-QA-u-nu-latn" : "en-GB", {
    timeZone: "Asia/Qatar", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));

export function NotSent({ lang }: { lang: Lang }) {
  const t = NS[lang];
  const [days, setDays] = useState(14);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState("");
  // A message sent again leaves the list and says so once; one refused says why on its row.
  const [sent, setSent] = useState(false);
  const [said, setSaid] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/messages/not-sent", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const data: { days: number; messages: Entry[] } = await response.json();
      setDays(data.days);
      setEntries(data.messages);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function sendAgain(entry: Entry) {
    setBusy(entry.id);
    setSent(false);
    let note = t.failed;
    try {
      const response = await fetch(`/api/messages/${entry.id}/retry`, { method: "POST" });
      if (response.ok) {
        setEntries((all) => all?.filter((e) => e.id !== entry.id) ?? all);
        setSent(true);
        setBusy("");
        return;
      }
      if (response.status === 409) {
        const why = (await response.json().catch(() => ({})))?.detail?.reason as WhyNot | undefined;
        note = (why && t.whyNot[why]) || t.failed;
      }
    } catch {
      note = t.offline;
    }
    setSaid((all) => ({ ...all, [entry.id]: note }));
    setBusy("");
  }

  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">{t.eyebrow}</span>
        <h1>{t.title}</h1>
        <p>{t.sub(days)}</p>
      </header>
      {offline && <p className="error" role="alert">{t.offline}</p>}
      {sent && <p className="sh-note" role="status">{t.queued}</p>}
      {entries === null ? (
        !offline && <p className="sh-note">{t.loading}</p>
      ) : entries.length === 0 ? (
        <p className="sh-note ns-empty">{t.empty(days)}</p>
      ) : (
        <ul className="ns-list">
          {entries.map((entry) => (
            <li key={entry.id} className={`sh-tile ns-row ${entry.status}`}>
              <div className="ns-top">
                <b dir="auto">{entry.customer || <bdi dir="ltr">{entry.phone}</bdi>}</b>
                <time dateTime={entry.created_at}>{when(entry.created_at, lang)}</time>
              </div>
              <p className="ns-body" dir="auto">{entry.body}</p>
              <p className="ns-why">{t.reason[entry.reason]}</p>
              {entry.whatsapp_said && (
                <p className="ns-said">{t.whatsappSaid} <bdi lang="en" dir="ltr">{entry.whatsapp_said}</bdi></p>
              )}
              <div className="ns-foot">
                {entry.can_retry ? (
                  <button className="btn small" type="button" disabled={busy === entry.id} onClick={() => sendAgain(entry)}>
                    {busy === entry.id ? t.retrying : t.retry}
                  </button>
                ) : entry.why_not && <span className="sh-note">{t.whyNot[entry.why_not]}</span>}
                {said[entry.id] && <span className="sh-note" role="status">{said[entry.id]}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
