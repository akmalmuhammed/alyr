import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { AppConfig, OutreachAction, OutreachStatus } from '../types';
import { Icon } from './Icon';

const STATUS_OPTIONS: Array<{ value: OutreachStatus | ''; label: string }> = [
  { value: '', label: 'All actions' },
  { value: 'pending-approval', label: 'Needs review' },
  { value: 'approved', label: 'Approved' },
  { value: 'sent', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'rejected', label: 'Rejected' },
];

function readable(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

interface HermesQueueProps {
  config: AppConfig;
  onOpenMarket: () => void;
  onNotice: (message: string) => void;
}

export function HermesQueue({ config, onOpenMarket, onNotice }: HermesQueueProps) {
  const [actions, setActions] = useState<OutreachAction[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<OutreachStatus | ''>('');
  const [selected, setSelected] = useState<OutreachAction | null>(null);
  const [actor, setActor] = useState('Akmal / ALYR');
  const [note, setNote] = useState('Relevance, destination, permission evidence, sender identity and opt-out route reviewed.');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await api.listOutreachActions(filter || undefined);
      setActions(response.items);
      setTotal(response.total);
      if (selected) setSelected(response.items.find((item) => item.id === selected.id) ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The Hermes queue could not be loaded.');
    }
  }, [filter, selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => actions.reduce<Record<string, number>>((accumulator, action) => {
    accumulator[action.status] = (accumulator[action.status] ?? 0) + 1;
    return accumulator;
  }, {}), [actions]);

  async function mutate(action: OutreachAction, operation: 'approve' | 'reject' | 'execute') {
    setBusyId(action.id);
    setError('');
    try {
      const updated = operation === 'approve'
        ? await api.approveOutreachAction(action.id, actor, note)
        : operation === 'reject'
          ? await api.rejectOutreachAction(action.id, actor, note)
          : await api.executeOutreachAction(action.id, actor);
      setSelected(updated);
      onNotice(`${updated.prospectName}: ${readable(updated.status)}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `${readable(operation)} failed.`);
    } finally {
      setBusyId('');
    }
  }

  return (
    <main className="page hermes-page" id="main-content">
      <section className="hermes-hero">
        <div>
          <p className="eyebrow">HERMES / AGENT OPERATIONS</p>
          <h1>Autonomy, with a visible handbrake.</h1>
          <p>Hermes can research, verify and prepare the next move. Permission decisions and message approvals stay human; execution is logged and revalidated at the moment of action.</p>
        </div>
        <div className="hermes-flow" aria-label="Hermes governance flow">
          <div><span>01</span><strong>AGENT</strong><small>Research + draft</small></div>
          <i />
          <div className="flow-human"><span>02</span><strong>HUMAN</strong><small>Permission + approval</small></div>
          <i />
          <div><span>03</span><strong>PROVIDER</strong><small>Controlled dispatch</small></div>
        </div>
      </section>

      <section className="hermes-gates">
        <div className="gate-live"><span>MCP</span><strong>{config.hermes.mcpReady ? 'READY' : 'OFFLINE'}</strong><small>Local SQLite access</small></div>
        <div><span>APPROVAL</span><strong>{config.hermes.humanApprovalRequired ? 'REQUIRED' : 'UNKNOWN'}</strong><small>Agent cannot self-approve</small></div>
        <div><span>EXTERNAL SEND</span><strong>{config.hermes.externalOutreach.mode.toUpperCase()}</strong><small>Safe default: disabled</small></div>
        <div><span>EMAIL</span><strong>{config.hermes.externalOutreach.smtpConfigured ? 'CONFIGURED' : 'NO PROVIDER'}</strong><small>SMTP adapter</small></div>
        <div><span>WHATSAPP</span><strong>{config.hermes.externalOutreach.whatsappConfigured ? 'CONFIGURED' : 'NO PROVIDER'}</strong><small>Opt-in templates only</small></div>
      </section>

      <section className="queue-layout">
        <div className="queue-main">
          <div className="queue-toolbar">
            <div><span>CONTROL QUEUE</span><strong>{total} ACTION{total === 1 ? '' : 'S'}</strong></div>
            <div className="queue-status-tabs">
              {STATUS_OPTIONS.map((option) => <button key={option.value || 'all'} className={filter === option.value ? 'is-active' : ''} onClick={() => setFilter(option.value)}>{option.label}</button>)}
            </div>
          </div>

          {error && <div className="market-error" role="alert"><strong>GATE STOPPED THE ACTION</strong><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div>}

          <div className="queue-list">
            {actions.map((action, index) => (
              <article className={`queue-action ${selected?.id === action.id ? 'is-selected' : ''}`} key={action.id}>
                <button className="queue-action-open" onClick={() => setSelected(action)}>
                  <span className="queue-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className={`channel-mark ${action.channel}`}><Icon name={action.channel === 'task' ? 'workflow' : action.channel === 'email' ? 'document' : 'notification'} size={18} /></span>
                  <span className="queue-account"><strong>{action.prospectName}</strong><small>{readable(action.channel)} · {action.destination || 'Internal account task'}</small></span>
                  <span className={`queue-permission ${action.permissionSnapshot}`}>{readable(action.permissionSnapshot)}</span>
                  <span className={`queue-status ${action.status}`}><i />{readable(action.status)}</span>
                  <Icon name="arrow-right" size={16} />
                </button>
              </article>
            ))}
            {!actions.length && (
              <div className="queue-empty">
                <span>∕∕</span>
                <h2>No action is waiting here.</h2>
                <p>Select a Qatar prospect, verify its evidence and ask Hermes for a governed next step.</p>
                <button className="button primary" onClick={onOpenMarket}>Open Qatar scan <Icon name="arrow-right" size={17} /></button>
              </div>
            )}
          </div>
        </div>

        <aside className="queue-review">
          {selected ? (
            <>
              <div className="review-head">
                <div><span>HUMAN REVIEW</span><strong>{selected.id.slice(0, 8).toUpperCase()}</strong></div>
                <button className="icon-button" aria-label="Close review" onClick={() => setSelected(null)}><Icon name="close" /></button>
              </div>
              <div className="review-account">
                <span className={`channel-mark ${selected.channel}`}><Icon name="automation" /></span>
                <div><p>{readable(selected.channel)} / {readable(selected.status)}</p><h2>{selected.prospectName}</h2><span>{selected.destination || 'Internal account task'}</span></div>
              </div>
              <div className="review-message">
                {selected.subject && <strong>{selected.subject}</strong>}
                <p>{selected.body}</p>
              </div>
              <div className="review-rationale"><span>WHY THIS DRAFT EXISTS</span><p>{selected.rationale}</p></div>
              <div className="review-checks">
                <div><span>PERMISSION SNAPSHOT</span><strong>{readable(selected.permissionSnapshot)}</strong></div>
                <div><span>CREATED BY</span><strong>{selected.createdBy}</strong></div>
                <div><span>TEMPLATE</span><strong>{selected.templateName || 'Not required'}</strong></div>
                <div><span>PROVIDER ID</span><strong>{selected.providerId || 'Not dispatched'}</strong></div>
              </div>
              {selected.error && <div className="review-error"><strong>LAST ERROR</strong><span>{selected.error}</span></div>}
              <div className="reviewer-fields">
                <label><span>REVIEWER</span><input value={actor} onChange={(event) => setActor(event.target.value)} /></label>
                <label><span>DECISION NOTE</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label>
              </div>
              <div className="review-actions">
                {selected.status === 'pending-approval' && <button className="button primary" disabled={busyId === selected.id} onClick={() => mutate(selected, 'approve')}><Icon name="check" size={16} /> Approve after review</button>}
                {selected.status === 'approved' && <button className="button primary" disabled={busyId === selected.id} onClick={() => mutate(selected, 'execute')}><Icon name="arrow-right" size={16} /> Execute approved action</button>}
                {['pending-approval', 'approved'].includes(selected.status) && <button className="button secondary" disabled={busyId === selected.id} onClick={() => mutate(selected, 'reject')}>Reject</button>}
              </div>
              <p className="review-footnote">Approval checks current permission and suppression—not only this snapshot. External execution remains disabled until provider configuration and compliance sign-off are complete.</p>
            </>
          ) : (
            <div className="review-placeholder">
              <span>SELECT / REVIEW / RELEASE</span>
              <div className="command-slash">╱</div>
              <h2>Every consequential action has an owner.</h2>
              <p>Choose a queue item to inspect its evidence, destination, message, permission snapshot and provider state.</p>
              <div className="queue-mini-stats">
                <div><strong>{counts['pending-approval'] ?? 0}</strong><span>REVIEW</span></div>
                <div><strong>{counts.approved ?? 0}</strong><span>APPROVED</span></div>
                <div><strong>{counts.sent ?? 0}</strong><span>SENT</span></div>
              </div>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
