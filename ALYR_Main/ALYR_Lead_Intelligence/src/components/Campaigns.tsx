import type { CampaignRecord } from '../types';
import { Icon } from './Icon';

interface CampaignsProps {
  campaigns: CampaignRecord[];
  onDiscover: () => void;
}

export function Campaigns({ campaigns, onDiscover }: CampaignsProps) {
  return (
    <main className="page" id="main-content">
      <section className="page-intro split-intro">
        <div><span className="eyebrow">ALYR / DISCOVERY CONTROL / 04</span><h1>Every search has a visible scope and cost.</h1></div>
        <div className="intro-note"><strong>{campaigns.reduce((sum, item) => sum + item.queryCount, 0)}</strong><p>user-initiated discovery queries recorded on this device. Result content is not persisted here.</p></div>
      </section>

      <section className="campaign-layout">
        <div className="campaign-history">
          <div className="panel-heading"><span className="section-number">01</span><div><h2>Campaign history</h2><p>Search configuration and counts only.</p></div></div>
          {campaigns.length ? campaigns.map((campaign) => (
            <article className="campaign-row" key={campaign.id}>
              <span className="campaign-mode">{campaign.mode.toUpperCase()}</span>
              <div><strong>{campaign.categories.join(' + ')}</strong><small>{campaign.locations.join(' · ')}{campaign.query ? ` · “${campaign.query}”` : ''}</small></div>
              <div><span>QUERIES</span><strong>{campaign.queryCount}</strong></div>
              <div><span>RESULTS</span><strong>{campaign.resultCount}</strong></div>
              <div><span>SOURCE</span><strong>{campaign.source.toUpperCase()}</strong></div>
              <time dateTime={campaign.createdAt}>{new Date(campaign.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time>
            </article>
          )) : <div className="campaign-empty"><p>No user-initiated campaigns have been recorded yet.</p><button className="button primary" onClick={onDiscover}>Run discovery <Icon name="arrow-right" size={18} /></button></div>}
        </div>

        <aside className="guardrail-panel">
          <span className="eyebrow inverse">QUERY GUARDRAIL</span>
          <strong>08</strong>
          <h2>Maximum search combinations per batch.</h2>
          <p>ALYR deliberately avoids invisible bulk collection. Users choose categories and locations, see the query count, then authorize the campaign.</p>
          <ul><li>No Maps UI scraping</li><li>No automatic pagination in batch</li><li>No stored live result lists</li><li>Server-side API key</li></ul>
        </aside>
      </section>
    </main>
  );
}
