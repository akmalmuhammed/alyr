// The dashboard's own chrome: section names and buttons. Everything about the business
// comes from the AgentView itself. A host can override any of these.

export type AgentLabels = {
  needs: string;
  suggestions: string;
  done: string;
  doneTick: string;
  showMe: string;
  hide: string;
  more: (n: number) => string;
  notNow: string;
  lastWeek: string;
  today: string;
  coming: string;
  allHours: string;
  team: string;
  replies: string;
  firstAnswer: string;
  open: string;
  waiting: string;
  report: string;
  stale: string;
  owedOf: string;
};

export const AGENT_LABELS: Record<"en" | "ar", AgentLabels> = {
  en: {
    needs: "Needs you now",
    suggestions: "Suggestions, by rule",
    done: "Done for you this week",
    doneTick: "Done",
    showMe: "Show me",
    hide: "Hide",
    more: (n) => `and ${n} more`,
    notNow: "Not now",
    lastWeek: "Last week",
    today: "Today",
    coming: "Still to come",
    allHours: "See all hours",
    team: "Team, last 7 days",
    replies: "Replies",
    firstAnswer: "First answer",
    open: "Open",
    waiting: "Waiting",
    report: "Sunday report",
    stale: "Cannot reach ALYR right now. The numbers below are from",
    owedOf: "owed by",
  },
  ar: {
    needs: "يحتاجك الآن",
    suggestions: "اقتراحات حسب القاعدة",
    done: "أنجزته ALYR لك هذا الأسبوع",
    doneTick: "تم",
    showMe: "اعرضها",
    hide: "إخفاء",
    more: (n) => `و${n} غيرهم`,
    notNow: "ليس الآن",
    lastWeek: "الأسبوع الماضي",
    today: "اليوم",
    coming: "لم يأتِ بعد",
    allHours: "كل الساعات",
    team: "الفريق، آخر 7 أيام",
    replies: "الردود",
    firstAnswer: "أول رد",
    open: "مفتوحة",
    waiting: "بانتظار الرد",
    report: "تقرير الأحد",
    stale: "تعذّر الوصول إلى ALYR الآن. الأرقام أدناه من",
    owedOf: "على",
  },
};
