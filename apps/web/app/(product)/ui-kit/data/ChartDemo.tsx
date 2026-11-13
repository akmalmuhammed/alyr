"use client";

import { Area, Band, BandItem, Bars, Meter, Ring, Spark, Stack } from "../../../_ui";
import type { Words } from "./copy";
import { Block, Cell } from "./shared";
import type { Lang } from "./shared";

/** Each chart with the sentence screen readers get printed under it, so a reviewer can read it too. */
function Said({ children }: { children: string }) {
  return <p className="u-kd-said">{children}</p>;
}

export function ChartDemo({ t, lang }: { t: Words; lang: Lang }) {
  void lang;
  return (
    <Block title={t.charts} note={t.chartsNote} id="charts">
      <div className="u-kg-grid">
        <Cell cap={t.sparkT}>
          <div className="u-kd-box u-kd-pad">
            <Spark values={t.sales} summary={t.sparkSummary} />
            <Spark values={t.sales} summary={t.sparkSummary} signal />
            <Said>{t.sparkSummary}</Said>
          </div>
        </Cell>
        <Cell cap={t.sparkOnBand}>
          <Band>
            <BandItem label={t.cols.total} value={t.money(610)}><Spark values={t.sales} summary={t.sparkSummary} onBand /></BandItem>
          </Band>
        </Cell>
        <Cell cap={t.ringT}>
          <div className="u-kd-box u-kd-pad u-kd-row">
            <Ring value={1264} total={1500} summary={t.ringSummary}>{t.ringText}</Ring>
            <Ring value={1264} total={1500} size="lg" tone="warn" summary={t.ringSummary}>{t.ringText}</Ring>
            <Ring value={0.4} summary={t.ringSummary} />
            <Ring value={0} summary={t.ringSummary} />
          </div>
          <Said>{t.ringSummary}</Said>
        </Cell>
        <Cell cap={t.stackT}>
          <div className="u-kd-box u-kd-pad">
            <p className="u-kg-cap">{t.stackAge}</p>
            <Stack summary={t.stackSummary} parts={[{ value: 224, tone: "ink" }, { value: 0, tone: "strong" }, { value: 1040, tone: "warn" }]} />
            <Stack size="md" summary={t.stackSummary} parts={[{ value: 3, tone: "ok" }, { value: 1, tone: "bad" }, { value: 2, tone: "warn" }, { value: 11, tone: "ctl" }]} />
            <Said>{t.stackSummary}</Said>
          </div>
        </Cell>
        <Cell cap={t.meterT}>
          <div className="u-kd-box u-kd-pad"><Meter value={0.23} max={1} label={t.meterSummary} /><Meter value={0.84} max={1} size="md" tone="warn" label={t.meterSummary} /></div>
        </Cell>
      </div>
      <div className="u-kg-grid u-kg-grid--wide">
        <Cell cap={t.areaT}>
          <div className="u-kd-box u-kd-pad">
            <Area values={t.sales} compare={t.salesLast} min={0} xLabels={t.days} summary={t.areaSummary} />
            <Said>{t.areaSummary}</Said>
          </div>
        </Cell>
        <Cell cap={t.barsT}>
          <div className="u-kd-box u-kd-pad">
            <Bars values={t.barsValues} labels={t.days} peak={2} today={6} summary={t.barsSummary} />
            <Said>{t.barsSummary}</Said>
          </div>
        </Cell>
      </div>
    </Block>
  );
}
