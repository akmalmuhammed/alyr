// The dashboard's own chrome: section names and buttons. Everything about the business
// comes from the AgentView itself. A host can override any of these.

export type AgentLabels = {
  needs: string;
  suggestions: string;
  done: string;
  doneTick: string;
  who: (n: number) => string;
  hide: string;
  more: (n: number) => string;
  notNow: string;
  open: string;
  closeCard: string;
  today: string;
  allHours: string;
  busiest: string;
  team: string;
  report: string;
  owedBy: string;
};

export const AGENT_LABELS: Record<"en" | "ar", AgentLabels> = {
  en: {
    needs: "Needs you now",
    suggestions: "Suggestions, by rule",
    done: "Done for you this week",
    doneTick: "Done",
    who: (n) => `Who (${n})`,
    hide: "Hide",
    more: (n) => `and ${n} more`,
    notNow: "Not now",
    open: "Show this suggestion",
    closeCard: "Fold this suggestion",
    today: "Today",
    allHours: "See all hours",
    busiest: "Busiest",
    team: "Team, last 7 days",
    report: "Sunday report",
    owedBy: "owed by",
  },
  ar: {
    needs: "يحتاجك الآن",
    suggestions: "اقتراحات حسب القاعدة",
    done: "أنجزته ALYR لك هذا الأسبوع",
    doneTick: "تم",
    who: (n) => `من هم (${n})`,
    hide: "إخفاء",
    more: (n) => `و${n} غيرهم`,
    notNow: "ليس الآن",
    open: "اعرض هذا الاقتراح",
    closeCard: "اطوِ هذا الاقتراح",
    today: "اليوم",
    allHours: "كل الساعات",
    busiest: "الأكثر ازدحاماً",
    team: "الفريق، آخر 7 أيام",
    report: "تقرير الأحد",
    owedBy: "على",
  },
};
