"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Choice = { id: string; title: string };
type Message = {
  direction: "in" | "out";
  kind: string;
  body: string;
  payload: { choices?: Choice[]; template?: string; category?: string };
  status?: string;
  error?: string | null;
  created_at: string;
};
type Buckets = { d0_30: number; d31_60: number; d61_90: number; d90_plus: number };
type Customer = {
  id: string; name: string; phone: string | null; balance: number; balance_text: string;
  oldest_days: number; buckets: Buckets; over_limit: boolean; promised_until: string | null;
  opted_out: boolean;
};
type Summary = {
  shop: { name: string; name_ar: string };
  outstanding_text: string; outstanding: number; buckets: Buckets;
  customers_owing: number; customers: Customer[];
  collected_by_link_text: string; payments_by_link: number;
};
type OrderRow = {
  id: string; number: number; status: string; payment: string; total_text: string;
  customer: string; items: { name: string; quantity: number; line_text: string }[];
};
type InboxRow = {
  id: string; name: string; phone: string | null; username: string | null;
  status: "open" | "closed"; assistant_paused: boolean; opted_out: boolean;
  window_open: boolean; window_closes_at: string | null; unread: number;
  last: { body: string; direction: "in" | "out"; kind: string; status: string; created_at: string };
};
type InboxMessage = Message & { id: string; sent_by: string };
type Thread = { customer: Omit<InboxRow, "unread" | "last">; messages: InboxMessage[] };
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
      `${n} reminders sent` + (skipped ? `, ${skipped} skipped (promised a date, reminded in the last 3 days, or said stop)` : ""),
    collected: "Collected through payment links", payments: (n: number) => `${n} payments`,
    promised: (d: string) => `Promised by ${d}`, overLimit: "Over credit limit", optedOut: "Said stop", customer: "Customer", balance: "Balance", age: "Oldest debt",
    days: (n: number) => `${n} days`, settled: "Settled", entries: "Entries",
    buckets: ["0–30 days", "31–60 days", "61–90 days", "Over 90 days"],
    kinds: { sale: "Credit sale", payment: "Payment", adjustment: "Adjustment" } as Record<string, string>,
    lang: "العربية",
    tabInbox: "Inbox", inboxSub: "Every customer conversation, answered by the assistant or by you",
    open: "Open", closed: "Closed", noChats: "No conversations here. As a customer in the chat, send \"hello\".",
    pick: "Choose a conversation to read it.", you: "You", assistant: "Assistant", customerSays: "Customer",
    paused: "You are answering", pausedHint: "The assistant is quiet for this customer until you close the conversation or hand it back.",
    handBack: "Hand back to assistant", close: "Close", reopen: "Reopen", reply: "Reply", replyHere: "Write a reply",
    windowOpen: (h: number) => (h < 1 ? "Free replies allowed for less than an hour" : `Free replies allowed for ${h} more hours`),
    windowClosed: "More than 24 hours since their last message. WhatsApp only allows an approved template now; typed replies are refused.",
    notSent: "Not sent",
    tabLedger: "Credit ledger", tabOrders: "Orders", ordersSub: "Placed through the order link",
    noOrders: "No orders yet. In the chat, tap \"Place an order\" as a customer.",
    orderNo: "Order", items: "Items", payment: "Payment", status: "Status",
    pay: { unpaid: "Not paid", paid: "Paid", on_account: "On account" } as Record<string, string>,
    st: { new: "New", confirmed: "Confirmed", ready: "Ready", done: "Done", cancelled: "Cancelled" } as Record<string, string>,
    next: { new: "Confirm", confirmed: "Mark ready", ready: "Mark done" } as Record<string, string>,
  },
  ar: {
    ledger: "دفتر الديون", sub: "من عليه مبلغ، ومنذ متى", outstanding: "إجمالي المستحق",
    owing: (n: number) => `${n} عميل عليهم مبالغ`, remind: "إرسال التذكيرات",
    remindHint: "للعملاء الذين مضى على أقدم فاتورة غير مدفوعة ٣٠ يوماً أو أكثر",
    sent: (n: number, skipped: number) =>
      `تم إرسال ${n} تذكير` + (skipped ? `، وتم تخطي ${skipped} (وعدوا بتاريخ أو تم تذكيرهم خلال ٣ أيام أو طلبوا الإيقاف)` : ""),
    collected: "المحصّل عبر روابط الدفع", payments: (n: number) => `${n} دفعة`,
    promised: (d: string) => `وعد بالدفع قبل ${d}`, overLimit: "تجاوز حد الائتمان", optedOut: "طلب الإيقاف", customer: "العميل", balance: "الرصيد", age: "أقدم دين",
    days: (n: number) => `${n} يوم`, settled: "مسدد", entries: "الحركات",
    buckets: ["٠–٣٠ يوم", "٣١–٦٠ يوم", "٦١–٩٠ يوم", "أكثر من ٩٠ يوم"],
    kinds: { sale: "بيع آجل", payment: "دفعة", adjustment: "تعديل" } as Record<string, string>,
    lang: "English",
    tabInbox: "المحادثات", inboxSub: "كل محادثات العملاء، يرد عليها المساعد أو أنت",
    open: "مفتوحة", closed: "مغلقة", noChats: "لا توجد محادثات. أرسل \"hello\" كعميل في المحادثة.",
    pick: "اختر محادثة لقراءتها.", you: "أنت", assistant: "المساعد", customerSays: "العميل",
    paused: "أنت من يرد", pausedHint: "المساعد متوقف لهذا العميل حتى تغلق المحادثة أو تعيدها إليه.",
    handBack: "إعادة للمساعد", close: "إغلاق", reopen: "إعادة فتح", reply: "إرسال", replyHere: "اكتب رداً",
    windowOpen: (h: number) => (h < 1 ? "الرد الحر متاح لأقل من ساعة" : `الرد الحر متاح لمدة ${h} ساعة`),
    windowClosed: "مضى أكثر من ٢٤ ساعة على آخر رسالة من العميل. واتساب يسمح الآن بالقوالب المعتمدة فقط، والردود المكتوبة مرفوضة.",
    notSent: "لم تُرسل",
    tabLedger: "دفتر الديون", tabOrders: "الطلبات", ordersSub: "الطلبات الواردة من رابط الطلب",
    noOrders: "لا توجد طلبات بعد. في المحادثة اضغط \"اطلب الآن\" كعميل.",
    orderNo: "الطلب", items: "الأصناف", payment: "الدفع", status: "الحالة",
    pay: { unpaid: "غير مدفوع", paid: "مدفوع", on_account: "على الحساب" } as Record<string, string>,
    st: { new: "جديد", confirmed: "مؤكد", ready: "جاهز", done: "منجز", cancelled: "ملغي" } as Record<string, string>,
    next: { new: "تأكيد", confirmed: "جاهز للاستلام", ready: "تم الإنجاز" } as Record<string, string>,
  },
};

const BLOCK_REASON: Record<string, string> = {
  opted_out: "customer said stop",
  no_consent: "customer has not agreed to messages",
  no_marketing_consent: "customer has not agreed to offers",
  window_closed: "more than 24 hours since their last message",
};
const NEXT_STATUS: Record<string, string> = { new: "confirmed", confirmed: "ready", ready: "done" };

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
  const [tab, setTab] = useState<"inbox" | "ledger" | "orders">("ledger");
  const [inboxRows, setInboxRows] = useState<InboxRow[]>([]);
  const [inboxFilter, setInboxFilter] = useState<"open" | "closed">("open");
  const [chatId, setChatId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [hoursLeft, setHoursLeft] = useState(0);
  const threadEnd = useRef<HTMLDivElement>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
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
      setOrders((await getJson<{ orders: OrderRow[] }>("/api/orders")).orders);
      const rows = (
        await getJson<{ conversations: InboxRow[] }>(`/api/inbox/conversations?status=${inboxFilter}`)
      ).conversations;
      setInboxRows(rows);
      if (tab === "inbox" && chatId) {
        const loaded = await getJson<Thread>(`/api/inbox/conversations/${chatId}`);
        setThread(loaded);
        const closes = loaded.customer.window_closes_at;
        setHoursLeft(closes ? Math.floor((new Date(closes).getTime() - Date.now()) / 3_600_000) : 0);
        // Reading a conversation on screen is what marks it read.
        if (rows.find((r) => r.id === chatId)?.unread) {
          await getJson(`/api/inbox/conversations/${chatId}/read`, { method: "POST" });
        }
      }
      if (selected) {
        const e = await getJson<{ entries: Entry[] }>(`/api/ledger/customers/${selected}/entries`);
        setEntries(e.entries);
      }
      setError("");
    } catch {
      setError("Cannot reach the Alyr API. Start it on port 8000, then this page recovers by itself.");
    }
  }, [phone, selected, inboxFilter, tab, chatId]);

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

  const threadLength = thread?.messages.length ?? 0;
  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: "nearest" });
  }, [threadLength, chatId]);

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
      const data = await getJson<{
        sent: number; skipped_promised: number; skipped_recent: number; skipped_opted_out: number;
      }>("/api/ledger/reminders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ min_days: 30 }),
      });
      setNote(t.sent(data.sent, data.skipped_promised + data.skipped_recent + data.skipped_opted_out));
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function inboxPost(path: string, body?: object) {
    if (!chatId) return;
    await getJson(`/api/inbox/conversations/${chatId}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    refresh();
  }

  async function sendReply() {
    const text = replyDraft.trim();
    if (!text) return;
    setReplyDraft("");
    await inboxPost("reply", { text });
  }

  async function advance(order: OrderRow) {
    await getJson(`/api/orders/${order.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: NEXT_STATUS[order.status] }),
    });
    refresh();
  }

  async function reset() {
    setBusy(true);
    try {
      await getJson("/sim/reset", { method: "POST" });
      setSelected(null);
      setChatId(null);
      setThread(null);
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
      : ["كم حسابي؟", "hello", "I want to order"];
  const total = summary ? Math.max(summary.outstanding, 1) : 1;
  const selectedCustomer = summary?.customers.find((c) => c.id === selected);
  const unreadChats = inboxRows.filter((r) => r.unread > 0).length;
  const openThread = thread && thread.customer.id === chatId ? thread : null;

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
                {m.status === "failed" && <span className="tag bad" dir="ltr">Not delivered</span>}
                {m.status === "blocked" && (
                  <span className="tag bad" dir="ltr">Not sent: {BLOCK_REASON[m.error ?? ""] ?? "blocked"}</span>
                )}
                {m.status === "queued" && <span className="tag" dir="ltr">Sending…</span>}
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
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === "ledger"} onClick={() => setTab("ledger")}>{t.tabLedger}</button>
                <button role="tab" aria-selected={tab === "inbox"} onClick={() => setTab("inbox")}>
                  {t.tabInbox}{inboxFilter === "open" && unreadChats ? ` (${unreadChats})` : ""}
                </button>
                <button role="tab" aria-selected={tab === "orders"} onClick={() => setTab("orders")}>
                  {t.tabOrders}{orders.length ? ` (${orders.length})` : ""}
                </button>
              </div>
              <p>
                {lang === "ar" ? summary?.shop.name_ar : summary?.shop.name} · {tab === "ledger" ? t.sub : tab === "orders" ? t.ordersSub : t.inboxSub}
              </p>
            </div>
            <span className="spacer" />
            <button className="btn" onClick={() => setLang(lang === "en" ? "ar" : "en")}>{t.lang}</button>
          </div>

          {tab === "inbox" && (
            <div className="inbox">
              <div className="inbox-list">
                <div className="seg">
                  {(["open", "closed"] as const).map((f) => (
                    <button key={f} aria-pressed={inboxFilter === f} onClick={() => setInboxFilter(f)}>{t[f]}</button>
                  ))}
                </div>
                {inboxRows.length === 0 && <p className="empty-note">{t.noChats}</p>}
                {inboxRows.map((r) => (
                  <button
                    key={r.id}
                    className={`conv ${r.id === chatId ? "sel" : ""}`}
                    onClick={() => { setChatId(r.id); setReplyDraft(""); }}
                  >
                    <span className="conv-top">
                      <b>{r.name}</b>
                      {r.unread > 0 && <span className="pill p1 num">{r.unread}</span>}
                    </span>
                    <span className="conv-last" dir="auto">
                      {r.last.direction === "out" ? "↩ " : ""}{r.last.body}
                    </span>
                    <span className="conv-flags">
                      {r.assistant_paused && <span className="pill promise">{t.paused}</span>}
                      {r.opted_out && <span className="pill none">{t.optedOut}</span>}
                      {r.last.status === "blocked" && <span className="pill p3">{t.notSent}</span>}
                    </span>
                  </button>
                ))}
              </div>

              <div className="inbox-thread">
                {!openThread ? (
                  <p className="empty-note">{t.pick}</p>
                ) : (
                  <>
                    <div className="thread-head">
                      <div>
                        <b>{openThread.customer.name}</b>
                        <span className="mono" dir="ltr">
                          {openThread.customer.phone ? `+${openThread.customer.phone}` : `@${openThread.customer.username}`}
                        </span>
                      </div>
                      <span className="spacer" />
                      {openThread.customer.assistant_paused && (
                        <button className="btn small" onClick={() => inboxPost("assistant", { paused: false })}>{t.handBack}</button>
                      )}
                      <button
                        className="btn small"
                        onClick={() => inboxPost("status", { status: openThread.customer.status === "open" ? "closed" : "open" })}
                      >
                        {openThread.customer.status === "open" ? t.close : t.reopen}
                      </button>
                    </div>
                    {openThread.customer.assistant_paused && <p className="thread-note">{t.pausedHint}</p>}
                    <div className="msgs thread-msgs">
                      {openThread.messages.map((m) => (
                        <div key={m.id} className={`bub ${m.direction === "out" ? "me" : ""}`} dir="auto">
                          <span className="who" dir={lang === "ar" ? "rtl" : "ltr"}>
                            {m.direction === "in" ? t.customerSays : m.sent_by ? t.you : t.assistant}
                          </span>
                          <Linked text={m.body} />
                          {m.payload.choices && (
                            <span className="tag" dir="ltr">Buttons: {m.payload.choices.map((c) => c.title).join(" · ")}</span>
                          )}
                          {m.status === "failed" && <span className="tag bad" dir="ltr">Not delivered</span>}
                          {m.status === "blocked" && (
                            <span className="tag bad" dir="ltr">Not sent: {BLOCK_REASON[m.error ?? ""] ?? "blocked"}</span>
                          )}
                        </div>
                      ))}
                      <div ref={threadEnd} />
                    </div>
                    <p className={`thread-note ${openThread.customer.window_open ? "" : "warn"}`}>
                      {openThread.customer.window_open ? t.windowOpen(hoursLeft) : t.windowClosed}
                    </p>
                    <form className="composer" onSubmit={(e) => { e.preventDefault(); sendReply(); }}>
                      <input
                        id="reply"
                        aria-label={t.replyHere}
                        value={replyDraft}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        placeholder={t.replyHere}
                        disabled={!openThread.customer.window_open}
                        dir="auto"
                        autoComplete="off"
                      />
                      <button className="btn primary" type="submit" disabled={!openThread.customer.window_open}>{t.reply}</button>
                    </form>
                  </>
                )}
              </div>
            </div>
          )}

          {tab === "orders" && (
            orders.length === 0 ? (
              <p className="empty-note">{t.noOrders}</p>
            ) : (
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.orderNo}</th>
                      <th>{t.items}</th>
                      <th className="r">{t.balance}</th>
                      <th>{t.payment}</th>
                      <th>{t.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="norow">
                        <td><b className="num">#{o.number}</b><br />{o.customer}</td>
                        <td>{o.items.map((i, k) => <div key={k}>{i.quantity} × {i.name}</div>)}</td>
                        <td className="r num" dir="ltr">{o.total_text}</td>
                        <td><span className={`pill ${o.payment === "unpaid" ? "p1" : "p0"}`}>{t.pay[o.payment]}</span></td>
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
            )
          )}

          {tab === "ledger" && summary && (
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
                          {c.opted_out && <span className="pill none gap">{t.optedOut}</span>}
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
