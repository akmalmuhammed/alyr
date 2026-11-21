"use client";

import { Button, Icon, Kbd, Panel, PanelBody, PanelHeader, SectionLabel } from "../../../_ui";
import { formatDate, isolate, money, range } from "../../../_ui/format";
import type { AuthCopyStrings } from "./copy";
import { FIXTURE_HOURS, type ServiceItem } from "./fixtures";
import { PhonePreview } from "./PhonePreview";
import { quoteTotal, summarizeServices, type LanguageChoice, type QuoteLine } from "./logic";

export interface PlanQuote {
  /** When ALYR published the quote, as an instant. */
  publishedAt: string;
  /** One line per product; a line with no amount comes with the others. */
  lines: readonly QuoteLine[];
}

export interface SignUpPlanPriceProps {
  t: AuthCopyStrings;
  lang: LanguageChoice;
  businessName: string;
  /** The quote ALYR published for this business. The amounts on the card are these and nothing else. */
  quote: PlanQuote;
  services: readonly ServiceItem[];
  onBack: () => void;
  /** Records that the owner accepted the price. The preview passes a function that only moves on. */
  onAccept: () => void;
}

export function SignUpPlanPrice({ t, lang, businessName, quote, services, onBack, onAccept }: SignUpPlanPriceProps) {
  const total = quoteTotal(quote.lines);
  const priced = quote.lines.filter((line) => line.dirhams !== null);
  const summary = summarizeServices(services);
  const hours = isolate(range(FIXTURE_HOURS.open, FIXTURE_HOURS.close));

  return (
    <div className="auth-wizard">
      <div className="auth-wizard-main">
        <div className="auth-wizard-step">
          <div className="auth-step-body">
            <div className="auth-card-header">
              <SectionLabel>{t.signupPlanKicker}</SectionLabel>
              <h1 className="auth-step-title">{t.signupPlanTitle}</h1>
              <p className="auth-card-subtitle">{t.signupPlanSubtitle}</p>
            </div>

            <div className="auth-plan-row">
              <section className="auth-price-card" aria-labelledby="auth-price-title">
                <div className="auth-price-card-header">
                  <h2 className="auth-price-card-kicker" id="auth-price-title">
                    {t.priceCardTitle}
                  </h2>
                  <span className="auth-price-card-published">{t.publishedMeta(formatDate(quote.publishedAt, lang, { now: quote.publishedAt }))}</span>
                </div>

                <p className="auth-price-card-main">
                  <span className="auth-price-card-amount">{money(total, lang)}</span>
                  <span className="auth-price-card-period">{t.pricePerMonthLabel}</span>
                </p>

                <ul className="auth-price-breakdown">
                  {quote.lines.map((line) => {
                    const product = t.products[line.product];
                    const first = line.dirhams !== null && line === priced[0];
                    const note = [
                      product.descriptor,
                      line.dirhams === null ? "" : first ? t.firstProductNote : t.furtherProductNote
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li key={line.product} className="auth-price-line">
                        <span className="auth-price-line-name" dir="ltr">
                          {product.name}
                        </span>
                        <span className="auth-price-line-note">{note}</span>
                        <span className="auth-price-line-amt">{line.dirhams === null ? t.includedWord : money(line.dirhams, lang)}</span>
                      </li>
                    );
                  })}
                </ul>

                <div className="auth-price-total">
                  <span className="auth-price-total-label">{t.sumEachMonthLabel}</span>
                  <span className="auth-price-total-amt">{money(total, lang)}</span>
                </div>

                <p className="auth-price-note">{t.quoteNote(priced.length)}</p>
              </section>

              <div className="auth-plan-side-stack">
                <Panel>
                  <PanelHeader title={t.countOnTitle} />
                  <PanelBody>
                    <ul className="auth-count-list">
                      {t.countOnItems.map((item) => (
                        <li key={item} className="auth-count-item">
                          <Icon name="check" size="md" className="auth-count-icon" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </PanelBody>
                </Panel>

                <Panel>
                  <PanelBody>
                    <h2 className="auth-meta-title">{t.waChargesTitle}</h2>
                    <p className="auth-meta-desc">{t.waChargesSub}</p>
                  </PanelBody>
                </Panel>
              </div>
            </div>
          </div>

          <div className="auth-wizard-actions">
            <Button kind="line" size="md" icon={<Icon name="left" size="md" />} onClick={onBack}>
              {t.back}
            </Button>
            <span className="auth-actions-note">{t.acceptPlanNote}</span>
            <Kbd>{t.enterKey}</Kbd>
            <Button kind="volt" size="md" onClick={onAccept}>
              {t.acceptPlanBtn}
            </Button>
          </div>
        </div>

        <aside className="auth-wizard-preview">
          <SectionLabel>{t.setupSoFarTitle}</SectionLabel>
          <Panel clip className="auth-sofar-panel">
            <ul className="auth-sofar-list">
              <li className="auth-sofar-row">
                <Tick />
                <div className="auth-sofar-info">
                  <span className="auth-sofar-title">{businessName}</span>
                  <span className="auth-sofar-sub">{t.setupBusinessSub}</span>
                </div>
              </li>
              {summary ? (
                <li className="auth-sofar-row">
                  <Tick />
                  <div className="auth-sofar-info">
                    <span className="auth-sofar-title">{t.setupServicesTitle(summary.count)}</span>
                    <span className="auth-sofar-sub">
                      {t.setupServicesSub(isolate(money(summary.low * 100, lang)), isolate(money(summary.high * 100, lang)), summary.withDeposit)}
                    </span>
                  </div>
                </li>
              ) : null}
              <li className="auth-sofar-row">
                <Tick />
                <div className="auth-sofar-info">
                  <span className="auth-sofar-title">{t.setupHoursTitle(hours)}</span>
                  <span className="auth-sofar-sub">{t.setupHoursSub}</span>
                </div>
              </li>
              <li className="auth-sofar-row">
                <Tick />
                <div className="auth-sofar-info">
                  <span className="auth-sofar-title">{t.setupWorksTitle}</span>
                  <span className="auth-sofar-sub">{t.setupWorksSub}</span>
                </div>
              </li>
            </ul>
          </Panel>
          <PhonePreview t={t} lang={lang} variant="plan" businessName={businessName} subTitle={t.testLineSub} caption={t.phonePreviewCaptionPlan} />
        </aside>
      </div>
    </div>
  );
}

function Tick() {
  return (
    <span className="auth-tick" aria-hidden="true">
      <Icon name="check" size="sm" />
    </span>
  );
}
