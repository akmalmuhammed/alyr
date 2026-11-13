export interface CreditCustomer {
  id: string;
  name: string;
  phone: string;
  owes: number; // in dirhams (1 QAR = 100 dirhams)
  limit: number; // in dirhams
  oldestDebtDays: number;
  promise: {
    status: string;
    dateText: string;
    tone: "n" | "warn" | "bad";
    passed?: boolean;
    note?: string;
  } | null;
  lastReminder: {
    date: string;
    tone: "Gentle" | "Firm" | "Final";
    countText: string;
  } | null;
  followsUp: string;
  tag: {
    text: string;
    tone: "n" | "warn" | "bad";
  } | null;
  since: string;
}

export interface CreditOpenOrder {
  orderNumber: string;
  customerName: string;
  status: string;
  tone: "n" | "ok" | "warn";
  amount: number;
  impactText: string;
}

export interface CreditPaymentRecord {
  date: string;
  customerName: string;
  howText: string;
  amount: number;
}

export function formatQar(dirhams: number, lang: "en" | "ar" = "en"): string {
  const qar = Math.abs(dirhams) / 100;
  const isNegative = dirhams < 0;
  const formatted = qar.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(qar) ? 0 : 2,
    maximumFractionDigits: 2,
  });

  const sign = isNegative ? "−" : "";

  if (lang === "ar") {
    return `${sign}${formatted}\u00a0ر.ق`;
  }
  return `${sign}QAR\u00a0${formatted}`;
}

export function getAgeBadgeTone(days: number): "n" | "warn" | "bad" {
  if (days > 60) return "bad";
  if (days > 30) return "warn";
  return "n";
}

export function getReminderTone(days: number): {
  toneName: "Gentle" | "Firm" | "Final";
  toneKey: "g" | "f" | "l";
  badgeTone: "n" | "warn" | "bad";
} {
  if (days >= 90) {
    return { toneName: "Final", toneKey: "l", badgeTone: "bad" };
  }
  if (days >= 60) {
    return { toneName: "Firm", toneKey: "f", badgeTone: "warn" };
  }
  return { toneName: "Gentle", toneKey: "g", badgeTone: "n" };
}

export function calculateCreditUsed(owes: number, limit: number): {
  percent: number;
  ratio: number;
  isOver: boolean;
  left: number;
} {
  if (limit <= 0) {
    return { percent: 0, ratio: 0, isOver: owes > 0, left: 0 };
  }
  const ratio = owes / limit;
  const percent = Math.round(ratio * 100);
  const isOver = owes > limit;
  const left = Math.max(0, limit - owes);
  return { percent, ratio, isOver, left };
}

export function getInitials(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function filterCreditAccounts(
  accounts: CreditCustomer[],
  options: {
    tab?: "owe_money" | "owe_nothing" | "all";
    search?: string;
    chip?: string;
    followsUp?: string;
  }
): CreditCustomer[] {
  let result = [...accounts];

  // Tab filter
  if (options.tab === "owe_money") {
    result = result.filter((a) => a.owes > 0);
  } else if (options.tab === "owe_nothing") {
    result = result.filter((a) => a.owes === 0);
  }

  // Search filter
  if (options.search && options.search.trim()) {
    const q = options.search.toLowerCase().trim();
    result = result.filter(
      (a) => a.name.toLowerCase().includes(q) || a.phone.includes(q)
    );
  }

  // Chip filter
  if (options.chip && options.chip !== "all") {
    if (options.chip === "over_30") {
      result = result.filter((a) => a.oldestDebtDays > 30);
    } else if (options.chip === "promised") {
      result = result.filter((a) => a.promise && !a.promise.passed);
    } else if (options.chip === "promise_passed") {
      result = result.filter((a) => a.promise && a.promise.passed);
    } else if (options.chip === "over_limit") {
      result = result.filter((a) => a.owes > a.limit);
    } else if (options.chip === "said_stop") {
      result = result.filter((a) => a.tag?.text === "Said stop");
    }
  }

  // Follows up filter
  if (options.followsUp && options.followsUp !== "Anyone") {
    result = result.filter((a) => a.followsUp === options.followsUp);
  }

  return result;
}

export function sortCreditAccounts(
  accounts: CreditCustomer[],
  sortBy: "owes_desc" | "name_asc" | "oldest_desc" = "owes_desc"
): CreditCustomer[] {
  return [...accounts].sort((a, b) => {
    if (sortBy === "owes_desc") {
      if (b.owes !== a.owes) return b.owes - a.owes;
      return a.name.localeCompare(b.name);
    }
    if (sortBy === "oldest_desc") {
      if (b.oldestDebtDays !== a.oldestDebtDays) return b.oldestDebtDays - a.oldestDebtDays;
      return b.owes - a.owes;
    }
    return a.name.localeCompare(b.name);
  });
}
