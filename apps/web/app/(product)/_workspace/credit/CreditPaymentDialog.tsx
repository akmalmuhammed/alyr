"use client";

import { useId, useMemo, useState } from "react";
import { Banner, Button, Field, FormSection, Icon, Input, Modal, Radio, Select, Status } from "../../../_ui";
import { amount as amountText, counted, formatDate, money, none } from "../../../_ui/format";
import { copy, type Lang } from "./copy";
import {
  PAY_METHODS, allocatePayment, checkAmount, openSales,
  type CreditAccountRow, type CreditEntry, type PayMethod,
} from "./logic";
import { Amount } from "./parts";

export type PaymentInput = { accountId: string; amount: number; method: PayMethod; reference: string };

export type PaymentProps = {
  lang: Lang;
  /** The customer, or null when it was opened from the list: then it asks who paid. */
  account: CreditAccountRow | null;
  /** Customers who owe, to choose from when there is no `account`. */
  owing: CreditAccountRow[];
  bookOf: (id: string) => CreditEntry[];
  now: string;
  onSave?: (input: PaymentInput) => Promise<void>;
  onClose: () => void;
};

export function CreditPaymentDialog(p: PaymentProps) {
  const { lang, now } = p;
  const t = copy(lang);
  const formId = useId();
  const [accountId, setAccountId] = useState<string>(p.account?.id ?? "");
  const account = p.account ?? p.owing.find((r) => r.id === accountId) ?? null;
  const { bookOf } = p;
  const sales = useMemo(() => (account ? openSales(bookOf(account.id), now) : []), [account, bookOf, now]);
  const [typed, setTyped] = useState<string | null>(null);
  const [method, setMethod] = useState<PayMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const oldest = sales[0];
  // The first sale's balance is what most payments are for; the owner types over it.
  const text = typed ?? (oldest ? amountText(oldest.remaining) : "");
  const owed = account?.balance ?? 0;
  const check = checkAmount(text, owed);
  const amount = check.ok ? check.amount : 0;
  const split = allocatePayment(sales, amount);
  const error = submitted && !check.ok ? t.amountError(check.reason, money(owed, lang)) : undefined;
  const promiseNote = account?.promisePassed || account?.promisedUntil;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!account || !check.ok || !p.onSave) return;
    setBusy(true);
    setFailed(false);
    try {
      await p.onSave({ accountId: account.id, amount: check.amount, method, reference: reference.trim() });
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
      title={account ? t.payTitle(account.name) : t.payTitleNone}
      closeLabel={t.close}
      footer={
        <>
          <Button kind="quiet" onClick={p.onClose}>{t.cancel}</Button>
          <Button kind="volt" type="submit" form={formId} loading={busy} loadingLabel={t.saving} disabled={!p.onSave || !account}>{t.savePayment}</Button>
        </>
      }
    >
      <form id={formId} className="crd-form" onSubmit={save} noValidate>
        {failed ? <Banner tone="bad">{t.saveFailed}</Banner> : null}

        {p.account ? null : (
          <Field label={t.customer} error={submitted && !account ? t.pickCustomer : undefined}>
            <Select value={accountId} onChange={(e) => { setAccountId(e.target.value); setTyped(null); }}>
              <option value="">{t.chooseCustomer}</option>
              {p.owing.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
        )}

        {account ? (
          <div className="crd-sum">
            <div className="crd-stack-2">
              <strong>{t.owesLine(account.name)}</strong>
              <span className="crd-quiet crd-small">
                {t.oldestSaleOld(counted(account.oldestDays, t.nounDay, lang))}
                {account.promisePassed ? ` · ${t.promisePassedShort(account.promisePassedOn ? formatDate(account.promisePassedOn, lang) : null)}` : ""}
              </span>
            </div>
            <strong className="u-mono crd-sum-fig"><Amount value={account.balance} lang={lang} /></strong>
          </div>
        ) : null}

        <div className="crd-form-row">
          <Field label={t.amountPaid} error={error}>
            <Input
              inputMode="decimal"
              prefix={t.currency}
              value={text}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              disabled={!account}
            />
          </Field>
          <Field label={t.reference} optional={t.optional}>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} autoComplete="off" dir="ltr" />
          </Field>
        </div>

        <FormSection label={t.howPaid}>
          <div className="crd-methods">
            {PAY_METHODS.map((m) => (
              <Radio key={m} name={`${formId}-method`} checked={method === m} onChange={() => setMethod(m)} className="crd-method">
                <span className="crd-method-row">
                  <span>{t.method[m]}</span>
                  <span className="crd-quiet crd-small">{t.methodHint[m]}</span>
                </span>
              </Radio>
            ))}
          </div>
        </FormSection>

        {account && sales.length > 0 ? (
          <section aria-labelledby={`${formId}-split`}>
            <h3 id={`${formId}-split`} className="u-label">{t.paysOff}</h3>
            <ul className="crd-split">
              {split.lines.map((l) => (
                <li key={l.ref} className="crd-split-row">
                  <span className="crd-stack-2">
                    <strong>{l.ref}</strong>
                    <span className="crd-quiet crd-small">{l.days === 0 ? t.today : counted(l.days, t.nounDay, lang)}</span>
                  </span>
                  <span className="u-mono crd-quiet"><Amount value={l.owed} lang={lang} /></span>
                  <Icon name="arrow" />
                  {l.applied === 0 ? (
                    <Status tone="n">{t.notTouched}</Status>
                  ) : l.left === 0 ? (
                    <Status tone="ok">{t.paidInFull}</Status>
                  ) : (
                    <Status tone="n">{t.stillOwed(money(l.left, lang))}</Status>
                  )}
                </li>
              ))}
              <li className="crd-split-total">
                <strong>{t.owesAfter}</strong>
                <strong className="u-mono"><Amount value={split.owesAfter} lang={lang} /></strong>
              </li>
            </ul>
          </section>
        ) : account ? <p className="crd-quiet">{none(lang)}</p> : null}

        <ul className="crd-notes">
          <li><Icon name="doc" />{t.noteReceipt}</li>
          {promiseNote ? <li><Icon name="check" />{t.notePromise}</li> : null}
          <li><Icon name="info" />{t.noteRecords}</li>
        </ul>
      </form>
    </Modal>
  );
}
