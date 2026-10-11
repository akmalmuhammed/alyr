import { NAV_GROUPS, VIEW_TITLES } from '../data';
import type { AppConfig, ViewKey } from '../types';
import { Icon } from './Icon';

interface SideNavProps {
  active: ViewKey;
  config: AppConfig;
  open: boolean;
  onClose: () => void;
  onNavigate: (view: ViewKey) => void;
}

export function SideNav({ active, config, open, onClose, onNavigate }: SideNavProps) {
  return (
    <>
      <button className={`nav-scrim ${open ? 'is-open' : ''}`} aria-label="Close navigation" onClick={onClose} />
      <aside className={`side-nav ${open ? 'is-open' : ''}`} aria-label="Primary navigation">
        <div className="brand-lockup">
          <img src="/alyr/logos/master-svg/primary-horizontal-reversed.svg" alt="ALYR" />
          <span>GROWTH OS / 01</span>
        </div>

        <nav className="nav-list">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.items.map((item, itemIndex) => (
                <button
                  key={item.key}
                  className={`nav-item ${active === item.key ? 'is-active' : ''}`}
                  onClick={() => {
                    onNavigate(item.key);
                    onClose();
                  }}
                  aria-current={active === item.key ? 'page' : undefined}
                >
                  <span className="nav-index">{String(groupIndex * 3 + itemIndex + 1).padStart(2, '0')}</span>
                  <Icon name={item.icon} size={18} />
                  <span className="nav-copy">
                    <strong>{item.label}</strong>
                    <small>{item.note}</small>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="nav-system-status">
          <span className="status-light live" />
          <div>
            <strong>DATA SPINE ONLINE</strong>
            <small>{config.googleConfigured ? 'Open data + live Google search' : 'Open data + website evidence'}</small>
          </div>
        </div>

        <div className="nav-footer">
          <span>Transform the business.</span>
          <span>Not just the interface.</span>
        </div>
      </aside>
    </>
  );
}

interface TopBarProps {
  active: ViewKey;
  config: AppConfig;
  leadCount: number;
  onMenu: () => void;
  onPrimaryAction: () => void;
}

export function TopBar({ active, config, leadCount, onMenu, onPrimaryAction }: TopBarProps) {
  const copy = VIEW_TITLES[active];
  const localOperations = active === 'market' || active === 'hermes';
  const primary = active === 'market' || active === 'campaigns' || active === 'policy'
    ? { label: 'New search', icon: 'search' }
    : active === 'delivery'
      ? { label: 'Open pipeline', icon: 'workflow' }
      : { label: 'Open prospects', icon: 'data' };
  return (
    <header className="top-bar">
      <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={onMenu}>
        <Icon name="menu" />
      </button>
      <div className="page-identity">
        <span>{copy.eyebrow}</span>
        <strong>{copy.title}</strong>
      </div>
      <div className="top-actions">
        <div className="top-stat" aria-label={localOperations ? 'Local control active' : `${leadCount} verified leads`}>
          <span>{localOperations ? 'CONTROL' : 'VERIFIED'}</span>
          <strong>{localOperations ? 'ON' : String(leadCount).padStart(2, '0')}</strong>
        </div>
        <div className="top-stat api-mode">
          <span>SOURCE</span>
          <strong>{localOperations ? 'LOCAL' : config.discoveryMode.toUpperCase()}</strong>
        </div>
        <button className="button primary compact" onClick={onPrimaryAction}>
          <Icon name={primary.icon} size={17} />
          {primary.label}
        </button>
      </div>
    </header>
  );
}
