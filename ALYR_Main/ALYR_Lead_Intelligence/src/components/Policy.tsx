import type { AppConfig } from '../types';
import { Icon } from './Icon';

interface PolicyProps { config: AppConfig }

export function Policy({ config }: PolicyProps) {
  const layers = [
    { number: '01', title: 'Live discovery', text: 'Google Places API results remain a live, attributed view. The application does not scrape the Google Maps interface or persist result lists.' },
    { number: '02', title: 'Permitted identity', text: 'Google Place IDs may be stored. Other Google content is refreshed live and is visually separated from ALYR-owned records.' },
    { number: '03', title: 'Independent verification', text: 'Exportable names and contacts are obtained from the business’s public website, manual research or a licensed provider, with source and observation date.' },
    { number: '04', title: 'Safe enrichment', text: 'Website checks respect robots rules, reject private network targets, cap redirects, response size and crawl depth, and inspect at most two pages per request.' },
    { number: '05', title: 'Responsible outreach', text: 'Users must validate Qatar/GCC privacy, direct-marketing, consent and do-not-contact requirements before activating email, phone or WhatsApp campaigns.' },
  ];
  return (
    <main className="page" id="main-content">
      <section className="policy-hero">
        <div><span className="eyebrow inverse">ALYR / GOVERNANCE / 05</span><h1>Lead intelligence without a trust deficit.</h1><p>Data provenance, platform terms and human approval are product requirements—not a legal appendix.</p></div>
        <img src="/brand/alyr-symbol-reversed.png" alt="" />
      </section>

      <section className="policy-stack">
        {layers.map((layer) => (
          <article key={layer.number}><span>{layer.number}</span><h2>{layer.title}</h2><p>{layer.text}</p></article>
        ))}
      </section>

      <section className="policy-matrix">
        <div className="panel-heading"><span className="section-number">06</span><div><h2>What the application stores</h2><p>A clear boundary between platform content and ALYR-owned records.</p></div></div>
        <div className="matrix-row heading"><span>DATA CLASS</span><span>DISPLAY</span><span>PERSIST</span><span>EXPORT</span></div>
        <div className="matrix-row"><strong>Google business content</strong><span>Live + attributed</span><span>No</span><span>No</span></div>
        <div className="matrix-row"><strong>Google Place ID</strong><span>Yes</span><span>Yes</span><span>Yes</span></div>
        <div className="matrix-row volt"><strong>Website-verified contacts</strong><span>With provenance</span><span>Yes</span><span>Yes</span></div>
        <div className="matrix-row"><strong>ALYR status, notes and scoring</strong><span>Yes</span><span>Yes</span><span>Yes</span></div>
      </section>

      <section className="policy-links">
        <Icon name="document" size={22} />
        <div><strong>Production prerequisites</strong><p>Publish an ALYR Terms of Use and Privacy Policy; restrict the Google API key; configure billing alerts; complete local legal review; and define outreach suppression and deletion workflows.</p></div>
        <div className="inline-actions">
          <a className="text-action" href={config.policies.googlePlaces} target="_blank" rel="noreferrer">Places policies <Icon name="arrow-up-right" size={15} /></a>
          <a className="text-action" href={config.policies.googleTerms} target="_blank" rel="noreferrer">Platform terms <Icon name="arrow-up-right" size={15} /></a>
          <a className="text-action" href={config.policies.googlePrivacy} target="_blank" rel="noreferrer">Google privacy <Icon name="arrow-up-right" size={15} /></a>
        </div>
      </section>
    </main>
  );
}
