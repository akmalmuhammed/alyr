"use client";

import { useState } from "react";
import { Banner, Button, Icon, Radio } from "../../../_ui";
import { copy, type Lang } from "./copy";
import { pickText } from "./logic";
import type { Template } from "./types";

export type WindowClosedProps = {
  lang: Lang;
  /** The approved templates that exist for this shop. None: only the notice (the API cannot send one yet). */
  templates: readonly Template[];
  /** First name of the customer, for the template's greeting. */
  first: string;
  onSend: (templateId: string) => void;
  /** Something else owns the screen's one Volt button (a dialog is open): this one is drawn dark. */
  yield?: boolean;
  /** A template is on its way. */
  sending?: boolean;
};

/**
 * The customer's 24 hours ran out: WhatsApp refuses typed replies, so the composer is not drawn. Says why,
 * and, where the shop can send one, lets a person pick an approved template and see exactly what the
 * customer would get. The picker lists every template and locks the ones that cannot go to this customer,
 * with the reason; nothing is sent until the button is pressed.
 */
export function InboxWindowClosed({ lang, templates, first, onSend, yield: giveWay = false, sending = false }: WindowClosedProps) {
  const t = copy(lang);
  const usable = templates.filter((tpl) => !tpl.blocked);
  const [choice, setChoice] = useState<string>(usable[0]?.id ?? "");
  const current = templates.find((tpl) => tpl.id === choice && !tpl.blocked) ?? usable[0];

  return (
    <section className="ibx-closedpane" aria-label={t.windowClosedBanner}>
      <Banner tone="warn">{templates.length > 0 ? t.windowClosedBanner : t.windowClosedNoTemplates}</Banner>
      {templates.length > 0 ? (
        <div className="ibx-tpl">
          <div className="ibx-tpl-head">
            <h2 className="ibx-tpl-title" id="ibx-tpl-title">{t.sendTemplate}</h2>
            <span className="u-label">{t.templatesCanGo(usable.length, templates.length)}</span>
          </div>
          <div className="ibx-tpl-body">
            <div className="ibx-tpl-list" role="radiogroup" aria-labelledby="ibx-tpl-title">
              {templates.map((tpl) => (
                <Radio
                  key={tpl.id}
                  name="ibx-template"
                  className={tpl.blocked ? "ibx-tpl-opt ibx-tpl-opt--off" : "ibx-tpl-opt"}
                  checked={current?.id === tpl.id}
                  disabled={Boolean(tpl.blocked)}
                  onChange={() => setChoice(tpl.id)}
                >
                  <span className="ibx-opt">
                    <span className="ibx-opt-name">{pickText(tpl.name, lang)}</span>
                    <span className="ibx-opt-sub">
                      {t.templateCategory[tpl.category]}
                      {tpl.blocked ? ` · ${pickText(tpl.blocked, lang)}` : ""}
                    </span>
                  </span>
                  {tpl.blocked ? <Icon name="lock" /> : null}
                </Radio>
              ))}
            </div>
            <div className="ibx-tpl-view" aria-live="polite">
              {current ? (
                <>
                  <div className="ibx-bubble ibx-bubble--out">
                    <span className="ibx-sender">{t.templatePreview} · {pickText(current.name, lang)}</span>
                    <p className="ibx-text" dir="auto">{pickText(current.preview, lang).replace("{first}", first)}</p>
                  </div>
                  {current.buttons ? <p className="ibx-cue">{t.buttonsCue(pickText(current.buttons, lang))}</p> : null}
                </>
              ) : null}
            </div>
          </div>
          <div className="ibx-tpl-foot">
            <p className="ibx-tpl-note">{t.metaCharges}</p>
            <Button kind={giveWay ? "dark" : "volt"} disabled={!current} loading={sending} onClick={() => current && onSend(current.id)}>
              {t.btnSendTemplate}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
