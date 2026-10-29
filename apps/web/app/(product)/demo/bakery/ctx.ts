// What every scene is given: the words, the moment, the shop, and the visit's state.

import type { Words } from "./copy";
import type { Lang, Numbers, Pain, Pos, Setup } from "./logic";

export type Cake = { size: number | null; flavour: number | null; message: number | null; day: number | null };
export const NO_CAKE: Cake = { size: null, flavour: null, message: null, day: null };
/** What the founder's Next fills in when the owner has not tapped everything. */
export const CAKE_DEFAULT: Cake = { size: 0, flavour: 0, message: 0, day: 0 };

export type Visit = {
  numbers: Numbers;
  formula: boolean;
  tapped: Pain[];
  cake: Cake;
  answers: number[];
  checkup: number | null;
};

export type SceneProps = {
  w: Words;
  lang: Lang;
  beat: number;
  shop: string;
  setup: Setup;
  visit: Visit;
  change: (patch: Partial<Visit>) => void;
  setSetup: (patch: Partial<Setup>) => void;
  go: (to: Pos, from?: Pos) => void;
  next: () => void;
  start: () => void;
};
