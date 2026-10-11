import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { AppConfig, CampaignRecord, CommandDashboard, LeadRecord, LeadStatus, ViewKey } from './types';
import { Campaigns } from './components/Campaigns';
import { CommandCenter } from './components/CommandCenter';
import { Delivery } from './components/Delivery';
import { Discovery } from './components/Discovery';
import { HermesQueue } from './components/HermesQueue';
import { Icon } from './components/Icon';
import { Intelligence } from './components/Intelligence';
import { Pipeline } from './components/Pipeline';
import { Policy } from './components/Policy';
import { QatarScan } from './components/QatarScan';
import { SideNav, TopBar } from './components/Shell';

const CAMPAIGN_STORAGE_KEY = 'alyr-prospect-campaigns-v1';

function readCampaigns(): CampaignRecord[] {
  try {
    const value = localStorage.getItem(CAMPAIGN_STORAGE_KEY);
    return value ? JSON.parse(value) as CampaignRecord[] : [];
  } catch {
    return [];
  }
}

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [dashboard, setDashboard] = useState<CommandDashboard | null>(null);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>(readCampaigns);
  const [activeView, setActiveView] = useState<ViewKey>('command');
  const [focusedProspectId, setFocusedProspectId] = useState('');
  const [focusedCategory, setFocusedCategory] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    Promise.all([api.config(), api.listLeads(), api.commandDashboard()])
      .then(([nextConfig, nextLeads, nextDashboard]) => {
        setConfig(nextConfig);
        setLeads(nextLeads);
        setDashboard(nextDashboard);
      })
      .catch((reason: Error) => setFatalError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(campaigns.slice(0, 40)));
  }, [campaigns]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refreshDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      const nextDashboard = await api.commandDashboard();
      setDashboard(nextDashboard);
      setLeads(nextDashboard.pipelineLeads);
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : 'The operating picture could not be refreshed.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const consumeFocusedProspect = useCallback(() => setFocusedProspectId(''), []);
  const consumeFocusedCategory = useCallback(() => setFocusedCategory(''), []);

  function navigate(view: ViewKey) {
    setActiveView(view);
    if (view === 'command' || view === 'delivery') void refreshDashboard();
  }

  function addCampaign(campaign: CampaignRecord) {
    setCampaigns((current) => [campaign, ...current].slice(0, 40));
  }

  function addLead(lead: LeadRecord) {
    setLeads((current) => current.some((item) => item.id === lead.id)
      ? current.map((item) => item.id === lead.id ? lead : item)
      : [lead, ...current]);
    setToast(`${lead.verifiedName} saved to the verified pipeline.`);
    void refreshDashboard();
  }

  async function updateStatus(id: string, status: LeadStatus) {
    try {
      const updated = await api.setStatus(id, status);
      setLeads((current) => current.map((lead) => lead.id === id ? updated : lead));
      setToast(`Pipeline stage changed to ${status.replace('-', ' ')}.`);
      void refreshDashboard();
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : 'Status update failed.');
    }
  }

  async function removeLead(id: string) {
    try {
      await api.deleteLead(id);
      setLeads((current) => current.filter((lead) => lead.id !== id));
      setToast('Lead removed from the pipeline.');
      void refreshDashboard();
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : 'Lead removal failed.');
    }
  }

  if (loading) {
    return (
      <div className="boot-screen">
        <img src="/alyr/logos/master-svg/primary-horizontal-reversed.svg" alt="ALYR" />
        <div className="boot-rail"><span /></div>
        <p>Resolving the operating picture…</p>
      </div>
    );
  }

  if (!config || !dashboard || fatalError) {
    return (
      <div className="fatal-screen">
        <img src="/alyr/logos/master-svg/primary-horizontal-reversed.svg" alt="ALYR" />
        <span>SYSTEM UNAVAILABLE</span>
        <h1>The Growth OS API is not responding.</h1>
        <p>{fatalError || 'Start the API service, then reload this page.'}</p>
        <button className="button primary" onClick={() => window.location.reload()}>Retry connection <Icon name="arrow-right" size={18} /></button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <SideNav active={activeView} config={config} open={navOpen} onClose={() => setNavOpen(false)} onNavigate={navigate} />
      <div className="work-area">
        <TopBar
          active={activeView}
          config={config}
          leadCount={leads.length}
          onMenu={() => setNavOpen(true)}
          onPrimaryAction={() => navigate(
            activeView === 'delivery'
              ? 'pipeline'
              : activeView === 'market' || activeView === 'campaigns' || activeView === 'policy'
                ? 'discover'
                : 'market',
          )}
        />
        {activeView === 'command' && (
          <CommandCenter
            dashboard={dashboard}
            refreshing={refreshing}
            onRefresh={() => void refreshDashboard()}
            onNavigate={navigate}
            onOpenProspect={(id) => {
              setFocusedProspectId(id);
              setActiveView('market');
            }}
            onOpenCategory={(category) => {
              setFocusedCategory(category);
              setActiveView('market');
            }}
          />
        )}
        {activeView === 'discover' && <Discovery config={config} leads={leads} onCampaign={addCampaign} onLeadCreated={addLead} />}
        {activeView === 'market' && <QatarScan focusProspectId={focusedProspectId || undefined} onFocusConsumed={consumeFocusedProspect} focusCategory={focusedCategory || undefined} onCategoryConsumed={consumeFocusedCategory} onNotice={setToast} onOpenHermes={() => navigate('hermes')} />}
        {activeView === 'pipeline' && <Pipeline leads={leads} onDelete={removeLead} onDiscover={() => navigate('discover')} onStatus={updateStatus} />}
        {activeView === 'intelligence' && <Intelligence leads={leads} />}
        {activeView === 'delivery' && <Delivery dashboard={dashboard} refreshing={refreshing} onRefresh={() => void refreshDashboard()} onOpenPipeline={() => navigate('pipeline')} />}
        {activeView === 'hermes' && <HermesQueue config={config} onNotice={setToast} onOpenMarket={() => navigate('market')} />}
        {activeView === 'campaigns' && <Campaigns campaigns={campaigns} onDiscover={() => navigate('discover')} />}
        {activeView === 'policy' && <Policy config={config} />}
      </div>
      {toast && <div className="toast" role="status"><span className="toast-mark" /><p>{toast}</p></div>}
    </div>
  );
}
