import React, { useState } from 'react';
import {
  BarChart3,
  Coins,
  Cpu,
  Clock,
  Layers,
  Zap
} from 'lucide-react';
import type { AiOverviewSummary, AiModelUsage, AiUsageRecord, AiProviderInfo } from '../../types';

interface UsageAnalyticsViewProps {
  summary?: AiOverviewSummary;
  models?: AiModelUsage[];
  recentUsage?: AiUsageRecord[];
  providers?: AiProviderInfo[];
  timeFilter: 'today' | '7d' | '30d' | '90d' | 'all';
  onTimeFilterChange: (filter: 'today' | '7d' | '30d' | '90d' | 'all') => void;
}

export const UsageAnalyticsView: React.FC<UsageAnalyticsViewProps> = ({
  summary,
  models = [],
  recentUsage = [],
  providers = [],
  timeFilter,
  onTimeFilterChange
}) => {
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  const totalTokens = summary?.totalTokens || 0;
  const inputTokens = summary?.inputTokens || 0;
  const outputTokens = summary?.outputTokens || 0;
  const totalCost = summary?.estimatedCost || 0;
  const totalRequests = summary?.totalRequests || 0;

  // Local vs Cloud calculation
  const ollamaModels = models.filter(m => m.provider === 'ollama');
  const localTokens = ollamaModels.reduce((acc, m) => acc + (m.totalTokens || 0), 0);
  const cloudTokens = Math.max(0, totalTokens - localTokens);
  const localPercent = totalTokens > 0 ? Math.round((localTokens / totalTokens) * 100) : 0;
  const cloudPercent = totalTokens > 0 ? 100 - localPercent : 0;

  // Filtered recent usage
  const filteredUsage = recentUsage.filter(record => {
    if (providerFilter !== 'all' && record.provider !== providerFilter) return false;
    if (sourceFilter !== 'all' && record.source !== sourceFilter) return false;
    return true;
  });

  return (
    <div className="playground-shell flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
      {/* Header with Time Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-400" />
            AI Usage &amp; Cost Telemetry
          </h1>
          <p className="text-sm opacity-70 mt-1">
            Real token consumption, generation latency, and estimated cloud expenditure.
          </p>
        </div>

        {/* Time Filter Pills */}
        <div className="playground-nav-pill flex items-center p-1 rounded-xl">
          {(['today', '7d', '30d', '90d', 'all'] as const).map(filter => (
            <button
              key={filter}
              onClick={() => onTimeFilterChange(filter)}
              className={`playground-nav-btn px-3 py-1 text-xs font-medium rounded-lg transition capitalize cursor-pointer ${
                timeFilter === filter ? 'tab-active-neutral' : ''
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Top Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Tokens */}
        <div className="playground-card rounded-xl p-5">
          <div className="flex items-center justify-between opacity-70 text-xs font-medium">
            <span>Total Tokens</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold mt-2">
            {totalTokens.toLocaleString()}
          </div>
          <div className="flex items-center gap-2 text-[11px] opacity-70 mt-2 font-mono">
            <span>In: {inputTokens.toLocaleString()}</span>
            <span>•</span>
            <span>Out: {outputTokens.toLocaleString()}</span>
          </div>
        </div>

        {/* Estimated Cost */}
        <div className="playground-card rounded-xl p-5">
          <div className="flex items-center justify-between opacity-70 text-xs font-medium">
            <span>Estimated Cost</span>
            <Coins className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold mt-2">
            ${totalCost.toFixed(4)}
          </div>
          <p className="text-[11px] opacity-70 mt-2">
            Today: <strong className="font-semibold">${(summary?.todayCost || 0).toFixed(4)}</strong>
          </p>
        </div>

        {/* Total Requests */}
        <div className="playground-card rounded-xl p-5">
          <div className="flex items-center justify-between opacity-70 text-xs font-medium">
            <span>AI Requests</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold mt-2">
            {totalRequests.toLocaleString()}
          </div>
          <p className="text-[11px] opacity-70 mt-2">
            Active models: <strong className="font-semibold">{models.length}</strong>
          </p>
        </div>

        {/* Local vs Cloud Ratio */}
        <div className="playground-card rounded-xl p-5">
          <div className="flex items-center justify-between opacity-70 text-xs font-medium">
            <span>Local vs Cloud</span>
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-cyan-400">{localPercent}%</span>
            <span className="text-xs opacity-60">Local (Ollama)</span>
          </div>
          <div className="w-full bg-black/10 dark:bg-white/10 h-1.5 rounded-full mt-3 overflow-hidden flex">
            <div className="bg-cyan-500 h-full" style={{ width: `${localPercent}%` }} />
            <div className="bg-indigo-500 h-full" style={{ width: `${cloudPercent}%` }} />
          </div>
          <div className="flex justify-between text-[10px] opacity-60 mt-1 font-mono">
            <span>Local: {localTokens.toLocaleString()}</span>
            <span>Cloud: {cloudTokens.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Model Breakdown Table */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider opacity-70 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-indigo-400" />
          Model Consumption Distribution
        </h2>

        {models.length === 0 ? (
          <div className="playground-card border-dashed rounded-xl p-8 text-center opacity-60 text-xs">
            No model consumption records recorded for this period.
          </div>
        ) : (
          <div className="playground-card rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="playground-header opacity-70 border-b uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Model</th>
                  <th className="py-3 px-4">Provider</th>
                  <th className="py-3 px-4 text-right">Requests</th>
                  <th className="py-3 px-4 text-right">Total Tokens</th>
                  <th className="py-3 px-4 text-right">Input / Output</th>
                  <th className="py-3 px-4 text-right">Est. Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10 font-mono">
                {models.map(m => (
                  <tr key={`${m.provider}-${m.model}`} className="hover:bg-black/5 dark:hover:bg-white/5 transition">
                    <td className="py-3 px-4 font-semibold">{m.model}</td>
                    <td className="py-3 px-4 opacity-75">
                      <span className="capitalize px-2 py-0.5 rounded playground-card text-[11px]">
                        {m.provider}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right opacity-80">{m.requestCount.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-medium">
                      {m.totalTokens.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right opacity-70 text-[11px]">
                      {m.inputTokens.toLocaleString()} / {m.outputTokens.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-500 font-medium">
                      ${m.estimatedCost.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historical Usage Telemetry Log */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider opacity-70 flex items-center gap-2">
            <Clock className="w-4 h-4 opacity-70" />
            Historical Usage Log ({filteredUsage.length})
          </h2>

          <div className="flex items-center gap-2 text-xs">
            <select
              value={providerFilter}
              onChange={e => setProviderFilter(e.target.value)}
              className="playground-select rounded px-2.5 py-1 focus:outline-none capitalize"
            >
              <option value="all">All Providers</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
              className="playground-select rounded px-2.5 py-1 focus:outline-none capitalize"
            >
              <option value="all">All Sources</option>
              <option value="playground">Playground</option>
              <option value="claude-code">Claude Code</option>
              <option value="copilot">Copilot</option>
            </select>
          </div>
        </div>

        {filteredUsage.length === 0 ? (
          <div className="playground-card border-dashed rounded-xl p-8 text-center opacity-60 text-xs">
            No telemetry records match the selected filters.
          </div>
        ) : (
          <div className="playground-card rounded-xl overflow-hidden max-h-96 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-xs">
              <thead className="playground-header opacity-70 border-b uppercase tracking-wider text-[10px] sticky top-0 backdrop-blur-sm">
                <tr>
                  <th className="py-2.5 px-4">Time</th>
                  <th className="py-2.5 px-4">Source</th>
                  <th className="py-2.5 px-4">Provider / Model</th>
                  <th className="py-2.5 px-4 text-right">Duration</th>
                  <th className="py-2.5 px-4 text-right">Tokens</th>
                  <th className="py-2.5 px-4 text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10 font-mono text-[11px]">
                {filteredUsage.slice(0, 100).map(record => (
                  <tr key={record.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition">
                    <td className="py-2 px-4 opacity-70 whitespace-nowrap">
                      {new Date(record.timestamp).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td className="py-2 px-4 opacity-80">
                      <span className="playground-card px-1.5 py-0.5 rounded text-[10px] uppercase">
                        {record.source}
                      </span>
                    </td>
                    <td className="py-2 px-4">
                      <span className="opacity-60">{record.provider}/</span>
                      <span className="font-semibold">{record.model}</span>
                    </td>
                    <td className="py-2 px-4 text-right opacity-70">
                      {record.durationMs ? `${record.durationMs}ms` : '—'}
                    </td>
                    <td className="py-2 px-4 text-right font-medium">
                      {(record.totalTokens || (record.inputTokens || 0) + (record.outputTokens || 0)).toLocaleString()}
                    </td>
                    <td className="py-2 px-4 text-right text-emerald-500 font-medium">
                      ${(record.estimatedCost || 0).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
