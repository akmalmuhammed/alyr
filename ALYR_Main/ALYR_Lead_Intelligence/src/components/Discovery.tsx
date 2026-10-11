import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { CATEGORIES, LOCATIONS } from '../data';
import type { AppConfig, CampaignRecord, LeadRecord, PlaceSummary, SearchResponse } from '../types';
import { Icon } from './Icon';
import { LeadInspector } from './LeadInspector';

interface DiscoveryProps {
  config: AppConfig;
  leads: LeadRecord[];
  onCampaign: (campaign: CampaignRecord) => void;
  onLeadCreated: (lead: LeadRecord) => void;
}

export function Discovery({ config, leads, onCampaign, onLeadCreated }: DiscoveryProps) {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState(['Travel & Tourism']);
  const [locations, setLocations] = useState(['Doha']);
  const [results, setResults] = useState<PlaceSummary[]>([]);
  const [source, setSource] = useState(config.discoveryMode);
  const [queryCount, setQueryCount] = useState(0);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [selected, setSelected] = useState<PlaceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const initialised = useRef(false);

  useEffect(() => {
    if (config.discoveryMode !== 'demo' || initialised.current) return;
    initialised.current = true;
    api.search({ query: '', category: 'Travel & Tourism', location: 'Doha' })
      .then((response) => {
        setResults(response.results);
        setSource(response.source);
        setQueryCount(response.queryCount);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [config.discoveryMode]);

  const plannedQueries = mode === 'single' ? 1 : categories.length * locations.length;
  const categoryLabel = mode === 'single' ? categories[0] : categories.join(' + ');
  const locationLabel = mode === 'single' ? locations[0] : locations.join(' + ');

  function toggleCategory(category: string) {
    if (mode === 'single') {
      setCategories([category]);
      return;
    }
    const next = categories.includes(category) ? categories.filter((item) => item !== category) : [...categories, category];
    if (next.length === 0 || next.length > 4 || next.length * locations.length > config.batchQueryLimit) return;
    setCategories(next);
  }

  function toggleLocation(location: string) {
    if (mode === 'single') {
      setLocations([location]);
      return;
    }
    const next = locations.includes(location) ? locations.filter((item) => item !== location) : [...locations, location];
    if (next.length === 0 || next.length > 3 || next.length * categories.length > config.batchQueryLimit) return;
    setLocations(next);
  }

  function changeMode(nextMode: 'single' | 'batch') {
    setMode(nextMode);
    if (nextMode === 'single') {
      setCategories([categories[0]]);
      setLocations([locations[0]]);
    }
  }

  async function runSearch() {
    setLoading(true);
    setError('');
    setSelected(null);
    try {
      const response = mode === 'single'
        ? await api.search({ query, category: categories[0], location: locations[0] })
        : await api.batchSearch({ query, categories, locations });
      applyResponse(response);
      onCampaign({
        id: crypto.randomUUID(),
        mode,
        query,
        categories,
        locations,
        queryCount: response.queryCount,
        resultCount: response.results.length,
        source: response.source,
        createdAt: new Date().toISOString(),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Discovery failed.');
    } finally {
      setLoading(false);
    }
  }

  function applyResponse(response: SearchResponse) {
    setResults(response.results);
    setSource(response.source);
    setQueryCount(response.queryCount);
    setNextPageToken(response.nextPageToken);
  }

  async function loadMore() {
    if (!nextPageToken || mode !== 'single') return;
    setLoadingMore(true);
    setError('');
    try {
      const response = await api.search({ query, category: categories[0], location: locations[0], pageToken: nextPageToken });
      setResults((current) => {
        const dedupe = new Map(current.map((place) => [place.placeId, place]));
        response.results.forEach((place) => dedupe.set(place.placeId, place));
        return [...dedupe.values()];
      });
      setNextPageToken(response.nextPageToken);
      setQueryCount((count) => count + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The next result page could not be loaded.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <main className="page discovery-page" id="main-content">
        <section className="discovery-hero">
          <div className="hero-copy">
            <span className="eyebrow">ALYR / GROWTH INTELLIGENCE / 01</span>
            <h1>Find businesses whose operations are ready to change.</h1>
            <p>Discover by market and location. Verify contacts from the business’s own website. Turn evidence into a prioritized transformation pipeline.</p>
          </div>
          <div className="hero-command-mark" aria-hidden="true">
            <span>DISCOVER</span><span>VERIFY</span><span>PRIORITIZE</span>
          </div>
        </section>

        <section className="search-console" aria-labelledby="search-heading">
          <div className="console-title">
            <div>
              <span className="section-number">01</span>
              <div><h2 id="search-heading">Define the market</h2><p>One precise search or a controlled multi-market batch.</p></div>
            </div>
            <div className="segmented" aria-label="Search mode">
              <button className={mode === 'single' ? 'is-active' : ''} onClick={() => changeMode('single')}>Single</button>
              <button className={mode === 'batch' ? 'is-active' : ''} onClick={() => changeMode('batch')}>Batch</button>
            </div>
          </div>

          <div className="console-grid">
            <div className="query-column">
              <label className="field-label" htmlFor="search-intent">Search intent <span>OPTIONAL</span></label>
              <div className="search-input">
                <Icon name="search" size={20} />
                <input
                  id="search-intent"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="e.g. family-owned, booking, document services"
                />
              </div>
              <div className="query-explainer">
                <strong>{mode === 'batch' ? `${plannedQueries} live searches` : '1 live search'}</strong>
                <span>{mode === 'batch' ? 'Controlled query matrix · no auto-pagination' : 'Up to 20 results per page'}</span>
              </div>
              <button className="button primary run-search" disabled={loading || plannedQueries > config.batchQueryLimit} onClick={runSearch}>
                {loading ? 'Running discovery…' : mode === 'batch' ? `Run ${plannedQueries} searches` : 'Run discovery'}
                <Icon name="arrow-right" size={19} />
              </button>
            </div>

            <fieldset className="filter-column">
              <legend>Business categories <span>{mode === 'batch' ? 'SELECT UP TO 4' : 'SELECT 1'}</span></legend>
              <div className="chip-field">
                {CATEGORIES.map((category) => (
                  <button
                    type="button"
                    key={category}
                    className={`filter-chip ${categories.includes(category) ? 'is-selected' : ''}`}
                    aria-pressed={categories.includes(category)}
                    onClick={() => toggleCategory(category)}
                  >
                    <span className="chip-check">{categories.includes(category) ? '✓' : '+'}</span>{category}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="filter-column location-column">
              <legend>Locations <span>{mode === 'batch' ? 'SELECT UP TO 3' : 'SELECT 1'}</span></legend>
              <div className="location-list">
                {LOCATIONS.map((location) => (
                  <button
                    type="button"
                    key={location}
                    className={locations.includes(location) ? 'is-selected' : ''}
                    aria-pressed={locations.includes(location)}
                    onClick={() => toggleLocation(location)}
                  >
                    <span>{location}</span><small>{locations.includes(location) ? 'IN SCOPE' : 'ADD'}</small>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </section>

        <section className="metric-rail" aria-label="Discovery metrics">
          <div><span>LIVE RESULTS</span><strong>{String(results.length).padStart(2, '0')}</strong><small>Current session only</small></div>
          <div><span>QUERY COUNT</span><strong>{String(queryCount).padStart(2, '0')}</strong><small>Cost control visible</small></div>
          <div><span>VERIFIED LEADS</span><strong>{String(leads.length).padStart(2, '0')}</strong><small>Exportable records</small></div>
          <div className="metric-source"><span>DISCOVERY MODE</span><strong>{source.toUpperCase()}</strong><small>{source === 'google' ? 'Live content boundary' : 'Fictional examples'}</small></div>
        </section>

        <section className="results-section" aria-labelledby="results-heading">
          <div className="results-head">
            <div>
              <span className="section-number">02</span>
              <div><h2 id="results-heading">Live discovery results</h2><p>Select a business to retrieve contact details and verify its public website.</p></div>
            </div>
            <div className={`source-label ${source}`}>
              {source === 'google' ? <span className="gmp-attribution" translate="no">Google Maps</span> : 'FICTIONAL DEMO DATA'}
            </div>
          </div>

          {error && <div className="alert error" role="alert">{error}</div>}
          {results.length === 0 && !loading ? (
            <div className="empty-state">
              <img src="/brand/alyr-symbol-reversed.png" alt="" />
              <div><h3>Define a market, then run discovery.</h3><p>Live Google content is never silently prefetched or stored. Every search is intentional and visible.</p></div>
            </div>
          ) : (
            <div className={`result-boundary ${source}`}>
              <div className="result-table-head" aria-hidden="true">
                <span>BUSINESS</span><span>LIVE LOCATION</span><span>GOOGLE TYPE</span><span>ACTION</span>
              </div>
              <div className="result-list">
                {results.map((place, index) => (
                  <button className="result-row" key={place.placeId} onClick={() => setSelected(place)}>
                    <span className="result-index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="business-cell"><strong>{place.name}</strong><small>{place.businessStatus.replaceAll('_', ' ')}</small></span>
                    <span className="address-cell">{place.address || 'Address not returned'}</span>
                    <span className="type-cell">{place.typeLabel}</span>
                    <span className="inspect-cell">Inspect <Icon name="arrow-right" size={17} /></span>
                  </button>
                ))}
              </div>
              <div className="results-foot">
                <p>{source === 'google' ? <>Results are supplied live by <span className="gmp-attribution" translate="no">Google Maps</span> and ranked primarily by relevance, distance and prominence.</> : 'Demo names and data are fictional and exist only to demonstrate the workflow.'}</p>
                {nextPageToken && <button className="button outline compact" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : 'Load next page'}</button>}
              </div>
            </div>
          )}
        </section>
      </main>

      <LeadInspector
        place={selected}
        campaignCategory={categoryLabel}
        campaignLocation={locationLabel}
        onClose={() => setSelected(null)}
        onCreated={onLeadCreated}
      />
    </>
  );
}
