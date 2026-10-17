// The homepage figure on its own page (ALY-99, 05-critique "As a homepage figure"): the
// three fictional samples in showcase mode, for screenshots and for whoever builds the
// public page. Not in search (the product layout says noindex). The data is the captured
// fixtures in app/_agent/samples, made by `python -m alyr.agent_samples`.
//
//   /agent-sample                      all three, in English
//   /agent-sample?lang=ar              all three, in Arabic
//   /agent-sample?sample=salon&lang=ar one of them

import { AgentDashboard } from "../../_agent/AgentDashboard";
import type { AgentView } from "../../_agent/types";
import bakeryAr from "../../_agent/samples/bakery.ar.json";
import bakeryEn from "../../_agent/samples/bakery.en.json";
import homeAr from "../../_agent/samples/homeservices.ar.json";
import homeEn from "../../_agent/samples/homeservices.en.json";
import salonAr from "../../_agent/samples/salon.ar.json";
import salonEn from "../../_agent/samples/salon.en.json";

const SAMPLES = {
  bakery: {
    en: bakeryEn, ar: bakeryAr,
    caption: { en: "Fig · Sample, fictional bakery", ar: "شكل · بيانات تجريبية لمخبز خيالي" },
  },
  salon: {
    en: salonEn, ar: salonAr,
    caption: { en: "Fig · Sample, fictional women's salon", ar: "شكل · بيانات تجريبية لصالون نسائي خيالي" },
  },
  homeservices: {
    en: homeEn, ar: homeAr,
    caption: { en: "Fig · Sample, fictional AC service company", ar: "شكل · بيانات تجريبية لشركة تكييف خيالية" },
  },
} as const;

type Key = keyof typeof SAMPLES;

export const metadata = { title: "ALYR Agent, sample figures" };

export default async function AgentSamplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const lang = params.lang === "ar" ? "ar" : "en";
  const one = typeof params.sample === "string" && params.sample in SAMPLES ? (params.sample as Key) : null;
  const keys: Key[] = one ? [one] : ["bakery", "salon", "homeservices"];
  return (
    <main className="agent-sample" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <style>{`
        .agent-sample { max-width: 1168px; margin: 0 auto; padding: 48px 24px 96px; display: grid; gap: 96px; }
        .agent-sample figure { margin: 0; display: grid; gap: 24px; }
        .agent-sample figcaption {
          font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em;
          text-transform: uppercase; color: var(--text-muted); border-top: 1px solid var(--line); padding-top: 8px;
        }
        .agent-sample[dir="rtl"] figcaption { font-family: var(--arabic); font-size: 13px; letter-spacing: 0; text-transform: none; }
        @media (max-width: 600px) { .agent-sample { padding: 24px 16px 64px; gap: 64px; } }
      `}</style>
      <h1 style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
        {lang === "ar" ? "ALYR Agent: أشكال تجريبية" : "ALYR Agent: sample figures"}
      </h1>
      {keys.map((key) => (
        <figure key={key}>
          <AgentDashboard view={SAMPLES[key][lang] as AgentView} mode="showcase" headingLevel={2} />
          <figcaption>{SAMPLES[key].caption[lang]}</figcaption>
        </figure>
      ))}
    </main>
  );
}
