import React, { useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  RefreshCw,
  Search,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Server,
  Activity,
  Layers,
  Code2,
  Clock
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
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
import { formatNumber, formatDuration, formatTimestamp } from '../utils/formatters';
import type {
  ApiIntelligenceData,
  ApiServiceItem,
  ApiEndpointItem,
  ApiRequestEventItem,
  ApiEndpointDetailsData
} from '../types';
import {
  requestApiData,
  createApiService,
  deleteApiService,
  toggleApiServiceMonitoring,
  regenerateApiServiceToken,
  requestApiEndpointDetails,
  clearApiData
} from '../services/vscode';

interface ApiIntelligencePageProps {
  data: ApiIntelligenceData | null;
  endpointDetails: ApiEndpointDetailsData | null;
  onRefresh: () => void;
  newServiceTokenData: { serviceId: string; serviceName: string; token: string } | null;
  onClearNewServiceToken: () => void;
}

const METHOD_COLORS: Record<string, string> = {
  GET: '#3b82f6',
  POST: '#10b981',
  PUT: '#f59e0b',
  DELETE: '#ef4444',
  PATCH: '#8b5cf6',
  OPTIONS: '#64748b'
};

const STATUS_CATEGORY_COLORS: Record<string, string> = {
  '2xx Success': '#10b981',
  '3xx Redirect': '#3b82f6',
  '4xx Client Error': '#f59e0b',
  '5xx Server Error': '#ef4444'
};

export const ApiIntelligencePage: React.FC<ApiIntelligencePageProps> = ({
  data,
  endpointDetails,
  onRefresh,
  newServiceTokenData,
  onClearNewServiceToken
}) => {
  const [selectedServiceId, setSelectedServiceId] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<'routeTemplate' | 'totalRequests' | 'totalErrors' | 'avgLatencyMs' | 'p95LatencyMs' | 'errorRate'>('totalRequests');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modals & Drawers
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceEnv, setNewServiceEnv] = useState('development');
  const [newServiceType, setNewServiceType] = useState('express');
  const [activeEndpointId, setActiveEndpointId] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const summary = data?.summary || {
    totalRequests: 0,
    successRate: 100,
    errorRate: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    activeServicesCount: 0
  };

  const ingestion = data?.ingestionStatus || {
    running: false,
    host: '127.0.0.1',
    port: 49152,
    activeConnections: 0,
    queueSize: 0
  };

  const handleFilterTime = (tf: '1h' | '24h' | '7d' | '30d') => {
    setTimeFilter(tf);
    requestApiData({
      timeFilter: tf,
      serviceId: selectedServiceId === 'all' ? undefined : selectedServiceId
    });
  };

  const handleServiceSelect = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    requestApiData({
      timeFilter,
      serviceId: serviceId === 'all' ? undefined : serviceId
    });
  };

  const handleCreateService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServiceName.trim()) return;
    createApiService(newServiceName.trim(), newServiceEnv, newServiceType);
    setNewServiceName('');
  };

  const handleDeleteService = (serviceId: string, serviceName: string) => {
    if (window.confirm(`Are you sure you want to delete service "${serviceName}"? This will revoke its API token.`)) {
      deleteApiService(serviceId);
    }
  };

  const handleInspectEndpoint = (endpointId: string) => {
    setActiveEndpointId(endpointId);
    requestApiEndpointDetails(endpointId, 50);
  };

  const copyToClipboard = (text: string, isSnippet = false) => {
    void navigator.clipboard.writeText(text);
    if (isSnippet) {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  // Filter & sort endpoints
  const filteredEndpoints = useMemo(() => {
    if (!data?.endpoints) return [];
    return data.endpoints
      .filter(ep => {
        if (selectedServiceId !== 'all' && ep.serviceId !== selectedServiceId) return false;
        if (methodFilter !== 'ALL' && ep.method !== methodFilter) return false;
        if (!searchQuery) return true;
        return ep.routeTemplate.toLowerCase().includes(searchQuery.toLowerCase());
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
  }, [data?.endpoints, selectedServiceId, methodFilter, searchQuery, sortField, sortOrder]);

  const toggleSort = (field: 'routeTemplate' | 'totalRequests' | 'totalErrors' | 'avgLatencyMs' | 'p95LatencyMs' | 'errorRate') => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="page-container api-intelligence-page">
      {/* Live Ingestion Server Banner */}
      <div className="live-status-banner">
        <div className="live-status-left">
          <div className="live-pulse-indicator">
            <span className={`live-pulse-dot ${ingestion.running ? 'is-active' : 'is-stopped'}`} />
            <span className="live-status-label">
              {ingestion.running
                ? `Ingestion Server Listening (${ingestion.host}:${ingestion.port})`
                : 'Ingestion Server Offline'}
            </span>
          </div>

          <div className="live-meta-pill">
            <Server size={14} />
            <span>Connections: <strong>{ingestion.activeConnections}</strong></span>
          </div>

          <div className="live-meta-pill">
            <Layers size={14} />
            <span>Queue: <strong>{ingestion.queueSize} events</strong></span>
          </div>

          {ingestion.error && (
            <div className="live-meta-pill pill-error">
              <AlertTriangle size={14} />
              <span>{ingestion.error}</span>
            </div>
          )}
        </div>

        <div className="live-status-actions">
          <button
            type="button"
            className="action-button-secondary"
            onClick={onRefresh}
            title="Refresh API intelligence metrics"
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            className="action-button-accent"
            onClick={() => setShowServiceModal(true)}
          >
            <Server size={14} />
            <span>Manage Services & Setup</span>
          </button>

          <button
            type="button"
            className="action-button-destructive"
            onClick={() => clearApiData(selectedServiceId === 'all' ? undefined : selectedServiceId)}
            title="Clear logged API request events from local database"
          >
            <Trash2 size={14} />
            <span>Clear Metrics</span>
          </button>
        </div>
      </div>

      {/* Filter and Service Selector Bar */}
      <div className="filter-bar">
        <div className="filter-group">
          {(['1h', '24h', '7d', '30d'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              className={`filter-tab ${timeFilter === tab ? 'is-active' : ''}`}
              onClick={() => handleFilterTime(tab)}
            >
              {tab === '1h'
                ? 'Last 1 Hour'
                : tab === '24h'
                ? 'Last 24 Hours'
                : tab === '7d'
                ? 'Last 7 Days'
                : 'Last 30 Days'}
            </button>
          ))}
        </div>

        <div className="filter-select-wrap">
          <label htmlFor="service-select" className="filter-label">Service:</label>
          <select
            id="service-select"
            value={selectedServiceId}
            onChange={e => handleServiceSelect(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Services ({data?.services?.length || 0})</option>
            {data?.services?.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.environment})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 6 Metric Cards */}
      <div className="metric-cards-grid-6">
        <MetricCard
          label="Total Requests"
          value={formatNumber(summary.totalRequests)}
          detail={timeFilter === '1h' ? 'Last hour throughput' : 'Observed API calls'}
          icon={<Activity size={18} style={{ color: '#38bdf8' }} />}
          variant="accent"
        />
        <MetricCard
          label="Success Rate"
          value={`${summary.successRate}%`}
          detail="Status 2xx and 3xx responses"
          icon={<CheckCircle2 size={18} style={{ color: '#10b981' }} />}
          variant="default"
        />
        <MetricCard
          label="Error Rate"
          value={`${summary.errorRate}%`}
          detail="4xx & 5xx HTTP exceptions"
          icon={<AlertTriangle size={18} style={{ color: '#ef4444' }} />}
          variant={summary.errorRate > 5 ? 'warning' : 'default'}
        />
        <MetricCard
          label="Average Latency"
          value={`${summary.avgLatencyMs} ms`}
          detail="Mean response time"
          icon={<Clock size={18} style={{ color: '#eab308' }} />}
        />
        <MetricCard
          label="P95 Latency"
          value={`${summary.p95LatencyMs} ms`}
          detail="95th percentile latency"
          icon={<Activity size={18} style={{ color: '#818cf8' }} />}
          variant="info"
        />
        <MetricCard
          label="Active Services"
          value={formatNumber(summary.activeServicesCount)}
          detail="Instrumented applications"
          icon={<Server size={18} style={{ color: '#06b6d4' }} />}
        />
      </div>

      {/* Charts Section: Volume & Latency Trend */}
      <div className="panel-card chart-panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Throughput & Latency Over Time</h3>
            <p className="panel-subtitle">Request volume split by outcome with average latency trend</p>
          </div>
          <Activity size={18} className="panel-icon-dim" />
        </div>

        <div className="chart-wrapper" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.volumeTimeSeries || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="#888888" fontSize={11} tickLine={false} />
              <YAxis stroke="#888888" fontSize={11} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-card)',
                  borderColor: 'var(--color-border)',
                  borderRadius: 6,
                  fontSize: 12,
                  color: 'var(--color-foreground)'
                }}
                itemStyle={{ color: 'var(--color-foreground)' }}
              />
              <Legend verticalAlign="top" align="right" height={28} />
              <Area
                type="monotone"
                dataKey="successCount"
                name="Successful Requests"
                stroke="#10b981"
                fill="url(#successGrad)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="errorCount"
                name="Failed Requests"
                stroke="#ef4444"
                fill="url(#errorGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Distributions Split Grid */}
      <div className="charts-split-grid">
        {/* HTTP Methods */}
        <div className="panel-card chart-panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">HTTP Method Distribution</h3>
              <p className="panel-subtitle">Distribution across REST verbs</p>
            </div>
            <Code2 size={18} className="panel-icon-dim" />
          </div>

          <div className="chart-wrapper" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.methodDistribution || []} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <XAxis type="number" stroke="#888888" fontSize={11} />
                <YAxis dataKey="method" type="category" stroke="#888888" fontSize={11} width={60} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-card)',
                    borderColor: 'var(--color-border)',
                    borderRadius: 6,
                    fontSize: 12,
                    color: 'var(--color-foreground)'
                  }}
                  itemStyle={{ color: 'var(--color-foreground)' }}
                  formatter={(val: any) => [`${val} requests`, 'Count']}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {data?.methodDistribution.map((entry, idx) => (
                    <Cell key={`meth-${idx}`} fill={METHOD_COLORS[entry.method] || '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Codes */}
        <div className="panel-card chart-panel">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">Status Code Breakdown</h3>
              <p className="panel-subtitle">HTTP response category shares</p>
            </div>
            <Layers size={18} className="panel-icon-dim" />
          </div>

          <div className="chart-wrapper" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.statusCodeDistribution || []}
                  dataKey="count"
                  nameKey="codeCategory"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={3}
                >
                  {data?.statusCodeDistribution.map((entry, idx) => (
                    <Cell key={`stat-${idx}`} fill={STATUS_CATEGORY_COLORS[entry.codeCategory] || '#888'} />
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
                  formatter={(val: any, name: any) => [`${val} requests`, name]}
                />
                <Legend verticalAlign="bottom" height={28} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Endpoints Performance Table */}
      <div className="panel-card table-panel">
        <div className="table-controls-bar">
          <div className="table-title-area">
            <h3 className="panel-title">Endpoint Performance Directory</h3>
            <span className="records-count-pill">{filteredEndpoints.length} endpoints</span>
          </div>

          <div className="table-filters-right">
            <div className="method-pill-group">
              {['ALL', 'GET', 'POST', 'PUT', 'DELETE'].map(m => (
                <button
                  key={m}
                  type="button"
                  className={`method-pill-btn ${methodFilter === m ? 'is-active' : ''}`}
                  onClick={() => setMethodFilter(m)}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="table-search-box">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search route template..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="table-search-input"
              />
            </div>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="devpulse-table">
            <thead>
              <tr>
                <th>Method</th>
                <th onClick={() => toggleSort('routeTemplate')} className="is-sortable">
                  <div className="th-content">
                    Route Template {sortField === 'routeTemplate' && <ArrowUpDown size={12} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('totalRequests')} className="is-sortable">
                  <div className="th-content">
                    Requests {sortField === 'totalRequests' && <ArrowUpDown size={12} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('avgLatencyMs')} className="is-sortable">
                  <div className="th-content">
                    Avg Latency {sortField === 'avgLatencyMs' && <ArrowUpDown size={12} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('p95LatencyMs')} className="is-sortable">
                  <div className="th-content">
                    P95 {sortField === 'p95LatencyMs' && <ArrowUpDown size={12} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('errorRate')} className="is-sortable">
                  <div className="th-content">
                    Error Rate {sortField === 'errorRate' && <ArrowUpDown size={12} />}
                  </div>
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEndpoints.map(ep => (
                <tr
                  key={ep.id}
                  className="table-row-hover"
                  onClick={() => handleInspectEndpoint(ep.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <span
                      className="method-badge"
                      style={{
                        backgroundColor: `${METHOD_COLORS[ep.method] || '#64748b'}20`,
                        color: METHOD_COLORS[ep.method] || '#64748b',
                        borderColor: METHOD_COLORS[ep.method] || '#64748b'
                      }}
                    >
                      {ep.method}
                    </span>
                  </td>
                  <td>
                    <span className="route-template-code table-cell-truncate" title={ep.routeTemplate}>
                      {ep.routeTemplate}
                    </span>
                  </td>
                  <td>{formatNumber(ep.totalRequests)}</td>
                  <td>{ep.avgLatencyMs} ms</td>
                  <td>
                    <span className={ep.p95LatencyMs > 1000 ? 'text-warning font-semibold' : ''}>
                      {ep.p95LatencyMs} ms
                    </span>
                  </td>
                  <td>
                    <span className={ep.errorRate > 5 ? 'text-destructive font-semibold' : ''}>
                      {ep.errorRate}%
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="inspect-session-button"
                      onClick={e => {
                        e.stopPropagation();
                        handleInspectEndpoint(ep.id);
                      }}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
              {filteredEndpoints.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-empty-row">
                    No endpoint traffic recorded yet. Start your instrumented dev server to stream events.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Endpoint Detail Modal / Drawer */}
      {activeEndpointId && endpointDetails && (
        <div className="modal-backdrop" onClick={() => setActiveEndpointId(null)}>
          <div className="modal-card modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span
                  className="method-badge"
                  style={{
                    backgroundColor: `${METHOD_COLORS[endpointDetails.endpoint.method] || '#64748b'}20`,
                    color: METHOD_COLORS[endpointDetails.endpoint.method] || '#64748b'
                  }}
                >
                  {endpointDetails.endpoint.method}
                </span>
                <h3 className="modal-title">{endpointDetails.endpoint.routeTemplate}</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setActiveEndpointId(null)}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-info-grid">
                <div className="info-cell">
                  <span className="info-label">Total Volume:</span>
                  <span className="info-val">{formatNumber(endpointDetails.endpoint.totalRequests)}</span>
                </div>
                <div className="info-cell">
                  <span className="info-label">Avg Latency:</span>
                  <span className="info-val">{endpointDetails.endpoint.avgLatencyMs} ms</span>
                </div>
                <div className="info-cell">
                  <span className="info-label">P95 Latency:</span>
                  <span className="info-val">{endpointDetails.endpoint.p95LatencyMs} ms</span>
                </div>
                <div className="info-cell">
                  <span className="info-label">Error Rate:</span>
                  <span className="info-val text-destructive">{endpointDetails.endpoint.errorRate}%</span>
                </div>
              </div>

              {/* Latency Histogram Bins */}
              <div className="modal-section-title">Latency Distribution Bins</div>
              <div className="chart-wrapper" style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={endpointDetails.latencyHistogram} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="bin" stroke="#888888" fontSize={11} tickLine={false} />
                    <YAxis stroke="#888888" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-card)',
                        borderColor: 'var(--color-border)',
                        borderRadius: 6,
                        fontSize: 12,
                        color: 'var(--color-foreground)'
                      }}
                      itemStyle={{ color: 'var(--color-foreground)' }}
                      formatter={(val: any) => [`${val} requests`, 'Count']}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Recent Request Traces */}
              <div className="modal-section-title">Recent Request Traces (Last 25)</div>
              <div className="table-wrapper">
                <table className="devpulse-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Time</th>
                      <th>Environment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpointDetails.recentEvents.slice(0, 25).map(ev => (
                      <tr key={ev.id}>
                        <td>
                          <span className={`status-pill ${ev.statusCode < 400 ? 'status-live' : 'status-ended'}`}>
                            {ev.statusCode}
                          </span>
                        </td>
                        <td>{ev.durationMs} ms</td>
                        <td>{formatTimestamp(ev.completedAt)}</td>
                        <td>{ev.environment || 'development'}</td>
                      </tr>
                    ))}
                    {endpointDetails.recentEvents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="table-empty-row">No recent traces.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="modal-footer-btn-row">
                <button
                  type="button"
                  className="action-button-accent"
                  onClick={() => setActiveEndpointId(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Services Management Modal */}
      {showServiceModal && (
        <div className="modal-backdrop" onClick={() => setShowServiceModal(false)}>
          <div className="modal-card modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Monitored Services & Instrumentation</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowServiceModal(false)}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              {/* Add Service Form */}
              <form onSubmit={handleCreateService} className="create-service-form">
                <div className="form-row">
                  <div className="form-group flex-1">
                    <label className="form-label">Service / Application Name</label>
                    <input
                      type="text"
                      placeholder="e.g. users-api, auth-backend"
                      value={newServiceName}
                      onChange={e => setNewServiceName(e.target.value)}
                      className="form-input"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Environment</label>
                    <select
                      value={newServiceEnv}
                      onChange={e => setNewServiceEnv(e.target.value)}
                      className="form-select"
                    >
                      <option value="development">Development</option>
                      <option value="staging">Staging</option>
                      <option value="test">Test</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Integration Type</label>
                    <select
                      value={newServiceType}
                      onChange={e => setNewServiceType(e.target.value)}
                      className="form-select"
                    >
                      <option value="express">Express</option>
                      <option value="fastify">Fastify</option>
                      <option value="nestjs">NestJS</option>
                      <option value="custom">Custom / HTTP</option>
                    </select>
                  </div>

                  <button type="submit" className="action-button-accent form-btn">
                    <Plus size={14} />
                    <span>Generate Token</span>
                  </button>
                </div>
              </form>

              {/* Registered Services List */}
              <div className="modal-section-title">Registered Services</div>
              <div className="services-list">
                {data?.services?.map(svc => (
                  <div key={svc.id} className="service-item-row">
                    <div className="service-info-left">
                      <div className="service-name-row">
                        <strong className="service-title">{svc.name}</strong>
                        <span className="service-env-pill">{svc.environment}</span>
                        <span className="service-type-pill">{svc.integrationType}</span>
                      </div>
                      <div className="service-meta-text">
                        <span>Total Requests: {formatNumber(svc.totalRequests)}</span>
                        <span>Created: {formatTimestamp(svc.createdAt)}</span>
                        {svc.lastEventAt && <span>Last Active: {formatTimestamp(svc.lastEventAt)}</span>}
                      </div>
                    </div>

                    <div className="service-actions-right">
                      <button
                        type="button"
                        className="service-action-btn"
                        onClick={() => toggleApiServiceMonitoring(svc.id, !svc.monitoringEnabled)}
                      >
                        {svc.monitoringEnabled ? 'Disable' : 'Enable'}
                      </button>

                      <button
                        type="button"
                        className="service-action-btn"
                        onClick={() => regenerateApiServiceToken(svc.id)}
                        title="Regenerate token"
                      >
                        <RefreshCw size={12} />
                        <span>Reset Token</span>
                      </button>

                      <button
                        type="button"
                        className="service-action-btn btn-danger"
                        onClick={() => handleDeleteService(svc.id, svc.name)}
                        title="Remove service"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                {(!data?.services || data.services.length === 0) && (
                  <div className="empty-state-text">No services registered yet. Create one above to get an ingestion token.</div>
                )}
              </div>

              <div className="modal-footer-btn-row">
                <button
                  type="button"
                  className="action-button-accent"
                  onClick={() => setShowServiceModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Single-view Token Disclosure Modal */}
      {newServiceTokenData && (
        <div className="modal-backdrop">
          <div className="modal-card modal-lg">
            <div className="modal-header">
              <div className="modal-title-wrap">
                <CheckCircle2 size={20} className="text-success" />
                <h3 className="modal-title">Service Token Generated for "{newServiceTokenData.serviceName}"</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={onClearNewServiceToken}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="token-alert-box">
                <p>
                  <strong>Copy this token now.</strong> DevPulse stores only cryptographic hashes; you cannot view this plain secret again.
                </p>
                <div className="token-display-box">
                  <code>{newServiceTokenData.token}</code>
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => copyToClipboard(newServiceTokenData.token, false)}
                  >
                    {copiedToken ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                    <span>{copiedToken ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="modal-section-title">Express Middleware Snippet</div>
              <p className="section-instruction-text">
                Add this zero-dependency snippet to your Node.js/Express server to stream request metrics directly to DevPulse on port {ingestion.port}:
              </p>

              <div className="code-snippet-box">
                <div className="code-snippet-header">
                  <span>app.js / server.js</span>
                  <button
                    type="button"
                    className="snippet-copy-btn"
                    onClick={() =>
                      copyToClipboard(
                        `const http = require('http');

function devpulseMiddleware(options) {
  const host = options.host || '127.0.0.1';
  const port = options.port || ${ingestion.port};
  const token = options.token;
  const serviceId = options.serviceId || '${newServiceTokenData.serviceName}';
  const agent = new http.Agent({ keepAlive: true, maxSockets: 5, timeout: 1000 });

  return function(req, res, next) {
    const startHr = process.hrtime();
    const startTime = Date.now();

    const onFinish = () => {
      res.removeListener('finish', onFinish);
      res.removeListener('close', onFinish);
      try {
        const rawPath = (req.baseUrl || '') + (req.path || req.url || '/').split('?')[0];
        const diff = process.hrtime(startHr);
        const durationMs = Math.round((diff[0] * 1000 + diff[1] / 1e6) * 10) / 10;
        const statusCode = res.statusCode || 200;

        const routeTemplate = ((req.baseUrl || '') + (req.route?.path || rawPath))
          .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
          .replace(/[0-9a-f]{24}/gi, ':id')
          .replace(/\\/(\\d+)(\\/|$)/g, '/:id$2');

        const payload = JSON.stringify({
          serviceId,
          method: (req.method || 'GET').toUpperCase(),
          endpoint: routeTemplate,
          statusCode,
          durationMs,
          startedAt: startTime,
          completedAt: Date.now(),
          outcome: statusCode >= 400 ? 'failure' : 'success'
        });

        const dispatch = http.request({
          hostname: host,
          port,
          path: '/api/v1/events',
          method: 'POST',
          agent,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Authorization': 'Bearer ' + token
          },
          timeout: 500
        }, r => r.resume());

        dispatch.on('error', () => {}); // Zero crash guarantee
        dispatch.write(payload);
        dispatch.end();
      } catch {}
    };

    res.on('finish', onFinish);
    res.on('close', onFinish);
    next();
  };
}

// Add to your Express server:
app.use(devpulseMiddleware({
  token: '${newServiceTokenData.token}',
  serviceId: '${newServiceTokenData.serviceName}'
}));`,
                        true
                      )
                    }
                  >
                    {copiedSnippet ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                    <span>{copiedSnippet ? 'Copied Code' : 'Copy Snippet'}</span>
                  </button>
                </div>
                <pre className="code-pre">
                  {`const http = require('http');

function devpulseMiddleware(options) { ... }

app.use(devpulseMiddleware({
  token: '${newServiceTokenData.token}',
  serviceId: '${newServiceTokenData.serviceName}'
}));`}
                </pre>
              </div>

              <div className="modal-footer-btn-row">
                <button
                  type="button"
                  className="action-button-accent"
                  onClick={onClearNewServiceToken}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
