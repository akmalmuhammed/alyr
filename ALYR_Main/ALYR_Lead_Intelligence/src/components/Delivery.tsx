import { useMemo, useState, type CSSProperties } from 'react';
import type { CommandDashboard, DeliveryProject } from '../types';
import { Icon } from './Icon';

interface DeliveryProps {
  dashboard: CommandDashboard;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenPipeline: () => void;
}

type DeliveryLens = 'portfolio' | 'accounts' | 'stream';
const phases = ['discovery', 'strategy', 'design', 'build', 'activate', 'optimize', 'complete'] as const;
const healthPosition = { strong: 82, 'on-track': 62, attention: 38, 'at-risk': 16 } as const;

function readable(value: string) {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function date(value?: string) {
  return value ? new Intl.DateTimeFormat('en-QA', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Not set';
}

function ProjectField({ projects, selected, onSelect }: { projects: DeliveryProject[]; selected?: string; onSelect: (project: DeliveryProject) => void }) {
  return (
    <div className="project-field" aria-label="Projects plotted by transformation phase and health">
      <div className="project-health-axis"><span>STRONG</span><span>ON TRACK</span><span>ATTENTION</span><span>AT RISK</span></div>
      <div className="project-phase-axis">{phases.map((phase) => <span key={phase}>{phase}</span>)}</div>
      <div className="project-field-grid" aria-hidden="true">{phases.map((phase) => <i key={phase} />)}</div>
      {projects.map((project, index) => {
        const phaseIndex = phases.indexOf(project.phase);
        const style = {
          '--project-x': `${7 + (phaseIndex / (phases.length - 1)) * 86}%`,
          '--project-y': `${healthPosition[project.health] + (index % 2 ? 3 : -3)}%`,
        } as CSSProperties;
        return (
          <button key={project.id} className={`project-node health-${project.health} ${selected === project.id ? 'is-selected' : ''}`} style={style} onClick={() => onSelect(project)}>
            <i /><strong>{project.progress}%</strong><span>{project.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Delivery({ dashboard, refreshing, onRefresh, onOpenPipeline }: DeliveryProps) {
  const [lens, setLens] = useState<DeliveryLens>('portfolio');
  const [selected, setSelected] = useState<DeliveryProject | null>(null);
  const atRisk = dashboard.projects.filter((project) => project.health === 'at-risk').length;
  const averageProgress = dashboard.projects.length
    ? Math.round(dashboard.projects.reduce((sum, project) => sum + project.progress, 0) / dashboard.projects.length)
    : 0;
  const workstreams = useMemo(() => dashboard.projects.flatMap((project) => project.workstreams), [dashboard.projects]);
  const completedWorkstreams = workstreams.filter((workstream) => workstream.state === 'complete').length;

  return (
    <main className="page delivery-page" id="main-content">
      <section className="delivery-hero">
        <div><p className="eyebrow">OUTCOMES / NOT TASK THEATRE</p><h1>See the transformation as a living system.</h1><p>Projects are plotted across phase, health, owner and outcome—then updated by staff, tools or Hermes through one governed event spine.</p></div>
        <button className="button secondary" onClick={onRefresh} disabled={refreshing}><Icon name="automation" size={17} />{refreshing ? 'Syncing…' : 'Sync portfolio'}</button>
      </section>

      <section className="delivery-stat-band">
        <div><span>CLIENT ACCOUNTS</span><strong>{dashboard.accounts.length}</strong><small>Non-archived</small></div>
        <div><span>ACTIVE PROJECTS</span><strong>{dashboard.kpis.activeProjects}</strong><small>Across all phases</small></div>
        <div className={atRisk ? 'is-risk' : ''}><span>AT RISK</span><strong>{atRisk}</strong><small>Needs owner action</small></div>
        <div><span>PORTFOLIO PROGRESS</span><strong>{averageProgress}%</strong><small>Average completion</small></div>
        <div><span>WORKSTREAMS DONE</span><strong>{completedWorkstreams}/{workstreams.length}</strong><small>Verified completion</small></div>
      </section>

      <nav className="delivery-lens-switch" aria-label="Delivery views">
        <button className={lens === 'portfolio' ? 'is-active' : ''} onClick={() => setLens('portfolio')}><span>01</span>Portfolio field</button>
        <button className={lens === 'accounts' ? 'is-active' : ''} onClick={() => setLens('accounts')}><span>02</span>Client health</button>
        <button className={lens === 'stream' ? 'is-active' : ''} onClick={() => setLens('stream')}><span>03</span>Event stream</button>
      </nav>

      {lens === 'portfolio' && (
        <section className="delivery-workspace">
          <header className="section-heading wide-heading"><div><span>TRANSFORMATION FIELD</span><h2>Phase × health × progress.</h2></div><small>{dashboard.projects.length} recorded projects</small></header>
          {dashboard.projects.length ? (
            <>
              <ProjectField projects={dashboard.projects} selected={selected?.id} onSelect={setSelected} />
              <div className="project-ledger">
                {dashboard.projects.map((project) => (
                  <button key={project.id} className={selected?.id === project.id ? 'is-selected' : ''} onClick={() => setSelected(project)}>
                    <i className={`health-dot health-${project.health}`} /><span><small>{project.accountName}</small><strong>{project.name}</strong></span><span>{readable(project.phase)}</span><span>{project.owner}</span><span><i style={{ inlineSize: `${project.progress}%` }} /></span><strong>{project.progress}%</strong>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="portfolio-empty">
              <div className="empty-coordinate"><span>Y / HEALTH</span><i /><strong>00</strong><i /><span>X / PHASE</span></div>
              <div><span>TRUE STARTING STATE</span><h2>No client delivery record exists yet.</h2><p>The portfolio is ready, but it will not invent progress. Move the first qualified relationship through proposal and win; the account then becomes available for outcome planning.</p><button className="button primary" onClick={onOpenPipeline}>Open relationship pipeline <Icon name="arrow-right" size={17} /></button></div>
              <ol><li><span>01</span><div><strong>Account</strong><small>Owner, value, engagement, next action</small></div></li><li><span>02</span><div><strong>Outcome map</strong><small>Phase, milestones, workstreams, blockers</small></div></li><li><span>03</span><div><strong>Event stream</strong><small>Hermes and tools update one shared truth</small></div></li></ol>
            </div>
          )}
        </section>
      )}

      {lens === 'accounts' && (
        <section className="account-health-view">
          <header className="section-heading wide-heading"><div><span>CLIENT HEALTH</span><h2>Commercial and delivery context together.</h2></div><small>{dashboard.accounts.length} active records</small></header>
          {dashboard.accounts.length ? dashboard.accounts.map((account) => (
            <article key={account.id} className={`account-health-row health-${account.health}`}>
              <i /><div><small>{account.category}</small><h3>{account.name}</h3><p>{account.summary}</p></div><dl><div><dt>Owner</dt><dd>{account.owner}</dd></div><div><dt>Status</dt><dd>{readable(account.status)}</dd></div><div><dt>Model</dt><dd>{account.engagementModel || 'Not set'}</dd></div><div><dt>Next move</dt><dd>{account.nextAction || 'Not set'}</dd></div></dl><span>{date(account.nextActionDueAt)}</span>
            </article>
          )) : <div className="command-empty"><span>NO CLIENT RECORDS</span><h3>The first win will activate this view.</h3><p>Accounts can be created from a won pipeline record or upserted by an authorized Hermes workflow.</p><button className="button primary" onClick={onOpenPipeline}>Open pipeline</button></div>}
        </section>
      )}

      {lens === 'stream' && (
        <section className="delivery-event-view">
          <header className="section-heading wide-heading"><div><span>EVENT SPINE</span><h2>One chronological truth across tools.</h2></div><small>Idempotent and source-attributed</small></header>
          {dashboard.recentEvents.length ? (
            <div className="event-stream">
              {dashboard.recentEvents.map((event) => <article key={event.id}><span>{new Intl.DateTimeFormat('en-QA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(event.occurredAt))}</span><i /><div><small>{event.source} / {readable(event.type)}</small><strong>{event.summary}</strong><p>{event.accountName || event.category || event.entityType}</p></div></article>)}
            </div>
          ) : <div className="command-empty"><span>EVENT SPINE READY</span><h3>No operational events recorded yet.</h3><p>Pipeline changes, account updates, project milestones and Hermes observations will appear here with source and time.</p></div>}
        </section>
      )}

      {selected && (
        <aside className="project-inspector" aria-label={`${selected.name} project details`}>
          <header><span>PROJECT / {selected.id.slice(0, 8).toUpperCase()}</span><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close project details"><Icon name="close" /></button></header>
          <div className="project-inspector-title"><strong>{selected.progress}%</strong><div><p>{selected.accountName} / {readable(selected.phase)}</p><h2>{selected.name}</h2><span className={`health-label health-${selected.health}`}>{readable(selected.health)}</span></div></div>
          <p>{selected.summary || 'No project summary has been recorded.'}</p>
          <dl><div><dt>Owner</dt><dd>{selected.owner}</dd></div><div><dt>Next milestone</dt><dd>{selected.nextMilestone || 'Not set'}</dd></div><div><dt>Due</dt><dd>{date(selected.dueAt)}</dd></div></dl>
          <section><span>WORKSTREAMS</span>{selected.workstreams.length ? selected.workstreams.map((workstream) => <div className="inspector-workstream" key={workstream.name}><div><strong>{workstream.name}</strong><small>{readable(workstream.state)}</small></div><span><i style={{ inlineSize: `${workstream.progress}%` }} /></span><b>{workstream.progress}%</b></div>) : <p>No workstreams recorded.</p>}</section>
          <section><span>BLOCKERS</span>{selected.blockers.length ? <ul>{selected.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p>No active blocker recorded.</p>}</section>
        </aside>
      )}
      {selected && <button className="inspector-scrim" onClick={() => setSelected(null)} aria-label="Close project details" />}
    </main>
  );
}
