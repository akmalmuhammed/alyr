"use client";

// The redesigned Credit accounts on the shop's real ledger. Managers only: an agent is shown "no
// access" by the screen and the host makes no request for balances at all.
//
// What the API cannot give yet is left out, not made up (requests.md, J06): the credit limit, the
// open orders on account, the month's payments, earlier statements, the pay link and bank lines
// are null, so the screen draws no panel for them; "Limit and promise" and "Send statement" have
// no endpoint, so those buttons are not drawn; reminders go to everyone the rule reaches.

import { useCallback, useEffect, useState } from "react";
import { api } from "@/app/_ui/api";
import { CreditWorkbench, type CreditActions } from "../../credit/CreditWorkbench";
import { assignFollowUp, loadEntries, loadSummary, recordPayment, sendReminders } from "../../credit/creditApi";
import { CreditError, CreditLoading } from "../../credit/CreditStates";
import { canSeeCredit, type CreditEntry } from "../../credit/logic";
import type { CreditData } from "../../credit/types";
import type { SectionProps } from "../../sectionRegistry";

const ACTIONS: CreditActions = { recordPayment, assign: assignFollowUp, sendReminders };

/** The books of the customers who owe, five requests at a time (the screen draws a book when an account opens). */
async function loadBooks(ids: string[]): Promise<Record<string, CreditEntry[]>> {
  const books: Record<string, CreditEntry[]> = {};
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) books[id] = await loadEntries(id);
  };
  await Promise.all(Array.from({ length: Math.min(5, queue.length) }, worker));
  return books;
}

const EMPTY: CreditData = {
  now: new Date(0).toISOString(), shop: { name: "", nameAr: "", phone: "", address: "" }, rows: [], payments: null, openOrders: null,
  team: [], books: {}, extras: {}, payLink: null, payHow: null, bank: null, earlier: null, nextStatementNumber: "", lastStatementEnd: null,
};

export default function CreditV2Section({ ws }: SectionProps) {
  const { me } = ws.state;
  const role = me.signed_in ? me.role : "owner";
  const allowed = canSeeCredit(role);
  const [data, setData] = useState<CreditData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      const [summary, team] = await Promise.all([
        loadSummary(),
        api<{ members: { id: string; name: string }[] }>("/api/team").then((t) => t.members.map((m) => ({ id: m.id, name: m.name }))),
      ]);
      const owing = summary.rows.filter((r) => r.balance > 0).map((r) => r.id);
      const books = await loadBooks(owing);
      setData({
        ...EMPTY,
        now: new Date().toISOString(),
        shop: { name: summary.shopName, nameAr: ws.state.business.name_ar || summary.shopName, phone: "", address: "" },
        rows: summary.rows, team, books,
      });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [allowed, ws.state.business.name_ar]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  if (!allowed) return <CreditWorkbench lang={ws.lang} role={role} data={EMPTY} />;
  if (failed) return <CreditError lang={ws.lang} onRetry={() => { setFailed(false); void load(); }} />;
  if (!data) return <CreditLoading lang={ws.lang} />;
  return <CreditWorkbench lang={ws.lang} role={role} data={data} actions={ACTIONS} onRetry={() => void load()} />;
}
