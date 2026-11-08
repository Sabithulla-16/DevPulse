import React, { useMemo } from 'react';
import {
  BrainCircuit,
  FolderTree,
  Cpu,
  GitBranch,
  Clock3,
  Network,
  Zap,
  Activity,
  HardDrive,
  Info,
  ArrowRight,
  Compass,
  FlaskConical
} from 'lucide-react';
import { MetricCard } from '../components/MetricCard';
import { StatusBadge } from '../components/StatusBadge';
import { formatBytes, formatDuration, formatTimestamp } from '../utils/formatters';
import type { OverviewData } from '../types';

interface OverviewPageProps {
  data: OverviewData | null;
  onNavigate: (tabId: string) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ data, onNavigate }) => {
  const system = data?.system;
  const workspace = data?.workspace;
  const collectors = data?.collectors ?? [];
  const recentEvents = useMemo(() => {
    return (data?.recentEvents ?? []).filter(
      evt => evt.collectorId !== 'port' && !evt.type.startsWith('port.')
    );
  }, [data?.recentEvents]);
  const fileSummary = data?.fileSummary;
  const disks = data?.disks ?? [];

  const cpuStr = system ? `${system.cpuPercent.toFixed(1)}%` : '—';
  const memStr = system ? `${system.memoryUsedPercent.toFixed(1)}%` : '—';
  const memUsedStr = system
    ? `${formatBytes(system.memoryUsedBytes)} / ${formatBytes(system.memoryTotalBytes)}`
    : 'Waiting for telemetry';

  const workspaceSizeStr = fileSummary
    ? formatBytes(fileSummary.totalSizeBytes)
    : workspace?.lastScanSizeBytes
    ? formatBytes(workspace.lastScanSizeBytes)
    : 'Not Scanned';

  const workspaceFileCount = fileSummary
    ? `${fileSummary.totalFileCount.toLocaleString()} files`
    : workspace?.lastScanFileCount
    ? `${workspace.lastScanFileCount.toLocaleString()} files`
    : 'No scan record';

  return (
    <div className="page-container">
      {/* 1. Welcome & Workspace Overview Banner */}
      <section className="welcome-banner">
        <div className="welcome-content">
          <div className="eyebrow-tag">
            <Zap size={13} />
            <span>DEVELOPER INTELLIGENCE ENGINE</span>
          </div>
          <h2 className="welcome-title">Unified Developer Observability</h2>
          <p className="welcome-desc">
            Local telemetry from workspace{' '}
            <strong>{workspace?.name ?? 'environment'}</strong>. Real-time CPU, RAM, disk capacity,
            and workspace file analytics streaming directly from your machine.
          </p>
        </div>
        <div className="welcome-aside">
          <div className="status-kpi-pill">
            <span className={`status-indicator ${data?.monitoring ? 'is-live' : 'is-paused'}`} />
            <span>{data?.monitoring ? 'Engine Active' : 'Engine Paused'}</span>
          </div>
          <span className="uptime-tag">
            Uptime: {system ? formatDuration(system.uptimeSeconds) : '—'}
          </span>
        </div>
      </section>

      {/* 2. Top Resource KPI Cards */}
      <section className="metric-cards-grid">
        <MetricCard
          label="CPU UTILIZATION"
          value={cpuStr}
          detail={system?.cpuModel ? `${system.cpuCores} cores · ${system.cpuModel}` : 'System CPU usage'}
          icon={<Cpu size={18} style={{ color: '#10b981' }} />}
          variant={system && system.cpuPercent > 85 ? 'warning' : 'accent'}
          onClick={() => onNavigate('System Intelligence')}
        />

        <MetricCard
          label="MEMORY UTILIZATION"
          value={memStr}
          detail={memUsedStr}
          icon={<Activity size={18} style={{ color: '#38bdf8' }} />}
          variant={system && system.memoryUsedPercent > 85 ? 'warning' : 'info'}
          onClick={() => onNavigate('System Intelligence')}
        />

        {/* Workspace Storage Card */}
        <MetricCard
          label="WORKSPACE STORAGE"
          value={workspaceSizeStr}
          detail={workspaceFileCount}
          icon={<FolderTree size={18} style={{ color: '#eab308' }} />}
          variant={fileSummary ? 'accent' : 'default'}
          badge={fileSummary ? 'Scanned' : undefined}
          onClick={() => onNavigate('File Intelligence')}
        />

        {/* AI Usage Card */}
        <MetricCard
          label="AI TOKEN USAGE"
          value={data?.aiSummary && data.aiSummary.totalTokens > 0
            ? `${(data.aiSummary.totalTokens >= 1000 ? (data.aiSummary.totalTokens / 1000).toFixed(1) + 'k' : data.aiSummary.totalTokens)} Tok`
            : '$0.00'}
          detail={data?.aiSummary && data.aiSummary.totalTokens > 0
            ? `Spend: $${data.aiSummary.estimatedCost.toFixed(4)} · ${data.aiSummary.modelsCount} models`
            : 'Active · Local & API telemetry'}
          icon={<BrainCircuit size={18} style={{ color: '#a855f7' }} />}
          variant={data?.aiSummary && data.aiSummary.totalTokens > 0 ? 'accent' : 'default'}
          onClick={() => onNavigate('AI Playground')}
        />
      </section>

      {/* 3. Main Intelligence & Telemetry Section */}
      <div className="flex flex-col gap-4">
        {/* Live System Health Snapshot */}
        <article className="card panel-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">System Resource Telemetry</h3>
              <p className="card-subtitle">Real-time hardware utilization via Node.js OS collector</p>
            </div>
            <button
              type="button"
              className="text-btn"
              onClick={() => onNavigate('System Intelligence')}
            >
              <span>Full charts</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <div className="health-bars-section">
            <div className="health-bar-row">
              <div className="bar-labels">
                <span className="bar-name">CPU Load</span>
                <span className="bar-val">{cpuStr}</span>
              </div>
              <div className="progress-track">
                <div
                  className={`progress-fill ${system && system.cpuPercent > 80 ? 'fill-warning' : 'fill-accent'}`}
                  style={{ width: `${Math.min(100, system?.cpuPercent ?? 0)}%` }}
                />
              </div>
            </div>

            {system?.gpu && (
              <div className="health-bar-row">
                <div className="bar-labels">
                  <span className="bar-name">GPU Load ({system.gpu.model})</span>
                  <span className="bar-val">{system.gpu.utilizationGpuPercent.toFixed(1)}%</span>
                </div>
                <div className="progress-track">
                  <div
                    className={`progress-fill ${system.gpu.utilizationGpuPercent > 80 ? 'fill-warning' : 'fill-accent'}`}
                    style={{ width: `${Math.min(100, system.gpu.utilizationGpuPercent)}%`, backgroundColor: '#a855f7' }}
                  />
                </div>
              </div>
            )}

            <div className="health-bar-row">
              <div className="bar-labels">
                <span className="bar-name">RAM Used</span>
                <span className="bar-val">{memStr}</span>
              </div>
              <div className="progress-track">
                <div
                  className={`progress-fill ${system && system.memoryUsedPercent > 80 ? 'fill-warning' : 'fill-info'}`}
                  style={{ width: `${Math.min(100, system?.memoryUsedPercent ?? 0)}%` }}
                />
              </div>
            </div>

            {disks.length > 0 && (
              <div className="health-bar-row">
                <div className="bar-labels">
                  <span className="bar-name">Disk ({disks[0].mount})</span>
                  <span className="bar-val">{disks[0].usedPercent}%</span>
                </div>
                <div className="progress-track">
                  <div
                    className={`progress-fill ${disks[0].usedPercent > 90 ? 'fill-warning' : 'fill-accent'}`}
                    style={{ width: `${Math.min(100, disks[0].usedPercent)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="system-stats-grid">
            <div className="stat-item">
              <span className="stat-label">Total Memory</span>
              <strong className="stat-value">
                {system ? formatBytes(system.memoryTotalBytes) : '—'}
              </strong>
            </div>
            <div className="stat-item">
              <span className="stat-label">Used Memory</span>
              <strong className="stat-value">
                {system ? formatBytes(system.memoryUsedBytes) : '—'}
              </strong>
            </div>
            <div className="stat-item">
              <span className="stat-label">Primary Disk</span>
              <strong className="stat-value">
                {disks.length > 0 ? `${formatBytes(disks[0].freeBytes)} free` : '—'}
              </strong>
            </div>
            <div className="stat-item">
              <span className="stat-label">Sampling Rate</span>
              <strong className="stat-value">
                {data?.settings?.sampleIntervalSeconds ?? 5}s
              </strong>
            </div>
          </div>
        </article>

        {/* Intelligence Quick Cards: Pulse Insights, Git, Coding, API, API Testing */}
        <div className="placeholder-cards-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <article
            className="card placeholder-mini-card"
            style={{ cursor: 'pointer', borderColor: 'var(--border)' }}
            onClick={() => onNavigate('Pulse Insights')}
          >
            <div className="mini-icon" style={{ color: '#38bdf8' }}>
              <Compass size={16} />
            </div>
            <div className="mini-text">
              <strong>Pulse Insights</strong>
              <span>
                {data?.activeAlerts && data.activeAlerts.length > 0
                  ? `${data.activeAlerts.length} active warnings · Correlation engine`
                  : 'Multi-module health & automated recommendations'}
              </span>
            </div>
          </article>

          <article
            className="card placeholder-mini-card"
            style={{ cursor: 'pointer', borderColor: 'var(--border)' }}
            onClick={() => onNavigate('Git Intelligence')}
          >
            <div className="mini-icon" style={{ color: '#10b981' }}>
              <GitBranch size={16} />
            </div>
            <div className="mini-text">
              <strong>Git Intelligence</strong>
              <span>
                {data?.gitSummary
                  ? `${data.gitSummary.currentBranch} · ${data.gitSummary.uncommittedChangesCount} uncommitted · ${data.gitSummary.commitsToday} commits today`
                  : 'View repository status, branches & commits'}
              </span>
            </div>
          </article>

          <article
            className="card placeholder-mini-card"
            style={{ cursor: 'pointer', borderColor: 'var(--border)' }}
            onClick={() => onNavigate('Coding Intelligence')}
          >
            <div className="mini-icon" style={{ color: '#38bdf8' }}>
              <Clock3 size={16} />
            </div>
            <div className="mini-text">
              <strong>Coding Intelligence</strong>
              <span>
                {data?.codingSummary
                  ? `${formatDuration(data.codingSummary.todayActiveSeconds)} active · ${data.codingSummary.topLanguage || 'Multi-language'} · ${data.codingSummary.isTracking ? (data.codingSummary.isPaused ? 'Paused' : 'Active') : 'Idle'}`
                  : 'View active coding sessions & metrics'}
              </span>
            </div>
          </article>

          <article
            className="card placeholder-mini-card"
            style={{ cursor: 'pointer', borderColor: 'var(--border)' }}
            onClick={() => onNavigate('API Intelligence')}
          >
            <div className="mini-icon" style={{ color: '#a855f7' }}>
              <Network size={16} />
            </div>
            <div className="mini-text">
              <strong>API Intelligence</strong>
              <span>
                {data?.apiSummary
                  ? `${data.apiSummary.totalRequestsToday} requests today · ${data.apiSummary.avgLatencyMs.toFixed(0)}ms avg · ${(data.apiSummary.errorRate * 100).toFixed(1)}% errors`
                  : 'View monitored endpoints & latency'}
              </span>
            </div>
          </article>

          <article
            className="card placeholder-mini-card"
            style={{ cursor: 'pointer', borderColor: 'var(--border)' }}
            onClick={() => onNavigate('API Testing Studio')}
          >
            <div className="mini-icon" style={{ color: '#06b6d4' }}>
              <FlaskConical size={16} />
            </div>
            <div className="mini-text">
              <strong>API Testing Studio</strong>
              <span>Interactive request builder, Postman runner & assertions</span>
            </div>
          </article>
        </div>

        {/* Recent Activity Telemetry Feed from SQLite */}
        <article className="card panel-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Recent Event Log</h3>
              <p className="card-subtitle">Stored in your local SQLite database</p>
            </div>
            <span className="counter-pill">{recentEvents.length} events</span>
          </div>

          {recentEvents.length === 0 ? (
            <div className="empty-state-box">
              <Info size={18} />
              <span>Waiting for initial metric events...</span>
            </div>
          ) : (
            <div className="events-table-wrapper">
              <table className="events-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Collector</th>
                    <th>Type</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map(evt => {
                    const payload = (evt.payload || {}) as Record<string, any>;
                    let detail = JSON.stringify(payload);
                    if (evt.type === 'system.snapshot') {
                      detail = `CPU: ${(payload?.cpuPercent as number)?.toFixed(0) ?? 0}% · RAM: ${(payload?.memoryUsedPercent as number)?.toFixed(0) ?? 0}%`;
                    } else if (evt.type === 'filesystem.summary') {
                      detail = `${formatBytes(Number(payload?.totalSizeBytes ?? 0))} · ${payload?.totalFileCount} files`;
                    } else if (evt.type === 'disk.snapshot') {
                      detail = `Disks sampled`;
                    } else if (evt.type === 'process.snapshot') {
                      detail = `Processes sampled`;
                    } else if (evt.type === 'ai.usage') {
                      detail = `${payload?.provider}/${payload?.model}: ${payload?.totalTokens} tokens ($${Number(payload?.estimatedCost || 0).toFixed(4)})`;
                    } else if (evt.type === 'git.activity') {
                      detail = `${payload?.repoName} [${payload?.currentBranch}]: ${payload?.uncommittedFilesCount} uncommitted files`;
                    } else if (evt.type === 'coding.summary') {
                      detail = `Coding focus: ${formatDuration(Number(payload?.live?.activeDurationSeconds || 0))} active (${payload?.live?.status})`;
                    } else if (evt.type === 'api.summary') {
                      detail = `API throughput: ${payload?.summary?.totalRequests || 0} requests (${payload?.summary?.avgLatencyMs || 0}ms avg)`;
                    }

                    return (
                      <tr key={evt.id}>
                        <td className="timestamp-cell">{formatTimestamp(evt.timestamp)}</td>
                        <td>
                          <span className="collector-tag">{evt.collectorId}</span>
                        </td>
                        <td className="type-cell">{evt.type}</td>
                        <td className="detail-cell">{detail}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>
    </div>
  );
};
