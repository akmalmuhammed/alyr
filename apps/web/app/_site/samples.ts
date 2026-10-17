// The ALYR Agent screens of the three fictional sample businesses, captured from the engine
// by `python -m alyr.agent_samples` (apps/web/app/_agent/samples/, ALY-99). The site shows
// them as they are: every number on them was computed from each sample's records.

import type { AgentView } from "../_agent/types";
import bakeryAr from "../_agent/samples/bakery.ar.json";
import bakeryEn from "../_agent/samples/bakery.en.json";
import homeAr from "../_agent/samples/homeservices.ar.json";
import homeEn from "../_agent/samples/homeservices.en.json";
import salonAr from "../_agent/samples/salon.ar.json";
import salonEn from "../_agent/samples/salon.en.json";
import type { Locale, SampleKey } from "./copy";
import reportBakeryAr from "../_agent/samples/report/bakery.ar.json";
import reportBakeryEn from "../_agent/samples/report/bakery.en.json";
import reportHomeAr from "../_agent/samples/report/homeservices.ar.json";
import reportHomeEn from "../_agent/samples/report/homeservices.en.json";
import reportSalonAr from "../_agent/samples/report/salon.ar.json";
import reportSalonEn from "../_agent/samples/report/salon.en.json";
import { REPORT_IMAGES, type CardImage } from "./report";

export const SAMPLE_ORDER: SampleKey[] = ["bakery", "salon", "homeservices"];

export const SAMPLES: Record<Locale, Record<SampleKey, AgentView>> = {
  en: { bakery: bakeryEn as AgentView, salon: salonEn as AgentView, homeservices: homeEn as AgentView },
  ar: { bakery: bakeryAr as AgentView, salon: salonAr as AgentView, homeservices: homeAr as AgentView },
};

// ------------------------------------------------- the Sunday report, as it is sent

/** One sample's Sunday report as the API renders it (`python -m alyr.report_samples`, ALY-99):
 * the card image in both themes and the message's lines, in WhatsApp's `*bold*` and
 * `_italics_`. Only what the phone draws is kept, so a client switch carries little. */
export type ReportSample = { shop: string; lines: string[]; carbon: CardImage; paper: CardImage };

type ReportFile = { card: { shop: string }; lines: string[] };
const report = (key: SampleKey, lang: Locale, file: ReportFile): ReportSample => ({
  shop: file.card.shop,
  lines: file.lines,
  ...REPORT_IMAGES[`${key}.${lang}`],
});

export const REPORTS: Record<Locale, Record<SampleKey, ReportSample>> = {
  en: {
    bakery: report("bakery", "en", reportBakeryEn),
    salon: report("salon", "en", reportSalonEn),
    homeservices: report("homeservices", "en", reportHomeEn),
  },
  ar: {
    bakery: report("bakery", "ar", reportBakeryAr),
    salon: report("salon", "ar", reportSalonAr),
    homeservices: report("homeservices", "ar", reportHomeAr),
  },
};
