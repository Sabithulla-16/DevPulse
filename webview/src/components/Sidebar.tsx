import React from 'react';
import {
  Activity,
  BrainCircuit,
  Compass,
  FolderTree,
  Cpu,
  GitBranch,
  Clock3,
  Network,
  FlaskConical,
  Bell,
  Settings,
  ShieldCheck
} from 'lucide-react';
import type { CollectorStatus } from '../types';
import { NAVIGATION_REGISTRY, CATEGORY_ORDER, type NavigationCategory } from '../navigation';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  'Overview': Activity,
  'Pulse Insights': Compass,
  'Git Intelligence': GitBranch,
  'System Intelligence': Cpu,
  'AI Playground': BrainCircuit,
  'Coding Intelligence': Clock3,
  'API Intelligence': Network,
  'API Testing Studio': FlaskConical,
  'File Intelligence': FolderTree,
  'Alerts': Bell,
  'Settings': Settings
};

const COLOR_MAP: Record<string, string> = {
  'Overview': '#38bdf8',
  'Pulse Insights': '#38bdf8',
  'Git Intelligence': '#fb923c',
  'System Intelligence': '#60a5fa',
  'AI Playground': '#c084fc',
  'Coding Intelligence': '#34d399',
  'API Intelligence': '#22d3ee',
  'API Testing Studio': '#38bdf8',
  'File Intelligence': '#facc15',
  'Alerts': '#f87171',
  'Settings': '#94a3b8'
};

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  collectors?: CollectorStatus[];
  alertCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  collectors = [],
  alertCount = 0
}) => {
  return (
    <aside className="sidebar-container custom-scrollbar">
      <nav className="sidebar-nav">
        {CATEGORY_ORDER.map(category => {
          const categoryItems = NAVIGATION_REGISTRY.filter(item => item.category === category);
          if (categoryItems.length === 0) return null;

          return (
            <div key={category} className="sidebar-category-group" style={{ marginBottom: 12 }}>
              <div
                className="sidebar-section-title"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted, #64748b)',
                  padding: '4px 12px 6px 12px',
                  textTransform: 'uppercase'
                }}
              >
                {category}
              </div>

              {categoryItems.map(item => {
                const Icon = ICON_MAP[item.id] || Activity;
                const isActive = activeTab === item.id || (item.id === 'Settings' && (activeTab === 'Settings' || activeTab === 'Privacy & Settings'));
                const collector = item.collectorId ? collectors.find(c => c.id === item.collectorId) : undefined;
                const isLive = collector?.implemented && collector.state === 'running';
                const color = COLOR_MAP[item.id] || '#38bdf8';

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`nav-button ${isActive ? 'is-active' : ''}`}
                    onClick={() => onSelectTab(item.id)}
                  >
                    <div className="nav-icon-wrap">
                      <Icon size={16} style={{ color: isActive ? color : undefined }} />
                    </div>
                    <span className="nav-label">{item.label}</span>

                    {item.id === 'Alerts' && alertCount > 0 && (
                      <span className="nav-alert-badge">{alertCount}</span>
                    )}

                    {item.collectorId && (
                      <span
                        className={`module-indicator ${isLive ? 'is-live' : 'is-preview'}`}
                        title={isLive ? 'Collector active' : 'Collector paused / idle'}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="privacy-badge">
          <ShieldCheck size={16} className="privacy-icon" />
          <div className="privacy-text">
            <strong>Local-First Telemetry</strong>
            <span>Zero cloud uploads · 100% on-device</span>
          </div>
        </div>
        <div className="sidebar-version-tag">DEVPULSE v1.0.0 · RELEASE</div>
      </div>
    </aside>
  );
};
