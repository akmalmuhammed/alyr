import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { CategoryInsight, CommandDashboard, PriorityProspect, ViewKey } from '../types';
import { Icon } from './Icon';

type CommandLens = 'focus' | 'market' | 'motion' | 'delivery';

interface CommandCenterProps {
  dashboard: CommandDashboard;
  refreshing: boolean;
  onRefresh: () => void;
  onNavigate: (view: ViewKey) => void;
  onOpenProspect: (id: string) => void;
  onOpenCategory: (category: string) => void;
}

const number = new Intl.NumberFormat('en-QA');
const percent = new Intl.NumberFormat('en-QA', { maximumFractionDigits: 1 });

function formatNumber(value: number) {
  return number.format(value);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('en-QA', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function readable(value: string) {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function host(value: string) {
  if (!value) return 'No public website';
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return value; }
}

function shortCategory(value: string) {
  return value
    .replace(' & E-commerce', '')
    .replace('Professional & Business Services', 'Business services')
    .replace('Food, Beverage & Restaurants', 'Food & beverage');
}

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  if (elapsed < 60_000) return 'just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return new Intl.DateTimeFormat('en-QA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function targetView(value: CommandDashboard['signals'][number]['targetView']): ViewKey {
  return value === 'sources' ? 'policy' : value;
}

function OpportunityField({
  categories,
  selected,
  onSelect,
}: {
  categories: CategoryInsight[];
  selected: string;
  onSelect: (category: string) => void;
}) {
  const plotted = categories.slice(0, 12);
  const potentialFloor = plotted.length ? Math.min(...plotted.map((category) => category.potentialScore)) : 0;
  const potentialCeiling = plotted.length ? Math.max(...plotted.map((category) => category.potentialScore)) : 1;
  const potentialRange = Math.max(1, potentialCeiling - potentialFloor);
  const tractionCeiling = Math.max(...plotted.map((category) => category.tractionScore), 1);
  return (
    <div className="opportunity-field" aria-label="Category potential and traction map">
      <div className="field-axis y-axis"><span>MORE TRACTION</span><i /></div>
      <div className="field-axis x-axis"><i /><span>MORE MARKET POTENTIAL</span></div>
      <div className="field-grid" aria-hidden="true">
        <i /><i /><i /><i /><i /><i />
      </div>
      {plotted.map((category, index) => {
        const size = Math.max(48, Math.min(94, 46 + Math.sqrt(category.marketCount) * .72));
        const normalizedPotential = 10 + ((category.potentialScore - potentialFloor) / potentialRange) * 78;
        const bottom = category.tractionScore > 0
          ? 18 + (category.tractionScore / tractionCeiling) * 66
          : 10 + (index % 3) * 7.5;
        const style = {
          '--field-x': `${Math.max(8, Math.min(90, normalizedPotential + ((index % 3) - 1) * 1.5))}%`,
          '--field-y': `${bottom}%`,
          '--field-size': `${size}px`,
        } as CSSProperties;
        return (
          <button
            className={`category-node ${selected === category.category ? 'is-selected' : ''}`}
            key={category.category}
            onClick={() => onSelect(category.category)}
            style={style}
            title={`${category.category}: potential ${category.potentialScore}, traction ${category.tractionScore}`}
          >
            <strong>{category.potentialScore}</strong>
            <span>{shortCategory(category.category)}</span>
          </button>
        );
      })}
      <div className="field-legend">
        <span><i className="legend-potential" /> Node = market scale</span>
        <span><i className="legend-current" /> Volt = selected</span>
      </div>
    </div>
  );
}

function ProspectRows({
  prospects,
  onOpen,
}: {
  prospects: PriorityProspect[];
  onOpen: (id: string) => void;
}) {
  if (!prospects.length) {
    return (
      <div className="command-empty compact-empty">
        <span>NO VERIFIED PRIORITIES</span>
        <h3>The evidence queue is still forming.</h3>
        <p>Complete website verification to unlock account-specific offers and opening angles.</p>
      </div>
    );
  }

  return (
    <div className="prospect-ledger">
      {prospects.map((prospect, index) => (
        <article className="prospect-line" key={prospect.id}>
          <div className="prospect-rank">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{prospect.priorityScore}</strong>
            <i style={{ inlineSize: `${prospect.priorityScore}%` }} />
          </div>
          <div className="prospect-identity">
            <p>{prospect.category} / {prospect.location}</p>
            <h3>{prospect.name}</h3>
            <a href={prospect.website || undefined} target="_blank" rel="noreferrer" onClick={(event) => !prospect.website && event.preventDefault()}>{host(prospect.website)}</a>
          </div>
          <div className="prospect-evidence">
            <span>EVIDENCE</span>
            <strong>{prospect.opportunitySignals[0]?.label || 'Discovery needed'}</strong>
            <small>{prospect.opportunitySignals[0]?.evidence || 'No website opportunity has been verified yet.'}</small>
          </div>
          <div className="prospect-offer">
            <span>WHERE ALYR HITS</span>
            <strong>{prospect.recommendedOffer}</strong>
            <small>{prospect.openingAngle}</small>
          </div>
          <div className="prospect-contact">
            <span>{readable(prospect.readiness)}</span>
            <strong>{prospect.contactName || prospect.email || prospect.phone || 'Contact research pending'}</strong>
            <small>{prospect.contactRole || prospect.latestOutreachStatus || prospect.nextMove}</small>
          </div>
          <button className="ledger-action" onClick={() => onOpen(prospect.id)} aria-label={`Open ${prospect.name} dossier`}>
            <Icon name="arrow-right" size={18} />
          </button>
        </article>
      ))}
    </div>
  );
}

export function CommandCenter({ dashboard, refreshing, onRefresh, onNavigate, onOpenProspect, onOpenCategory }: CommandCenterProps) {
  const [lens, setLens] = useState<CommandLens>('focus');
  const [selectedCategory, setSelectedCategory] = useState(dashboard.categories[0]?.category ?? '');

  useEffect(() => {
    if (!dashboard.categories.some((category) => category.category === selectedCategory)) {
      setSelectedCategory(dashboard.categories[0]?.category ?? '');
    }
  }, [dashboard.categories, selectedCategory]);

  const selected = useMemo(
    () => dashboard.categories.find((category) => category.category === selectedCategory) ?? dashboard.categories[0],
    [dashboard.categories, selectedCategory],
  );
  const topTraction = useMemo(
    () => [...dashboard.categories].sort((left, right) => right.tractionScore - left.tractionScore)[0],
    [dashboard.categories],
  );
  const headline = dashboard.kpis.pendingApprovals > 0
    ? 'Human decisions are the constraint.'
    : topTraction?.tractionScore > 0
      ? `${shortCategory(topTraction.category)} is moving.`
      : 'Turn market evidence into the first client.';
  const leadProspect = dashboard.priorityProspects[0];

  return (
    <main className="page command-page" id="main-content">
      <section className="command-masthead">
        <div className="command-intro">
          <p className="eyebrow">ALYR / GROWTH OPERATING SYSTEM</p>
          <h1>{headline}</h1>
          <p>One decision layer from Qatar market discovery to outreach, client conversion and transformation delivery.</p>
        </div>
        <div className="command-pulse" aria-label="System freshness">
          <span className="pulse-mark"><i /></span>
          <div><small>OPERATING PICTURE</small><strong>{refreshing ? 'SYNCING' : 'CURRENT'}</strong></div>
          <div><small>UPDATED</small><strong>{relativeTime(dashboard.generatedAt)}</strong></div>
          <button className="icon-button" onClick={onRefresh} disabled={refreshing} aria-label="Refresh command dashboard"><Icon name="automation" /></button>
        </div>
      </section>

      <nav className="lens-switch" aria-label="Command views">
        {([
          ['focus', '01', 'Focus', 'What needs a decision'],
          ['market', '02', 'Market', 'Where demand can be created'],
          ['motion', '03', 'Motion', 'How relationships progress'],
          ['delivery', '04', 'Delivery', 'How outcomes are moving'],
        ] as const).map(([key, index, label, note]) => (
          <button className={lens === key ? 'is-active' : ''} key={key} onClick={() => setLens(key)}>
            <span>{index}</span><strong>{label}</strong><small>{note}</small>
          </button>
        ))}
      </nav>

      <section className="command-kpi-ribbon" aria-label="Growth system totals">
        {[
          ['Market', dashboard.kpis.marketCandidates, 'Qatar candidates'],
          ['Verified', dashboard.kpis.verifiedProspects, 'Website evidence'],
          ['Contactable', dashboard.kpis.contactableProspects, 'Public channel found'],
          ['Pipeline', dashboard.kpis.activePipeline, 'Active relationships'],
          ['Clients', dashboard.kpis.onboardedClients, 'Onboarded accounts'],
          ['Projects', dashboard.kpis.activeProjects, 'Active outcomes'],
          ['Decisions', dashboard.kpis.pendingApprovals, 'Awaiting approval'],
        ].map(([label, value, note]) => (
          <div key={String(label)} className={label === 'Decisions' && Number(value) > 0 ? 'needs-action' : ''}>
            <span>{label}</span><strong>{formatNumber(Number(value))}</strong><small>{note}</small>
          </div>
        ))}
      </section>

      {lens === 'focus' && (
        <>
          <section className="focus-grid">
            <div className="decision-stack">
              <header className="section-heading">
                <div><span>01 / DECISION QUEUE</span><h2>Owner attention, ranked.</h2></div>
                <small>{dashboard.signals.length} live signals</small>
              </header>
              <div className="decision-list">
                {dashboard.signals.map((signal, index) => (
                  <article key={signal.id} className={`decision-row priority-${signal.priority}`}>
                    <span className="decision-index">{String(index + 1).padStart(2, '0')}</span>
                    <div><small>{signal.priority}</small><h3>{signal.title}</h3><p>{signal.detail}</p></div>
                    <button onClick={() => onNavigate(targetView(signal.targetView))}>{signal.actionLabel}<Icon name="arrow-right" size={16} /></button>
                  </article>
                ))}
              </div>
            </div>

            <aside className="next-move-panel">
              <span>THE NEXT BEST MOVE</span>
              {leadProspect ? (
                <>
                  <div className="move-score"><strong>{leadProspect.priorityScore}</strong><small>PRIORITY</small></div>
                  <p>{leadProspect.category} / {leadProspect.location}</p>
                  <h2>{leadProspect.name}</h2>
                  <div className="move-rule" />
                  <small>LEAD WITH</small>
                  <h3>{leadProspect.recommendedOffer}</h3>
                  <p className="move-evidence">{leadProspect.openingAngle}</p>
                  <button className="button primary full" onClick={() => onOpenProspect(leadProspect.id)}>Open evidence dossier <Icon name="arrow-right" size={17} /></button>
                </>
              ) : (
                <div className="command-empty inverse-empty"><h3>Verify the first priority.</h3><p>The system will surface an evidence-led offer here.</p><button onClick={() => onNavigate('market')}>Open prospects</button></div>
              )}
            </aside>
          </section>

          <section className="command-section">
            <header className="section-heading wide-heading">
              <div><span>02 / PRIORITY ACCOUNTS</span><h2>Know exactly where to hit.</h2></div>
              <button className="text-action" onClick={() => onNavigate('market')}>Explore all prospects <Icon name="arrow-right" size={16} /></button>
            </header>
            <ProspectRows prospects={dashboard.priorityProspects.slice(0, 5)} onOpen={onOpenProspect} />
          </section>
        </>
      )}

      {lens === 'market' && (
        <section className="market-lens-grid">
          <div className="market-field-wrap">
            <header className="section-heading">
              <div><span>02 / OPPORTUNITY FIELD</span><h2>Potential × traction, not vanity volume.</h2></div>
              <small>{dashboard.categories.length} categories resolved</small>
            </header>
            <OpportunityField categories={dashboard.categories} selected={selectedCategory} onSelect={setSelectedCategory} />
          </div>
          {selected && (
            <aside className="category-brief">
              <span>SELECTED CATEGORY</span>
              <h2>{selected.category}</h2>
              <div className="category-score-pair">
                <div><strong>{selected.potentialScore}</strong><small>POTENTIAL</small></div>
                <div><strong>{selected.tractionScore}</strong><small>TRACTION</small></div>
              </div>
              <dl>
                <div><dt>Market candidates</dt><dd>{formatNumber(selected.marketCount)}</dd></div>
                <div><dt>Verified evidence</dt><dd>{formatNumber(selected.verified)}</dd></div>
                <div><dt>Contactable</dt><dd>{formatNumber(selected.contactable)}</dd></div>
                <div><dt>Pipeline</dt><dd>{formatNumber(selected.pipeline)}</dd></div>
                <div><dt>Meetings / proposals</dt><dd>{selected.meetings} / {selected.proposals}</dd></div>
              </dl>
              <small>RECOMMENDED WEDGE</small>
              <h3>{selected.recommendedOffer}</h3>
              <p>{selected.nextMove}</p>
              <button className="button primary full" onClick={() => onOpenCategory(selected.category)}>Filter this market <Icon name="arrow-right" size={17} /></button>
            </aside>
          )}
          <div className="category-ledger">
            <div className="category-ledger-head"><span>Category</span><span>Market</span><span>Evidence</span><span>Pipeline</span><span>Potential</span><span>Traction</span></div>
            {dashboard.categories.slice(0, 12).map((category) => (
              <button key={category.category} onClick={() => setSelectedCategory(category.category)} className={selectedCategory === category.category ? 'is-selected' : ''}>
                <strong>{category.category}</strong><span>{formatNumber(category.marketCount)}</span><span>{formatNumber(category.verified)}</span><span>{category.pipeline}</span><span>{category.potentialScore}</span><span>{category.tractionScore}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {lens === 'motion' && (
        <>
          <section className="motion-stage">
            <header className="section-heading wide-heading">
              <div><span>03 / RELATIONSHIP MOTION</span><h2>From universe to trusted client.</h2></div>
              <small>Counts are evidence-based; zeros stay zero</small>
            </header>
            <div className="funnel-rail">
              {dashboard.funnel.map((stage, index) => {
                const previous = dashboard.funnel[index - 1]?.count;
                const conversion = previous ? Math.min(100, (stage.count / previous) * 100) : 100;
                return (
                  <div key={stage.key} className="funnel-stage">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{compactNumber(stage.count)}</strong>
                    <h3>{stage.label}</h3>
                    <p>{stage.detail}</p>
                    {index > 0 && <small>{percent.format(conversion)}% from prior</small>}
                  </div>
                );
              })}
            </div>
          </section>
          <section className="command-section">
            <header className="section-heading wide-heading">
              <div><span>EXECUTION BOARD</span><h2>Evidence, offer, contact, next move.</h2></div>
              <button className="text-action" onClick={() => onNavigate('pipeline')}>Open pipeline <Icon name="arrow-right" size={16} /></button>
            </header>
            <ProspectRows prospects={dashboard.priorityProspects} onOpen={onOpenProspect} />
          </section>
        </>
      )}

      {lens === 'delivery' && (
        <section className="delivery-lens">
          <header className="section-heading wide-heading">
            <div><span>04 / OUTCOME PORTFOLIO</span><h2>Transformation tracked by outcomes.</h2></div>
            <button className="text-action" onClick={() => onNavigate('delivery')}>Open delivery system <Icon name="arrow-right" size={16} /></button>
          </header>
          {dashboard.projects.length ? (
            <div className="mini-project-grid">
              {dashboard.projects.slice(0, 8).map((project) => (
                <article key={project.id} className={`mini-project health-${project.health}`}>
                  <span>{project.accountName} / {readable(project.phase)}</span><h3>{project.name}</h3>
                  <div><i style={{ inlineSize: `${project.progress}%` }} /></div><strong>{project.progress}%</strong><p>{project.nextMilestone}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="delivery-zero">
              <div><span>PORTFOLIO / TRUE ZERO</span><strong>0</strong></div>
              <div><h2>No client project is recorded yet.</h2><p>This is an honest starting state, not missing dashboard data. A won pipeline record can create the account; Hermes or a human can then attach outcome workstreams through the operations API.</p><button className="button primary" onClick={() => onNavigate('pipeline')}>Progress the first relationship <Icon name="arrow-right" size={17} /></button></div>
              <ol><li><span>01</span>Win or onboard account</li><li><span>02</span>Define outcomes and workstreams</li><li><span>03</span>Stream milestones, risk and completion</li></ol>
            </div>
          )}
        </section>
      )}

      <section className="source-spine">
        <header><span>SYSTEM / SOURCE SPINE</span><strong>Every number retains provenance.</strong></header>
        <div>
          {dashboard.sources.map((source) => (
            <article key={source.id}>
              <i className={`source-state state-${source.status}`} />
              <span>{source.name}</span><strong>{formatNumber(source.records)}</strong><small>{source.note}</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
