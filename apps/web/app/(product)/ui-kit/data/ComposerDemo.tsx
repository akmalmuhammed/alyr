"use client";

import { useState } from "react";
import { Avatar, Button, Chip, Composer, Icon, IconButton, KV, KVList, PhoneFrame, Workbench } from "../../../_ui";
import type { WorkbenchPane } from "../../../_ui";
import type { Words } from "./copy";
import { Block, Cell, Num } from "./shared";
import type { Lang } from "./shared";

function Tools({ t }: { t: Words }) {
  return (
    <>
      <IconButton icon={<Icon name="clip" />} label={t.toolAttach} />
      {t.toolSaved.map((s) => <Chip key={s}>{s}</Chip>)}
      <Chip count={9}>{t.toolAll}</Chip>
    </>
  );
}

export function ComposerDemo({ t }: { t: Words }) {
  const [reply, setReply] = useState(t.composerDraft);
  const [mode, setMode] = useState("reply");
  const [note, setNote] = useState("");
  const [over, setOver] = useState("x".repeat(40) + " ".repeat(1) + "y".repeat(80));

  const props = {
    modes: t.modes,
    modeLabel: t.modeLabel,
    fieldLabel: t.fieldLabel,
    sendLabels: { reply: t.sendReply, note: t.sendNote },
    hint: t.hint,
    counter: t.counter,
    tools: <Tools t={t} />,
  };

  return (
    <Block title={t.composer} note={t.composerNote} id="composer">
      <div className="u-kg-grid u-kg-grid--wide">
        <Cell cap={t.composerOpen}>
          <div className="u-kd-box">
            <Composer {...props} value={reply} onChange={setReply} onSend={() => setReply("")} mode={mode} onModeChange={setMode} limit={4000} placeholder={mode === "note" ? t.placeholderNote : t.placeholderReply} />
          </div>
        </Cell>
        <Cell cap={t.composerClosed}>
          <div className="u-kd-box">
            <Composer {...props} value="" onChange={() => {}} onSend={() => {}} mode="reply" onModeChange={() => {}} closed={t.closedText} limit={4000} />
          </div>
        </Cell>
        <Cell cap={t.composerOver}>
          <div className="u-kd-box">
            <Composer {...props} value={over} onChange={setOver} onSend={() => {}} mode="reply" onModeChange={() => {}} limit={100} />
          </div>
        </Cell>
        <Cell cap={t.modes[1].label}>
          <div className="u-kd-box">
            <Composer {...props} value={note} onChange={setNote} onSend={() => setNote("")} mode="note" onModeChange={() => {}} limit={4000} placeholder={t.placeholderNote} />
          </div>
        </Cell>
      </div>
    </Block>
  );
}

function Context({ t, lang }: { t: Words; lang: Lang }) {
  return (
    <div className="u-kd-pad">
      <div className="u-kd-who"><Avatar name={lang === "ar" ? "ليلى فاروق" : "Layla Farouk"} size={40} /><strong>{t.threadTitle}</strong></div>
      <KVList>
        <KV k={t.ctxVisits} mono>9</KV>
        <KV k={t.ctxSpent} mono>{t.money(2310)}</KV>
        <KV k={t.ctxOwes} mono>{t.money(0)}</KV>
        <KV k={t.ctxSince}>{lang === "ar" ? "مارس 2025" : "Mar 2025"}</KV>
      </KVList>
    </div>
  );
}

function Thread({ t, back, context }: { t: Words; back?: () => void; context?: () => void }) {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState("reply");
  return (
    <>
      <header className="u-kd-pane-head">
        {back ? <IconButton bare icon={<Icon name="left" />} label={t.backToList} onClick={back} /> : null}
        <div className="u-kd-who"><strong>{t.threadTitle}</strong><span className="u-kd-muted u-mono"><Num>{t.threadPhone}</Num></span></div>
        {context ? <Button size="xs" onClick={context}>{t.openContext}</Button> : null}
      </header>
      <div className="u-kd-thread">
        {t.threadMessages.map((m, k) => <p key={m} className={k ? "u-kd-bubble u-kd-bubble--me" : "u-kd-bubble"}>{m}</p>)}
      </div>
      <Composer
        value={draft} onChange={setDraft} onSend={() => setDraft("")} mode={mode} onModeChange={setMode}
        modes={t.modes} modeLabel={t.modeLabel} fieldLabel={t.fieldLabel} sendLabels={{ reply: t.sendReply, note: t.sendNote }}
        hint={t.hint} rows={2}
      />
    </>
  );
}

function List({ t, open }: { t: Words; open?: () => void }) {
  return (
    <ul className="u-kd-convos">
      {t.convos.map(([name, line], k) => (
        <li key={name}>
          <button type="button" className={k === 2 ? "u-kd-convo u-kd-convo--on" : "u-kd-convo"} onClick={open}>
            <Avatar name={name} size={28} />
            <span className="u-kd-convo-text"><strong>{name}</strong><span className="u-kd-muted">{line}</span></span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function WorkbenchDemo({ t, lang }: { t: Words; lang: Lang }) {
  const [pane, setPane] = useState<WorkbenchPane>("list");
  const labels = { list: t.paneList, main: t.paneMain, context: t.paneContext };
  return (
    <Block title={t.workbench} note={t.workbenchNote} id="workbench">
      <div className="u-kd-bench">
        <Workbench labels={labels} list={<List t={t} />} main={<Thread t={t} />} context={<Context t={t} lang={lang} />} />
      </div>
      <Cell cap={t.phoneWorkbench}>
        <PhoneFrame caption={t.paneList}>
          <div className="u-kd-benchphone">
            <Workbench
              pane={pane}
              labels={labels}
              list={<List t={t} open={() => setPane("main")} />}
              main={<Thread t={t} back={() => setPane("list")} context={() => setPane("context")} />}
              context={<><header className="u-kd-pane-head"><IconButton bare icon={<Icon name="left" />} label={t.backToList} onClick={() => setPane("main")} /></header><Context t={t} lang={lang} /></>}
            />
          </div>
        </PhoneFrame>
      </Cell>
    </Block>
  );
}
