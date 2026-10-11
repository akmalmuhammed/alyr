import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type {
  MarketProspect,
  MarketSummary,
  OutreachChannel,
  PermissionStatus,
  ProspectContact,
  ProspectListResult,
  VerificationStatus,
} from '../types';
import { Icon } from './Icon';

const EMPTY_RESULTS: ProspectListResult = { items: [], total: 0, limit: 40, offset: 0 };

function readable(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatNumber(value?: number): string {
  return new Intl.NumberFormat('en-QA').format(value ?? 0);
}

interface QatarScanProps {
  onOpenHermes: () => void;
  onNotice: (message: string) => void;
  focusProspectId?: string;
  onFocusConsumed?: () => void;
  focusCategory?: string;
  onCategoryConsumed?: () => void;
}

export function QatarScan({ onOpenHermes, onNotice, focusProspectId, onFocusConsumed, focusCategory, onCategoryConsumed }: QatarScanProps) {
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [results, setResults] = useState<ProspectListResult>(EMPTY_RESULTS);
  const [selected, setSelected] = useState<MarketProspect | null>(null);
  const [contacts, setContacts] = useState<ProspectContact[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [verification, setVerification] = useState<VerificationStatus | ''>('');
  const [busy, setBusy] = useState<'load' | 'scan' | 'verify' | 'detail' | ''>('load');
  const [error, setError] = useState('');
  const [permission, setPermission] = useState<PermissionStatus>('unknown');
  const [permissionEvidence, setPermissionEvidence] = useState('');

  const load = useCallback(async (offset = 0) => {
    setBusy('load');
    setError('');
    try {
      const [nextSummary, nextResults] = await Promise.all([
        api.marketSummary(),
        api.listMarketProspects({ search, category, location, verification: verification || undefined, limit: 40, offset }),
      ]);
      setSummary(nextSummary);
      setResults(nextResults);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The local market dataset could not be read.');
    } finally {
      setBusy('');
    }
  }, [category, location, search, verification]);

  useEffect(() => {
    if (!focusCategory) void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focusCategory) return;
    setCategory(focusCategory);
    setSearch('');
    setLocation('');
    setVerification('');
    setBusy('load');
    setError('');
    Promise.all([
      api.marketSummary(),
      api.listMarketProspects({ category: focusCategory, limit: 40, offset: 0 }),
    ])
      .then(([nextSummary, nextResults]) => {
        setSummary(nextSummary);
        setResults(nextResults);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => {
        setBusy('');
        onCategoryConsumed?.();
      });
  }, [focusCategory, onCategoryConsumed]);

  useEffect(() => {
    if (!focusProspectId) return;
    setBusy('detail');
    api.getMarketProspect(focusProspectId)
      .then((prospect) => setSelected(prospect))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => {
        setBusy('');
        onFocusConsumed?.();
      });
  }, [focusProspectId, onFocusConsumed]);

  useEffect(() => {
    if (!selected) {
      setContacts([]);
      return;
    }
    setPermission(selected.permissionStatus);
    setPermissionEvidence(selected.permissionEvidence);
    setContacts([]);
    api.listProspectContacts(selected.id)
      .then((response) => setContacts(response.items))
      .catch(() => setContacts([]));
  }, [selected]);

  const websiteQueued = useMemo(() => summary?.websiteQueued ?? 0, [summary]);

  async function runScan() {
    setBusy('scan');
    setError('');
    try {
      const run = await api.runQatarScan();
      onNotice(`Qatar scan saved ${formatNumber(run.imported)} records locally.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Qatar scan failed.');
    } finally {
      setBusy('');
    }
  }

  async function verifyBatch() {
    setBusy('verify');
    setError('');
    try {
      const result = await api.verifyMarketBatch(20);
      onNotice(`${result.verified} websites verified; ${result.failed} need review; ${result.remaining} remain queued.`);
      await load(results.offset);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Website verification failed.');
    } finally {
      setBusy('');
    }
  }

  async function verifyOne(prospect: MarketProspect) {
    setBusy('detail');
    try {
      const updated = await api.verifyMarketProspect(prospect.id);
      setSelected(updated);
      onNotice(`${updated.name} website evidence refreshed.`);
      await load(results.offset);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Website verification failed.');
    } finally {
      setBusy('');
    }
  }

  async function savePermission() {
    if (!selected) return;
    setBusy('detail');
    try {
      const updated = await api.setMarketPermission(selected.id, permission, permissionEvidence);
      setSelected(updated);
      onNotice(`${updated.name} permission record updated.`);
      await load(results.offset);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Permission record was not saved.');
    } finally {
      setBusy('');
    }
  }

  async function createDraft(channel: OutreachChannel) {
    if (!selected) return;
    setBusy('detail');
    try {
      await api.createOutreachDraft({
        prospectId: selected.id,
        channel,
        templateName: channel === 'whatsapp' ? 'alyr_intro_opted_in' : undefined,
      });
      onNotice(`${readable(channel)} draft sent to the human review queue.`);
      onOpenHermes();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Draft creation failed.');
    } finally {
      setBusy('');
    }
  }

  async function suppress() {
    if (!selected) return;
    const reason = window.prompt('Suppression reason (required). This immediately blocks known destinations:');
    if (!reason) return;
    setBusy('detail');
    try {
      const updated = await api.suppressMarketProspect(selected.id, reason);
      setSelected(updated);
      onNotice(`${updated.name} suppressed. No further outreach is permitted.`);
      await load(results.offset);
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'Suppression failed.');
    } finally {
      setBusy('');
    }
  }

  const lastScan = summary?.latestScan;
  return (
    <main className="page market-page" id="main-content">
      <section className="market-hero">
        <div className="market-hero-copy">
          <p className="eyebrow">QATAR / OPEN MARKET INTELLIGENCE</p>
          <h1>The market, resolved into action.</h1>
          <p>Licensed open data establishes the national research layer. ALYR then verifies public websites, ranks transformation fit and hands only governed next steps to Hermes.</p>
          <div className="inline-actions">
            <button className="button primary" disabled={Boolean(busy)} onClick={runScan}>
              <Icon name="data" size={17} /> {busy === 'scan' ? 'Scanning Qatar…' : 'Run Qatar scan'}
            </button>
            <button className="button secondary" disabled={Boolean(busy) || websiteQueued === 0} onClick={verifyBatch}>
              <Icon name="check" size={17} /> {busy === 'verify' ? 'Verifying…' : 'Verify next 20'}
            </button>
          </div>
        </div>
        <div className="market-radar" aria-label={`${formatNumber(summary?.total)} locally stored records`}>
          <span className="radar-ring ring-one" />
          <span className="radar-ring ring-two" />
          <span className="radar-axis axis-one" />
          <span className="radar-axis axis-two" />
          <div className="radar-core"><strong>{formatNumber(summary?.total)}</strong><span>LOCAL RECORDS</span></div>
          <div className="radar-coordinate">25.2854° N<br />51.5310° E</div>
        </div>
      </section>

      <section className="market-metrics" aria-label="Dataset summary">
        <div><span>01 / CANDIDATES</span><strong>{formatNumber(summary?.candidates)}</strong><small>Commercial fit</small></div>
        <div><span>02 / WEBSITES</span><strong>{formatNumber(summary?.withWebsite)}</strong><small>{formatNumber(websiteQueued)} queued</small></div>
        <div><span>03 / VERIFIED</span><strong>{formatNumber(summary?.websiteVerified)}</strong><small>Website evidence</small></div>
        <div><span>04 / CONTACT</span><strong>{formatNumber((summary?.withEmail ?? 0) + (summary?.withPhone ?? 0))}</strong><small>Source-listed signals</small></div>
        <div className="metric-volt"><span>05 / OUTREACH READY</span><strong>{formatNumber(summary?.outreachReady)}</strong><small>Permission recorded</small></div>
      </section>

      <section className="scan-status-band">
        <span className={`scan-state ${lastScan?.status ?? 'idle'}`} />
        <div>
          <strong>{lastScan ? `${readable(lastScan.status)} · ${lastScan.scope}` : 'No local scan recorded yet'}</strong>
          <small>{lastScan?.completedAt ? `Last completed ${new Date(lastScan.completedAt).toLocaleString('en-QA')}` : 'Run the national scan to populate the local SQLite dataset.'}</small>
        </div>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors / ODbL <Icon name="arrow-up-right" size={14} /></a>
      </section>

      <section className="market-workbench">
        <div className="market-filterbar">
          <label className="market-search">
            <span>SEARCH</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Business, category, contact…" />
          </label>
          <label>
            <span>CATEGORY</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">All sectors</option>
              {summary?.categories.map((item) => <option key={item.label} value={item.label}>{item.label} ({item.count})</option>)}
            </select>
          </label>
          <label>
            <span>LOCATION</span>
            <select value={location} onChange={(event) => setLocation(event.target.value)}>
              <option value="">All Qatar</option>
              {summary?.locations.map((item) => <option key={item.label} value={item.label}>{item.label} ({item.count})</option>)}
            </select>
          </label>
          <label>
            <span>EVIDENCE</span>
            <select value={verification} onChange={(event) => setVerification(event.target.value as VerificationStatus | '')}>
              <option value="">Any state</option>
              <option value="website-verified">Website verified</option>
              <option value="website-queued">Website queued</option>
              <option value="no-website">No website in source</option>
              <option value="verification-error">Needs review</option>
            </select>
          </label>
          <button className="button primary compact" disabled={Boolean(busy)} onClick={() => load(0)}><Icon name="filter" size={16} /> Apply</button>
        </div>

        {error && <div className="market-error" role="alert"><strong>OPERATION STOPPED</strong><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div>}

        <div className="market-table-head">
          <span>FIT</span><span>BUSINESS</span><span>SECTOR</span><span>LOCATION</span><span>EVIDENCE</span><span>CONTROL</span>
        </div>
        <div className={`market-results ${busy === 'load' ? 'is-loading' : ''}`}>
          {results.items.map((prospect) => (
            <button className={`market-row ${selected?.id === prospect.id ? 'is-selected' : ''}`} key={prospect.id} onClick={() => setSelected(prospect)}>
              <span className="market-score"><strong>{prospect.fitScore}</strong><small>/ 100</small></span>
              <span className="market-name"><strong>{prospect.name}</strong><small>{prospect.nameAr || prospect.subcategory.replaceAll('_', ' ')}</small></span>
              <span className="market-sector">{prospect.category}</span>
              <span className="market-location">{prospect.location}</span>
              <span className={`evidence-state ${prospect.verificationStatus}`}><i />{readable(prospect.verificationStatus)}</span>
              <span className="market-control">Inspect <Icon name="arrow-right" size={15} /></span>
            </button>
          ))}
          {!results.items.length && <div className="market-empty"><strong>No records match this lens.</strong><span>Change the filters or run the Qatar scan.</span></div>}
        </div>
        <div className="market-pagination">
          <span>Showing {results.items.length ? results.offset + 1 : 0}–{Math.min(results.offset + results.items.length, results.total)} of {formatNumber(results.total)}</span>
          <div>
            <button className="button ghost compact" disabled={results.offset === 0 || Boolean(busy)} onClick={() => load(Math.max(0, results.offset - results.limit))}>Previous</button>
            <button className="button ghost compact" disabled={results.offset + results.limit >= results.total || Boolean(busy)} onClick={() => load(results.offset + results.limit)}>Next</button>
          </div>
        </div>
      </section>

      {selected && (
        <aside className="market-inspector" aria-label={`${selected.name} account evidence`}>
          <div className="market-inspector-head">
            <span>ACCOUNT / {selected.sourceId.toUpperCase()}</span>
            <button className="icon-button" aria-label="Close account details" onClick={() => setSelected(null)}><Icon name="close" /></button>
          </div>
          <div className="market-inspector-body">
            <div className="account-title">
              <div className="account-score">{selected.fitScore}</div>
              <div><p>{selected.category}</p><h2>{selected.name}</h2><span>{selected.location} · {readable(selected.verificationStatus)}</span></div>
            </div>
            <div className="account-source-note">
              <Icon name="security" size={18} />
              <p><strong>Research candidate, not consent.</strong> Contact availability never authorizes marketing. Confirm the right person and record evidence before approval.</p>
            </div>
            <div className="account-facts">
              <div><span>WEBSITE</span>{selected.website ? <a href={selected.website} target="_blank" rel="noreferrer">{selected.website}</a> : <strong>Not present in source</strong>}</div>
              <div><span>EMAIL</span><strong>{selected.emails[0] || 'Not available'}</strong></div>
              <div><span>PHONE</span><strong>{selected.phones[0] || 'Not available'}</strong></div>
              <div><span>SOURCE</span><a href={selected.sourceUrl} target="_blank" rel="noreferrer">{selected.sourceLicense}</a></div>
            </div>
            <div className="decision-contact-panel">
              <div><span className="inspector-label">DECISION CONTACT</span><small>{contacts.length ? `${contacts.length} source-verified` : 'Research pending'}</small></div>
              {contacts.length ? contacts.slice(0, 3).map((contact) => (
                <article key={contact.id}>
                  <div><strong>{contact.name || contact.role || 'Business contact'}</strong><span>{contact.role || 'Role to confirm'} · {contact.confidence}% confidence</span></div>
                  <div>{contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}{contact.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}{contact.sourceUrl && <a href={contact.sourceUrl} target="_blank" rel="noreferrer">Source evidence</a>}</div>
                </article>
              )) : (
                <p>No named decision-maker is verified yet. Hermes can add one only with a public source URL and confidence score.</p>
              )}
            </div>
            <div className="account-signals">
              <span className="inspector-label">OBSERVED SIGNALS</span>
              {selected.signals.slice(0, 5).map((signal) => <div key={signal.key}><i className={signal.state} /><p><strong>{signal.label}</strong><span>{signal.evidence}</span></p></div>)}
            </div>
            {selected.website && selected.verificationStatus !== 'website-verified' && (
              <button className="button secondary full" disabled={Boolean(busy)} onClick={() => verifyOne(selected)}><Icon name="check" size={16} /> Verify public website now</button>
            )}
            <div className="permission-editor">
              <div><span className="inspector-label">PERMISSION CONTROL</span><small>Human record only</small></div>
              <select value={permission} onChange={(event) => setPermission(event.target.value as PermissionStatus)}>
                <option value="unknown">Unknown — no external send</option>
                <option value="opted-in">Opted in — evidence required</option>
                <option value="approved-business-contact">Counsel-approved B2B email basis</option>
                <option value="opted-out">Opted out — suppress</option>
              </select>
              <textarea rows={3} value={permissionEvidence} onChange={(event) => setPermissionEvidence(event.target.value)} placeholder="Source, scope, timestamp and reviewer…" />
              <button className="button secondary full" disabled={Boolean(busy)} onClick={savePermission}>Save permission record</button>
            </div>
            <div className="draft-controls">
              <span className="inspector-label">HAND OFF TO HERMES</span>
              <p>Drafts enter human review. Unknown permission allows internal research tasks, but blocks external approval.</p>
              <div>
                <button className="button primary" disabled={Boolean(busy)} onClick={() => createDraft('task')}>Internal task</button>
                <button className="button secondary" disabled={Boolean(busy) || !selected.emails.length} onClick={() => createDraft('email')}>Email draft</button>
                <button className="button secondary" disabled={Boolean(busy) || !selected.phones.length} onClick={() => createDraft('whatsapp')}>WhatsApp draft</button>
              </div>
            </div>
            <button className="suppress-action" disabled={Boolean(busy) || selected.suppressed} onClick={suppress}>{selected.suppressed ? 'Suppressed · outreach blocked' : 'Record opt-out / suppress account'}</button>
          </div>
        </aside>
      )}
      {selected && <button className="inspector-scrim" aria-label="Close account details" onClick={() => setSelected(null)} />}
    </main>
  );
}
