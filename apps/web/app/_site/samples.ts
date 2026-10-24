// The ALYR Agent screens of the three fictional sample businesses, captured from the engine
// by `python -m alyr.agent_samples` (apps/web/app/_agent/samples/, ALY-99). The site shows
// them as they are, without their rule lines: every number on them was computed from each
// sample's records.

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

/** The public site shows no rule lines (founder, 25 Oct 2026: "a new user will not understand
 * what's rule"), so the site's copy of each screen leaves them out, from the page's data too:
 * a crawler reads what the page carries, not only what it draws. The workspace keeps them. */
const site = (view: AgentView): AgentView => ({
  ...view,
  needs: { ...view.needs, items: view.needs.items.map((item) => ({ ...item, rule: "" })) },
  suggestions: view.suggestions.map((card) => ({ ...card, rule: "" })),
});

export const SAMPLES: Record<Locale, Record<SampleKey, AgentView>> = {
  en: { bakery: site(bakeryEn as AgentView), salon: site(salonEn as AgentView), homeservices: site(homeEn as AgentView) },
  ar: { bakery: site(bakeryAr as AgentView), salon: site(salonAr as AgentView), homeservices: site(homeAr as AgentView) },
};

// ------------------------------------------------- the Sunday report, as it is sent

/** One sample's Sunday report as the API renders it (`python -m alyr.report_samples`, ALY-99):
 * the card image in both themes and the message's lines, in WhatsApp's `*bold*` and
 * `_italics_`. Only what the phone draws is kept, so a client switch carries little. */
export type ReportSample = { shop: string; lines: string[]; carbon: CardImage; paper: CardImage };

type ReportFile = { card: { shop: string }; lines: string[] };
/** The message's last line, "_Rule · …_" / «_القاعدة · …_»: the owner's WhatsApp message keeps
 * it, the site's drawing of it does not (see `site` above). */
const RULE_LINE = /^\u200f?_(?:Rule|RULE|القاعدة) · /;
const report = (key: SampleKey, lang: Locale, file: ReportFile): ReportSample => ({
  shop: file.card.shop,
  lines: file.lines.filter((line) => !RULE_LINE.test(line)),
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
