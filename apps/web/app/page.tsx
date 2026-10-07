"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Choice = { id: string; title: string };
type Message = {
  direction: "in" | "out";
  kind: string;
  body: string;
  payload: { choices?: Choice[]; template?: string; category?: string };
  created_at: string;
};
type Buckets = { d0_30: number; d31_60: number; d61_90: number; d90_plus: number };
type Customer = {
  id: string; name: string; phone: string | null; balance: number; balance_text: string;
  oldest_days: number; buckets: Buckets; over_limit: boolean; promised_until: string | null;
};
type Summary = {
  shop: { name: string; name_ar: string };
  outstanding_text: string; outstanding: number; buckets: Buckets;
  customers_owing: number; customers: Customer[];
  collected_by_link_text: string; payments_by_link: number;
};
type Entry = { kind: string; amount_text: string; note: string; created_at: string };
// `key` is what the simulator addresses the phone by: its number, or its WhatsApp user ID
// when the customer uses a username and shows no number.
type Persona = {
  key: string; name: string; phone: string | null; user_id: string | null;
  username?: string | null; kind: "staff" | "customer";
};

const BUCKET_KEYS = ["d0_30", "d31_60", "d61_90", "d90_plus"] as const;

const T = {
  en: {
    ledger: "Credit ledger", sub: "Who owes what, and for how long", outstanding: "Outstanding",
    owing: (n: number) => `${n} customers owe money`, remind: "Send reminders",
    remindHint: "To customers whose oldest unpaid purchase is 30+ days old",
    sent: (n: number, skipped: number) =>
      `${n} reminders sent` + (skipped ? `, ${skipped} skipped (promised a date or reminded in the last 3 days)` : ""),
    collected: "Collected through payment links", payments: (n: number) => `${n} payments`,
    promised: (d: string) => `Promised by ${d}`, overLimit: "Over credit limit", customer: "Customer", balance: "Balance", age: "Oldest debt",
    days: (n: number) => `${n} days`, settled: "Settled", entries: "Entries",
    buckets: ["0–30 days", "31–60 days", "61–90 days", "Over 90 days"],
    kinds: { sale: "Credit sale", payment: "Payment", adjustment: "Adjustment" } as Record<string, string>,
    lang: "العربية",
  },
  ar: {
    ledger: "دفتر الديون", sub: "من عليه مبلغ، ومنذ متى", outstanding: "إجمالي المستحق",
    owing: (n: number) => `${n} عميل عليهم مبالغ`, remind: "إرسال التذكيرات",
    remindHint: "للعملاء الذين مضى على أقدم فاتورة غير مدفوعة ٣٠ يوماً أو أكثر",
    sent: (n: number, skipped: number) =>
      `تم إرسال ${n} تذكير` + (skipped ? `، وتم تخطي ${skipped} (وعدوا بتاريخ أو تم تذكيرهم خلال ٣ أيام)` : ""),
    collected: "المحصّل عبر روابط الدفع", payments: (n: number) => `${n} دفعة`,
    promised: (d: string) => `وعد بالدفع قبل ${d}`, overLimit: "تجاوز حد الائتمان", customer: "العميل", balance: "الرصيد", age: "أقدم دين",
    days: (n: number) => `${n} يوم`, settled: "مسدد", entries: "الحركات",
    buckets: ["٠–٣٠ يوم", "٣١–٦٠ يوم", "٦١–٩٠ يوم", "أكثر من ٩٠ يوم"],
    kinds: { sale: "بيع آجل", payment: "دفعة", adjustment: "تعديل" } as Record<string, string>,
    lang: "English",
  },
};

const qar = (dirhams: number) =>
  "QAR " + (dirhams / 100).toLocaleString("en", { maximumFractionDigits: 2 });

function bucketIndex(days: number) {
  return days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
}

async function getJson<R>(url: string, init?: RequestInit): Promise<R> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export default function Demo() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [phone, setPhone] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const t = T[lang];
  const persona = personas.find((p) => p.key === phone);

  const loadPersonas = useCallback(async () => {
    const data = await getJson<{
      staff: { name: string; phone: string; user_id: null };
      customers: { name: string; phone: string | null; user_id: string | null; username: string | null }[];
    }>("/sim/personas");
    const list: Persona[] = [
      ...data.customers.map((c) => ({ ...c, key: c.phone ?? c.user_id ?? "", kind: "customer" as const })),
      { ...data.staff, key: data.staff.phone, kind: "staff" as const },
    ];
    setPersonas(list);
    setPhone((current) => current || data.staff.phone);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        getJson<Summary>("/api/ledger/summary"),
        phone
          ? getJson<{ messages: Message[] }>(`/sim/conversations/${phone}`)
          : Promise.resolve({ messages: [] }),
      ]);
      setSummary(s);
      setMessages(c.messages);
      if (selected) {
        const e = await getJson<{ entries: Entry[] }>(`/api/ledger/customers/${selected}/entries`);
        setEntries(e.entries);
      }
      setError("");
    } catch {
      setError("Cannot reach the Alyr API. Start it on port 8000, then this page recovers by itself.");
    }
  }, [phone, selected]);

  useEffect(() => {
    const first = setTimeout(() => loadPersonas().catch(() => undefined), 0);
    return () => clearTimeout(first);
  }, [loadPersonas]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 1500);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(text: string, replyId = "") {
    if (!persona || (!text.trim() && !replyId)) return;
    setDraft("");
    const data = await getJson<{ messages: Message[] }>("/sim/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from_number: persona.phone ?? "", from_user_id: persona.user_id ?? "",
        username: persona.username ?? "", text, reply_id: replyId,
      }),
    });
    setMessages(data.messages);
    refresh();
  }

  async function remind() {
    setBusy(true);
    try {
      const data = await getJson<{ sent: number; skipped_promised: number; skipped_recent: number }>("/api/ledger/reminders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ min_days: 30 }),
      });
      setNote(t.sent(data.sent, data.skipped_promised + data.skipped_recent));
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      await getJson("/sim/reset", { method: "POST" });
      setSelected(null);
      setEntries([]);
      setNote("");
      await loadPersonas();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const suggestions =
    persona?.kind === "staff"
      ? ["Ahmed 450 credit", "Ahmed paid 200"]
      : ["كم حسابي؟", "hello", "balance"];
  const total = summary ? Math.max(summary.outstanding, 1) : 1;
  const selectedCustomer = summary?.customers.find((c) => c.id === selected);

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Alyr</span>
        <span className="where">Demo 1 · the credit ledger in a chat · sample data, fictional shop</span>
        <span className="spacer" />
        <button className="btn" onClick={reset} disabled={busy}>Reset demo</button>
      </header>

      <div className="panes">
        <section className="chat" aria-label="Chat simulator">
          <div className="chat-head">
            <label htmlFor="persona">Chat simulator · you are holding this phone</label>
            <select id="persona" value={phone} onChange={(e) => setPhone(e.target.value)}>
              {personas.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.kind === "staff" ? "Staff · " : "Customer · "}{p.name}
                  {p.username ? ` · @${p.username}, no phone number` : ""}
                </option>
              ))}
            </select>
            <span className="to">Chatting with: {summary?.shop.name ?? "…"}</span>
          </div>

          <div className="msgs">
            {messages.length === 0 && (
              <p className="empty">No messages yet. Tap a suggestion below or type one.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`bub ${m.direction === "in" ? "me" : ""}`} dir="auto">
                <Linked text={m.body} />
                {m.payload.choices && (
                  <div className="choices">
                    {m.payload.choices.map((c) => (
                      <button key={c.id} onClick={() => send(c.title, c.id)}>{c.title}</button>
                    ))}
                  </div>
                )}
                {m.kind === "template" && (
                  <span className="tag" dir="ltr">
                    Template · {m.payload.category} · charged when sent outside the 24-hour window
                  </span>
                )}
              </div>
            ))}
            <div ref={bottom} />
          </div>

          <div className="chips">
            {suggestions.map((s) => (
              <button key={s} onClick={() => send(s)} dir="auto">{s}</button>
            ))}
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <input
              id="draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message"
              dir="auto"
              autoComplete="off"
            />
            <button className="btn primary" type="submit">Send</button>
          </form>
        </section>

        <main className="work" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
          {error && <div className="error" dir="ltr">{error}</div>}
          <div className="work-head">
            <div>
              <h1>{t.ledger}</h1>
              <p>{lang === "ar" ? summary?.shop.name_ar : summary?.shop.name} · {t.sub}</p>
            </div>
            <span className="spacer" />
            <button className="btn" onClick={() => setLang(lang === "en" ? "ar" : "en")}>{t.lang}</button>
          </div>

          {summary && (
            <>
              <div className="tiles">
              <div className="totals">
                <span className="label">{t.outstanding}</span>
                <span className="big num" dir="ltr">{summary.outstanding_text}</span>
                <span>{t.owing(summary.customers_owing)}</span>
                <div className="agebar" aria-hidden="true">
                  {BUCKET_KEYS.map((k, i) => (
                    <span key={k} className={`a${i}`} style={{ width: `${(summary.buckets[k] / total) * 100}%` }} />
                  ))}
                </div>
                <div className="legend">
                  {BUCKET_KEYS.map((k, i) => (
                    <div key={k}>
                      <small><i className={`a${i}`} />{t.buckets[i]}</small>
                      <b className="num" dir="ltr">{qar(summary.buckets[k])}</b>
                    </div>
                  ))}
                </div>
              </div>

              <div className="totals">
                <span className="label">{t.collected}</span>
                <span className="big num" dir="ltr">{summary.collected_by_link_text}</span>
                <span>{t.payments(summary.payments_by_link)}</span>
              </div>
              </div>

              <div className="actions">
                <button className="btn primary" onClick={remind} disabled={busy}>{t.remind}</button>
                <span style={{ color: "var(--muted)", fontSize: 13.5 }}>{t.remindHint}</span>
                {note && <span className="note">{note}</span>}
              </div>

              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.customer}</th>
                      <th className="r">{t.balance}</th>
                      <th>{t.age}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.customers.map((c) => (
                      <tr key={c.id} className={c.id === selected ? "sel" : ""} onClick={() => setSelected(c.id)}>
                        <td>
                          {c.name}
                          {c.over_limit && <span className="pill p3 gap">{t.overLimit}</span>}
                        </td>
                        <td className="r num" dir="ltr">{c.balance_text}</td>
                        <td>
                          {c.balance > 0 ? (
                            <>
                              <span className={`pill p${bucketIndex(c.oldest_days)}`}>{t.days(c.oldest_days)}</span>
                              {c.promised_until && (
                                <span className="pill promise gap">
                                  {t.promised(new Date(c.promised_until).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }))}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="pill none">{t.settled}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedCustomer && (
                <div className="entries">
                  <h2>{t.entries} · {selectedCustomer.name}</h2>
                  <ul>
                    {entries.map((e, i) => (
                      <li key={i}>
                        <span className="mono" dir="ltr">
                          {new Date(e.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </span>
                        <span>{t.kinds[e.kind]}{e.note ? ` · ${e.note}` : ""}</span>
                        <b className={`num ${e.kind === "payment" ? "minus" : "plus"}`} dir="ltr">
                          {e.kind === "payment" ? "−" : "+"}{e.amount_text}
                        </b>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
