import React from 'react';
import { Folder, RefreshCw, Sun, Moon, Pause, Play, Settings as SettingsIcon } from 'lucide-react';
import { DevPulseLogo } from './DevPulseLogo';
import { refreshMetrics, toggleMonitoring } from '../services/vscode';

interface HeaderProps {
  workspaceName?: string;
  isMonitoring: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  workspaceName,
  isMonitoring,
  theme,
  onToggleTheme,
  onOpenSettings,
  isRefreshing = false
}) => {
  return (
    <header className="header-container">
      <div className="header-left">
        <div className="brand-badge">
          <div className="brand-icon">
            <DevPulseLogo size={20} color="#22c55e" />
          </div>
          <div className="brand-text">
            <span className="brand-title">DevPulse</span>
            <span className="brand-subtitle">OBSERVABILITY</span>
          </div>
        </div>

        <div className="workspace-chip" title="Current Workspace Folder">
          <Folder size={14} />
          <span className="workspace-name">{workspaceName || 'No workspace open'}</span>
        </div>
      </div>

      <div className="header-right">
        <div
          className={`monitoring-pill ${isMonitoring ? 'is-active' : 'is-paused'}`}
          title={isMonitoring ? 'Metrics are actively being collected' : 'Metrics collection is paused'}
        >
          <span className="status-dot" />
          <span className="status-text">{isMonitoring ? 'Live Monitoring' : 'Paused'}</span>
        </div>

        <button
          type="button"
          className={`icon-btn ${isRefreshing ? 'is-spinning' : ''}`}
          onClick={refreshMetrics}
          title="Refresh metrics now"
        >
          <RefreshCw size={15} />
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} theme`}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={onOpenSettings}
          title="Open DevPulse Settings"
        >
          <SettingsIcon size={15} />
        </button>

        <button
          type="button"
          className={`action-btn ${isMonitoring ? 'btn-pause' : 'btn-resume'}`}
          onClick={() => toggleMonitoring(isMonitoring)}
        >
          {isMonitoring ? (
            <>
              <Pause size={14} /> <span>Pause</span>
            </>
          ) : (
            <>
              <Play size={14} /> <span>Resume</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};

