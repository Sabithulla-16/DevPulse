import React, { useState, useMemo } from 'react';
import {
  Clock3,
  Play,
  Pause,
  Layers,
  Code2,
  FolderKanban,
  Flame,
  Search,
  ArrowUpDown,
  Trash2,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { MetricCard } from '../components/MetricCard';
import { formatDuration, formatTimestamp, formatNumber } from '../utils/formatters';
import type {
  CodingIntelligenceData,
  CodingSessionItem,
  CodingLanguageStat,
  CodingProjectStat,
  CodingStatusEvent
} from '../types';
import {
  requestCodingData,
  pauseCodingTracking,
  resumeCodingTracking,
  clearCodingData
} from '../services/vscode';

interface CodingIntelligencePageProps {
  data: CodingIntelligenceData | null;
  onRefresh: () => void;
}

const LANGUAGE_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#e11d48'  // rose
];

export const CodingIntelligencePage: React.FC<CodingIntelligencePageProps> = ({ data, onRefresh }) => {
  const [timeFilter, setTimeFilter] = useState<'today' | '7d' | '30d' | 'all'>('7d');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'startedAt' | 'activeDurationSeconds' | 'workspaceName'>('startedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedSession, setSelectedSession] = useState<CodingSessionItem | null>(null);

  const summary = data?.summary || {
    totalActiveSeconds: 0,
    totalIdleSeconds: 0,
    totalSessions: 0,
    avgSessionSeconds: 0,
    activeProjectsCount: 0,
    languagesCount: 0,
    weeklyActiveSeconds: 0
  };

  const live: CodingStatusEvent = data?.liveStatus || {
    status: 'stopped',
    currentSessionSeconds: 0,
    activeDurationSeconds: 0
  };

  const handleFilterChange = (filter: 'today' | '7d' | '30d' | 'all') => {
    setTimeFilter(filter);
    requestCodingData(filter);
  };

  // Filter & sort recent sessions
  const filteredSessions = useMemo(() => {
    if (!data?.recentSessions) return [];
    return data.recentSessions
      .filter(s => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          s.workspaceName.toLowerCase().includes(q) ||
          s.primaryLanguage.toLowerCase().includes(q) ||
          s.status.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        let valA: any = a[sortField];
        let valB: any = b[sortField];
        if (typeof valA === 'string') {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [data?.recentSessions, searchQuery, sortField, sortOrder]);

  const toggleSort = (field: 'startedAt' | 'activeDurationSeconds' | 'workspaceName') => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Hourly activity data formatted for Recharts
  const hourlyChartData = useMemo(() => {
    if (!data?.hourlyActivity) return [];
    return data.hourlyActivity.map(h => ({
      hour: h.hour,
      activeMinutes: Math.round(h.activeSeconds / 60),
      idleMinutes: Math.round(h.idleSeconds / 60)
    }));
  }, [data?.hourlyActivity]);

  // Language chart data
  const languagePieData = useMemo(() => {
    if (!data?.languages) return [];
    return data.languages.slice(0, 6).map((lang, idx) => ({
      name: lang.displayName,
      value: lang.activeSeconds,
      percentage: lang.percentage,
      color: LANGUAGE_COLORS[idx % LANGUAGE_COLORS.length]
    }));
  }, [data?.languages]);

  return (
    <div className="page-container coding-intelligence-page">
      {/* Live Status Banner */}
      <div className="live-status-banner">
        <div className="live-status-left">
          <div className="live-pulse-indicator">
            <span
              className={`live-pulse-dot ${
                live.status === 'active'
                  ? 'is-active'
                  : live.status === 'idle'
                  ? 'is-idle'
                  : live.status === 'paused'
                  ? 'is-paused'
                  : 'is-stopped'
              }`}
            />
            <span className="live-status-label">
              {live.status === 'active'
                ? 'Actively Coding'
                : live.status === 'idle'
                ? 'Idle / Inactive'
                : live.status === 'paused'
                ? 'Tracking Paused'
                : 'Tracking Inactive'}
            </span>
          </div>

          {live.activeProject && (
            <div className="live-meta-pill">
              <FolderKanban size={14} />
              <span>Project: <strong>{live.activeProject}</strong></span>
            </div>
          )}

          {live.activeLanguage && (
            <div className="live-meta-pill">
              <Code2 size={14} />
              <span>Language: <strong>{live.activeLanguage}</strong></span>
            </div>
          )}

          {live.currentSessionSeconds > 0 && (
            <div className="live-meta-pill">
              <Clock3 size={14} />
              <span>Session: <strong>{formatDuration(live.currentSessionSeconds)}</strong></span>
            </div>
          )}
        </div>

        <div className="live-status-actions">
          <button
            type="button"
            className="action-button-secondary"
            onClick={onRefresh}
            title="Refresh coding intelligence metrics"
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>

          {live.status === 'paused' ? (
            <button
              type="button"
              className="action-button-success"
              onClick={resumeCodingTracking}
              title="Resume coding activity tracking"
            >
              <Play size={14} />
              <span>Resume Tracking</span>
            </button>
          ) : (
            <button
              type="button"
              className="action-button-warning"
              onClick={pauseCodingTracking}
              title="Pause coding tracking temporarily"
            >
              <Pause size={14} />
              <span>Pause Tracking</span>
            </button>
          )}

          <button
            type="button"
            className="action-button-destructive"
            onClick={clearCodingData}
            title="Clear all recorded sessions from local SQLite"
          >
            <Trash2 size={14} />
            <span>Clear History</span>
          </button>
        </div>
      </div>

      {/* Time Range Filter Bar */}
      <div className="filter-bar">
        <div className="filter-group">
          {(['today', '7d', '30d', 'all'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              className={`filter-tab ${timeFilter === tab ? 'is-active' : ''}`}
              onClick={() => handleFilterChange(tab)}
            >
              {tab === 'today'
                ? 'Today'
                : tab === '7d'
                ? 'Last 7 Days'
                : tab === '30d'
                ? 'Last 30 Days'
                : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* 6 Metric Cards */}
      <div className="metric-cards-grid-6">
        <MetricCard
          label="Active Coding Time"
          value={formatDuration(summary.totalActiveSeconds)}
          detail={timeFilter === 'today' ? 'Focus time today' : 'Total focused coding duration'}
          icon={<Clock3 size={18} style={{ color: '#10b981' }} />}
          variant="accent"
        />
        <MetricCard
          label="Total Sessions"
          value={formatNumber(summary.totalSessions)}
          detail={`${summary.activeProjectsCount} active workspace${summary.activeProjectsCount === 1 ? '' : 's'}`}
          icon={<Layers size={18} style={{ color: '#38bdf8' }} />}
        />
        <MetricCard
          label="Avg Session Duration"
          value={formatDuration(summary.avgSessionSeconds)}
          detail="Mean active focus interval"
          icon={<Flame size={18} style={{ color: '#f97316' }} />}
        />
        <MetricCard
          label="Active Projects"
          value={formatNumber(summary.activeProjectsCount)}
          detail="Monitored workspaces"
          icon={<FolderKanban size={18} style={{ color: '#eab308' }} />}
        />
        <MetricCard
          label="Languages Used"
          value={formatNumber(summary.languagesCount)}
          detail="Distinct technologies detected"
          icon={<Code2 size={18} style={{ color: '#a855f7' }} />}
        />
        <MetricCard
          label="Weekly Velocity"
          value={formatDuration(summary.weeklyActiveSeconds)}
          detail="Last 7 calendar days"
          icon={<Sparkles size={18} style={{ color: '#06b6d4' }} />}
          variant="info"
        />
      </div>

      {/* Charts Section: Hourly Activity & Language Distribution */}
      <div className="charts-split-grid">
        {/* Hourly Focus Breakdown */}
        <div className="panel-card chart-panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Hourly Activity Breakdown</h3>
              <p className="panel-subtitle">Active vs idle focus time across the 24-hour day (minutes)</p>
            </div>
            <Clock3 size={18} className="panel-icon-dim" />
          </div>

          <div className="chart-wrapper" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="hour" stroke="#888888" fontSize={11} tickLine={false} />
                <YAxis stroke="#888888" fontSize={11} tickLine={false} unit="m" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-card)',
                    borderColor: 'var(--color-border)',
                    borderRadius: 6,
                    fontSize: 12,
                    color: 'var(--color-foreground)'
                  }}
                  itemStyle={{ color: 'var(--color-foreground)' }}
                  formatter={(value: any, name: any) => [
                    `${value} min`,
                    name === 'activeMinutes' ? 'Active Coding' : 'Idle Time'
                  ]}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={28}
                  formatter={value => (value === 'activeMinutes' ? 'Active Coding' : 'Idle Time')}
                />
                <Bar dataKey="activeMinutes" fill="#3b82f6" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="idleMinutes" fill="#64748b" stackId="a" radius={[3, 3, 0, 0]} opacity={0.4} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Language Breakdown */}
        <div className="panel-card chart-panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Language Distribution</h3>
              <p className="panel-subtitle">Share of active coding time by programming language</p>
            </div>
            <Code2 size={18} className="panel-icon-dim" />
          </div>

          <div className="language-split-content">
            <div className="chart-wrapper" style={{ height: 200, flex: '1 1 200px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={languagePieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {languagePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-card)',
                      borderColor: 'var(--color-border)',
                      borderRadius: 6,
                      fontSize: 12,
                      color: 'var(--color-foreground)'
                    }}
                    itemStyle={{ color: 'var(--color-foreground)' }}
                    formatter={(val: any, name: any) => [`${formatDuration(Number(val))}`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="language-legend-list">
              {data?.languages.slice(0, 6).map((lang, idx) => (
                <div key={lang.languageId} className="language-legend-row">
                  <span
                    className="lang-color-dot"
                    style={{ backgroundColor: LANGUAGE_COLORS[idx % LANGUAGE_COLORS.length] }}
                  />
                  <span className="lang-name">{lang.displayName}</span>
                  <span className="lang-pct">{lang.percentage}%</span>
                  <span className="lang-time">{formatDuration(lang.activeSeconds)}</span>
                </div>
              ))}
              {(!data?.languages || data.languages.length === 0) && (
                <div className="empty-state-text">No language activity recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Project Analytics Ranking */}
      <div className="panel-card">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Project & Workspace Activity</h3>
            <p className="panel-subtitle">Active focus duration aggregated by repository and workspace root</p>
          </div>
          <FolderKanban size={18} className="panel-icon-dim" />
        </div>

        <div className="project-cards-grid">
          {data?.projects.map(proj => (
            <div key={proj.workspaceId} className="project-stat-card">
              <div className="project-stat-header">
                <span className="project-name">{proj.workspaceName}</span>
                <span className="project-primary-lang">{proj.primaryLanguage}</span>
              </div>
              <div className="project-stat-duration">{formatDuration(proj.activeSeconds)}</div>
              <div className="project-stat-footer">
                <span>{proj.sessionCount} session{proj.sessionCount === 1 ? '' : 's'}</span>
                <span>Last active: {formatTimestamp(proj.lastActiveAt)}</span>
              </div>
            </div>
          ))}
          {(!data?.projects || data.projects.length === 0) && (
            <div className="empty-state-text">No project activity recorded yet. Start editing files to track sessions.</div>
          )}
        </div>
      </div>

      {/* Session History Table */}
      <div className="panel-card table-panel">
        <div className="table-controls-bar">
          <div className="table-title-area">
            <h3 className="panel-title">Session History</h3>
            <span className="records-count-pill">{filteredSessions.length} sessions</span>
          </div>

          <div className="table-search-box">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Search project, language, or status..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="table-search-input"
            />
          </div>
        </div>

        <div className="table-wrapper">
          <table className="devpulse-table">
            <thead>
              <tr>
                <th onClick={() => toggleSort('workspaceName')} className="is-sortable">
                  <div className="th-content">
                    Project {sortField === 'workspaceName' && <ArrowUpDown size={12} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('startedAt')} className="is-sortable">
                  <div className="th-content">
                    Start Time {sortField === 'startedAt' && <ArrowUpDown size={12} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('activeDurationSeconds')} className="is-sortable">
                  <div className="th-content">
                    Active Time {sortField === 'activeDurationSeconds' && <ArrowUpDown size={12} />}
                  </div>
                </th>
                <th>Idle Time</th>
                <th>Primary Language</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map(session => (
                <tr
                  key={session.id}
                  className="table-row-hover"
                  onClick={() => setSelectedSession(session)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <span className="table-project-name">{session.workspaceName}</span>
                  </td>
                  <td>
                    <span className="table-timestamp">{formatTimestamp(session.startedAt)}</span>
                  </td>
                  <td>
                    <span className="table-active-duration">{formatDuration(session.activeDurationSeconds)}</span>
                  </td>
                  <td>
                    <span className="table-idle-duration">{formatDuration(session.idleDurationSeconds)}</span>
                  </td>
                  <td>
                    <span className="language-badge">{session.primaryLanguage}</span>
                  </td>
                  <td>
                    <span
                      className={`status-pill ${
                        session.status === 'active'
                          ? 'status-live'
                          : session.status === 'idle'
                          ? 'status-idle'
                          : session.status === 'paused'
                          ? 'status-paused'
                          : 'status-ended'
                      }`}
                    >
                      {session.status}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="inspect-session-button"
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedSession(session);
                      }}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
              {filteredSessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-empty-row">
                    No matching coding sessions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Session Details Modal */}
      {selectedSession && (
        <div className="modal-backdrop" onClick={() => setSelectedSession(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Session Details</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedSession(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-info-grid">
                <div className="info-cell">
                  <span className="info-label">Project:</span>
                  <span className="info-val">{selectedSession.workspaceName}</span>
                </div>
                <div className="info-cell">
                  <span className="info-label">Started:</span>
                  <span className="info-val">{formatTimestamp(selectedSession.startedAt)}</span>
                </div>
                <div className="info-cell">
                  <span className="info-label">Last Activity:</span>
                  <span className="info-val">{formatTimestamp(selectedSession.lastActivityAt)}</span>
                </div>
                <div className="info-cell">
                  <span className="info-label">Status:</span>
                  <span className="info-val">{selectedSession.status}</span>
                </div>
                <div className="info-cell">
                  <span className="info-label">Active Focus:</span>
                  <span className="info-val active-highlight">
                    {formatDuration(selectedSession.activeDurationSeconds)}
                  </span>
                </div>
                <div className="info-cell">
                  <span className="info-label">Idle Time:</span>
                  <span className="info-val">{formatDuration(selectedSession.idleDurationSeconds)}</span>
                </div>
              </div>

              <div className="modal-section-title">Languages in Session</div>
              <div className="session-lang-list">
                {Object.entries(selectedSession.languages || {}).map(([lang, sec]) => (
                  <div key={lang} className="session-lang-item">
                    <span className="session-lang-name">{lang}</span>
                    <span className="session-lang-time">{formatDuration(sec)}</span>
                  </div>
                ))}
                {Object.keys(selectedSession.languages || {}).length === 0 && (
                  <div className="empty-state-text">Single language session ({selectedSession.primaryLanguage})</div>
                )}
              </div>

              <div className="modal-footer-btn-row">
                <button
                  type="button"
                  className="action-button-accent"
                  onClick={() => setSelectedSession(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
