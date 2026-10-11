import { useEffect, useState } from 'react';
import { api } from '../api';
import { opportunityCount, scoreBand } from '../scoring';
import type { LeadRecord, PlaceDetails, PlaceSummary, WebsiteEnrichment } from '../types';
import { Icon } from './Icon';

interface LeadInspectorProps {
  place: PlaceSummary | null;
  campaignCategory: string;
  campaignLocation: string;
  onClose: () => void;
  onCreated: (lead: LeadRecord) => void;
}

export function LeadInspector({ place, campaignCategory, campaignLocation, onClose, onCreated }: LeadInspectorProps) {
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [enrichment, setEnrichment] = useState<WebsiteEnrichment | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingEnrichment, setLoadingEnrichment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDetails(null);
    setEnrichment(null);
    setError('');
    if (!place) return;
    setLoadingDetails(true);
    api.placeDetails(place.placeId)
      .then(setDetails)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoadingDetails(false));
  }, [place]);

  if (!place) return null;

  async function verifyWebsite() {
    if (!details?.website) return;
    setLoadingEnrichment(true);
    setError('');
    try {
      setEnrichment(await api.enrichWebsite(details.website));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Website verification failed.');
    } finally {
      setLoadingEnrichment(false);
    }
  }

  async function addToPipeline() {
    if (!enrichment || !place) return;
    setSaving(true);
    setError('');
    try {
      const record = await api.createLead({
        placeId: place.placeId,
        verifiedName: enrichment.businessName,
        website: enrichment.sourceUrl,
        category: campaignCategory,
        location: campaignLocation,
        emails: enrichment.emails,
        phones: enrichment.phones,
        socialLinks: enrichment.socialLinks,
        sourceUrl: enrichment.sourceUrl,
        sourceType: 'website',
        status: 'new',
        owner: 'Unassigned',
        notes: '',
        signals: enrichment.signals,
        fitScore: enrichment.fitScore,
      });
      onCreated(record);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The lead could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const band = enrichment ? scoreBand(enrichment.fitScore) : null;

  return (
    <aside className="inspector" aria-label="Prospect inspector">
      <div className="inspector-head">
        <div>
          <span className="eyebrow">LIVE PLACE RECORD</span>
          <h2>{place.name}</h2>
        </div>
        <button className="icon-button" aria-label="Close prospect inspector" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>

      <div className="source-boundary">
        <div>
          <span>DISCOVERY SOURCE</span>
          <strong>{place.source === 'google' ? <span className="gmp-attribution" translate="no">Google Maps</span> : 'Fictional demo record'}</strong>
        </div>
        <span className="live-only">VIEW LIVE · DO NOT EXPORT</span>
      </div>

      <div className="inspector-body">
        <section className="record-section live-record">
          <div className="section-label"><span>01</span> Live discovery details</div>
          <dl className="fact-list">
            <div><dt>Address</dt><dd>{place.address || 'Not returned'}</dd></div>
            <div><dt>Category</dt><dd>{place.typeLabel}</dd></div>
            <div><dt>Status</dt><dd>{place.businessStatus.replaceAll('_', ' ')}</dd></div>
            {details?.phone && <div><dt>Phone</dt><dd>{details.phone}</dd></div>}
            {details?.rating !== undefined && <div><dt>Rating</dt><dd>{details.rating.toFixed(1)} · {details.userRatingCount ?? 0} ratings</dd></div>}
          </dl>
          {loadingDetails && <p className="loading-line">Retrieving live details…</p>}
          <div className="inline-actions">
            {place.googleMapsUri && <a className="text-action" href={place.googleMapsUri} target="_blank" rel="noreferrer">Open in Google Maps <Icon name="arrow-up-right" size={15} /></a>}
            {details?.website && <a className="text-action" href={details.website} target="_blank" rel="noreferrer">Open website <Icon name="arrow-up-right" size={15} /></a>}
          </div>
        </section>

        <section className="record-section verify-section">
          <div className="section-label"><span>02</span> Independent verification</div>
          <p>Inspect the public business website, respect robots policy, and create exportable contact evidence with source provenance.</p>
          <button className="button secondary wide" disabled={!details?.website || loadingEnrichment} onClick={verifyWebsite}>
            <Icon name="security" size={18} />
            {loadingEnrichment ? 'Verifying website…' : details?.website ? 'Verify public website' : 'No website returned'}
          </button>
        </section>

        {enrichment && (
          <section className="record-section verified-record">
            <div className="verified-heading">
              <div>
                <span className="section-label"><span>03</span> Verified lead record</span>
                <h3>{enrichment.businessName}</h3>
              </div>
              <div className={`fit-orbit ${band?.className}`}>
                <strong>{enrichment.fitScore}</strong>
                <span>{band?.label}</span>
              </div>
            </div>

            <div className="contact-grid">
              <div><span>EMAILS</span><strong>{enrichment.emails[0] || 'Not found'}</strong></div>
              <div><span>PHONES</span><strong>{enrichment.phones[0] || 'Not found'}</strong></div>
              <div><span>LANGUAGES</span><strong>{enrichment.languages.join(' · ') || 'Unknown'}</strong></div>
              <div><span>OPPORTUNITIES</span><strong>{opportunityCount(enrichment.signals)} observed</strong></div>
            </div>

            <div className="signal-list">
              {enrichment.signals.map((signal) => (
                <div className={`signal-row ${signal.state}`} key={signal.key}>
                  <span className="signal-mark" />
                  <div><strong>{signal.label}</strong><small>{signal.evidence}</small></div>
                </div>
              ))}
            </div>
            <p className="provenance">Source: {enrichment.sourceUrl} · observed {new Date(enrichment.observedAt).toLocaleDateString()}</p>
          </section>
        )}

        {error && <div className="alert error" role="alert">{error}</div>}
      </div>

      <div className="inspector-foot">
        <p>{enrichment ? 'Only independently verified data will enter the ALYR pipeline.' : 'Verify the public website before creating an exportable lead.'}</p>
        <button className="button primary" disabled={!enrichment || saving} onClick={addToPipeline}>
          {saving ? 'Saving…' : 'Add verified lead'}
          <Icon name="arrow-right" size={18} />
        </button>
      </div>
    </aside>
  );
}
