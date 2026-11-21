"use client";

import { useMemo, useState } from "react";
import { Banner, Button, Icon, Modal, Select, Tabs, Tag } from "../../../_ui";
import { counted, formatDate, formatTime } from "../../../_ui/format";
import { copy, type Lang } from "./copy";
import {
  PROMISE_DAYS, addDays, daysSince, dohaDay, planReminders, reminderText,
  type CreditAccountRow, type ReminderGo, type ReminderSkip, type Tone,
} from "./logic";
import { Amount } from "./parts";

export type SendResult = { sent: number; skippedPromised: number; skippedRecent: number; skippedOptedOut: number };

export type RemindersProps = {
  lang: Lang;
  rows: CreditAccountRow[];
  now: string;
  shop: { name: string; nameAr: string };
  /** The pay link the reminder carries, or null when the shop takes no money online yet. */
  payLink: string | null;
  /** The sentence that replaces the link when there is none. */
  payHow: string | null;
  /** The run: the API sends to every customer the rules reach. Absent: the button is off. */
  onSend?: (minDays: number) => Promise<SendResult>;
  onClose: () => void;
  onDone: (result: SendResult, minDays: number) => void;
};

const AGES = [0, 30, 60, 90] as const;

export function CreditRemindersDialog(p: RemindersProps) {
  const { lang, rows, now } = p;
  const t = copy(lang);
  const [minDays, setMinDays] = useState<number>(30);
  const [pick, setPick] = useState<string | null>(null);
  const [tone, setTone] = useState<Tone | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const plan = useMemo(() => planReminders(rows, minDays, now), [rows, minDays, now]);
  const current: ReminderGo | undefined = plan.go.find((g) => g.row.id === pick) ?? plan.go[0];
  const shownTone: Tone = tone ?? (current ? current.tone : "gentle");

  async function send() {
    if (!p.onSend) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await p.onSend(minDays);
      p.onDone(result, minDays);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={p.onClose}
      title={t.remindTitle}
      closeLabel={t.close}
      className="crd-wide"
      footerNote={t.nothingSent}
      footer={
        <>
          <Button kind="quiet" onClick={p.onClose}>{t.cancel}</Button>
          <Button kind="volt" loading={busy} loadingLabel={t.sending} disabled={plan.go.length === 0 || !p.onSend} onClick={send}>
            {t.sendN(plan.go.length)}
          </Button>
        </>
      }
    >
      {failed ? <Banner tone="bad" action={<Button kind="quiet" size="sm" onClick={send}>{t.retry}</Button>}>{t.sendFailed}</Banner> : null}

      <div className="crd-rem">
        <div className="crd-rem-list">
          <div className="crd-rem-head">
            <Select variant="filter" label={t.oldestIs} value={String(minDays)} onChange={(e) => { setMinDays(Number(e.target.value)); setPick(null); }}>
              {AGES.map((d) => <option key={d} value={d}>{d === 0 ? t.anyAge : t.orMore(counted(d, t.nounDay, lang))}</option>)}
            </Select>
            <span className="u-mono crd-quiet crd-small">{t.matchLine(plan.matched, plan.go.length, plan.skipped.length)}</span>
          </div>

          <h3 className="u-label">{t.willBe(plan.go.length)}</h3>
          {plan.go.length === 0 ? (
            <p className="crd-empty-line">{t.nobodyToRemind}</p>
          ) : (
            <ul className="crd-rem-rows" aria-label={t.willBe(plan.go.length)}>
              {plan.go.map((g) => (
                <li key={g.row.id}>
                  <button
                    type="button"
                    className="crd-rem-row"
                    aria-pressed={current?.row.id === g.row.id}
                    onClick={() => { setPick(g.row.id); setTone(null); }}
                  >
                    <span className="crd-stack-2">
                      <bdi className="crd-rem-name">{g.row.name}</bdi>
                      <span className="u-mono crd-quiet crd-small"><Amount value={g.row.balance} lang={lang} /> · {counted(g.row.oldestDays, t.nounDay, lang)}</span>
                    </span>
                    <Tag tone={g.tone === "final" ? "bad" : g.tone === "firm" ? "warn" : "n"} dot={false}>{t.tone[g.tone]}</Tag>
                    <span className="crd-stack-2">
                      <span>{g.via === "buttons" ? t.viaButtons : t.viaTemplate}</span>
                      <span className="crd-quiet crd-small">{viaSub(g, t, lang, now)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h3 className="u-label">{t.areSkipped(plan.skipped.length)}</h3>
          {plan.skipped.length === 0 ? (
            <p className="crd-empty-line">{t.nobodySkipped}</p>
          ) : (
            <ul className="crd-rem-skips" aria-label={t.areSkipped(plan.skipped.length)}>
              {plan.skipped.map((s) => (
                <li key={s.row.id} className="crd-rem-skip">
                  <span className="crd-stack-2">
                    <bdi className="crd-rem-name">{s.row.name}</bdi>
                    <span className="u-mono crd-quiet crd-small"><Amount value={s.row.balance} lang={lang} /> · {counted(s.row.oldestDays, t.nounDay, lang)}</span>
                  </span>
                  <span className="crd-stack-2">
                    <span>{skipWhy(s, t, lang)}</span>
                    <span className="crd-quiet crd-small">{skipSub(s, t, lang, now)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <ul className="crd-rem-notes">
            <li><Icon name="arrow" />{p.payLink ? t.noteLink : t.noteNoLink}</li>
            <li><Icon name="clock" />{t.noteWording}</li>
          </ul>
        </div>

        <div className="crd-rem-side">
          {current ? (
            <>
              <h3 className="u-label">{t.whatReads(current.row.name)}</h3>
              <Tabs
                label={t.toneLabel}
                value={shownTone}
                onChange={(id) => setTone(id as Tone)}
                items={[
                  { id: "gentle", label: t.tone.gentle },
                  { id: "firm", label: t.tone.firm },
                  { id: "final", label: t.tone.final },
                ]}
              />
              <div className="crd-wa" dir={current.row.lang === "ar" ? "rtl" : "ltr"}>
                <p className="crd-wa-bubble">
                  {reminderText({
                    lang: current.row.lang, shop: p.shop.name, shopAr: p.shop.nameAr, amount: current.row.balance,
                    days: current.row.oldestDays, tone: shownTone, link: p.payLink ?? "", how: p.payLink ? "" : (p.payHow ?? ""),
                  })}
                  <span className="crd-wa-time u-mono">{formatTime(now, lang)} · {t.waKind}</span>
                </p>
                {current.via === "buttons" ? (
                  <ul className="crd-wa-buttons" aria-label={t.waButtons}>
                    {p.payLink ? <li>{current.row.lang === "ar" ? "ادفع الآن" : "Pay now"}</li> : null}
                    <li>{current.row.lang === "ar" ? "سأدفع خلال أسبوع" : "I'll pay within a week"}</li>
                  </ul>
                ) : null}
              </div>
              <p className="crd-quiet crd-small">{t.promiseTapHelp(formatDate(addDays(now, PROMISE_DAYS), lang))}</p>
              <p className="crd-quiet crd-small">{t.viaHelp(current.row.name, current.via, current.row.lastInboundAt ? daysSince(current.row.lastInboundAt, now) : null, t.tone[current.tone])}</p>
              {current.row.lang !== lang ? <p className="crd-quiet crd-small">{t.inTheirLanguage(current.row.lang === "ar" ? t.langArabic : t.langEnglish)}</p> : null}
            </>
          ) : (
            <p className="crd-quiet">{t.noPreview}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function viaSub(g: ReminderGo, t: ReturnType<typeof copy>, lang: Lang, now: string): string {
  if (g.via === "template") return t.windowClosedShort;
  if (g.row.promisePassed) return t.promisePassedShort(g.row.promisePassedOn ? formatDate(g.row.promisePassedOn, lang) : null);
  return g.row.lastInboundAt ? t.wroteAt(formatDate(g.row.lastInboundAt, lang), formatTime(g.row.lastInboundAt, lang), daysSince(g.row.lastInboundAt, now) === 0) : "";
}

function skipWhy(s: ReminderSkip, t: ReturnType<typeof copy>, lang: Lang): string {
  if (s.reason === "stop") return t.skipStop(s.row.optedOutAt ? formatDate(s.row.optedOutAt, lang) : null);
  if (s.reason === "promise") return t.skipPromise(formatDate(s.until, lang));
  return t.skipRecent(s.row.lastRemindedAt ? `${formatDate(s.row.lastRemindedAt, lang)} ${formatTime(s.row.lastRemindedAt, lang)}` : "");
}

function skipSub(s: ReminderSkip, t: ReturnType<typeof copy>, lang: Lang, now: string): string {
  if (s.reason === "stop") return t.skipStopSub(s.row.phone);
  if (s.reason === "promise") return t.skipPromiseSub;
  return t.skipRecentSub(s.until ? `${dohaDay(s.until) === dohaDay(now) ? t.today.toLowerCase() : formatDate(s.until, lang)} ${formatTime(s.until, lang)}` : "");
}

