"use client";

import { useId, useState } from "react";
import { Banner, Button, Field, FormSection, Input, Meter, Modal, Radio, Select, Textarea } from "../../../_ui";
import { amount as amountText, formatDate, money } from "../../../_ui/format";
import { copy, type Lang } from "./copy";
import { addDays, dohaDay, limitUse, parseAmount, PROMISE_DAYS, type CreditAccountRow } from "./logic";

export type LimitMode = "limit" | "stop";

export type LimitInput = {
  accountId: string;
  mode: LimitMode;
  /** Dirhams; 0 unless the mode is "limit". */
  limit: number;
  /** A date, `2026-11-16`, or "" for no promise. */
  promiseOn: string;
  promiseAmount: number | null;
  note: string;
  assignee: string | null;
};

export type LimitProps = {
  lang: Lang;
  account: CreditAccountRow;
  team: readonly { id: string; name: string }[];
  now: string;
  onSave?: (input: LimitInput) => Promise<void>;
  onClose: () => void;
};

export function CreditLimitDialog(p: LimitProps) {
  const { lang, account, now } = p;
  const t = copy(lang);
  const formId = useId();
  const startMode: LimitMode = account.creditLimit === null || account.creditLimit > 0 ? "limit" : "stop";
  const [mode, setMode] = useState<LimitMode>(startMode);
  const [limitText, setLimitText] = useState(account.creditLimit ? amountText(account.creditLimit) : "");
  const [promiseOn, setPromiseOn] = useState(dohaDay(addDays(now, PROMISE_DAYS)));
  const [promiseText, setAmountText] = useState(account.balance > 0 ? amountText(account.balance) : "");
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState(account.assigned?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const typedLimit = parseAmount(limitText);
  const limit = mode === "limit" ? typedLimit ?? 0 : 0;
  const use = limitUse(account.balance, limit > 0 ? limit : null);
  const limitError = submitted && mode === "limit" && (typedLimit === null || typedLimit <= 0) ? t.limitError : undefined;
  const dateError = submitted && promiseOn !== "" && promiseOn < dohaDay(now) ? t.dateError : undefined;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!p.onSave || limitError || (promiseOn !== "" && promiseOn < dohaDay(now)) || (mode === "limit" && (typedLimit === null || typedLimit <= 0))) return;
    setBusy(true);
    setFailed(false);
    try {
      await p.onSave({
        accountId: account.id, mode, limit, promiseOn, promiseAmount: parseAmount(promiseText), note: note.trim(),
        assignee: assignee || null,
      });
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
      title={t.limitTitle(account.name)}
      closeLabel={t.close}
      footer={
        <>
          <Button kind="quiet" onClick={p.onClose}>{t.cancel}</Button>
          <Button kind="volt" type="submit" form={formId} loading={busy} loadingLabel={t.saving} disabled={!p.onSave}>{t.save}</Button>
        </>
      }
    >
      <form id={formId} className="crd-form" onSubmit={save} noValidate>
        {failed ? <Banner tone="bad">{t.saveFailed}</Banner> : null}

        <FormSection label={t.creditLimit}>
          <div className="crd-methods">
            {(["limit", "stop"] as const).map((m) => (
              <Radio key={m} name={`${formId}-mode`} checked={mode === m} onChange={() => setMode(m)} className="crd-method">
                <span className="crd-stack-2">
                  <strong>{t.limitMode[m]}</strong>
                  <span className="crd-quiet crd-small">{t.limitModeHelp[m]}</span>
                </span>
              </Radio>
            ))}
          </div>
        </FormSection>

        {mode === "limit" ? (
          <div className="crd-form-row">
            <Field label={t.limit} error={limitError}>
              <Input inputMode="decimal" prefix={t.currency} value={limitText} onChange={(e) => setLimitText(e.target.value)} autoComplete="off" />
            </Field>
            <div className="crd-stack-2 crd-use">
              <div className="crd-use-line">
                <span className="crd-quiet crd-small">{t.owesNow(money(account.balance, lang))}</span>
                {use.hasLimit ? <span className={use.over ? "u-mono crd-small crd-bad" : "u-mono crd-small"}><bdi>{t.usedLeft(use.percent, money(use.left, lang))}</bdi></span> : null}
              </div>
              <Meter value={Math.min(account.balance, limit || 1)} max={limit || 1} tone={use.over ? "bad" : "ink"} label={t.limitUsedLabel(account.name)} />
            </div>
          </div>
        ) : null}

        <section className="crd-form" aria-labelledby={`${formId}-promise`}>
          <div className="crd-form-head">
            <h3 id={`${formId}-promise`} className="u-label">{t.promiseTitle}</h3>
            {account.promisePassed ? <span className="crd-warn crd-small">{t.lastPassed(account.promisePassedOn ? formatDate(account.promisePassedOn, lang) : null)}</span> : null}
          </div>
          <div className="crd-form-row">
            <Field label={t.theyPayBy} optional={t.optional} error={dateError}>
              <Input type="date" value={promiseOn} min={dohaDay(now)} onChange={(e) => setPromiseOn(e.target.value)} dir="ltr" />
            </Field>
            <Field label={t.howMuch} optional={t.optional}>
              <Input inputMode="decimal" prefix={t.currency} value={promiseText} onChange={(e) => setAmountText(e.target.value)} autoComplete="off" />
            </Field>
          </div>
          <Field label={t.noteTeam} optional={t.optional} hint={t.promiseHelp}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} />
          </Field>
        </section>

        <Field label={t.whoFollows}>
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{t.nobody2}</option>
            {p.team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}
