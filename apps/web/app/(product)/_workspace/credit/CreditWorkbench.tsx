"use client";

import React, { useState } from "react";
import "./credit.css";
import { CreditLang } from "./copy";
import { CreditAccounts } from "./CreditAccounts";
import { CreditAccount } from "./CreditAccount";
import { CreditRemindersDialog } from "./CreditRemindersDialog";
import { CreditPaymentDialog } from "./CreditPaymentDialog";
import { CreditLimitDialog } from "./CreditLimitDialog";
import { CreditStatement } from "./CreditStatement";
import { CreditStates } from "./CreditStates";
import { CreditPhone } from "./CreditPhone";

export interface CreditWorkbenchProps {
  initialAccount?: string | null;
  initialDialog?: "reminders" | "payment" | "limit" | null;
  initialView?: "statement" | null;
  initialState?: "loading" | "empty" | "offline" | "filtered" | null;
  isPhone?: boolean;
  lang?: CreditLang;
}

export function CreditWorkbench({
  initialAccount = null,
  initialDialog = null,
  initialView = null,
  initialState = null,
  isPhone = false,
  lang = "en",
}: CreditWorkbenchProps) {
  const [currentAccount, setCurrentAccount] = useState<string | null>(initialAccount);
  const [activeDialog, setActiveDialog] = useState<"reminders" | "payment" | "limit" | null>(initialDialog);
  const [currentView, setCurrentView] = useState<"statement" | null>(initialView);
  const [currentState, setCurrentState] = useState<"loading" | "empty" | "offline" | "filtered" | null>(initialState);

  // If a state override is active (e.g. state=loading)
  if (currentState) {
    return (
      <div style={{ padding: isPhone ? "1rem" : "1.5rem 1.75rem" }}>
        <CreditStates
          state={currentState}
          lang={lang}
          onReset={() => setCurrentState(null)}
          onAction={() => setCurrentState(null)}
        />
      </div>
    );
  }

  // Mobile layout
  if (isPhone) {
    return (
      <div style={{ padding: "0.75rem" }}>
        <CreditPhone
          view={currentAccount ? "account" : "accounts"}
          lang={lang}
          onSelectAccount={(id) => setCurrentAccount(id)}
          onBack={() => {
            if (currentAccount) setCurrentAccount(null);
          }}
          onOpenReminders={() => setActiveDialog("reminders")}
          onOpenPayment={() => setActiveDialog("payment")}
          onOpenStatement={() => setCurrentView("statement")}
        />

        {activeDialog === "reminders" && (
          <CreditRemindersDialog
            lang={lang}
            onClose={() => setActiveDialog(null)}
          />
        )}

        {activeDialog === "payment" && (
          <CreditPaymentDialog
            lang={lang}
            onClose={() => setActiveDialog(null)}
          />
        )}

        {activeDialog === "limit" && (
          <CreditLimitDialog
            lang={lang}
            onClose={() => setActiveDialog(null)}
          />
        )}
      </div>
    );
  }

  // Desktop Statement of account view
  if (currentView === "statement") {
    return (
      <div style={{ padding: "1.5rem 1.75rem" }}>
        <CreditStatement
          lang={lang}
          onBack={() => setCurrentView(null)}
        />
      </div>
    );
  }

  // Desktop Single Customer Account view
  if (currentAccount) {
    return (
      <div style={{ padding: "1.5rem 1.75rem" }}>
        <CreditAccount
          lang={lang}
          onBack={() => setCurrentAccount(null)}
          onOpenPayment={() => setActiveDialog("payment")}
          onOpenLimit={() => setActiveDialog("limit")}
          onOpenStatement={() => setCurrentView("statement")}
          onOpenReminders={() => setActiveDialog("reminders")}
        />

        {activeDialog === "payment" && (
          <CreditPaymentDialog
            lang={lang}
            onClose={() => setActiveDialog(null)}
          />
        )}

        {activeDialog === "limit" && (
          <CreditLimitDialog
            lang={lang}
            onClose={() => setActiveDialog(null)}
          />
        )}

        {activeDialog === "reminders" && (
          <CreditRemindersDialog
            lang={lang}
            onClose={() => setActiveDialog(null)}
          />
        )}
      </div>
    );
  }

  // Desktop Main Accounts view
  return (
    <div style={{ padding: "1.5rem 1.75rem" }}>
      <CreditAccounts
        lang={lang}
        onOpenAccount={(id) => setCurrentAccount(id)}
        onOpenReminders={() => setActiveDialog("reminders")}
        onOpenRecordPayment={() => {
          setCurrentAccount("bluefin");
          setActiveDialog("payment");
        }}
        onOpenRecordSale={() => setCurrentAccount("bluefin")}
      />

      {activeDialog === "reminders" && (
        <CreditRemindersDialog
          lang={lang}
          onClose={() => setActiveDialog(null)}
        />
      )}

      {activeDialog === "payment" && (
        <CreditPaymentDialog
          lang={lang}
          onClose={() => setActiveDialog(null)}
        />
      )}

      {activeDialog === "limit" && (
        <CreditLimitDialog
          lang={lang}
          onClose={() => setActiveDialog(null)}
        />
      )}
    </div>
  );
}
