import { averageScore, topOpportunitySignals } from '../scoring';
import type { LeadRecord } from '../types';

interface IntelligenceProps { leads: LeadRecord[] }

export function Intelligence({ leads }: IntelligenceProps) {
  const signals = topOpportunitySignals(leads);
  const average = averageScore(leads);
  const categories = Object.entries(leads.reduce<Record<string, number>>((accumulator, lead) => {
    accumulator[lead.category || 'Uncategorized'] = (accumulator[lead.category || 'Uncategorized'] ?? 0) + 1;
    return accumulator;
  }, {})).sort((a, b) => b[1] - a[1]);
  const denominator = Math.max(1, ...signals.map((signal) => signal.count), ...categories.map((category) => category[1]));

  return (
    <main className="page" id="main-content">
      <section className="page-intro intelligence-intro">
        <div>
          <span className="eyebrow">ALYR / TRANSFORMATION SIGNALS / 03</span>
          <h1>Turn prospect research into an offer strategy.</h1>
          <p>Patterns across verified websites reveal which transformation products ALYR should package, market and sell first.</p>
        </div>
        <div className="intelligence-score">
          <span>PORTFOLIO FIT</span>
          <strong>{average || '—'}</strong>
          <small>{leads.length ? `${leads.length} verified prospects` : 'Waiting for verified evidence'}</small>
        </div>
      </section>

      <section className="intelligence-grid">
        <div className="pattern-panel">
          <div className="panel-heading"><span className="section-number">01</span><div><h2>Recurring transformation gaps</h2><p>Independently observed website and workflow signals.</p></div></div>
          {signals.length ? (
            <div className="bar-list">
              {signals.map((signal, index) => (
                <div className="bar-row" key={signal.key}>
                  <span className="bar-rank">0{index + 1}</span>
                  <div><strong>{signal.label}</strong><span className="bar-track"><span style={{ inlineSize: `${Math.max(12, (signal.count / denominator) * 100)}%` }} /></span></div>
                  <strong>{signal.count}</strong>
                </div>
              ))}
            </div>
          ) : <EvidenceEmpty />}
        </div>

        <div className="sector-panel">
          <div className="panel-heading"><span className="section-number">02</span><div><h2>Market concentration</h2><p>User-defined campaign categories, not Google-derived scoring.</p></div></div>
          {categories.length ? (
            <div className="sector-list">
              {categories.map(([category, count]) => (
                <div key={category}><span>{category}</span><strong>{count}</strong><i style={{ inlineSize: `${Math.max(8, (count / denominator) * 100)}%` }} /></div>
              ))}
            </div>
          ) : <EvidenceEmpty compact />}
        </div>

        <div className="offer-panel">
          <span className="eyebrow inverse">NEXT BEST OFFER</span>
          <h2>{signals[0]?.label ? `Productize a response to “${signals[0].label}”.` : 'Verify ten prospects to reveal ALYR’s first repeatable offer.'}</h2>
          <p>{signals[0] ? 'Build a focused diagnostic, a 90-day implementation package and proof content around the most common observed gap.' : 'The intelligence layer intentionally waits for independent evidence instead of inventing conclusions from live directory data.'}</p>
          <div className="offer-sequence"><span>DIAGNOSTIC</span><span>LIGHTHOUSE</span><span>OPERATING SUPPORT</span></div>
        </div>
      </section>

      <section className="decision-band"><span>CLARITY</span><i /><span>CONTROL</span><i /><span>CAPABILITY</span><i className="volt" /><span>COMPOUND</span></section>
    </main>
  );
}

function EvidenceEmpty({ compact = false }: { compact?: boolean }) {
  return <div className={`evidence-empty ${compact ? 'compact' : ''}`}><strong>No evidence yet.</strong><p>Verify public business websites and add prospects to the pipeline.</p></div>;
}
