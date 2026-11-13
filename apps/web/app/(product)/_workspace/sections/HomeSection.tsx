"use client";

// The workspace's home: what is left to go live, ALYR Agent's view, the setup checklist and the
// help box. Moved out of the shell page unchanged.

import Link from "next/link";
import { AgentDashboard } from "../../../_agent/AgentDashboard";
import { color } from "../../../_tokens/tokens";
import { checksLeft, withoutSetupRow } from "../goLive";
import type { Product, Step } from "../useWorkspace";
import type { SectionProps } from "../sectionRegistry";
import { Icon, Mark, Tick, stagger } from "../shellParts";

export default function HomeSection({ ws }: SectionProps) {
  const {
    state, t, lang, pick, agent, agentRise, offline, readiness, enabledScreens, ask, notNow,
    help, setHelp, helpSent, setHelpSent,
  } = ws;
  const pending = state.products.filter((p) => p.status === "active" && p.steps.some((s) => !s.done));

  const stepAction = (product: Product, step: Step) => {
    if (step.done) return null;
    if (step.screen && enabledScreens.has(step.screen)) {
      return <Link className="btn small" href={`/app/${step.screen}`}>{t.doIt}<Icon name="arrow" className="sh-ico arrow" /></Link>;
    }
    if (step.asked) return <span className="sh-pill wait">{t.asked}</span>;
    return <button className="btn small" onClick={() => ask(product.key, step.key)}>{t.ask}</button>;
  };

  // What is left to go live comes from the go-live check alone: the banner lists it and counts it,
  // and "Needs you now" leaves out its own row of product setup steps while the banner shows, so
  // the home never gives two numbers for the same work (CJ-24 of the go-live audit).
  const goLiveLeft = checksLeft(readiness?.checks);
  const goLive = readiness && readiness.stage !== "live" && state.can_manage ? readiness : null;
  const agentView = agent ? withoutSetupRow(agent, goLive !== null) : null;

  // The full setup checklist leads only while nothing has happened yet, and only for people
  // who can act on it; after that it is one row in "Needs you now" (05-critique P1-2).
  const setupTiles = state.can_manage && (!agent || agent.state === "empty")
    ? pending.map((product) => {
      const done = product.steps.filter((s) => s.done).length;
      const total = product.steps.length;
      return (
        <section key={product.key} className="sh-tile raised folded sh-setup sh-home-row" aria-label={t.setup(pick(product.name))} style={stagger(0)}>
          <div className="sh-gauge" style={{ "--p": (done / total) * 100 } as React.CSSProperties}>
            <b className="num" dir="ltr">{done}<small>/{total}</small></b>
          </div>
          <div className="sh-setup-head">
            <span className="sh-eyebrow">{pick(product.name)}</span>
            <h2>{t.setup(pick(product.name))}</h2>
            <p>{t.setupSub(done, total)}</p>
          </div>
          <ul className="sh-steps">
            {product.steps.map((step) => (
              <li key={step.key} className={step.done ? "done" : ""}>
                <span className="sh-check"><Tick /></span>
                <span className="sh-step">{pick(step.label)}</span>
                {stepAction(product, step)}
              </li>
            ))}
          </ul>
        </section>
      );
      })
    : null;

  return (
  <>
    {state.plan?.status === "published" && (
      <section className="sh-tile raised sh-allset sh-plan-ready sh-home-row" style={stagger(0)}>
        <span className="sh-check"><Tick /></span>
        <div><h2>{t.planReady}</h2><p className="sh-note">{t.planReadySub(state.plan.monthly_total_text ?? "")}</p></div>
        <Link className="btn small" href="/start">{t.planReview}<Icon name="arrow" className="sh-ico arrow" /></Link>
      </section>
    )}
    {goLive && (
      <section className="sh-tile raised sh-allset sh-plan-ready sh-home-row" style={stagger(0)}>
        <span className="sh-check" />
        <div>
          <h2>{t.goLive[goLive.stage]}</h2>
          <p className="sh-note">{t.goLiveSub(goLiveLeft.length, goLiveLeft.map((c) => pick(c.label)).join(lang === "ar" ? "، " : ", "))}</p>
        </div>
        <Link className="btn small" href="/start?golive">{t.goLiveOpen}<Icon name="arrow" className="sh-ico arrow" /></Link>
      </section>
    )}
    {agentView ? (
      <AgentDashboard view={agentView} link={Link} animate={agentRise} onNotNow={state.can_manage ? notNow : undefined}
        stale={offline ? `${t.offline} ${agentView.header.updated}` : null} setup={setupTiles} />
    ) : (
      <>
        {setupTiles}
        <p className="sh-note">{offline ? t.offline : t.loading}</p>
      </>
    )}

    <section id="ask" className="sh-tile sh-ask sh-home-ask">
      <div className="sh-ask-head">
        <span className="sh-avatar"><Mark volt={color.brand.volt} /></span>
        <div><b>{t.helpTitle}</b><small>{t.helpOnline}</small></div>
      </div>
      {/* No chat bubbles and no read ticks: nobody has answered yet, and no reply time is
          promised (05-critique P0-4). */}
      <p className="sh-ask-prompt">{t.helpHello}</p>
      {helpSent ? (
        <p className="sh-ask-sent" role="status">{t.sentReply}</p>
      ) : (
        <div className="sh-suggest">
          {t.suggestions.map((s) => <button key={s} type="button" onClick={() => setHelp(s)}>{s}</button>)}
        </div>
      )}
      <form className="sh-composer" onSubmit={async (e) => {
        e.preventDefault();
        const note = help.trim();
        if (!note) return;
        await ask("chat", "help", note);
        setHelp("");
        setHelpSent(note);
      }}>
        <input value={help} onChange={(e) => setHelp(e.target.value)} placeholder={t.helpPlaceholder}
          aria-label={t.helpPlaceholder} dir="auto" maxLength={500} />
        <button className="sh-send" type="submit" disabled={!help.trim()} aria-label={t.send}><Icon name="send" /></button>
      </form>
    </section>
  </>
  );
}
