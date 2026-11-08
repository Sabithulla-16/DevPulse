import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Cpu,
  FolderGit2,
  GitBranch,
  Code2,
  Network,
  Bot,
  Check,
  X,
  Layers,
  ArrowRight
} from 'lucide-react';
import type {
  PulseInsightsData,
  PulseInsight,
  ModuleHealthStatus,
  InsightEvidence
} from '../../types';

interface PulseInsightsPageProps {
  data?: PulseInsightsData;
  timeRange: 'today' | '7d' | '30d' | '90d';
  onTimeRangeChange: (range: 'today' | '7d' | '30d' | '90d') => void;
  onRunAnalysis: () => void;
  onUpdateStatus: (id: string, status: 'viewed' | 'dismissed' | 'resolved') => void;
  onExplainInsight: (insightId: string) => void;
  explanations?: Record<string, string>;
  isExplaining?: Record<string, boolean>;
}

const MODULE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  system: Cpu,
  workspace: FolderGit2,
  git: GitBranch,
  coding: Code2,
  api: Network,
  ai: Bot,
  'cross-module': Layers
};

const SEVERITY_STYLES = {
  high: 'bg-red-950/40 text-red-400 border-red-800/40',
  medium: 'bg-amber-950/40 text-amber-400 border-amber-800/40',
  low: 'bg-sky-950/40 text-sky-400 border-sky-800/40',
  info: 'playground-card opacity-80'
};

const HEALTH_STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.FC<{ className?: string }> }> = {
  healthy: { bg: 'border-emerald-800/40 bg-emerald-950/20', text: 'text-emerald-400', icon: CheckCircle2 },
  warning: { bg: 'border-amber-800/40 bg-amber-950/20', text: 'text-amber-400', icon: AlertTriangle },
  degraded: { bg: 'border-red-800/40 bg-red-950/20', text: 'text-red-400', icon: XCircle },
  insufficient_data: { bg: 'playground-card', text: 'opacity-60', icon: HelpCircle },
  unavailable: { bg: 'playground-card', text: 'opacity-50', icon: HelpCircle }
};

export const PulseInsightsPage: React.FC<PulseInsightsPageProps> = ({
  data,
  timeRange,
  onTimeRangeChange,
  onRunAnalysis,
  onUpdateStatus,
  onExplainInsight,
  explanations = {},
  isExplaining = {}
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [expandedEvidence, setExpandedEvidence] = useState<Record<string, boolean>>({});
  const [showResolved, setShowResolved] = useState<boolean>(false);

  const toggleEvidence = (id: string) => {
    setExpandedEvidence(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const insights = (data?.insights || []).filter(ins => {
    if (!showResolved && (ins.status === 'dismissed' || ins.status === 'resolved')) {
      return false;
    }
    if (categoryFilter !== 'all' && ins.category !== categoryFilter) {
      return false;
    }
    return true;
  });

  const health = data?.health;
  const modulesList = health?.modules ? Object.entries(health.modules) : [];

  return (
    <div className="insights-shell flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <Activity className="w-6 h-6 text-indigo-400" />
            <h1 className="text-xl font-bold tracking-wide">Pulse Insights</h1>
            <span className="text-xs playground-card px-2 py-0.5 rounded-full font-medium">
              Intelligence Layer
            </span>
          </div>
          <p className="text-xs sm:text-sm opacity-70 mt-1">
            Deterministic cross-module correlation engine &amp; unified developer environment health.
          </p>
        </div>

        {/* Controls: Time filter & Run button */}
        <div className="flex items-center gap-3">
          <div className="playground-nav-pill flex items-center p-1 rounded-xl">
            {(['today', '7d', '30d', '90d'] as const).map(range => (
              <button
                key={range}
                onClick={() => onTimeRangeChange(range)}
                className={`playground-nav-btn px-3 py-1 text-xs font-medium rounded-lg transition uppercase cursor-pointer ${
                  timeRange === range ? 'tab-active-neutral' : ''
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          <button
            onClick={onRunAnalysis}
            className="btn-theme-primary flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-xl shadow-sm transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Run Analysis
          </button>
        </div>
      </div>

      {/* Environment Health Overview Banner */}
      {health && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider opacity-70 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Environment Health Overview
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <span className="opacity-70">Status:</span>
              <span
                className={`font-semibold uppercase tracking-wider text-[11px] px-2.5 py-0.5 rounded-full border ${
                  health.overallStatus === 'healthy'
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                    : health.overallStatus === 'attention_required'
                    ? 'bg-amber-950/40 text-amber-400 border-amber-800/40'
                    : 'bg-red-950/40 text-red-400 border-red-800/40'
                }`}
              >
                {health.overallStatus.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Module Health Cards (6 modules) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {modulesList.map(([key, mod]) => {
              const statusCfg = HEALTH_STATUS_STYLES[mod.status] || HEALTH_STATUS_STYLES.insufficient_data;
              const StatusIcon = statusCfg.icon;
              const ModIcon = MODULE_ICONS[key] || Activity;

              return (
                <div
                  key={key}
                  className={`insights-card rounded-xl p-4 transition flex flex-col justify-between ${statusCfg.bg}`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ModIcon className="w-4 h-4 opacity-80" />
                        <span className="font-semibold text-sm capitalize">{mod.label || key}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-semibold ${statusCfg.text} capitalize`}>
                          {mod.status.replace('_', ' ')}
                        </span>
                        <StatusIcon className={`w-3.5 h-3.5 ${statusCfg.text}`} />
                      </div>
                    </div>

                    <p className="text-xs opacity-70 mt-2 line-clamp-2">
                      {mod.explanation}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-xs">
                    <span className="opacity-60">Health Score</span>
                    <span className="font-mono font-bold">
                      {mod.score}/100
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Insights Feed Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider opacity-80">
              Active Findings &amp; Correlations ({insights.length})
            </h2>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <div className="playground-nav-pill flex items-center p-0.5 rounded-lg">
              {['all', 'cross-module', 'system', 'workspace', 'git', 'coding', 'api', 'ai'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`playground-nav-btn px-2.5 py-1 rounded capitalize text-[11px] transition cursor-pointer ${
                    categoryFilter === cat ? 'tab-active-neutral' : ''
                  }`}
                >
                  {cat.replace('-', ' ')}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-1.5 opacity-70 cursor-pointer ml-2 text-[11px]">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={e => setShowResolved(e.target.checked)}
                className="rounded accent-zinc-500"
              />
              Show Resolved
            </label>
          </div>
        </div>

        {/* Insights List */}
        {insights.length === 0 ? (
          <div className="playground-card border-dashed rounded-2xl p-12 text-center space-y-3 opacity-75">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <div className="text-sm font-medium">No anomalous patterns detected</div>
            <p className="text-xs opacity-60 max-w-md mx-auto">
              Your development environment is stable and consistent across monitored modules. Trigger
              new coding, git, or AI sessions to expand cross-module coverage.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {insights.map(insight => {
              const severityClass = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.info;
              const isEvidenceOpen = !!expandedEvidence[insight.id];
              const explanation = explanations[insight.id];
              const explaining = isExplaining[insight.id];
              const CatIcon = MODULE_ICONS[insight.category] || Activity;

              return (
                <div
                  key={insight.id}
                  className={`insights-card rounded-xl p-5 hover:border-[var(--color-foreground-muted)] transition space-y-4 ${
                    insight.status === 'resolved' ? 'opacity-60' : ''
                  }`}
                >
                  {/* Insight Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${severityClass}`}>
                          {insight.severity}
                        </span>

                        <span className="text-[11px] font-medium playground-card px-2 py-0.5 rounded-full flex items-center gap-1 capitalize">
                          <CatIcon className="w-3 h-3" />
                          {insight.category.replace('-', ' ')}
                        </span>

                        <span className="text-[11px] opacity-60">
                          {Math.round(insight.confidence * 100)}% confidence
                        </span>

                        {insight.status !== 'new' && (
                          <span className="text-[10px] uppercase font-mono playground-card px-2 py-0.5 rounded">
                            {insight.status}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-semibold mt-1">
                        {insight.title}
                      </h3>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => onExplainInsight(insight.id)}
                        disabled={explaining}
                        className="playground-card flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition cursor-pointer hover:tab-active-neutral"
                        title="Generate deeper explainability analysis"
                      >
                        <Sparkles className="w-3.5 h-3.5 opacity-70" />
                        {explaining ? 'Analyzing...' : 'Explain with AI'}
                      </button>

                      {insight.status !== 'resolved' && (
                        <button
                          onClick={() => onUpdateStatus(insight.id, 'resolved')}
                          className="playground-card p-1.5 hover:text-emerald-400 rounded-lg transition cursor-pointer"
                          title="Mark Resolved"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}

                      {insight.status !== 'dismissed' && (
                        <button
                          onClick={() => onUpdateStatus(insight.id, 'dismissed')}
                          className="playground-card p-1.5 hover:text-rose-400 rounded-lg transition cursor-pointer"
                          title="Dismiss"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Description (safe non-causal phrasing) */}
                  <p className="text-xs opacity-80 leading-relaxed">
                    {insight.description}
                  </p>

                  {/* Recommendation */}
                  {insight.recommendation && (
                    <div className="playground-card rounded-lg p-3 text-xs flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-semibold">Actionable Suggestion: </strong>
                        <span className="opacity-80">{insight.recommendation}</span>
                      </div>
                    </div>
                  )}

                  {/* AI Explanation Result */}
                  {explanation && (
                    <div className="playground-card rounded-lg p-3.5 text-xs space-y-1.5 border-l-2 border-l-emerald-500">
                      <div className="flex items-center gap-1.5 font-semibold text-[11px] uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        Diagnostic Analysis
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap opacity-90">{explanation}</p>
                    </div>
                  )}

                  {/* Evidence Drawer Toggle */}
                  {insight.evidence && insight.evidence.length > 0 && (
                    <div>
                      <button
                        onClick={() => toggleEvidence(insight.id)}
                        className="flex items-center gap-1 text-xs opacity-70 hover:opacity-100 transition cursor-pointer"
                      >
                        {isEvidenceOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        <span>{isEvidenceOpen ? 'Hide Evidence Metrics' : `View Evidence Metrics (${insight.evidence.length})`}</span>
                      </button>

                      {isEvidenceOpen && (
                        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-3 playground-card rounded-lg">
                          {insight.evidence.map((ev, idx) => (
                            <div key={idx} className="playground-header p-2.5 rounded border text-[11px] space-y-0.5">
                              <div className="opacity-50 uppercase tracking-wider text-[10px] flex items-center justify-between">
                                <span>{ev.module}</span>
                                {ev.threshold !== undefined && <span>Threshold: {ev.threshold}</span>}
                              </div>
                              <div className="font-medium opacity-80">{ev.label}</div>
                              <div className="font-mono font-bold">
                                {ev.value} {ev.unit || ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
