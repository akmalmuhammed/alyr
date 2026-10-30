"use client";

// The sales link of a lead (ALY-216, D-105, specs/041-sales-link): after a visit the founder
// builds the quote above, publishes it, and sends one link. Here he makes it, copies it, sends it
// on WhatsApp from his own phone, shows it as a QR code for the owner to scan during the visit,
// sees what came of it, and revokes it. The link's address is made again from the API each time
// (the token is never stored). The console is English only; the message to the owner is in both
// languages, because the founder does not know which one the owner will read.

import { useCallback, useEffect, useMemo, useState } from "react";
import { color } from "../../_tokens/tokens";
import { api, type ClientDetail, type Pricing, type Prospect, type SalesLinkState } from "./api";

type Qr = typeof import("../_workspace/qr");
// Ink on paper, whatever the theme (the print rules): the same colours as a shop's counter QR.
const INK = { dark: color.brand.carbon, light: color.ink.white };
const DAYS = [1, 3, 7, 14, 30] as const;

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** What the link has done so far, in a sentence a founder reads at a glance. */
function status(link: SalesLinkState): string {
  if (link.state === "used") return `Used on ${day(link.claimed_at ?? link.created_at)}: the business is ${link.business}.`;
  if (link.state === "revoked") {
    const why = { by_hand: "Revoked", replaced: "Replaced by a newer link", email_changed: "Ended because the email changed", "": "Revoked" }[link.revoked_reason];
    return `${why}${link.revoked_by && link.revoked_reason !== "email_changed" ? ` by ${link.revoked_by}` : ""} on ${day(link.revoked_at ?? link.created_at)}.`;
  }
  const seen = link.opens === 0 ? "Not opened yet" : `Opened ${link.opens} ${link.opens === 1 ? "time" : "times"}, last ${time(link.last_opened_at ?? link.created_at)}`;
  const proved = link.verified_at ? ". Email proved." : ".";
  const ends = link.state === "expired" ? ` Ran out on ${day(link.expires_at)}.` : ` Runs out on ${day(link.expires_at)}.`;
  return `${seen}${proved}${ends}`;
}

/** The message the founder sends: English and Arabic, one link. He can edit it in WhatsApp. */
function message(owner: string, business: string, url: string): string {
  const first = owner.trim().split(/\s+/)[0] || "";
  return `Hello ${first}, here is your ALYR offer for ${business}. مرحباً ${first}، هذا عرض ALYR لنشاط ${business}.\n${url}`;
}

/** The owner's phone as wa.me wants it: digits only, no leading 00. Empty when there is none. */
function whatsappNumber(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^00/, "");
}

export function SalesLink({ client, hasPublished, types, onChange }: {
  client: ClientDetail; hasPublished: boolean; types: Pricing["types"]; onChange: () => void;
}) {
  const [link, setLink] = useState<SalesLinkState | null | undefined>(undefined);
  const [plan, setPlan] = useState<Prospect>(client.prospect ?? { type: "", name_ar: "", area: "" });
  const [days, setDays] = useState<number>(7);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState<Qr | null>(null);
  const [message_, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const offered = types.filter((x) => x.availability !== "hidden");

  const load = useCallback(async () => {
    const answer = await api<{ link: SalesLinkState | null }>(`/api/admin/clients/${client.id}/sales-link`);
    if (answer.ok) setLink(answer.data.link);
  }, [client.id]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);
  useEffect(() => {
    if (showQr && !qr) import("../_workspace/qr").then(setQr).catch(() => setError("The QR code could not be drawn."));
  }, [showQr, qr]);

  async function run(work: () => Promise<{ ok: boolean; error: string }>, done: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const answer = await work();
      if (!answer.ok) return setError(answer.error);
      setMessage(done);
      await load();
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const send = () => run(async () => {
    const answer = await api<{ link: SalesLinkState }>(`/api/admin/clients/${client.id}/sales-link`, "POST", { days });
    if (answer.ok) setLink(answer.data.link);
    return answer;
  }, "Link made. Copy it, send it on WhatsApp, or show the QR code.");
  const revoke = () => run(
    () => api(`/api/admin/clients/${client.id}/sales-link`, "DELETE"),
    "Revoked. The link opens nothing now.",
  );
  const savePlan = () => run(
    () => api(`/api/admin/clients/${client.id}/prospect`, "PUT", plan),
    "Plan saved. A quote already made keeps its lines: edit them above if the type changed.",
  );

  const url = link?.state === "live" ? link.url : null;
  const drawn = useMemo(() => (url && qr ? qr.svg(url, INK) : ""), [url, qr]);
  const whatsapp = useMemo(() => {
    if (!url) return "";
    const text = encodeURIComponent(message(client.contact_name, client.name, url));
    const to = whatsappNumber(client.contact_phone);
    return `https://wa.me/${to}?text=${text}`;
  }, [url, client.contact_name, client.name, client.contact_phone]);

  async function copy() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setMessage("Copied."); } catch { setError("Copying is blocked here: select the address and copy it."); }
  }

  const planChanged = plan.type !== client.prospect?.type || plan.area !== client.prospect?.area || plan.name_ar !== client.prospect?.name_ar;
  const canSend = hasPublished && !!client.contact_email && !busy;

  return (
    <div className="ops-quote ops-sales" aria-live="polite">
      <p className="sh-note">
        The owner opens the link, proves <b dir="ltr">{client.contact_email || "an email"}</b> with a code,
        reads the published quote, accepts the terms, and lands on the go-live list where the first
        payment is asked. The business is made then, with the type below.
      </p>

      {link?.state !== "used" && (
        <div className="ops-terms">
          <label className="ops-field"><span>Type of business</span>
            <select value={plan.type} onChange={(e) => setPlan({ ...plan, type: e.target.value })}>
              {offered.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
            </select>
          </label>
          <label className="ops-field"><span>Area</span><input value={plan.area} onChange={(e) => setPlan({ ...plan, area: e.target.value })} dir="auto" /></label>
          <label className="ops-field"><span>Name in Arabic</span><input value={plan.name_ar} onChange={(e) => setPlan({ ...plan, name_ar: e.target.value })} dir="rtl" lang="ar" /></label>
          <button className="btn" type="button" disabled={busy || !planChanged || !plan.type} onClick={savePlan}>Save plan</button>
        </div>
      )}

      {link === undefined && <p className="sh-note">Loading…</p>}
      {link && <p className="ops-sales-status" role="status"><span className={`sh-pill ${link.state === "live" ? "active" : link.state === "used" ? "active" : "idle"}`}>{{ live: "Live", used: "Used", expired: "Ran out", revoked: "Revoked" }[link.state]}</span> {status(link)}</p>}

      {url && (
        <>
          <label className="ops-field ops-wide">
            <span>Link for {client.contact_name}</span>
            <input readOnly value={url} dir="ltr" onFocus={(e) => e.currentTarget.select()} aria-label="Sales link address" />
          </label>
          <div className="ops-actions">
            <button className="btn primary" type="button" onClick={copy}>Copy</button>
            <a className="btn" href={whatsapp} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
            <button className="btn" type="button" aria-expanded={showQr} onClick={() => setShowQr(!showQr)}>{showQr ? "Hide QR" : "Show QR"}</button>
            <span className="spacer" />
            <button className="btn ghost" type="button" disabled={busy} onClick={revoke}>Revoke</button>
          </div>
          {showQr && (
            <figure className="ops-qr">
              {drawn
                /* eslint-disable-next-line @next/next/no-img-element -- the code is a data URI drawn here */
                ? <img alt={`QR code of the sales link for ${client.name}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawn)}`} />
                : <p className="sh-note">Drawing…</p>}
              <figcaption>{client.name}{link?.expires_at ? ` · valid until ${day(link.expires_at)}` : ""}</figcaption>
            </figure>
          )}
        </>
      )}

      {link?.state !== "used" && !url && (
        <div className="ops-actions">
          <label className="ops-field"><span>Link lasts</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {DAYS.map((d) => <option key={d} value={d}>{d === 1 ? "1 day" : `${d} days`}</option>)}
            </select>
          </label>
          <button className="btn volt" type="button" disabled={!canSend} onClick={send}>{link ? "Send a new link" : "Send link"}</button>
        </div>
      )}
      {link?.state !== "used" && !url && !hasPublished && <p className="sh-note">Publish the quote above first: the owner reads it from the link.</p>}
      {url && (
        <div className="ops-actions">
          <label className="ops-field"><span>Replace with a new link that lasts</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {DAYS.map((d) => <option key={d} value={d}>{d === 1 ? "1 day" : `${d} days`}</option>)}
            </select>
          </label>
          <button className="btn" type="button" disabled={!canSend} onClick={send}>Replace the link</button>
        </div>
      )}
      {message_ && <p className="ops-ok" role="status">{message_}</p>}
      {error && <p className="ops-error" role="alert">{error}</p>}
    </div>
  );
}
