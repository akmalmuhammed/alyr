import { Icon } from "./brand";
import { copy, type Locale } from "./copy";
import { CONTACT_EMAIL, CONTACT_STATE, WHATSAPP_NUMBER } from "./site";
import { rich } from "./Text";

// The one action on the site, in its three states (site.ts): WhatsApp when ALYR's number
// is set, email until then, and a plain status line if neither exists. Every word is in
// `copy.ts` under `contact`.

/** Where the main button goes: a chat with the message filled in, or an email with a
 * subject, or the contact section. */
export function contactLink(locale: Locale): string {
  const c = copy[locale].contact;
  if (CONTACT_STATE === "whatsapp") return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(c.prefill)}`;
  if (CONTACT_STATE === "email") return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(c.subject)}`;
  return "#contact";
}

/** The Volt button with the 45° notch. Absent in the pending state: there is nothing to
 * press yet, so the page says so in words instead (`ContactPending`). */
export function ContactButton({
  locale, className, lean = false, id,
}: { locale: Locale; className?: string; lean?: boolean; id?: string }) {
  if (CONTACT_STATE === "pending") return null;
  const c = copy[locale].contact;
  return (
    <a
      id={id}
      className={`btn btn-volt btn-notch${className ? ` ${className}` : ""}`}
      href={contactLink(locale)}
      data-lean={lean || undefined}
    >
      <Icon name={CONTACT_STATE === "whatsapp" ? "chat" : "mail"} className="ico btn-glyph" />
      <span>{CONTACT_STATE === "whatsapp" ? c.whatsapp : c.email}</span>
      <Icon name="arrow-up-right" className="ico ico-flip btn-arrow" />
    </a>
  );
}

/** The address, set in mono, as a link that opens mail. */
export function ContactAddress({ locale, className }: { locale: Locale; className?: string }) {
  if (!CONTACT_EMAIL) return null;
  return (
    <a className={`address${className ? ` ${className}` : ""}`} href={contactLink(locale)} dir="ltr">
      {CONTACT_EMAIL}
    </a>
  );
}

/** The status line used while there is no way to reach ALYR: a hollow grey dot and
 * plain words. Never an error box, never a disabled button. */
export function ContactPending({ locale, className }: { locale: Locale; className?: string }) {
  if (CONTACT_STATE !== "pending") return null;
  return (
    <p className={`status-line${className ? ` ${className}` : ""}`}>
      <span className="dot-pending" aria-hidden="true" />
      <span>{rich(copy[locale].contact.pending)}</span>
    </p>
  );
}

/** The line under the hero button: who replies, or, before WhatsApp opens, where to write. */
export function ContactNote({ locale, className }: { locale: Locale; className?: string }) {
  const c = copy[locale].contact;
  if (CONTACT_STATE === "pending") return <ContactPending locale={locale} className={className} />;
  if (CONTACT_STATE === "email") {
    return (
      <p className={`contact-note${className ? ` ${className}` : ""}`}>
        {rich(c.soon)} <ContactAddress locale={locale} />
      </p>
    );
  }
  return <p className={`contact-note${className ? ` ${className}` : ""}`}>{rich(c.reply)}</p>;
}
