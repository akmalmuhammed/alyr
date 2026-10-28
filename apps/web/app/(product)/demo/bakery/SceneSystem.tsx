"use client";

// Scenes 5, 6 and 7: one order through the whole suite, then before and after, then how it
// grows; being found on Google (set up by ALYR); and the owner's Sunday, with the report card
// and the ALYR Agent home drawn from the engine's captured samples (never typed by hand), the
// sample shop's name replaced by the owner's.

import type { CSSProperties, ReactNode } from "react";
import { AgentDashboard } from "../../../_agent/AgentDashboard";
import type { AgentView } from "../../../_agent/types";
import agentAr from "../../../_agent/samples/bakery.ar.json";
import agentEn from "../../../_agent/samples/bakery.en.json";
import reportAr from "../../../_agent/samples/report/bakery.ar.json";
import reportEn from "../../../_agent/samples/report/bakery.en.json";
import type { SceneProps } from "./ctx";
import { Bubble, Icon, Label, Labels, Line, Monogram, Phone, Qr, WaHead, Window, type IconName } from "./parts";

const i = (n: number) => ({ "--i": n }) as CSSProperties;

// ── 5 · One order, the whole business ─────────────────────────────────────────

const ISLAND_ICONS: IconName[] = ["notebook", "chat", "camera", "bank", "sheet", "delivery", "calculator"];

export function System({ w, beat, shop }: SceneProps) {
  const s = w.system;
  if (beat >= 7) {
    return (
      <div className="dm-sys2">
        {beat === 7 ? (
          <>
            <Line>{s.before}</Line>
            <div className="dm-islands">
              {s.islands.map((name, k) => (
                <div key={name} className={`dm-island is-${k} dm-in`} style={i(k * 2)}>
                  <Icon name={ISLAND_ICONS[k]} className="dm-ico" />
                  <span>{name}</span>
                </div>
              ))}
            </div>
          </>
        ) : beat === 8 ? (
          <>
            <Line>{s.after}</Line>
            <Window title={shop} name={shop} className="dm-one dm-cut"
              labels={<><Label kind="sample">{w.labels.sample}</Label><Label kind="built">{w.labels.built}</Label></>}>
              <div className="dm-one-in">
                <nav className="dm-one-side" aria-label={s.sidebar}>
                  <span className="dm-eyebrow">{s.sidebar}</span>
                  {s.nodes.map((n, k) => (
                    <span key={n.name} className="dm-one-prod dm-in" style={i(k)}>
                      <b className="dm-pname"><bdi>{n.name}</bdi></b><small>{n.what}</small>
                    </span>
                  ))}
                </nav>
                <ul className="dm-one-rows">
                  {s.afterRows.map(([what, eg], k) => (
                    <li key={what} className="dm-in" style={i(4 + k * 2)}><b>{what}</b><span dir="auto">{eg}</span></li>
                  ))}
                </ul>
              </div>
            </Window>
          </>
        ) : (
          <>
            <Line size="hero" className="dm-rise">{s.grows}</Line>
            <ul className="dm-grows">
              {s.growRows.map(([what, kind], k) => (
                <li key={what} className={`dm-grow is-${kind} dm-in`} style={i(2 + k * 2)}>
                  <span className={`dm-grow-dot ${kind === "notBuilt" ? "is-pending" : ""}`} aria-hidden="true" />
                  <span className="dm-grow-what">{what}</span>
                  <Label kind={kind}>{w.labels[kind]}</Label>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }
  const at = Math.max(0, beat - 1);
  return (
    <div className="dm-sys" style={{ "--at": at, "--lit": beat } as CSSProperties}>
      <div className="dm-sys-head">
        <Line>{s.title}</Line>
        <p className={`dm-lead ${beat === 6 ? "dm-in" : "is-held"}`} aria-hidden={beat === 6 ? undefined : true}>{s.end}</p>
        <Labels><Label kind="built">{w.labels.built}</Label><Label kind="sample">{w.labels.sample}</Label></Labels>
      </div>
      <div className="dm-wire">
        <span className="dm-wire-line" aria-hidden="true"><i /></span>
        <span className={`dm-token ${beat ? "is-moving" : ""}`} aria-hidden="true"><b>#1043</b></span>
        <ol className="dm-stations">
          {s.nodes.map((n, k) => {
            const state = beat === 0 ? "" : k + 1 < beat ? "is-done" : k + 1 === beat ? "is-on" : "";
            return (
              <li key={n.name} className={`dm-station ${state}`} aria-current={k + 1 === beat ? "step" : undefined}>
                <span className="dm-station-node" aria-hidden="true" />
                <b className="dm-pname"><bdi>{n.name}</bdi></b>
                <small>{n.what}</small>
                <span className={`dm-frag ${beat > k ? "is-lit" : ""}`} dir="auto">{n.frag}</span>
                {beat > k ? <p className="dm-station-did dm-in" dir="auto">{n.did}</p> : null}
              </li>
            );
          })}
        </ol>
      </div>
      <p className="dm-sr">{s.order}</p>
    </div>
  );
}

// ── 6 · Be found ──────────────────────────────────────────────────────────────

const slug = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "your-bakery";

export function Found({ w, beat, shop, setup }: SceneProps) {
  const f = w.found;
  const link = `alyr.qa/s/${slug(setup.name || w.fallback.en)}`;
  return (
    <div className="dm-found">
      <div className="dm-found-head">
        <Line key={beat} className="dm-in">{f.head[beat]}</Line>
        <Labels note={beat <= 2 ? f.condition : undefined}><Label kind="sample">{w.labels.sample}</Label></Labels>
      </div>
      <div className="dm-found-row">
        <div className="dm-found-fig">
          <Phone label={f.search}>
            <div className="dm-map">
              <div className="dm-map-search"><Icon name="pin" className="dm-ico" /><span>{f.search}</span></div>
              <div className="dm-map-area" aria-hidden="true">
                {f.others.map((o, k) => <span key={o} className={`dm-pin is-${k}`}><Icon name="pin" className="dm-ico" /></span>)}
                <span className="dm-pin is-ours"><Monogram name={shop} /></span>
              </div>
              <div className="dm-listing">
                <b dir="auto">{shop}</b>
                <small>{f.kind}</small>
                {beat >= 2 ? (
                  <div className="dm-review dm-in">
                    <span className="dm-stars" role="img" aria-label={f.stars}>{Array.from({ length: 5 }, (_, k) => <Icon key={k} name="star" className="dm-ico" />)}</span>
                    <b>{f.reviewer}</b> <small>{f.reviewWhen}</small>
                    <p dir="auto">{f.reviewText}</p>
                  </div>
                ) : null}
                <div className="dm-listing-btns">
                  <span className="dm-listing-btn is-order">{f.order}</span>
                  <span className="dm-listing-btn"><Icon name="directions" className="dm-ico" />{f.directions}</span>
                  <span className="dm-listing-btn"><Icon name="phone" className="dm-ico" />{f.call}</span>
                </div>
              </div>
            </div>
          </Phone>
          <Labels><Label kind="setup">{w.labels.setup}</Label></Labels>
        </div>
        {beat >= 1 && beat <= 2 ? (
          <div className="dm-found-fig dm-in">
            <Phone label={w.order.customer}>
              <WaHead name={shop} sub={w.order.account} />
              <div className="dm-wa-body">
                <Bubble time={f.when}>{f.thanks(shop)} <span className="dm-wa-link is-static">{f.review}</span></Bubble>
              </div>
            </Phone>
            <Labels><Label kind="setup">{w.labels.setup}</Label></Labels>
          </div>
        ) : null}
        {beat >= 3 ? (
          <div className="dm-found-fig dm-in">
            <div className="dm-counter">
              <span className="dm-counter-top"><Monogram name={shop} /><b dir="auto">{shop}</b></span>
              <Qr link={`https://${link}`} label={f.qrNote} />
              <b>{f.qr}</b>
              <span className="dm-bio-line"><small>{f.bio}</small> <span dir="ltr">{link}</span></span>
            </div>
            <Labels><Label kind="built">{w.labels.built}</Label></Labels>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── 7 · Your Sunday ───────────────────────────────────────────────────────────

type Card = typeof reportEn.card;

/** WhatsApp's *bold* and _italic_, drawn; the sample shop's name becomes the owner's. */
function waText(line: string, shop: string, sample: string): ReactNode {
  const text = line.split(sample).join(shop);
  return text.split(/(\*[^*]+\*)/g).map((part, k) =>
    part.startsWith("*") && part.endsWith("*") ? <b key={k}>{part.slice(1, -1)}</b> : <span key={k}>{part}</span>,
  );
}

function ReportCard({ card, shop, week, sample, mini }: { card: Card; shop: string; week: string; sample: string; mini?: boolean }) {
  const max = Math.max(...card.days.map((d) => Math.max(d.value, d.last)));
  return (
    <div className="dm-report" dir={card.dir}>
      <div className="dm-report-top">
        <span className="dm-report-eyebrow">ALYR · {card.eyebrow}</span>
        <span className="dm-report-week"><bdi>{card.week}</bdi> · {sample}</span>
      </div>
      <b className="dm-report-shop" dir="auto">{shop}</b>
      <div className="dm-report-mid">
        <div className="dm-report-hero">
          <small>{card.hero.label} · {card.hero.unit}</small>
          <b><bdi>{card.hero.value}</bdi></b>
          <span><span className="dm-tri" aria-hidden="true">▲</span> {card.hero.change.text}</span>
        </div>
        <div className="dm-report-bars" aria-hidden="true">
          {card.days.map((d) => (
            <span key={d.label} className={`dm-report-day ${d.signal ? "is-signal" : ""}`}>
              {d.signal ? <small className="dm-report-peak"><bdi>{d.text}</bdi></small> : null}
              <span className="dm-report-pair">
                <i className="is-last" style={{ height: `${(d.last / max) * 100}%` }} />
                <i style={{ height: `${(d.value / max) * 100}%` }} />
              </span>
              <small>{d.label}</small>
            </span>
          ))}
        </div>
      </div>
      <div className="dm-report-facts" hidden={mini}>
        {card.facts.map((f) => (
          <span key={f.key}><small>{f.label}</small><b><bdi>{f.value}</bdi></b><small>{f.note}</small></span>
        ))}
      </div>
      <span className="dm-sr">{week}</span>
    </div>
  );
}

export function Sunday({ w, lang, beat, shop }: SceneProps) {
  const s = w.sunday;
  const report = lang === "ar" ? reportAr : reportEn;
  const sampleName = lang === "ar" ? "مخبز قرفة" : "Qirfa Bakery";
  const lines = report.lines.filter((l) => !/^‏?_(Rule|القاعدة)/.test(l));
  return (
    <div className="dm-sunday">
      <div className="dm-sunday-head">
        <Line key={beat} className="dm-in">{s.head[beat]}</Line>
        <Labels note={beat === 0 ? s.condition : undefined}>
          {beat === 1 ? <Label kind="built">{w.labels.built}</Label> : null}
          <Label kind="week">{w.labels.week}</Label>
        </Labels>
      </div>
      {beat === 0 ? (
        <div className="dm-sunday-row">
          <Phone label={s.shop}>
            <WaHead name={s.from} sub={w.order.account} alyr />
            <div className="dm-wa-body">
              <div className="dm-in" style={i(2)}>
                <div className="dm-bub is-card">
                  <ReportCard card={report.card as Card} shop={shop} week={report.week} sample={w.labels.week} mini />
                  <span className="dm-bub-text" dir="auto">
                    {lines.map((l, k) => (l ? <span key={k} className="dm-wa-line">{waText(l, shop, sampleName)}</span> : <br key={k} />))}
                  </span>
                  <span className="dm-bub-time"><bdi>{s.when}</bdi></span>
                </div>
              </div>
            </div>
          </Phone>
          <div className="dm-sunday-big dm-in" style={i(4)}>
            <ReportCard card={report.card as Card} shop={shop} week={report.week} sample={w.labels.week} />
          </div>
        </div>
      ) : (
        <div className="dm-agent dm-cut">
          <Window title={shop} name={shop}>
            <div className="dm-agent-scroll" tabIndex={0} role="region" aria-label={w.scenes[7]}>
              <AgentDashboard
                view={(lang === "ar" ? agentAr : agentEn) as unknown as AgentView}
                mode="showcase" headingLevel={3} headings={false} ruleLines={false}
                labels={{ suggestions: s.suggestions }}
              />
            </div>
          </Window>
        </div>
      )}
    </div>
  );
}
