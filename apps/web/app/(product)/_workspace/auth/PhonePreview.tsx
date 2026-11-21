import { Icon } from "../../../_ui";
import type { AuthCopyStrings } from "./copy";
import { CHAT_TIMES, FIXTURE_SERVICES, type ServiceItem } from "./fixtures";
import { durationLabel, formatMoney, parsePrice, type LanguageChoice } from "./logic";

export interface PhonePreviewProps {
  t: AuthCopyStrings;
  lang: LanguageChoice;
  variant: "type" | "offer" | "plan";
  businessName: string;
  /** The line under the name; "Business account" when left out. */
  subTitle?: string;
  /** The price list the customer is shown (variant "offer"). */
  services?: readonly ServiceItem[];
  /** The line being typed in, marked in the list. */
  focusId?: string;
  caption?: string;
}

function Bubble({ from, time, auto, t, wide, children }: { from: "customer" | "business"; time: string; auto?: boolean; t: AuthCopyStrings; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`auth-wa-bubble auth-wa-bubble--${from}${wide ? " auth-wa-bubble--wide" : ""}`}>
      {children}
      <span className="auth-wa-bubble-time">{auto ? `${time} · ${t.phone.auto}` : time}</span>
    </div>
  );
}

/** A drawing of the shop's WhatsApp chat as its customer sees it. It is not interactive and sends nothing. */
export function PhonePreview({ t, lang, variant, businessName, subTitle, services = [], focusId, caption }: PhonePreviewProps) {
  const p = t.phone;
  const fullWash = FIXTURE_SERVICES[1];
  const deposits = services.filter((s) => (parsePrice(s.deposit) ?? 0) > 0 && s.name.trim());

  return (
    <figure className="auth-phone-wrap">
      <div className="auth-phone-frame" role="group" aria-label={p.label}>
        <div className="auth-phone-bar" aria-hidden="true">
          <span className="auth-phone-bar-time">{CHAT_TIMES.status}</span>
          <span className="auth-phone-bar-network">5G</span>
        </div>

        <div className="auth-phone-header">
          <Icon name="left" size="md" className="auth-phone-header-icon" />
          <span className="auth-phone-avatar" aria-hidden="true">
            {Array.from(businessName)[0]}
          </span>
          <div className="auth-phone-header-info">
            <span className="auth-phone-title">{businessName}</span>
            <span className="auth-phone-subtitle">{subTitle ?? p.businessAccount}</span>
          </div>
          <Icon name="dots" size="md" className="auth-phone-header-icon" />
        </div>

        <div className="auth-phone-chat">
          {variant === "type" && (
            <>
              <Bubble from="customer" time={CHAT_TIMES.type[0]} t={t}>
                <span>{p.typeAsk}</span>
              </Bubble>
              <div className="auth-wa-stack">
                <Bubble from="business" time={CHAT_TIMES.type[1]} auto t={t}>
                  <span>{p.typeReply(formatMoney(fullWash.price, lang), durationLabel(fullWash.minutes, lang))}</span>
                </Bubble>
                <span className="auth-wa-chip">{p.bookVisit}</span>
                <span className="auth-wa-chips-row">
                  <span className="auth-wa-chip">{p.priceList}</span>
                  <span className="auth-wa-chip">{p.aPerson}</span>
                </span>
              </div>
              <Bubble from="customer" time={CHAT_TIMES.type[2]} t={t}>
                <span>{p.bookVisit}</span>
              </Bubble>
              <Bubble from="business" time={CHAT_TIMES.type[3]} auto t={t}>
                <span>{p.typeSlots}</span>
              </Bubble>
            </>
          )}

          {variant === "offer" && (
            <>
              <Bubble from="customer" time={CHAT_TIMES.offer[0]} t={t}>
                <span>{p.offerAsk}</span>
              </Bubble>
              <div className="auth-wa-stack">
                <Bubble from="business" time={CHAT_TIMES.offer[1]} auto t={t} wide>
                  <span>{p.offerLead(businessName)}</span>
                  <ul className="auth-wa-prices">
                    {services
                      .filter((s) => s.name.trim())
                      .map((s) => (
                        <li key={s.id} className={s.id === focusId ? "auth-wa-price-row auth-wa-price-row--focus" : "auth-wa-price-row"}>
                          <span className="auth-wa-service-name">{s.name}</span>
                          <span className="auth-wa-service-length">{durationLabel(s.minutes, lang)}</span>
                          <span className="auth-wa-service-price" dir="ltr">
                            {s.price.trim() ? formatMoney(s.price, lang) : ""}
                          </span>
                        </li>
                      ))}
                  </ul>
                  {deposits.map((s) => (
                    <span key={s.id}>{p.depositNote(s.name, formatMoney(s.deposit, lang))}</span>
                  ))}
                </Bubble>
                <span className="auth-wa-chip">{p.bookVisit}</span>
              </div>
            </>
          )}

          {variant === "plan" && (
            <>
              <Bubble from="customer" time={CHAT_TIMES.plan[0]} t={t}>
                <span>{p.planAsk}</span>
              </Bubble>
              <Bubble from="business" time={CHAT_TIMES.plan[1]} auto t={t}>
                <span>{p.planReply}</span>
              </Bubble>
            </>
          )}
        </div>

        <div className="auth-phone-foot" aria-hidden="true">
          <span className="auth-phone-input-pill">{p.message}</span>
          <span className="auth-phone-send">
            <Icon name="send" size="md" />
          </span>
        </div>
      </div>

      {caption ? <figcaption className="auth-phone-caption">{caption}</figcaption> : null}
    </figure>
  );
}
