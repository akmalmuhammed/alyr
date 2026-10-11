import { useMemo, useState } from 'react';
import { STATUS_LABELS, STATUS_ORDER } from '../data';
import { leadsToCsv, opportunityCount, scoreBand } from '../scoring';
import type { LeadRecord, LeadStatus } from '../types';
import { Icon } from './Icon';

function websiteHost(value: string): string {
  try {
    return value ? new URL(value).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

interface PipelineProps {
  leads: LeadRecord[];
  onDelete: (id: string) => Promise<void>;
  onDiscover: () => void;
  onStatus: (id: string, status: LeadStatus) => Promise<void>;
}

export function Pipeline({ leads, onDelete, onDiscover, onStatus }: PipelineProps) {
  const [filter, setFilter] = useState<'all' | LeadStatus>('all');
  const filtered = useMemo(() => filter === 'all' ? leads : leads.filter((lead) => lead.status === filter), [filter, leads]);

  function exportCsv() {
    const blob = new Blob([leadsToCsv(leads)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `alyr-verified-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="page" id="main-content">
      <section className="page-intro split-intro">
        <div>
          <span className="eyebrow">ALYR / REVENUE WORKFLOW / 02</span>
          <h1>A pipeline built on verified evidence.</h1>
        </div>
        <div className="intro-note">
          <strong>{leads.length}</strong>
          <p>exportable prospects from public websites, manual research or licensed imports—not copied Google business listings.</p>
        </div>
      </section>

      <section className="pipeline-controls">
        <div className="status-tabs" aria-label="Filter pipeline by status">
          <button className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>All <span>{leads.length}</span></button>
          {STATUS_ORDER.slice(0, 6).map((status) => (
            <button key={status} className={filter === status ? 'is-active' : ''} onClick={() => setFilter(status)}>
              {STATUS_LABELS[status]} <span>{leads.filter((lead) => lead.status === status).length}</span>
            </button>
          ))}
        </div>
        <button className="button outline" disabled={!leads.length} onClick={exportCsv}>
          <Icon name="download" size={18} /> Export verified leads
        </button>
      </section>

      {leads.length === 0 ? (
        <section className="pipeline-empty">
          <div className="empty-command"><span>DISCOVER</span><span>VERIFY</span><span>CONVERT</span></div>
          <div>
            <span className="section-number">01</span>
            <h2>The pipeline starts after independent verification.</h2>
            <p>Choose a live place result, verify the business website, then save the independently sourced contact record here.</p>
            <button className="button primary" onClick={onDiscover}>Find prospects <Icon name="arrow-right" size={18} /></button>
          </div>
        </section>
      ) : (
        <section className="pipeline-table" aria-label="Verified prospects">
          <div className="pipeline-head" aria-hidden="true">
            <span>VERIFIED PROSPECT</span><span>TRANSFORMATION SIGNAL</span><span>FIT</span><span>STATUS</span><span>OWNER</span><span>ACTIONS</span>
          </div>
          {filtered.map((lead) => {
            const band = scoreBand(lead.fitScore);
            const topSignal = lead.signals.find((signal) => signal.state === 'opportunity');
            const host = websiteHost(lead.website);
            return (
              <article className="pipeline-row" key={lead.id}>
                <div className="lead-name">
                  <strong>{lead.verifiedName}</strong>
                  {host
                    ? <a href={lead.website} target="_blank" rel="noreferrer">{host}</a>
                    : <span className="website-missing">No website recorded</span>}
                  <small>{lead.category} · {lead.location}</small>
                </div>
                <div className="lead-signal">
                  <strong>{topSignal?.label || 'Manual qualification required'}</strong>
                  <small>{opportunityCount(lead.signals)} opportunities observed</small>
                </div>
                <div className={`score-cell ${band.className}`}><strong>{lead.fitScore}</strong><span>{band.label}</span></div>
                <label className="select-field compact-select">
                  <span className="sr-only">Status for {lead.verifiedName}</span>
                  <select value={lead.status} onChange={(event) => void onStatus(lead.id, event.target.value as LeadStatus)}>
                    {STATUS_ORDER.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                  </select>
                </label>
                <div className="owner-cell"><span className="owner-avatar">{lead.owner === 'Unassigned' ? '—' : lead.owner.slice(0, 2).toUpperCase()}</span><span>{lead.owner}</span></div>
                <div className="row-actions">
                  {lead.emails[0] && <a className="icon-button" aria-label={`Email ${lead.verifiedName}`} href={`mailto:${lead.emails[0]}`}><Icon name="arrow-up-right" size={18} /></a>}
                  <button
                    className="text-button destructive"
                    onClick={() => {
                      if (window.confirm(`Remove ${lead.verifiedName} from the pipeline?`)) void onDelete(lead.id);
                    }}
                  >Remove</button>
                </div>
              </article>
            );
          })}
          {filtered.length === 0 && <div className="filtered-empty">No prospects are currently in this stage.</div>}
        </section>
      )}

      <section className="export-policy-band">
        <Icon name="security" size={22} />
        <div><strong>Export boundary</strong><p>CSV includes only independently sourced contacts, user workflow data and permitted Place IDs. Live Google names, addresses and ratings are not exported.</p></div>
      </section>
    </main>
  );
}
