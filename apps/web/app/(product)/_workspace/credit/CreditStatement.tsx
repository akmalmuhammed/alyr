"use client";

import { useId, useMemo, useState } from "react";
import {
  Banner, Button, Check, ConfirmDialog, Field, Icon, KV, KVList, PageTitle, Panel, PanelBody, PanelFooter, PanelHeader,
  Select, Thumb, Toggle,
} from "../../../_ui";
import { formatDate, money, none } from "../../../_ui/format";
import { copy, type Lang } from "./copy";
import type { EarlierStatement } from "./types";
import {
  BUCKET_KEYS, addDays, statementOf, type CreditAccountRow, type CreditEntry,
} from "./logic";
import { Amount } from "./parts";

export type StatementProps = {
  lang: Lang;
  account: CreditAccountRow;
  entries: CreditEntry[];
  now: string;
  /** The sheet's own details: shop, number, bank. */
  shop: { name: string; nameAr: string; phone: string; address: string };
  number: string;
  bank: { name: string; account: string; iban: string } | null;
  /** The pay link on the sheet, or null when the shop takes no money online. */
  payLink: string | null;
  earlier: EarlierStatement[] | null;
  /** The last statement's end: the second period starts the day after. */
  lastEnd: string | null;
  email: string | null;
  offline: boolean;
  /** Sends the statement (to the channels ticked). Absent: the button is off. */
  onSend?: (channels: { whatsapp: boolean; email: boolean }) => Promise<void>;
  onBack: () => void;
};

type Period = "all" | "sinceLast";

export function CreditStatement(p: StatementProps) {
  const { lang, account, entries, now } = p;
  const t = copy(lang);
  const ids = useId();
  const [period, setPeriod] = useState<Period>("all");
  const [showPaid, setShowPaid] = useState(true);
  const [showAge, setShowAge] = useState(true);
  const [showLink, setShowLink] = useState(p.payLink !== null);
  const [showBank, setShowBank] = useState(p.bank !== null);
  const [whatsapp, setWhatsapp] = useState(true);
  const [email, setEmail] = useState(p.email !== null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const first = useMemo(() => [...entries].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0]?.at ?? now, [entries, now]);
  const from = period === "sinceLast" && p.lastEnd ? addDays(p.lastEnd, 1) : null;
  const st = useMemo(() => statementOf(entries, now, { from, to: now, showPaid }), [entries, now, from, showPaid]);
  const start = from ?? first;

  async function send() {
    if (!p.onSend) return;
    setBusy(true);
    setFailed(false);
    try {
      await p.onSend({ whatsapp, email });
      setConfirm(false);
    } catch {
      setFailed(true);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crd-page">
      <nav className="crd-crumbs" aria-label={t.crumbsLabel}>
        <button type="button" className="crd-link" onClick={p.onBack}>{t.title}</button>
        <span aria-hidden="true" className="crd-quiet">/</span>
        <span>{account.name}</span>
        <span aria-hidden="true" className="crd-quiet">/</span>
        <span aria-current="page">{t.statementCrumb}</span>
      </nav>

      <PageTitle
        title={t.statementTitle}
        sub={t.statementSub(account.name)}
        right={
          <>
            <Button kind="line" icon={<Icon name="print" />} onClick={() => window.print()}>{t.print}</Button>
            <Button kind={confirm ? "dark" : "volt"} disabled={p.offline || !p.onSend || (!whatsapp && !email)} onClick={() => setConfirm(true)}>{t.sendStatement}</Button>
          </>
        }
      />
      {p.offline ? <Banner tone="warn">{t.offline}</Banner> : null}
      {failed ? <Banner tone="bad" action={<Button kind="quiet" size="sm" onClick={() => setConfirm(true)}>{t.retry}</Button>}>{t.sendFailed}</Banner> : null}

      <div className="crd-stmt">
        <div className="crd-sheet">
          <p className="crd-sheet-note u-mono">{t.previewNote}</p>
          <article className="crd-paper" aria-label={t.statementTitle}>
            <header className="crd-paper-head">
              <div className="crd-paper-shop">
                <Thumb size={32} seed={1} initials="NC" />
                <div className="crd-stack-2">
                  <strong className="crd-paper-name">{lang === "ar" ? p.shop.nameAr : p.shop.name}</strong>
                  <span className="crd-paper-quiet">{p.shop.address}</span>
                  <span className="crd-paper-quiet u-mono"><bdi dir="ltr">{p.shop.phone}</bdi></span>
                </div>
              </div>
              <div className="crd-paper-doc">
                <strong className="crd-paper-title">{t.statementTitle}</strong>
                <span className="crd-paper-title-ar" lang="ar">كشف حساب</span>
                <span className="crd-paper-quiet u-mono"><bdi>{p.number}</bdi> · {formatDate(now, lang, { year: "always" })}</span>
              </div>
            </header>

            <div className="crd-paper-meta">
              <div className="crd-stack-2">
                <span className="crd-paper-label u-mono">{t.to}</span>
                <strong><bdi>{account.name}</bdi></strong>
                <span className="crd-paper-quiet u-mono"><bdi dir="ltr">{account.phone}</bdi></span>
              </div>
              <div className="crd-stack-2">
                <span className="crd-paper-label u-mono">{t.period}</span>
                <strong>{t.periodText(formatDate(start, lang, { weekday: false, year: "always" }), formatDate(now, lang, { weekday: false, year: "always" }))}</strong>
                <span className="crd-paper-quiet">{t.periodHelp}</span>
              </div>
            </div>

            <dl className="crd-paper-sum">
              <div><dt>{t.owedAtStart}</dt><dd className="u-mono"><Amount value={st.opening} lang={lang} /></dd></div>
              <div><dt>{t.putOnAccount}</dt><dd className="u-mono"><Amount value={st.put} lang={lang} /></dd></div>
              <div><dt>{t.paid}</dt><dd className="u-mono"><Amount value={st.paid} lang={lang} /></dd></div>
              <div className="crd-paper-sum-last"><dt>{t.youOwe}</dt><dd className="u-mono"><Amount value={st.owes} lang={lang} /></dd></div>
            </dl>

            <div className="crd-paper-table" role="region" aria-label={t.statementTitle} tabIndex={0}>
              <table className="crd-paper-tbl">
                <thead>
                  <tr>
                    <th scope="col">{t.colDate}</th>
                    <th scope="col">{t.colWhat}</th>
                    <th scope="col" className="crd-num">{t.colPutOn}</th>
                    <th scope="col" className="crd-num">{t.colPaid}</th>
                    <th scope="col" className="crd-num">{t.colBalance}</th>
                  </tr>
                </thead>
                <tbody>
                  {st.lines.map((e) => (
                    <tr key={e.id}>
                      <td className="u-mono">{formatDate(e.at, lang, { weekday: false })}</td>
                      <td>
                        <span>{t.entryKind[e.kind]} <bdi className="u-mono">{e.ref}</bdi></span>
                        <span className="crd-paper-quiet crd-small crd-block">{e.note}</span>
                      </td>
                      <td className="crd-num u-mono">{e.kind === "payment" ? null : <Amount value={e.kind === "sale" ? e.amount : -e.amount} lang={lang} />}</td>
                      <td className="crd-num u-mono">{e.kind === "payment" ? <Amount value={e.amount} lang={lang} /> : null}</td>
                      <td className="crd-num u-mono"><Amount value={e.owesAfter} lang={lang} /></td>
                    </tr>
                  ))}
                  {st.lines.length === 0 ? <tr><td colSpan={5}>{none(lang)}</td></tr> : null}
                </tbody>
              </table>
            </div>
            {st.hidden > 0 ? <p className="crd-paper-quiet crd-small">{t.hiddenLines(st.hidden)}</p> : null}

            <p className="crd-paper-total">
              <span>{t.youOweOn(formatDate(now, lang, { year: "always" }))}</span>
              <strong className="u-mono"><Amount value={st.owes} lang={lang} /></strong>
            </p>

            {showAge ? (
              <section aria-labelledby={`${ids}-age`}>
                <h3 id={`${ids}-age`} className="crd-paper-label u-mono">{t.howOld}</h3>
                <dl className="crd-paper-age">
                  {BUCKET_KEYS.map((k) => (
                    <div key={k}><dt>{t.bucket[k]}</dt><dd className="u-mono"><Amount value={st.buckets[k]} lang={lang} /></dd></div>
                  ))}
                </dl>
              </section>
            ) : null}

            {(showLink && p.payLink) || (showBank && p.bank) ? (
              <div className="crd-paper-pay">
                {showLink && p.payLink ? (
                  <div className="crd-stack-2">
                    <span className="crd-paper-label u-mono">{t.payOnline}</span>
                    <span className="u-mono"><bdi dir="ltr">{p.payLink}</bdi></span>
                    <span className="crd-paper-quiet">{t.payOnlineHelp(p.shop.name)}</span>
                  </div>
                ) : null}
                {showBank && p.bank ? (
                  <div className="crd-stack-2">
                    <span className="crd-paper-label u-mono">{t.orBank}</span>
                    <span>{p.bank.name}</span>
                    <span className="u-mono"><bdi dir="ltr">{p.bank.iban}</bdi></span>
                    <span className="crd-paper-quiet">{t.bankRef(p.number)}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <footer className="crd-paper-foot">
              <span className="crd-paper-quiet">{t.tellUs}</span>
              <span lang="ar" className="crd-paper-quiet">شكراً لتعاملكم معنا</span>
            </footer>
          </article>
        </div>

        <div className="crd-side">
          <Panel>
            <PanelHeader title={t.whatIsOn} />
            <PanelBody>
              <Field label={t.periodPick}>
                <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
                  <option value="all">{t.periodAll(formatDate(first, lang, { weekday: false, year: "always" }))}</option>
                  {p.lastEnd ? <option value="sinceLast">{t.periodSince(formatDate(addDays(p.lastEnd, 1), lang, { weekday: false, year: "always" }))}</option> : null}
                </Select>
              </Field>
            </PanelBody>
            <div className="crd-toggles">
              <Toggle checked={showPaid} onChange={setShowPaid}>
                <span className="crd-stack-2"><strong>{t.optPaid}</strong><span className="crd-quiet crd-small">{t.optPaidHelp}</span></span>
              </Toggle>
              <Toggle checked={showAge} onChange={setShowAge}>
                <span className="crd-stack-2"><strong>{t.optAge}</strong><span className="crd-quiet crd-small">{t.optAgeHelp}</span></span>
              </Toggle>
              {p.payLink ? (
                <Toggle checked={showLink} onChange={setShowLink}>
                  <span className="crd-stack-2"><strong>{t.optLink(money(st.owes, lang))}</strong><span className="crd-quiet crd-small">{t.optLinkHelp}</span></span>
                </Toggle>
              ) : null}
              {p.bank ? (
                <Toggle checked={showBank} onChange={setShowBank}>
                  <span className="crd-stack-2"><strong>{t.optBank}</strong><span className="crd-quiet crd-small">{t.optBankHelp}</span></span>
                </Toggle>
              ) : null}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title={t.sendTo} />
            <div className="crd-channels">
              <Check checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)}>
                <span className="crd-stack-2"><strong className="u-mono"><bdi dir="ltr">{account.phone}</bdi></strong><span className="crd-quiet crd-small">{t.byWhatsapp}</span></span>
              </Check>
              {p.email ? (
                <Check checked={email} onChange={(e) => setEmail(e.target.checked)}>
                  <span className="crd-stack-2"><strong className="u-mono"><bdi dir="ltr">{p.email}</bdi></strong><span className="crd-quiet crd-small">{t.byEmail}</span></span>
                </Check>
              ) : null}
            </div>
            <PanelFooter>{t.onceSent(p.number)}</PanelFooter>
          </Panel>

          {p.earlier && p.earlier.length > 0 ? (
            <Panel clip>
              <PanelHeader title={t.earlier} sub={String(p.earlier.length)} right={<Button kind="quiet" size="sm" href="/app/documents">{t.openInDocuments}</Button>} />
              <KVList className="crd-kv">
                {p.earlier.map((e) => (
                  <KV key={e.id} k={<span className="u-mono">{e.number} <span className="crd-quiet">{formatDate(e.at, lang)}</span></span>} mono>
                    <Amount value={e.amount} lang={lang} />
                  </KV>
                ))}
              </KVList>
            </Panel>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        onConfirm={send}
        busy={busy}
        closeLabel={t.close}
        title={t.confirmSendTitle(account.name)}
        confirmLabel={t.sendStatement}
        cancelLabel={t.cancel}
        note={t.nothingSent}
      >
        {t.confirmSendBody(p.number, [whatsapp ? account.phone : null, email ? p.email : null].filter((x): x is string => !!x))}
      </ConfirmDialog>
    </div>
  );
}
