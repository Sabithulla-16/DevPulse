import React, { useState, useMemo } from 'react';
import {
  Cpu,
  Activity,
  HardDrive,
  Clock,
  RefreshCw,
  Pause,
  Play,
  RotateCcw,
  Zap,
  Radio,
  Search,
  ListOrdered,
  Server,
  ArrowUpDown,
  Square,
  Shield,
  ShieldAlert,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Network,
  X
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { MetricCard } from '../components/MetricCard';
import { formatBytes, formatDuration, formatTimestamp } from '../utils/formatters';
import {
  refreshMetrics,
  toggleMonitoring,
  resetData,
  requestProcesses,
  requestDisks,
  requestPorts,
  stopProcess,
  freePort
} from '../services/vscode';
import type { SystemMetricsData, SystemExtendedData, ProcessInfo, PortInfo } from '../types';

interface SystemMetricsPageProps {
  data: SystemMetricsData | null;
  extendedData?: SystemExtendedData | null;
  terminationResult?: { success: boolean; pid: number; processName: string; message: string; requiresForce?: boolean } | null;
  portFreedResult?: { success: boolean; port: number; pid?: number; message: string; requiresForce?: boolean } | null;
  onClearTerminationResult?: () => void;
  onClearPortFreedResult?: () => void;
}

export const SystemMetricsPage: React.FC<SystemMetricsPageProps> = ({
  data,
  extendedData,
  terminationResult,
  portFreedResult,
  onClearTerminationResult,
  onClearPortFreedResult
}) => {
  const current = data?.current;
  const history = data?.history ?? [];
  const monitoring = data?.monitoring ?? false;

  const disks = extendedData?.disks ?? [];
  const processes = extendedData?.topProcesses ?? [];
  const ports = extendedData?.activePorts ?? [];
  const cpuStats = extendedData?.cpuStats ?? {
    current: current?.cpuPercent ?? 0,
    average: current?.cpuPercent ?? 0,
    peak: current?.cpuPercent ?? 0
  };

  const [activeTab, setActiveTab] = useState<'charts' | 'processes' | 'disks' | 'ports'>('charts');

  // Process monitor states
  const [procSearch, setProcSearch] = useState('');
  const [procSortKey, setProcSortKey] = useState<'cpu' | 'mem'>('cpu');
  const [selectedProcToStop, setSelectedProcToStop] = useState<ProcessInfo | null>(null);
  const [isTerminatingProc, setIsTerminatingProc] = useState(false);

  // Port monitor states
  const [portSearch, setPortSearch] = useState('');
  const [protoFilter, setProtoFilter] = useState<'ALL' | 'TCP' | 'UDP'>('ALL');
  const [selectedPortToFree, setSelectedPortToFree] = useState<PortInfo | null>(null);
  const [isFreeingPort, setIsFreeingPort] = useState(false);

  // Growth / time-series data
  const chartData = useMemo(() => {
    return history.map(item => ({
      time: formatTimestamp(item.timestamp),
      cpu: item.cpuPercent,
      memory: item.memoryUsedPercent
    }));
  }, [history]);

  // Filtered and sorted processes
  const filteredProcesses = useMemo(() => {
    return processes
      .filter(p => p.name.toLowerCase().includes(procSearch.toLowerCase()) || String(p.pid).includes(procSearch))
      .sort((a, b) => {
        if (procSortKey === 'cpu') {
          return b.cpuPercent - a.cpuPercent;
        }
        return b.memoryBytes - a.memoryBytes;
      });
  }, [processes, procSearch, procSortKey]);

  // Filtered ports
  const filteredPorts = useMemo(() => {
    return ports.filter(p => {
      const matchSearch =
        portSearch.trim() === '' ||
        String(p.port).includes(portSearch) ||
        (p.processName && p.processName.toLowerCase().includes(portSearch.toLowerCase())) ||
        (p.pid && String(p.pid).includes(portSearch));
      const proto = (p.protocol || 'TCP').toUpperCase();
      const matchProto = protoFilter === 'ALL' || proto === protoFilter;
      return matchSearch && matchProto;
    });
  }, [ports, portSearch, protoFilter]);

  const listeningPortsCount = useMemo(() => {
    return ports.filter(p => p.state === 'LISTENING').length;
  }, [ports]);

  // Handle stop process confirmation
  const handleConfirmStopProcess = (force = false) => {
    if (!selectedProcToStop) return;
    setIsTerminatingProc(true);
    stopProcess(selectedProcToStop.pid, selectedProcToStop.name, force);
  };

  // Handle free port confirmation
  const handleConfirmFreePort = (force = false) => {
    if (!selectedPortToFree) return;
    setIsFreeingPort(true);
    freePort(selectedPortToFree.port, selectedPortToFree.protocol ?? 'TCP', selectedPortToFree.pid, selectedPortToFree.processName, force);
  };

  // Close modals when operation finishes
  React.useEffect(() => {
    if (terminationResult) {
      setIsTerminatingProc(false);
      if (terminationResult.success) {
        setSelectedProcToStop(null);
      }
    }
  }, [terminationResult]);

  React.useEffect(() => {
    if (portFreedResult) {
      setIsFreeingPort(false);
      if (portFreedResult.success) {
        setSelectedPortToFree(null);
      }
    }
  }, [portFreedResult]);

  // Auto-dismiss termination notification after 3 seconds
  React.useEffect(() => {
    if (terminationResult && onClearTerminationResult) {
      const timer = setTimeout(() => {
        onClearTerminationResult();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [terminationResult, onClearTerminationResult]);

  // Auto-dismiss port freed notification after 3 seconds
  React.useEffect(() => {
    if (portFreedResult && onClearPortFreedResult) {
      const timer = setTimeout(() => {
        onClearPortFreedResult();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [portFreedResult, onClearPortFreedResult]);

  // Navigate to port from process table
  const handleNavigateToPort = (portNum: number) => {
    setActiveTab('ports');
    setPortSearch(String(portNum));
  };

  // Navigate to process from port table
  const handleNavigateToProcess = (procName: string) => {
    setActiveTab('processes');
    setProcSearch(procName);
  };

  return (
    <div className="page-container">
      {/* Header Banner */}
      <section className="section-header-row">
        <div>
          <div className="eyebrow-tag">
            <Cpu size={13} />
            <span>CORE SYSTEM OBSERVABILITY</span>
          </div>
          <h2 className="section-title">System & Host Intelligence</h2>
          <p className="section-desc">
            Hardware resource utilization, mounted volume capacity, running processes, and local development ports.
          </p>
        </div>

        <div className="header-action-group">
          <button
            type="button"
            className="secondary-btn"
            onClick={refreshMetrics}
            title="Poll metrics immediately"
          >
            <RefreshCw size={14} />
            <span>Poll Now</span>
          </button>

          <button
            type="button"
            className={`action-btn ${monitoring ? 'btn-pause' : 'btn-resume'}`}
            onClick={() => toggleMonitoring(monitoring)}
          >
            {monitoring ? <Pause size={14} /> : <Play size={14} />}
            <span>{monitoring ? 'Pause Polling' : 'Resume Polling'}</span>
          </button>

          <button
            type="button"
            className="secondary-btn"
            onClick={resetData}
            title="Purge local SQLite metrics"
          >
            <RotateCcw size={14} />
            <span>Reset Data</span>
          </button>
        </div>
      </section>

      {/* Primary KPI Metrics Grid */}
      <section className="metric-cards-grid metrics-grid-5">
        <MetricCard
          label="CPU LOAD"
          value={`${(current?.cpuPercent ?? 0).toFixed(1)}%`}
          detail={`Avg: ${cpuStats.average.toFixed(1)}% · Peak: ${cpuStats.peak.toFixed(1)}%`}
          icon={<Cpu size={18} style={{ color: '#10b981' }} />}
          variant="accent"
        />

        <MetricCard
          label="SYSTEM RAM UTILIZATION"
          value={`${(current?.memoryUsedPercent ?? 0).toFixed(1)}%`}
          detail={`${formatBytes(current?.memoryUsedBytes ?? 0)} of ${formatBytes(current?.memoryTotalBytes ?? 0)}`}
          icon={<Activity size={18} style={{ color: '#38bdf8' }} />}
          variant="info"
        />

        <MetricCard
          label="GPU LOAD"
          value={current?.gpu ? `${(current.gpu.utilizationGpuPercent ?? 0).toFixed(1)}%` : '—'}
          detail={current?.gpu ? `${current.gpu.model}${current.gpu.temperatureC ? ` · ${current.gpu.temperatureC}°C` : ''}` : 'GPU active'}
          icon={<Zap size={18} style={{ color: '#a855f7' }} />}
          variant={current?.gpu && current.gpu.utilizationGpuPercent > 80 ? 'warning' : 'accent'}
        />

        <MetricCard
          label="MOUNTED DISKS"
          value={`${disks.length} Volume${disks.length !== 1 ? 's' : ''}`}
          detail={disks[0] ? `${disks[0].fs} (${disks[0].usedPercent.toFixed(0)}% full)` : 'Ready to inspect'}
          icon={<HardDrive size={18} style={{ color: '#f59e0b' }} />}
          variant="warning"
        />

        <MetricCard
          label="SYSTEM UPTIME"
          value={formatDuration(current?.uptimeSeconds ?? 0)}
          detail={monitoring ? 'Active background telemetry' : 'Monitoring paused'}
          icon={<Clock size={18} style={{ color: '#818cf8' }} />}
          variant="default"
        />
      </section>

      {/* Operation Feedback Notifications */}
      {terminationResult && (
        <aside className={`notification-banner ${terminationResult.success ? 'is-success' : 'is-error'}`}>
          <div className="notification-content">
            {terminationResult.success ? (
              <CheckCircle2 size={16} className="notification-icon text-accent" />
            ) : (
              <AlertTriangle size={16} className="notification-icon text-danger" />
            )}
            <div className="notification-body">
              <span className="notification-title">Process Termination Result</span>
              <span className="notification-message">{terminationResult.message}</span>
            </div>
          </div>
          <button
            type="button"
            className="notification-close-btn"
            onClick={onClearTerminationResult}
            title="Dismiss notification"
          >
            <X size={14} />
          </button>
        </aside>
      )}

      {portFreedResult && (
        <aside className={`notification-banner ${portFreedResult.success ? 'is-success' : 'is-error'}`}>
          <div className="notification-content">
            {portFreedResult.success ? (
              <CheckCircle2 size={16} className="notification-icon text-accent" />
            ) : (
              <AlertTriangle size={16} className="notification-icon text-danger" />
            )}
            <div className="notification-body">
              <span className="notification-title">Port Release Result</span>
              <span className="notification-message">{portFreedResult.message}</span>
            </div>
          </div>
          <button
            type="button"
            className="notification-close-btn"
            onClick={onClearPortFreedResult}
            title="Dismiss notification"
          >
            <X size={14} />
          </button>
        </aside>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="subnav-tabs-row">
        <button
          type="button"
          className={`subnav-tab ${activeTab === 'charts' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('charts')}
        >
          <Zap size={14} />
          <span>Real-time Charts</span>
        </button>

        <button
          type="button"
          className={`subnav-tab ${activeTab === 'processes' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('processes')}
        >
          <ListOrdered size={14} />
          <span>Process Monitor ({processes.length})</span>
        </button>

        <button
          type="button"
          className={`subnav-tab ${activeTab === 'ports' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('ports')}
        >
          <Network size={14} />
          <span>Port Intelligence ({listeningPortsCount} listening)</span>
        </button>

        <button
          type="button"
          className={`subnav-tab ${activeTab === 'disks' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('disks')}
        >
          <HardDrive size={14} />
          <span>Mounted Volumes ({disks.length})</span>
        </button>
      </div>

      {/* TAB 1: Real-time Area Charts */}
      {activeTab === 'charts' && (
        <article className="card panel-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Telemetry Time-Series</h3>
              <p className="card-subtitle">CPU & Memory usage recorded over the last 60 polling ticks</p>
            </div>
            <div className="flex-align-center" style={{ gap: '16px' }}>
              <div className="flex-align-center" style={{ gap: '6px' }}>
                <span className="legend-indicator" style={{ backgroundColor: '#22C55E' }} />
                <span className="card-subtitle">CPU %</span>
              </div>
              <div className="flex-align-center" style={{ gap: '6px' }}>
                <span className="legend-indicator" style={{ backgroundColor: '#38BDF8' }} />
                <span className="card-subtitle">RAM %</span>
              </div>
            </div>
          </div>

          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#38BDF8" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.07)" vertical={false} />
                <XAxis dataKey="time" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} unit="%" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E293B',
                    borderColor: '#475569',
                    borderRadius: '8px',
                    color: '#F8FAFC',
                    fontSize: '12px'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  name="CPU Load"
                  stroke="#22C55E"
                  strokeWidth={2}
                  fill="url(#cpuGradient)"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="memory"
                  name="RAM Usage"
                  stroke="#38BDF8"
                  strokeWidth={2}
                  fill="url(#memGradient)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>
      )}

      {/* TAB 2: Process Monitor Table with STOP ACTION */}
      {activeTab === 'processes' && (
        <article className="card panel-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Top Active Operating System Processes</h3>
              <p className="card-subtitle">Inspect running host applications and terminate runaway processes</p>
            </div>
            <div className="flex-align-center" style={{ gap: '10px' }}>
              <div className="search-input-wrap">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Filter by name or PID..."
                  value={procSearch}
                  onChange={e => setProcSearch(e.target.value)}
                  className="search-field"
                />
              </div>

              <div className="theme-toggle-group">
                <button
                  type="button"
                  className={`theme-pill ${procSortKey === 'cpu' ? 'is-selected' : ''}`}
                  onClick={() => setProcSortKey('cpu')}
                >
                  <ArrowUpDown size={12} /> Sort CPU
                </button>
                <button
                  type="button"
                  className={`theme-pill ${procSortKey === 'mem' ? 'is-selected' : ''}`}
                  onClick={() => setProcSortKey('mem')}
                >
                  <ArrowUpDown size={12} /> Sort RAM
                </button>
              </div>

              <button type="button" className="text-btn" onClick={requestProcesses}>
                <RefreshCw size={13} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="events-table-wrapper">
            <table className="events-table">
              <thead>
                <tr>
                  <th>PID</th>
                  <th>Process Name</th>
                  <th>CPU (%)</th>
                  <th>Memory (RSS)</th>
                  <th>Memory (%)</th>
                  <th>Listening Ports</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredProcesses.map(proc => (
                  <tr key={proc.pid}>
                    <td className="timestamp-cell">{proc.pid}</td>
                    <td>
                      <div className="flex-align-center" style={{ gap: '6px' }}>
                        {proc.isProtected && (
                          <span title="Protected System Process">
                            <Shield size={13} className="text-warning" />
                          </span>
                        )}
                        <strong>{proc.name}</strong>
                      </div>
                    </td>
                    <td className="metric-num-cell">
                      <span className={proc.cpuPercent > 50 ? 'text-warning' : 'text-accent'}>
                        {proc.cpuPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td>{formatBytes(proc.memoryBytes)}</td>
                    <td>{proc.memoryPercent.toFixed(1)}%</td>
                    <td>
                      {proc.ports && proc.ports.length > 0 ? (
                        <div className="flex-align-center" style={{ gap: '4px' }}>
                          {proc.ports.map(pt => (
                            <button
                              key={pt}
                              type="button"
                              className="action-pill-btn"
                              style={{ padding: '2px 6px', fontSize: '11px' }}
                              onClick={() => handleNavigateToPort(pt)}
                              title={`Inspect port :${pt}`}
                            >
                              :{pt}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted" style={{ fontSize: '12px' }}>—</span>
                      )}
                    </td>
                    <td>
                      {proc.isProtected ? (
                        <span className="badge badge-idle" title="System-critical or host process cannot be stopped">
                          Protected
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="secondary-btn btn-danger"
                          style={{ padding: '3px 8px', fontSize: '11px' }}
                          onClick={() => setSelectedProcToStop(proc)}
                          title={`Stop process ${proc.name} (PID ${proc.pid})`}
                        >
                          <Square size={11} />
                          <span>Stop</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredProcesses.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-cell">
                      No processes matching your search filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {/* TAB 3: Dynamic Port Monitor Table with FREE PORT ACTION */}
      {activeTab === 'ports' && (
        <article className="card panel-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Dynamic Port Discovery & Free Port Manager</h3>
              <p className="card-subtitle">
                Automatically discovers listening sockets across all ports. Free occupied ports directly.
              </p>
            </div>

            <div className="flex-align-center" style={{ gap: '10px' }}>
              <div className="search-input-wrap">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Filter by port or process..."
                  value={portSearch}
                  onChange={e => setPortSearch(e.target.value)}
                  className="search-field"
                />
              </div>

              <div className="theme-toggle-group">
                <button
                  type="button"
                  className={`theme-pill ${protoFilter === 'ALL' ? 'is-selected' : ''}`}
                  onClick={() => setProtoFilter('ALL')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`theme-pill ${protoFilter === 'TCP' ? 'is-selected' : ''}`}
                  onClick={() => setProtoFilter('TCP')}
                >
                  TCP
                </button>
                <button
                  type="button"
                  className={`theme-pill ${protoFilter === 'UDP' ? 'is-selected' : ''}`}
                  onClick={() => setProtoFilter('UDP')}
                >
                  UDP
                </button>
              </div>

              <button type="button" className="text-btn" onClick={requestPorts}>
                <RefreshCw size={13} />
                <span>Re-probe Ports</span>
              </button>
            </div>
          </div>

          <div className="events-table-wrapper">
            <table className="events-table">
              <thead>
                <tr>
                  <th>Port</th>
                  <th>Protocol</th>
                  <th>Status</th>
                  <th>Local Address</th>
                  <th>Owning Process</th>
                  <th>PID</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPorts.map(p => {
                  const isListening = p.state === 'LISTENING';
                  const isBound = p.state === 'BOUND';
                  return (
                    <tr key={`${p.protocol || 'TCP'}:${p.port}`}>
                      <td className="timestamp-cell">
                        <strong style={{ fontSize: '13px' }}>:{p.port}</strong>
                      </td>
                      <td>
                        <span className="badge badge-idle" style={{ fontSize: '10px' }}>
                          {p.protocol ?? 'TCP'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${isListening ? 'badge-running' : isBound ? 'badge-warning' : 'badge-idle'}`}>
                          {p.state}
                        </span>
                      </td>
                      <td className="file-path-cell">{p.localAddress ?? '127.0.0.1'}</td>
                      <td>
                        {p.processName ? (
                          <button
                            type="button"
                            className="text-btn"
                            style={{ fontWeight: 600, padding: 0 }}
                            onClick={() => handleNavigateToProcess(p.processName!)}
                            title="Inspect in Process table"
                          >
                            {p.processName}
                          </button>
                        ) : isListening ? (
                          <span className="text-muted">Listening Service</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="timestamp-cell">{p.pid ?? '—'}</td>
                      <td>
                        {isListening && p.pid ? (
                          <button
                            type="button"
                            className="secondary-btn btn-danger"
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                            onClick={() => setSelectedPortToFree(p)}
                            title={`Free port :${p.port} (terminates process ${p.processName ?? ''} PID ${p.pid})`}
                          >
                            <Square size={11} />
                            <span>Free Port</span>
                          </button>
                        ) : isListening ? (
                          <button
                            type="button"
                            className="secondary-btn btn-danger"
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                            onClick={() => setSelectedPortToFree(p)}
                          >
                            <Square size={11} />
                            <span>Free Port</span>
                          </button>
                        ) : (
                          <span className="badge badge-idle" style={{ opacity: 0.6 }}>
                            Free
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredPorts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-cell">
                      No ports matching search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {/* TAB 4: Mounted Disks */}
      {activeTab === 'disks' && (
        <article className="card panel-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Mounted Storage Volumes</h3>
              <p className="card-subtitle">Operating system filesystem drives</p>
            </div>
            <button type="button" className="text-btn" onClick={requestDisks}>
              <RefreshCw size={13} />
              <span>Refresh Disks</span>
            </button>
          </div>

          <div className="disks-grid">
            {disks.map(d => (
              <div key={d.fs} className="disk-card">
                <div className="disk-header">
                  <div className="disk-title">
                    <HardDrive size={16} className="text-accent" />
                    <strong>{d.fs}</strong>
                    <span className="disk-mount">({d.mount})</span>
                  </div>
                  <span className={`badge ${d.usedPercent > 85 ? 'badge-critical' : 'badge-running'}`}>
                    {d.usedPercent.toFixed(1)}% full
                  </span>
                </div>
                <div className="progress-bar-track" style={{ marginTop: '10px' }}>
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${Math.min(100, d.usedPercent)}%`,
                      backgroundColor: d.usedPercent > 85 ? '#EF4444' : '#22C55E'
                    }}
                  />
                </div>
                <div className="disk-details">
                  <div className="disk-metric-item">
                    <span className="disk-metric-label">Used</span>
                    <strong className="disk-metric-val">{formatBytes(d.usedBytes)}</strong>
                  </div>
                  <div className="disk-metric-item">
                    <span className="disk-metric-label">Free</span>
                    <strong className="disk-metric-val">{formatBytes(d.freeBytes)}</strong>
                  </div>
                  <div className="disk-metric-item">
                    <span className="disk-metric-label">Total</span>
                    <strong className="disk-metric-val">{formatBytes(d.totalBytes)}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>
      )}

      {/* CONFIRMATION MODAL: STOP PROCESS */}
      {selectedProcToStop && (
        <div className="modal-overlay">
          <article className="card modal-dialog">
            <div className="card-header">
              <div className="flex-align-center" style={{ gap: '8px' }}>
                <AlertTriangle size={18} className="text-warning" />
                <h3 className="card-title">Confirm Stop Process</h3>
              </div>
              <button
                type="button"
                className="close-icon-btn"
                onClick={() => setSelectedProcToStop(null)}
                disabled={isTerminatingProc}
                title="Close"
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '16px', fontSize: '13px', lineHeight: '1.5' }}>
              <p>
                Are you sure you want to stop process <strong>{selectedProcToStop.name}</strong> (PID {selectedProcToStop.pid})?
              </p>
              <div className="modal-info-box">
                <div className="modal-info-item">
                  <span className="modal-info-label">PID</span>
                  <span className="modal-info-value font-mono">{selectedProcToStop.pid}</span>
                </div>
                <div className="modal-info-item">
                  <span className="modal-info-label">PROCESS NAME</span>
                  <span className="modal-info-value font-mono">{selectedProcToStop.name}</span>
                </div>
                <div className="modal-info-item">
                  <span className="modal-info-label">CPU USAGE</span>
                  <span className="modal-info-value">{selectedProcToStop.cpuPercent.toFixed(1)}%</span>
                </div>
                <div className="modal-info-item">
                  <span className="modal-info-label">MEMORY</span>
                  <span className="modal-info-value">{formatBytes(selectedProcToStop.memoryBytes)}</span>
                </div>
                {selectedProcToStop.ports && selectedProcToStop.ports.length > 0 && (
                  <div className="modal-info-item" style={{ gridColumn: 'span 2' }}>
                    <span className="modal-info-label">LISTENING PORTS</span>
                    <span className="modal-info-value font-mono">{selectedProcToStop.ports.map(p => `:${p}`).join(', ')}</span>
                  </div>
                )}
              </div>

              {terminationResult && terminationResult.requiresForce && (
                <div className="alert-critical" style={{ marginTop: '12px', padding: '10px', borderRadius: '6px' }}>
                  <strong>Process did not exit gracefully.</strong> Force termination is required.
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setSelectedProcToStop(null)}
                disabled={isTerminatingProc}
              >
                Cancel
              </button>

              {terminationResult && terminationResult.requiresForce ? (
                <button
                  type="button"
                  className="action-btn btn-danger"
                  onClick={() => handleConfirmStopProcess(true)}
                  disabled={isTerminatingProc}
                >
                  {isTerminatingProc ? <RefreshCw size={13} className="spin-icon" /> : <ShieldAlert size={13} />}
                  <span>{isTerminatingProc ? 'Force Stopping...' : 'Force Stop Process'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="action-btn btn-danger"
                  onClick={() => handleConfirmStopProcess(false)}
                  disabled={isTerminatingProc}
                >
                  {isTerminatingProc ? <RefreshCw size={13} className="spin-icon" /> : <Square size={13} />}
                  <span>{isTerminatingProc ? 'Stopping...' : 'Stop Process'}</span>
                </button>
              )}
            </div>
          </article>
        </div>
      )}

      {/* CONFIRMATION MODAL: FREE PORT */}
      {selectedPortToFree && (
        <div className="modal-overlay">
          <article className="card modal-dialog">
            <div className="card-header">
              <div className="flex-align-center" style={{ gap: '8px' }}>
                <Network size={18} className="text-warning" />
                <h3 className="card-title">Confirm Free Port</h3>
              </div>
              <button
                type="button"
                className="close-icon-btn"
                onClick={() => setSelectedPortToFree(null)}
                disabled={isFreeingPort}
                title="Close"
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '16px', fontSize: '13px', lineHeight: '1.5' }}>
              <p>
                Release port <strong>:{selectedPortToFree.port}</strong> ({selectedPortToFree.protocol ?? 'TCP'})?
              </p>
              <div className="modal-info-box">
                <div className="modal-info-item">
                  <span className="modal-info-label">PORT</span>
                  <span className="modal-info-value font-mono">:{selectedPortToFree.port}</span>
                </div>
                <div className="modal-info-item">
                  <span className="modal-info-label">PROTOCOL</span>
                  <span className="modal-info-value">{selectedPortToFree.protocol ?? 'TCP'}</span>
                </div>
                <div className="modal-info-item">
                  <span className="modal-info-label">STATUS</span>
                  <span className="modal-info-value">{selectedPortToFree.state}</span>
                </div>
                <div className="modal-info-item">
                  <span className="modal-info-label">PID</span>
                  <span className="modal-info-value font-mono">{selectedPortToFree.pid ?? 'Unknown'}</span>
                </div>
                <div className="modal-info-item" style={{ gridColumn: 'span 2' }}>
                  <span className="modal-info-label">OWNING PROCESS</span>
                  <span className="modal-info-value font-mono">{selectedPortToFree.processName ?? 'Unknown'}</span>
                </div>
              </div>

              <p style={{ marginTop: '12px', color: '#94A3B8', fontSize: '12px' }}>
                Freeing this port will terminate the occupying process and verify that the port becomes available.
              </p>

              {portFreedResult && portFreedResult.requiresForce && (
                <div className="alert-critical" style={{ marginTop: '12px', padding: '10px', borderRadius: '6px' }}>
                  <strong>Graceful release failed.</strong> Force termination is required to free this port.
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setSelectedPortToFree(null)}
                disabled={isFreeingPort}
              >
                Cancel
              </button>

              {portFreedResult && portFreedResult.requiresForce ? (
                <button
                  type="button"
                  className="action-btn btn-danger"
                  onClick={() => handleConfirmFreePort(true)}
                  disabled={isFreeingPort}
                >
                  {isFreeingPort ? <RefreshCw size={13} className="spin-icon" /> : <ShieldAlert size={13} />}
                  <span>{isFreeingPort ? 'Force Freeing...' : 'Force Free Port'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="action-btn btn-danger"
                  onClick={() => handleConfirmFreePort(false)}
                  disabled={isFreeingPort}
                >
                  {isFreeingPort ? <RefreshCw size={13} className="spin-icon" /> : <Square size={13} />}
                  <span>{isFreeingPort ? 'Freeing Port...' : 'Free Port'}</span>
                </button>
              )}
            </div>
          </article>
        </div>
      )}
    </div>
  );
};
