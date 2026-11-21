"use client";

import { Banner, Button, Field, Input, Panel, SectionLabel } from "../../../_ui";
import { formatTime, isolate } from "../../../_ui/format";
import type { AuthCopyStrings } from "./copy";
import { FIXTURE_CODE, FIXTURE_EMAIL, FIXTURE_ORDER } from "./fixtures";
import type { LanguageChoice } from "./logic";

export interface SignInStatesProps {
  t: AuthCopyStrings;
  lang: LanguageChoice;
}

// The times in the drawing: the next code may be asked for at 10:38 and the last one works until 09:48.
const AGAIN_AT = "2026-11-12T10:38:00+03:00";
const LAST_CODE_UNTIL = "2026-11-12T09:48:00+03:00";
const WRONG_ENTRY = "730581";

function Digits({ value, label, bad, digitLabel }: { value: string; label: string; bad?: boolean; digitLabel: (n: number) => string }) {
  return (
    <div role="group" aria-label={label} className="auth-code-row auth-code-row--small" dir="ltr">
      {value.split("").map((digit, index) => (
        <input
          key={index}
          className="auth-code-box"
          readOnly
          value={digit}
          inputMode="numeric"
          aria-label={digitLabel(index + 1)}
          aria-invalid={bad ? true : undefined}
        />
      ))}
    </div>
  );
}

function ErrorLine({ children }: { children: string }) {
  return (
    <p className="auth-error-line">
      <span className="auth-error-dot" aria-hidden="true" />
      <span className="auth-error-text">{children}</span>
    </p>
  );
}

/** The four ways sign-in can go wrong or end, drawn as they look. Each is a card of its own. */
export function SignInStates({ t, lang }: SignInStatesProps) {
  const againAt = isolate(formatTime(AGAIN_AT, lang));
  const lastUntil = isolate(formatTime(LAST_CODE_UNTIL, lang));

  return (
    <div className="auth-stage auth-stage--states">
      <h1 className="u-sr">{t.statesPageTitle}</h1>
      <div className="auth-states-grid">
        <section className="auth-state-col" aria-labelledby="auth-state-wrong">
          <div className="auth-state-meta-row">
            <SectionLabel as="h2" className="auth-state-label">
              <span id="auth-state-wrong">{t.wrongCodeTitle}</span>
            </SectionLabel>
            <span className="auth-state-sub">{t.wrongCodeSub}</span>
          </div>
          <Panel className="auth-state-card">
            <p className="auth-state-title">{t.codeTitle}</p>
            <Digits value={WRONG_ENTRY} label={t.codeGroupLabel} digitLabel={t.digitLabel} bad />
            <ErrorLine>{t.wrongCodeError}</ErrorLine>
            <div className="auth-action-row">
              <Button kind="dark" size="md">
                {t.sendNewCodeBtn}
              </Button>
              <span className="auth-state-hint">{t.triesLeft(3)}</span>
            </div>
          </Panel>
        </section>

        <section className="auth-state-col" aria-labelledby="auth-state-many">
          <div className="auth-state-meta-row">
            <SectionLabel as="h2" className="auth-state-label">
              <span id="auth-state-many">{t.tooManyCodesTitle}</span>
            </SectionLabel>
            <span className="auth-state-sub">{t.tooManyCodesSub}</span>
          </div>
          <Panel className="auth-state-card">
            <p className="auth-state-title">{t.signInTitle}</p>
            <Field label={t.workEmailLabel}>
              <Input type="email" dir="ltr" readOnly value={FIXTURE_EMAIL} />
            </Field>
            <ErrorLine>{t.tooManyCodesError}</ErrorLine>
            <div className="auth-action-row">
              <Button kind="line" size="md" disabled>
                {t.sendCodeBtn}
              </Button>
              <span className="auth-state-hint">{t.retryAtTime(againAt)}</span>
            </div>
            <p className="auth-state-footnote">{t.lastCodeStillWorks(lastUntil)}</p>
          </Panel>
        </section>

        <section className="auth-state-col" aria-labelledby="auth-state-offline">
          <div className="auth-state-meta-row">
            <SectionLabel as="h2" className="auth-state-label">
              <span id="auth-state-offline">{t.noConnectionTitle}</span>
            </SectionLabel>
            <span className="auth-state-sub">{t.noConnectionSub}</span>
          </div>
          <Panel className="auth-state-card">
            <p className="auth-state-title">{t.codeTitle}</p>
            <Digits value={FIXTURE_CODE} label={t.codeGroupLabel} digitLabel={t.digitLabel} />
            <ErrorLine>{t.noConnectionError}</ErrorLine>
            <div className="auth-action-row">
              <Button kind="dark" size="md">
                {t.tryAgainBtn}
              </Button>
              <span className="auth-state-hint">{t.retryingInSeconds(8)}</span>
            </div>
          </Panel>
        </section>

        <section className="auth-state-col" aria-labelledby="auth-state-ended">
          <div className="auth-state-meta-row">
            <SectionLabel as="h2" className="auth-state-label">
              <span id="auth-state-ended">{t.sessionEndedTitle}</span>
            </SectionLabel>
            <span className="auth-state-sub">{t.sessionEndedSub}</span>
          </div>
          <Panel className="auth-state-card">
            <p className="auth-state-title">{t.sessionEndedHeadline}</p>
            <Banner tone="n">{t.sessionEndedBanner}</Banner>
            <Field label={t.workEmailLabel}>
              <Input type="email" dir="ltr" readOnly value={FIXTURE_EMAIL} />
            </Field>
            <div className="auth-action-row">
              <Button kind="volt" size="md">
                {t.sendCodeBtn}
              </Button>
            </div>
            <p className="auth-state-footnote">{t.returnToOrderNote(isolate(`#${FIXTURE_ORDER}`))}</p>
          </Panel>
        </section>
      </div>

      <p className="auth-states-footer">{t.statesFooterNote}</p>
    </div>
  );
}
