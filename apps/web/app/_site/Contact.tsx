import { Icon } from "./brand";
import { copy, type Locale } from "./copy";
import { CONTACT_EMAIL, CONTACT_STATE, WHATSAPP_NUMBER } from "./site";
import { rich } from "./Text";

// The one action on the site, in its three states (site.ts): WhatsApp when ALYR's number
// is set, email until then, and a plain status line if neither exists. Every word is in
// `copy.ts` under `contact`.

/** A message filled in for one kind of business (the homepage's business tabs): the
 * WhatsApp text in the owner's words, and the email's subject. */
export type ContactMessage = { prefill: string; subject: string };

/** Where the main button goes: a chat with the message filled in, or an email with a
 * subject and the few lines a first visit needs, or the contact section. */
export function contactLink(locale: Locale, message?: ContactMessage): string {
  const c = copy[locale].contact;
  if (CONTACT_STATE === "whatsapp") {
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message?.prefill ?? c.prefill)}`;
  }
  if (CONTACT_STATE === "email") {
    return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(message?.subject ?? c.subject)}&body=${encodeURIComponent(c.body)}`;
  }
  return "#contact";
}

/** The Volt button with the 45° notch, or its outlined twin for a second way in further
 * down the page (`variant="line"`). Absent in the pending state: there is nothing to
 * press yet, so the page says so in words instead (`ContactPending`). */
export function ContactButton({
  locale, className, lean = false, id, variant = "volt", message, label,
}: {
  locale: Locale; className?: string; lean?: boolean; id?: string; variant?: "volt" | "line";
  /** A message for one kind of business, and the words that say so ("Show me for my bakery"). */
  message?: ContactMessage; label?: string;
}) {
  if (CONTACT_STATE === "pending") return null;
  const c = copy[locale].contact;
  return (
    <a
      id={id}
      className={`btn btn-${variant} btn-notch${className ? ` ${className}` : ""}`}
      href={contactLink(locale, message)}
      data-lean={lean || undefined}
      data-cta={id ?? (variant === "line" ? "button-line" : "button")}
    >
      <Icon name={CONTACT_STATE === "whatsapp" ? "chat" : "mail"} className="ico btn-glyph" />
      <span>{label ?? (CONTACT_STATE === "whatsapp" ? c.whatsapp : c.email)}</span>
      <Icon name="arrow-up-right" className="ico ico-flip btn-arrow" />
    </a>
  );
}

/** The address as a link that opens mail: in mono in the closing call, in the sentence's own
 * type everywhere else (home.css). */
export function ContactAddress({ locale, className }: { locale: Locale; className?: string }) {
  if (!CONTACT_EMAIL) return null;
  return (
    <a className={`address${className ? ` ${className}` : ""}`} href={contactLink(locale)} dir="ltr" data-cta="address">
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

/** The line under a contact button: who replies, and in the email state the address too.
 * The WhatsApp line not being open yet is said once, in the questions, not here. */
export function ContactNote({ locale, className }: { locale: Locale; className?: string }) {
  const c = copy[locale].contact;
  if (CONTACT_STATE === "pending") return <ContactPending locale={locale} className={className} />;
  if (CONTACT_STATE === "email") {
    return (
      <p className={`contact-note${className ? ` ${className}` : ""}`}>
        {rich(c.replyShort)} <ContactAddress locale={locale} />
      </p>
    );
  }
  return <p className={`contact-note${className ? ` ${className}` : ""}`}>{rich(c.reply)}</p>;
}
