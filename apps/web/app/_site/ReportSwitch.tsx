"use client";

// /agent's Sunday report follows the sample chosen on the page's ALYR Agent figure: the
// figure's switch sends `alyr:sample` with its `sync` id (AgentFigure.tsx), and this shows
// that sample's message and caption. Without scripts it stays on the first sample, which
// is what the figure shows then too.

import { useEffect, useState } from "react";
import type { Caption, SampleKey } from "./copy";
import { ReportPhone, type ReportWords } from "./ReportPhone";
import type { ReportSample } from "./samples";
import { rich } from "./Text";

export const SAMPLE_EVENT = "alyr:sample";
export type SampleEvent = CustomEvent<{ id: string; key: SampleKey }>;

type Props = {
  /** The id the figure's switch sends with its choice. */
  sync: string;
  start: SampleKey;
  samples: Record<SampleKey, ReportSample>;
  words: Record<SampleKey, ReportWords>;
  figLabel: string;
  caption: Caption;
  /** The end of the caption, for each sample: "Sample data, fictional bakery". */
  fictional: Record<SampleKey, string>;
};

export function ReportSwitch({ sync, start, samples, words, figLabel, caption, fictional }: Props) {
  const [key, setKey] = useState<SampleKey>(start);
  useEffect(() => {
    const pick = (event: Event) => {
      const { id, key: next } = (event as SampleEvent).detail ?? {};
      if (id === sync && next in samples) setKey(next);
    };
    window.addEventListener(SAMPLE_EVENT, pick);
    return () => window.removeEventListener(SAMPLE_EVENT, pick);
  }, [sync, samples]);

  return (
    <>
      <ReportPhone sample={samples[key]} words={words[key]} />
      <figcaption className="cap">
        <span className="cap-n">{figLabel} <bdi>{caption.n}</bdi></span>
        <span className="cap-sep" aria-hidden="true">·</span>
        <span>{rich(caption.text)}</span>
        <span className="cap-sep" aria-hidden="true">·</span>
        <span>{fictional[key]}</span>
      </figcaption>
    </>
  );
}
