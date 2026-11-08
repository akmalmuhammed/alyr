// The words that the four-stage switch adds to the homepage (ALY-330, section 3). The stages'
// own words (chip, headline, sentence, "Runs today", "Our team does", the figures' rows) stay
// in `copyHome.ts` (`home.stages`). The integrator wires this as `copy[locale].home.stageTabs`.
// Arabic is a draft in Modern Standard Arabic with Western digits; a native reviewer signs it
// off (ALY-66).

import { stageScenesAr, stageScenesEn, type StageScenesCopy } from "./copyScenes";

export type StageTabsCopy = {
  /** The section's heading; a line feed names where it breaks. */
  title: string;
  /** One line under it. */
  lead: string;
  /** The switch's accessible name. */
  tabsLabel: string;
  /** The step-on link at the end of a panel; `{stage}` is the next stage's name. */
  next: string;
  /** The same link on the last stage, which goes back to the first. */
  back: string;
  /** The animated scenes in the Discover and Convert panels (copyScenes.ts). */
  scenes: StageScenesCopy;
};

export const stageTabsEn: StageTabsCopy = {
  title: "One business, four stages.",
  lead: "Choose a stage to see what runs today and what our team does with you.",
  tabsLabel: "The four stages",
  next: "Next: {stage}",
  back: "Back to {stage}",
  scenes: stageScenesEn,
};

export const stageTabsAr: StageTabsCopy = {
  title: "نشاط واحد، أربع مراحل.",
  lead: "اختر مرحلة لترى ما يعمل اليوم وما يتولاه فريقنا معك.",
  tabsLabel: "المراحل الأربع",
  next: "التالي: {stage}",
  back: "العودة إلى {stage}",
  scenes: stageScenesAr,
};
