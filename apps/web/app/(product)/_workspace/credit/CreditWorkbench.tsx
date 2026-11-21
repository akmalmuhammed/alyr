"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../../../_ui";
import "./credit.css";
import { CreditAccount } from "./CreditAccount";
import { CreditAccounts } from "./CreditAccounts";
import { CreditLimitDialog, type LimitInput } from "./CreditLimitDialog";
import { CreditPaymentDialog, type PaymentInput } from "./CreditPaymentDialog";
import { CreditRemindersDialog, type SendResult } from "./CreditRemindersDialog";
import { CreditStatement } from "./CreditStatement";
import { CreditError, CreditFirstRun, CreditLoading, CreditNoPermission } from "./CreditStates";
import { copy, type Lang } from "./copy";
import {
  applyPayment, canSeeCredit, paymentEntry, planReminders,
  type AccountFilters, type CreditAccountRow, type CreditEntry, type Payment,
} from "./logic";
import type { CreditData } from "./types";

/** What the screen can do. A missing one is not drawn (a button for it is left out), never faked. */
export type CreditActions = {
  recordPayment?: (input: PaymentInput) => Promise<void>;
  saveLimit?: (input: LimitInput) => Promise<void>;
  sendReminders?: (minDays: number) => Promise<SendResult>;
  sendStatement?: (accountId: string, channels: { whatsapp: boolean; email: boolean }) => Promise<void>;
  assign?: (accountId: string, userId: string | null) => Promise<void>;
};

export type CreditState = "loading" | "empty" | "offline" | "error" | "filtered" | null;
type Dialog = { kind: "reminders" } | { kind: "pay"; id: string | null } | { kind: "limit"; id: string } | null;
type View = { kind: "accounts" } | { kind: "account"; id: string } | { kind: "statement"; id: string };

export type CreditWorkbenchProps = {
  lang: Lang;
  /** The signed-in person's role: owner, admin or agent. */
  role: string;
  data: CreditData;
  /** Preview: the actions are simulated here, nothing is saved or sent, and the toasts say so. */
  preview?: boolean;
  actions?: CreditActions;
  initialAccount?: string | null;
  initialDialog?: "reminders" | "payment" | "limit" | null;
  initialView?: "statement" | null;
  initialState?: CreditState;
  onRetry?: () => void;
};

export function CreditWorkbench(props: CreditWorkbenchProps) {
  const { lang, role, data, preview = false, actions = {}, initialState = null } = props;
  const t = copy(lang);
  const toast = useToast();

  const [rows, setRows] = useState<CreditAccountRow[]>(data.rows);
  const [books, setBooks] = useState<Record<string, CreditEntry[]>>(data.books);
  const [payments, setPayments] = useState<Payment[] | null>(data.payments);
  const [extras, setExtras] = useState(data.extras);
  const [view, setView] = useState<View>(
    props.initialAccount && data.rows.some((r) => r.id === props.initialAccount)
      ? props.initialView === "statement" ? { kind: "statement", id: props.initialAccount } : { kind: "account", id: props.initialAccount }
      : { kind: "accounts" },
  );
  const [dialog, setDialog] = useState<Dialog>(() => {
    const id = props.initialAccount && data.rows.some((r) => r.id === props.initialAccount) ? props.initialAccount : null;
    if (props.initialDialog === "reminders") return { kind: "reminders" };
    if (props.initialDialog === "payment") return { kind: "pay", id };
    if (props.initialDialog === "limit" && id) return { kind: "limit", id };
    return null;
  });
  const [state, setState] = useState<CreditState>(initialState);

  // The page's language and direction follow the screen (the preview route has no shell to set them).
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const now = data.now;
  const offline = state === "offline";
  const bookOf = useCallback((id: string) => books[id] ?? [], [books]);
  const owing = useMemo(() => rows.filter((r) => r.balance > 0).sort((a, b) => a.name.localeCompare(b.name, "en")), [rows]);
  const can = {
    pay: preview || !!actions.recordPayment,
    limit: preview || !!actions.saveLimit,
    statement: true,
    assign: preview || !!actions.assign,
  };
  const note = (text: string) => toast.push({ text, tone: "ok", meta: preview ? t.previewOnly : undefined });

  if (!canSeeCredit(role)) return <CreditNoPermission lang={lang} />;
  if (state === "loading") return <CreditLoading lang={lang} />;
  if (state === "error") return <CreditError lang={lang} onRetry={() => { setState(null); props.onRetry?.(); }} />;
  if (state === "empty" || rows.filter((r) => r.balance > 0 || (r.creditLimit ?? 0) > 0).length === 0) return <CreditFirstRun lang={lang} />;

  const current = view.kind === "accounts" ? null : rows.find((r) => r.id === view.id) ?? null;

  async function recordPayment(input: PaymentInput) {
    if (actions.recordPayment) await actions.recordPayment(input);
    const row = rows.find((r) => r.id === input.accountId);
    if (!row) return;
    const entry = paymentEntry({ amount: input.amount, method: input.method, reference: input.reference, by: preview ? t.you : "", at: now }, `local-${Date.now()}`);
    const book = [...bookOf(row.id), entry];
    setBooks((b) => ({ ...b, [row.id]: book }));
    setRows((rs) => rs.map((r) => (r.id === row.id ? applyPayment(r, book, now) : r)));
    setPayments((ps) => (ps ? [...ps, { id: entry.id, at: now, customerId: row.id, customerName: row.name, amount: input.amount, method: input.method, by: entry.by }] : ps));
    setDialog(null);
    note(t.paymentSaved);
  }

  async function saveLimit(input: LimitInput) {
    if (actions.saveLimit) await actions.saveLimit(input);
    setRows((rs) => rs.map((r) => {
      if (r.id !== input.accountId) return r;
      const limit = input.mode === "limit" ? input.limit : 0;
      return {
        ...r,
        creditLimit: limit,
        overLimit: limit > 0 && r.balance > limit,
        promisedUntil: input.promiseOn ? `${input.promiseOn}T00:00:00+03:00` : null,
        promisePassed: input.promiseOn ? false : r.promisePassed,
        assigned: data.team.find((m) => m.id === input.assignee) ?? null,
      };
    }));
    if (input.promiseOn) {
      setExtras((e) => ({
        ...e,
        [input.accountId]: {
          ...e[input.accountId],
          promise: { madeAt: now, via: "staff", until: `${input.promiseOn}T00:00:00+03:00`, amount: input.promiseAmount, note: input.note },
        },
      }));
    }
    setDialog(null);
    note(t.limitSaved);
  }

  async function sendReminders(minDays: number): Promise<SendResult> {
    if (actions.sendReminders) return actions.sendReminders(minDays);
    const plan = planReminders(rows, minDays, now);
    return {
      sent: plan.go.length,
      skippedPromised: plan.skipped.filter((s) => s.reason === "promise").length,
      skippedRecent: plan.skipped.filter((s) => s.reason === "recent").length,
      skippedOptedOut: plan.skipped.filter((s) => s.reason === "stop").length,
    };
  }

  function remindersDone(result: SendResult, minDays: number) {
    const reached = new Set(planReminders(rows, minDays, now).go.map((g) => g.row.id));
    setRows((rs) => rs.map((r) => (reached.has(r.id) ? { ...r, lastRemindedAt: now, remindersSent: (r.remindersSent ?? 0) + 1 } : r)));
    setDialog(null);
    note(t.remindersSent(result.sent));
  }

  async function assign(id: string, userId: string | null) {
    if (actions.assign) await actions.assign(id, userId);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, assigned: data.team.find((m) => m.id === userId) ?? null } : r)));
    note(t.assigned);
  }

  const dialogOpen = dialog !== null;
  const reminders = dialog?.kind === "reminders" ? (
    <CreditRemindersDialog
      lang={lang} rows={rows} now={now} shop={data.shop} payLink={data.payLink} payHow={data.payHow}
      onSend={preview || actions.sendReminders ? sendReminders : undefined}
      onClose={() => setDialog(null)} onDone={remindersDone}
    />
  ) : null;
  const pay = dialog?.kind === "pay" ? (
    <CreditPaymentDialog
      lang={lang} account={dialog.id ? rows.find((r) => r.id === dialog.id) ?? null : null} owing={owing} bookOf={bookOf} now={now}
      onSave={can.pay ? recordPayment : undefined} onClose={() => setDialog(null)}
    />
  ) : null;
  const limit = dialog?.kind === "limit" && rows.find((r) => r.id === dialog.id) ? (
    <CreditLimitDialog
      lang={lang} account={rows.find((r) => r.id === dialog.id) as CreditAccountRow} team={data.team} now={now}
      onSave={can.limit ? saveLimit : undefined} onClose={() => setDialog(null)}
    />
  ) : null;

  if (view.kind === "statement" && current) {
    const extra = extras[current.id] ?? {};
    return (
      <>
        <CreditStatement
          lang={lang} account={current} entries={bookOf(current.id)} now={now} shop={data.shop} number={data.nextStatementNumber}
          bank={data.bank} payLink={data.payLink} earlier={data.earlier} lastEnd={data.lastStatementEnd} email={extra.email ?? null}
          offline={offline}
          onSend={preview || actions.sendStatement ? async (channels) => {
            if (actions.sendStatement) await actions.sendStatement(current.id, channels);
            note(t.statementSent);
          } : undefined}
          onBack={() => setView({ kind: "account", id: current.id })}
        />
      </>
    );
  }

  if (view.kind === "account" && current) {
    const extra = extras[current.id] ?? {};
    return (
      <>
        <CreditAccount
          lang={lang} row={current} entries={bookOf(current.id)} since={extra.since ?? null} promise={extra.promise ?? null}
          reminders={extra.reminders ?? null} separate={extra.separate ?? null} lastStatement={extra.lastStatement ?? null}
          openOrders={data.openOrders} team={data.team} now={now} dialogOpen={dialogOpen} offline={offline} canManage={canSeeCredit(role)} can={can}
          onBack={() => setView({ kind: "accounts" })}
          onPay={() => setDialog({ kind: "pay", id: current.id })}
          onLimit={() => setDialog({ kind: "limit", id: current.id })}
          onStatement={() => setView({ kind: "statement", id: current.id })}
          onAssign={(userId) => void assign(current.id, userId)}
        />
        {pay}{limit}{reminders}
      </>
    );
  }

  return (
    <>
      <CreditAccounts
        lang={lang} rows={rows} payments={payments} openOrders={data.openOrders} team={data.team} now={now}
        dialogOpen={dialogOpen} offline={offline}
        initialFilters={state === "filtered" ? ({ search: "zzz" } satisfies Partial<AccountFilters>) : undefined}
        onOpen={(id) => setView({ kind: "account", id })}
        onRemind={() => setDialog({ kind: "reminders" })}
        onPay={(id) => setDialog({ kind: "pay", id })}
        onLimit={(id) => setDialog({ kind: "limit", id })}
      />
      {pay}{limit}{reminders}
    </>
  );
}
