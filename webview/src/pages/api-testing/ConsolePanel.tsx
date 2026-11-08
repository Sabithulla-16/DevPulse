import React, { useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Terminal,
  AlertCircle,
  Info
} from 'lucide-react';

export interface ConsoleLogItem {
  id: string;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

interface ConsolePanelProps {
  logs: ConsoleLogItem[];
  onClear: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const ConsolePanel: React.FC<ConsolePanelProps> = ({
  logs,
  onClear,
  isOpen,
  onToggle
}) => {
  const [filter, setFilter] = useState<'all' | 'log' | 'warn' | 'error'>('all');

  const filteredLogs = logs.filter(l => filter === 'all' || l.level === filter);

  return (
    <div className={`studio-console-panel ${isOpen ? 'is-open' : 'is-collapsed'}`}>
      <div className="console-header" onClick={onToggle}>
        <div className="console-header-left">
          <Terminal size={14} />
          <span className="console-title">Console &amp; Script Logs</span>
          <span className="console-count">({logs.length})</span>
          {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>

        {isOpen && (
          <div className="console-header-right" onClick={e => e.stopPropagation()}>
            <div className="filter-group">
              <button
                type="button"
                className={`filter-btn ${filter === 'all' ? 'is-active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`filter-btn ${filter === 'log' ? 'is-active' : ''}`}
                onClick={() => setFilter('log')}
              >
                Logs
              </button>
              <button
                type="button"
                className={`filter-btn ${filter === 'warn' ? 'is-active' : ''}`}
                onClick={() => setFilter('warn')}
              >
                Warn
              </button>
              <button
                type="button"
                className={`filter-btn ${filter === 'error' ? 'is-active' : ''}`}
                onClick={() => setFilter('error')}
              >
                Errors
              </button>
            </div>

            <button type="button" className="console-clear-btn" onClick={onClear} title="Clear Console">
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="console-body">
          {filteredLogs.length === 0 ? (
            <div className="console-empty">Console is clear. User script logs and execution details will appear here.</div>
          ) : (
            <div className="console-log-list">
              {filteredLogs.map(log => (
                <div key={log.id} className={`log-row log-${log.level}`}>
                  <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className={`log-level-badge level-${log.level}`}>{log.level.toUpperCase()}</span>
                  <span className="log-msg">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
