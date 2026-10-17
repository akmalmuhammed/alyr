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

export const SAMPLE_ORDER: SampleKey[] = ["bakery", "salon", "homeservices"];

export const SAMPLES: Record<Locale, Record<SampleKey, AgentView>> = {
  en: { bakery: bakeryEn as AgentView, salon: salonEn as AgentView, homeservices: homeEn as AgentView },
  ar: { bakery: bakeryAr as AgentView, salon: salonAr as AgentView, homeservices: homeAr as AgentView },
};
