import { createHash } from 'node:crypto';
import type { Database } from '../../database/Database';
import type {
  PulseInsight,
  InsightEvidence,
  EnvironmentHealthOverview,
  ModuleHealthStatus,
  PulseInsightsData,
  SystemMetricRecord
} from '../../shared/types';
import type { AiProviderRegistry } from '../ai/AiProviderRegistry';

export class CorrelationEngine {
  constructor(
    private readonly db: Database,
    private readonly aiRegistry?: AiProviderRegistry
  ) {}

  /**
   * Generates a deterministic deduplication hash for an insight.
   * Uses 4-hour time bucketing so repeated checks within 4 hours don't produce duplicate alerts.
   */
  private generateDedupeHash(ruleId: string, category: string, timeRangeEnd: number): string {
    const timeBucket = Math.floor(timeRangeEnd / (4 * 3600 * 1000));
    return createHash('sha256')
      .update(`${ruleId}_${category}_${timeBucket}`)
      .digest('hex')
      .slice(0, 32);
  }

  /**
   * Evaluates all cross-module and single-module intelligence rules for the given time range.
   */
  public async evaluateInsights(timeRange: 'today' | '7d' | '30d' | '90d' = '7d'): Promise<PulseInsightsData> {
    const now = Date.now();
    let since = now - 7 * 86400 * 1000;
    if (timeRange === 'today') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      since = d.getTime();
    } else if (timeRange === '30d') {
      since = now - 30 * 86400 * 1000;
    } else if (timeRange === '90d') {
      since = now - 90 * 86400 * 1000;
    }

    const generatedInsights: PulseInsight[] = [];

    // 1. Cross-Module Correlations
    const corr1 = this.evaluateCodingAiCorrelation(since, now);
    if (corr1) generatedInsights.push(corr1);

    const corr2 = this.evaluateSystemApiCorrelation(since, now);
    if (corr2) generatedInsights.push(corr2);

    const corr3 = this.evaluateGitCodingCorrelation(since, now);
    if (corr3) generatedInsights.push(corr3);

    const corr4 = this.evaluateWorkspaceSystemCorrelation(since, now);
    if (corr4) generatedInsights.push(corr4);

    const corr5 = this.evaluateMultiFactorCorrelation(since, now);
    if (corr5) generatedInsights.push(corr5);

    // 2. Module-specific Insights
    const sysInsight = this.evaluateSystemInsights(since, now);
    if (sysInsight) generatedInsights.push(sysInsight);

    const gitInsight = this.evaluateGitInsights(since, now);
    if (gitInsight) generatedInsights.push(gitInsight);

    const apiInsight = this.evaluateApiInsights(since, now);
    if (apiInsight) generatedInsights.push(apiInsight);

    const aiInsight = this.evaluateAiInsights(since, now);
    if (aiInsight) generatedInsights.push(aiInsight);

    const wsInsight = this.evaluateWorkspaceInsights(since, now);
    if (wsInsight) generatedInsights.push(wsInsight);

    // Save to repository (with deduplication)
    for (const insight of generatedInsights) {
      this.db.insights.saveInsight(insight);
    }

    // Retrieve full insights list from repo for the time filter
    const storedInsights = this.db.insights.getInsights({ since, limit: 100 });

    // Compute environment health
    const health = this.evaluateEnvironmentHealth(since, now);

    return {
      insights: storedInsights,
      health,
      timeRange,
      lastEvaluatedAt: now,
      moduleSummaries: this.buildModuleSummaries(since)
    };
  }

  // -------------------------------------------------------------------------
  // Rule 1: Coding + AI Alignment
  // -------------------------------------------------------------------------
  private evaluateCodingAiCorrelation(since: number, now: number): PulseInsight | null {
    try {
      const codingSessions = this.db.coding.getRecentSessions({ since, limit: 100 });
      const aiUsage = this.db.ai.getUsageRecords({ since, limit: 100 });

      if (codingSessions.length < 2 || aiUsage.length < 3) {
        return null; // Insufficient sample size
      }

      // Group into 15-minute bins
      const binMs = 15 * 60 * 1000;
      const bins = new Map<number, { activeSec: number; tokens: number }>();

      for (const s of codingSessions) {
        const bin = Math.floor(s.startedAt / binMs) * binMs;
        const entry = bins.get(bin) || { activeSec: 0, tokens: 0 };
        entry.activeSec += s.activeDurationSeconds;
        bins.set(bin, entry);
      }

      for (const u of aiUsage) {
        const bin = Math.floor(u.timestamp / binMs) * binMs;
        const entry = bins.get(bin) || { activeSec: 0, tokens: 0 };
        entry.tokens += u.totalTokens || 0;
        bins.set(bin, entry);
      }

      // Find overlapping bins where activeSec >= 300 and tokens >= 1000
      let matchingBins = 0;
      let totalTokensInBins = 0;
      let totalCodingTimeInBins = 0;

      for (const entry of bins.values()) {
        if (entry.activeSec >= 300 && entry.tokens >= 1000) {
          matchingBins++;
          totalTokensInBins += entry.tokens;
          totalCodingTimeInBins += entry.activeSec;
        }
      }

      if (matchingBins >= 2) {
        const dedupeHash = this.generateDedupeHash('corr_coding_ai', 'cross-module', now);
        const evidence: InsightEvidence[] = [
          { label: 'Synchronized 15-min Intervals', value: matchingBins, module: 'coding', unit: 'bins' },
          { label: 'AI Tokens in Active Windows', value: totalTokensInBins, module: 'ai', unit: 'tokens' },
          { label: 'Active Coding Time in Windows', value: Math.round(totalCodingTimeInBins / 60), module: 'coding', unit: 'mins' }
        ];

        return {
          id: '',
          category: 'cross-module',
          title: 'AI Usage Aligns With Coding Sessions',
          description: `AI Playground usage increased during periods of elevated coding activity across ${matchingBins} observed time intervals.`,
          severity: 'info',
          confidence: 0.88,
          evidence,
          recommendation: 'Consider caching repetitive prompts as templates in Prompt Studio to streamline your workflow during intensive coding stretches.',
          timeRangeStart: since,
          timeRangeEnd: now,
          status: 'new',
          dedupeHash,
          generatedAt: now,
          updatedAt: now
        };
      }
    } catch {}
    return null;
  }

  // -------------------------------------------------------------------------
  // Rule 2: System Load & API Latency Degradation
  // -------------------------------------------------------------------------
  private evaluateSystemApiCorrelation(since: number, now: number): PulseInsight | null {
    try {
      const endpoints = this.db.api.getEndpoints();
      const sysHistory = this.db.systemMetrics.getRecent(50);

      if (endpoints.length === 0 || sysHistory.length < 3) return null;

      const slowEndpoints = endpoints.filter(e => e.p95LatencyMs > 400);
      const highCpuSamples = sysHistory.filter((s: SystemMetricRecord) => s.cpuPercent > 70 || s.memoryUsedPercent > 80);

      if (slowEndpoints.length > 0 && highCpuSamples.length >= 2) {
        const worstEndpoint = slowEndpoints[0];
        const avgCpu = Math.round(highCpuSamples.reduce((a: number, b: SystemMetricRecord) => a + b.cpuPercent, 0) / highCpuSamples.length);
        const dedupeHash = this.generateDedupeHash('corr_sys_api', 'cross-module', now);

        const evidence: InsightEvidence[] = [
          { label: 'Degraded Endpoint', value: `${worstEndpoint.method} ${worstEndpoint.routeTemplate}`, module: 'api' },
          { label: 'Measured P95 Latency', value: Math.round(worstEndpoint.p95LatencyMs), module: 'api', unit: 'ms', threshold: '400ms' },
          { label: 'Average Host CPU During Period', value: avgCpu, module: 'system', unit: '%' }
        ];

        return {
          id: '',
          category: 'cross-module',
          title: 'Elevated API Latency During High Resource Load',
          description: `API latency increased during periods of elevated system resource utilization (average CPU ${avgCpu}%).`,
          severity: 'medium',
          confidence: 0.82,
          evidence,
          recommendation: 'Inspect long-running background tasks or consider rate-limiting intensive local services.',
          timeRangeStart: since,
          timeRangeEnd: now,
          status: 'new',
          dedupeHash,
          generatedAt: now,
          updatedAt: now
        };
      }
    } catch {}
    return null;
  }

  // -------------------------------------------------------------------------
  // Rule 3: Git Commits & Coding Session Patterns
  // -------------------------------------------------------------------------
  private evaluateGitCodingCorrelation(since: number, now: number): PulseInsight | null {
    try {
      const repos = this.db.git.getRepositories();
      if (repos.length === 0) return null;

      const commits = this.db.git.getCommits(repos[0].id, { limit: 100 });
      const recentCommits = commits.filter(c => c.timestamp >= since);
      const codingSessions = this.db.coding.getRecentSessions({ since, limit: 100 });

      // Check if user has substantial active coding time but 0 commits
      const totalActiveHours = codingSessions.reduce((a, b) => a + b.activeDurationSeconds, 0) / 3600;

      if (totalActiveHours >= 4 && recentCommits.length === 0) {
        const dedupeHash = this.generateDedupeHash('corr_git_coding_uncommitted', 'cross-module', now);
        const evidence: InsightEvidence[] = [
          { label: 'Recorded Active Coding Time', value: totalActiveHours.toFixed(1), module: 'coding', unit: 'hours' },
          { label: 'Commits Recorded', value: 0, module: 'git' }
        ];

        return {
          id: '',
          category: 'cross-module',
          title: 'Prolonged Coding Without Repository Commits',
          description: `Repository commit activity decoupled from recorded coding session duration (${totalActiveHours.toFixed(1)} active hours with no commits).`,
          severity: 'low',
          confidence: 0.9,
          evidence,
          recommendation: 'Create a commit or branch checkpoint to ensure your recent work is tracked and safely versioned.',
          timeRangeStart: since,
          timeRangeEnd: now,
          status: 'new',
          dedupeHash,
          generatedAt: now,
          updatedAt: now
        };
      }
    } catch {}
    return null;
  }

  // -------------------------------------------------------------------------
  // Rule 4: Workspace Growth & Disk Consumption
  // -------------------------------------------------------------------------
  private evaluateWorkspaceSystemCorrelation(since: number, now: number): PulseInsight | null {
    try {
      const scans = this.db.fileScans.getScanHistory();
      const diskMetrics = this.db.diskMetrics.getLatest();

      if (scans.length < 2 || diskMetrics.length === 0) return null;

      const latestScan = scans[0];
      const prevScan = scans[scans.length - 1];
      const deltaBytes = latestScan.totalSizeBytes - prevScan.totalSizeBytes;
      const deltaMb = Math.round(deltaBytes / (1024 * 1024));

      const primaryDisk = diskMetrics[0];
      const isHighDisk = primaryDisk.usedPercent > 85;

      if (deltaMb > 300 && isHighDisk) {
        const dedupeHash = this.generateDedupeHash('corr_ws_disk', 'cross-module', now);
        const evidence: InsightEvidence[] = [
          { label: 'Workspace Growth Delta', value: `+${deltaMb}`, module: 'workspace', unit: 'MB' },
          { label: 'Host Disk Used Percentage', value: primaryDisk.usedPercent.toFixed(1), module: 'system', unit: '%' }
        ];

        return {
          id: '',
          category: 'cross-module',
          title: 'Workspace Growth Coincided with Low Disk Space',
          description: `Workspace storage growth (+${deltaMb} MB) coincided with increasing local disk utilization (${primaryDisk.usedPercent.toFixed(1)}% full).`,
          severity: 'medium',
          confidence: 0.85,
          evidence,
          recommendation: 'Check build artifact directories (e.g. dist, node_modules) or run File Intelligence duplicate cleaner.',
          timeRangeStart: since,
          timeRangeEnd: now,
          status: 'new',
          dedupeHash,
          generatedAt: now,
          updatedAt: now
        };
      }
    } catch {}
    return null;
  }

  // -------------------------------------------------------------------------
  // Rule 5: Multi-Factor System, API & Coding Strain
  // -------------------------------------------------------------------------
  private evaluateMultiFactorCorrelation(since: number, now: number): PulseInsight | null {
    try {
      const liveCoding = this.db.coding.getRecentSessions({ since, limit: 5 });
      const apiSummary = this.db.api.getSummary(since);
      const sysHistory = this.db.systemMetrics.getRecent(20);

      const isLiveCoding = liveCoding.some(s => s.status === 'active');
      const hasErrors = apiSummary.errorRate > 3;
      const highLoad = sysHistory.some((s: SystemMetricRecord) => s.cpuPercent > 80);

      if (isLiveCoding && hasErrors && highLoad) {
        const dedupeHash = this.generateDedupeHash('corr_multifactor', 'cross-module', now);
        const evidence: InsightEvidence[] = [
          { label: 'API Error Rate', value: apiSummary.errorRate.toFixed(1), module: 'api', unit: '%' },
          { label: 'Active Coding Session', value: 'Active', module: 'coding' },
          { label: 'Peak CPU Observed', value: '>80', module: 'system', unit: '%' }
        ];

        return {
          id: '',
          category: 'cross-module',
          title: 'System, Coding, and API Resource Contention',
          description: 'API request latency and errors elevated during concurrent development sessions under high system load.',
          severity: 'high',
          confidence: 0.8,
          evidence,
          recommendation: 'Examine background dev servers or database instances to alleviate local machine resource contention.',
          timeRangeStart: since,
          timeRangeEnd: now,
          status: 'new',
          dedupeHash,
          generatedAt: now,
          updatedAt: now
        };
      }
    } catch {}
    return null;
  }

  // -------------------------------------------------------------------------
  // Single-module Insights
  // -------------------------------------------------------------------------
  private evaluateSystemInsights(since: number, now: number): PulseInsight | null {
    try {
      const history = this.db.systemMetrics.getRecent(50);
      if (history.length < 5) return null;

      const avgCpu = Math.round(history.reduce((a: number, b: SystemMetricRecord) => a + b.cpuPercent, 0) / history.length);
      const avgMem = Math.round(history.reduce((a: number, b: SystemMetricRecord) => a + b.memoryUsedPercent, 0) / history.length);

      if (avgMem > 85) {
        const dedupeHash = this.generateDedupeHash('sys_high_mem', 'system', now);
        return {
          id: '',
          category: 'system',
          title: 'Sustained Memory Consumption',
          description: `Host system memory utilization averaged ${avgMem}% across the evaluated period.`,
          severity: 'medium',
          confidence: 0.95,
          evidence: [
            { label: 'Average Memory Utilization', value: avgMem, module: 'system', unit: '%', threshold: '85%' }
          ],
          recommendation: 'Review active background processes in System Intelligence to free allocated RAM.',
          timeRangeStart: since,
          timeRangeEnd: now,
          status: 'new',
          dedupeHash,
          generatedAt: now,
          updatedAt: now
        };
      }
    } catch {}
    return null;
  }

  private evaluateGitInsights(since: number, now: number): PulseInsight | null {
    try {
      const repos = this.db.git.getRepositories();
      if (repos.length === 0) return null;

      const workingTree = this.db.git.getWorkingTree(repos[0].id);
      if (workingTree.length > 20) {
        const dedupeHash = this.generateDedupeHash('git_large_working_tree', 'git', now);
        return {
          id: '',
          category: 'git',
          title: 'High Uncommitted Changes',
          description: `${workingTree.length} modified or untracked files are pending in repository "${repos[0].name}".`,
          severity: 'medium',
          confidence: 1.0,
          evidence: [
            { label: 'Pending Uncommitted Files', value: workingTree.length, module: 'git', threshold: '20' }
          ],
          recommendation: 'Review pending changes in Git Intelligence and create structured commits.',
          timeRangeStart: since,
          timeRangeEnd: now,
          status: 'new',
          dedupeHash,
          generatedAt: now,
          updatedAt: now
        };
      }
    } catch {}
    return null;
  }

  private evaluateApiInsights(since: number, now: number): PulseInsight | null {
    try {
      const summary = this.db.api.getSummary(since);
      if (summary.totalRequests >= 20 && summary.errorRate > 5) {
        const dedupeHash = this.generateDedupeHash('api_high_error_rate', 'api', now);
        const failedCount = Math.round((summary.totalRequests * summary.errorRate) / 100);
        return {
          id: '',
          category: 'api',
          title: 'Elevated API Error Rate',
          description: `Observed error rate of ${summary.errorRate.toFixed(1)}% across ${summary.totalRequests} API requests.`,
          severity: 'high',
          confidence: 0.92,
          evidence: [
            { label: 'Error Rate', value: summary.errorRate.toFixed(1), module: 'api', unit: '%', threshold: '5%' },
            { label: 'Estimated Failed Requests', value: failedCount, module: 'api' }
          ],
          recommendation: 'Check failed endpoints in API Intelligence to diagnose 4xx and 5xx response causes.',
          timeRangeStart: since,
          timeRangeEnd: now,
          status: 'new',
          dedupeHash,
          generatedAt: now,
          updatedAt: now
        };
      }
    } catch {}
    return null;
  }

  private evaluateAiInsights(since: number, now: number): PulseInsight | null {
    try {
      const summary = this.db.ai.getSummary(since);
      if (summary.totalRequests >= 5 && summary.estimatedCost > 5.0) {
        const dedupeHash = this.generateDedupeHash('ai_spending_acceleration', 'ai', now);
        return {
          id: '',
          category: 'ai',
          title: 'AI Usage and Spending Acceleration',
          description: `Total AI expenditure reached $${summary.estimatedCost.toFixed(2)} across ${summary.totalTokens.toLocaleString()} tokens.`,
          severity: 'low',
          confidence: 0.95,
          evidence: [
            { label: 'Estimated Spending', value: `$${summary.estimatedCost.toFixed(2)}`, module: 'ai' },
            { label: 'Total Tokens Consumed', value: summary.totalTokens.toLocaleString(), module: 'ai' }
          ],
          recommendation: 'Review token usage in AI Playground Usage Analytics and consider local Ollama models for high-volume tasks.',
          timeRangeStart: since,
          timeRangeEnd: now,
          status: 'new',
          dedupeHash,
          generatedAt: now,
          updatedAt: now
        };
      }
    } catch {}
    return null;
  }

  private evaluateWorkspaceInsights(since: number, now: number): PulseInsight | null {
    try {
      const scans = this.db.fileScans.getScanHistory();
      if (scans.length < 2) return null;

      const latest = scans[0];
      const prev = scans[1];
      const deltaBytes = latest.totalSizeBytes - prev.totalSizeBytes;
      const deltaMb = Math.round(deltaBytes / (1024 * 1024));

      if (deltaMb > 500) {
        const dedupeHash = this.generateDedupeHash('ws_rapid_growth', 'workspace', now);
        return {
          id: '',
          category: 'workspace',
          title: 'Rapid Workspace File Growth',
          description: `Workspace file storage increased by +${deltaMb} MB since previous scan.`,
          severity: 'info',
          confidence: 0.9,
          evidence: [
            { label: 'Growth Delta', value: `+${deltaMb} MB`, module: 'workspace' },
            { label: 'Current File Count', value: latest.fileCount, module: 'workspace' }
          ],
          recommendation: 'Examine File Intelligence breakdown to verify whether build artifacts require exclusion.',
          timeRangeStart: since,
          timeRangeEnd: now,
          status: 'new',
          dedupeHash,
          generatedAt: now,
          updatedAt: now
        };
      }
    } catch {}
    return null;
  }

  // -------------------------------------------------------------------------
  // Environment Health Overview Calculation
  // -------------------------------------------------------------------------
  public evaluateEnvironmentHealth(since: number, now: number): EnvironmentHealthOverview {
    const modules: Record<'system' | 'workspace' | 'git' | 'coding' | 'api' | 'ai', ModuleHealthStatus> = {
      system: this.computeSystemHealth(),
      workspace: this.computeWorkspaceHealth(),
      git: this.computeGitHealth(),
      coding: this.computeCodingHealth(),
      api: this.computeApiHealth(since),
      ai: this.computeAiHealth(since)
    };

    const hasDegraded = Object.values(modules).some(m => m.status === 'degraded');
    const hasWarning = Object.values(modules).some(m => m.status === 'warning');

    const overallStatus = hasDegraded
      ? 'degraded'
      : hasWarning
      ? 'attention_required'
      : 'healthy';

    const insights = this.db.insights.getInsights({ since });
    const alerts = this.db.alerts.getRecent(50, true);

    return {
      modules,
      overallStatus,
      totalInsightsCount: insights.length,
      unresolvedAlertsCount: alerts.length,
      evaluatedAt: now
    };
  }

  private computeSystemHealth(): ModuleHealthStatus {
    try {
      const latest = this.db.systemMetrics.getLatest();
      if (!latest) {
        return {
          category: 'system',
          status: 'insufficient_data',
          score: 100,
          label: 'System Monitor',
          explanation: 'No recent hardware telemetry recorded.',
          metrics: {},
          lastUpdated: Date.now()
        };
      }

      const isCritical = latest.cpuPercent > 90 || latest.memoryUsedPercent > 90;
      const isWarn = latest.cpuPercent > 75 || latest.memoryUsedPercent > 80;

      return {
        category: 'system',
        status: isCritical ? 'degraded' : isWarn ? 'warning' : 'healthy',
        score: Math.max(0, Math.round(100 - (latest.cpuPercent * 0.4 + latest.memoryUsedPercent * 0.6))),
        label: 'System Monitor',
        explanation: isCritical
          ? 'High resource utilization (CPU >90% or RAM >90%).'
          : isWarn
          ? 'Elevated resource utilization.'
          : 'Hardware resources operating within normal parameters.',
        metrics: {
          'CPU Load': `${latest.cpuPercent.toFixed(1)}%`,
          'RAM Used': `${latest.memoryUsedPercent.toFixed(1)}%`
        },
        lastUpdated: latest.timestamp
      };
    } catch {
      return {
        category: 'system',
        status: 'unavailable',
        score: 0,
        label: 'System Monitor',
        explanation: 'System telemetry unavailable.',
        metrics: {},
        lastUpdated: Date.now()
      };
    }
  }

  private computeWorkspaceHealth(): ModuleHealthStatus {
    try {
      const latest = this.db.fileScans.getLatestScan();
      if (!latest) {
        return {
          category: 'workspace',
          status: 'insufficient_data',
          score: 100,
          label: 'Workspace & Files',
          explanation: 'No workspace file scans performed yet.',
          metrics: {},
          lastUpdated: Date.now()
        };
      }

      const sizeMb = Math.round(latest.totalSizeBytes / (1024 * 1024));

      return {
        category: 'workspace',
        status: 'healthy',
        score: 100,
        label: 'Workspace & Files',
        explanation: `Workspace indexed cleanly with ${latest.totalFileCount.toLocaleString()} files (${sizeMb} MB).`,
        metrics: {
          'Total Files': latest.totalFileCount,
          'Workspace Size': `${sizeMb} MB`
        },
        lastUpdated: latest.timestamp
      };
    } catch {
      return {
        category: 'workspace',
        status: 'unavailable',
        score: 0,
        label: 'Workspace & Files',
        explanation: 'Workspace scan records unavailable.',
        metrics: {},
        lastUpdated: Date.now()
      };
    }
  }

  private computeGitHealth(): ModuleHealthStatus {
    try {
      const repos = this.db.git.getRepositories();
      if (repos.length === 0) {
        return {
          category: 'git',
          status: 'insufficient_data',
          score: 100,
          label: 'Git Intelligence',
          explanation: 'No Git repositories discovered in workspace.',
          metrics: {},
          lastUpdated: Date.now()
        };
      }

      const activeRepo = repos[0];
      const workingTree = this.db.git.getWorkingTree(activeRepo.id);
      const isWarn = workingTree.length > 25;

      return {
        category: 'git',
        status: isWarn ? 'warning' : 'healthy',
        score: isWarn ? 75 : 100,
        label: 'Git Intelligence',
        explanation: isWarn
          ? `${workingTree.length} uncommitted changes pending in working tree.`
          : `Clean branch state on ${activeRepo.currentBranch || 'main'}.`,
        metrics: {
          'Branch': activeRepo.currentBranch || 'main',
          'Uncommitted Changes': workingTree.length
        },
        lastUpdated: activeRepo.lastPolledAt || Date.now()
      };
    } catch {
      return {
        category: 'git',
        status: 'unavailable',
        score: 0,
        label: 'Git Intelligence',
        explanation: 'Git repository state unavailable.',
        metrics: {},
        lastUpdated: Date.now()
      };
    }
  }

  private computeCodingHealth(): ModuleHealthStatus {
    try {
      const live = this.db.coding.getRecentSessions({ limit: 1 });
      const activeSession = live.find(s => s.status === 'active');

      return {
        category: 'coding',
        status: 'healthy',
        score: 100,
        label: 'Coding Intelligence',
        explanation: activeSession
          ? `Active coding session in progress (${activeSession.primaryLanguage || 'code'}).`
          : 'Idle (no active editor session).',
        metrics: {
          'Status': activeSession ? 'Active' : 'Idle',
          'Active Language': activeSession?.primaryLanguage || 'None'
        },
        lastUpdated: activeSession?.lastActivityAt || Date.now()
      };
    } catch {
      return {
        category: 'coding',
        status: 'unavailable',
        score: 0,
        label: 'Coding Intelligence',
        explanation: 'Coding session tracking unavailable.',
        metrics: {},
        lastUpdated: Date.now()
      };
    }
  }

  private computeApiHealth(since: number): ModuleHealthStatus {
    try {
      const summary = this.db.api.getSummary(since);
      if (summary.totalRequests === 0) {
        return {
          category: 'api',
          status: 'insufficient_data',
          score: 100,
          label: 'API Intelligence',
          explanation: 'No ingested API requests in selected period.',
          metrics: {
            'Requests': 0
          },
          lastUpdated: Date.now()
        };
      }

      const isDegraded = summary.errorRate > 10;
      const isWarn = summary.errorRate > 3 || summary.avgLatencyMs > 500;

      return {
        category: 'api',
        status: isDegraded ? 'degraded' : isWarn ? 'warning' : 'healthy',
        score: Math.max(0, Math.round(100 - summary.errorRate * 4)),
        label: 'API Intelligence',
        explanation: isDegraded
          ? `High failure rate (${summary.errorRate.toFixed(1)}%).`
          : isWarn
          ? 'Moderate latency or errors observed.'
          : 'API endpoints responding with low latency and zero or minimal errors.',
        metrics: {
          'Requests': summary.totalRequests,
          'Error Rate': `${summary.errorRate.toFixed(1)}%`,
          'Avg Latency': `${Math.round(summary.avgLatencyMs)} ms`
        },
        lastUpdated: Date.now()
      };
    } catch {
      return {
        category: 'api',
        status: 'unavailable',
        score: 0,
        label: 'API Intelligence',
        explanation: 'API intelligence metrics unavailable.',
        metrics: {},
        lastUpdated: Date.now()
      };
    }
  }

  private computeAiHealth(since: number): ModuleHealthStatus {
    try {
      const summary = this.db.ai.getSummary(since);
      const providers = this.db.ai.getProviders();

      const connectedCount = providers.filter(p => p.status === 'connected').length;

      return {
        category: 'ai',
        status: 'healthy',
        score: 100,
        label: 'AI Playground',
        explanation: `${connectedCount} AI provider(s) active. Total tokens: ${summary.totalTokens.toLocaleString()}.`,
        metrics: {
          'Active Providers': connectedCount,
          'Total Tokens': summary.totalTokens.toLocaleString(),
          'Estimated Cost': `$${summary.estimatedCost.toFixed(2)}`
        },
        lastUpdated: Date.now()
      };
    } catch {
      return {
        category: 'ai',
        status: 'unavailable',
        score: 0,
        label: 'AI Playground',
        explanation: 'AI telemetry unavailable.',
        metrics: {},
        lastUpdated: Date.now()
      };
    }
  }

  private buildModuleSummaries(since: number): Record<string, Record<string, unknown>> {
    const summaries: Record<string, Record<string, unknown>> = {};

    try {
      const sys = this.db.systemMetrics.getLatest();
      if (sys) {
        summaries.system = {
          cpu: `${sys.cpuPercent.toFixed(1)}%`,
          ram: `${sys.memoryUsedPercent.toFixed(1)}%`,
          uptime: `${Math.round(sys.uptimeSeconds / 3600)}h`
        };
      }
    } catch {}

    try {
      const latestScan = this.db.fileScans.getLatestScan();
      if (latestScan) {
        summaries.workspace = {
          files: latestScan.totalFileCount,
          sizeMb: Math.round(latestScan.totalSizeBytes / (1024 * 1024))
        };
      }
    } catch {}

    try {
      const repos = this.db.git.getRepositories();
      if (repos[0]) {
        summaries.git = {
          repoName: repos[0].name,
          branch: repos[0].currentBranch || 'main',
          totalCommits: repos[0].totalCommits || 0
        };
      }
    } catch {}

    try {
      const coding = this.db.coding.getSummary(since);
      summaries.coding = {
        totalSessions: coding.totalSessions,
        activeHours: (coding.totalActiveSeconds / 3600).toFixed(1),
        activeProjects: coding.activeProjectsCount
      };
    } catch {}

    try {
      const api = this.db.api.getSummary(since);
      summaries.api = {
        requests: api.totalRequests,
        errorRate: `${api.errorRate.toFixed(1)}%`,
        avgLatency: `${Math.round(api.avgLatencyMs)}ms`
      };
    } catch {}

    try {
      const ai = this.db.ai.getSummary(since);
      summaries.ai = {
        tokens: ai.totalTokens,
        cost: `$${ai.estimatedCost.toFixed(2)}`,
        requests: ai.totalRequests
      };
    } catch {}

    return summaries;
  }

  /**
   * Generates an explanation for an existing insight.
   * If opt-in AI is enabled and configured, queries the LLM; otherwise returns deterministic structured explanation.
   */
  public async explainInsight(insightId: string, enabledAi = false): Promise<string> {
    const insight = this.db.insights.getInsightById(insightId);
    if (!insight) {
      return 'Insight not found or was deleted.';
    }

    const evidenceList = insight.evidence.map(e => `• ${e.label}: ${e.value} ${e.unit || ''}`).join('\n');
    const deterministicExplanation = `### Analysis Breakdown: ${insight.title}

**Observation:**  
${insight.description}

**Supporting Telemetry Evidence:**  
${evidenceList}

**Recommended Action:**  
${insight.recommendation || 'No specific action required; telemetry within acceptable operating bounds.'}

*Note: This explanation is derived directly from deterministic local system metrics without cloud inference.*`;

    if (!enabledAi || !this.aiRegistry) {
      return deterministicExplanation;
    }

    try {
      const adapters = this.aiRegistry.getAllAdapters();
      const activeAdapter = adapters.find(a => a.id === 'ollama') || adapters.find(a => a.requiresKey);
      if (!activeAdapter) return deterministicExplanation;

      const apiKey = await this.aiRegistry.getApiKey(activeAdapter.id);
      if (activeAdapter.requiresKey && !apiKey) return deterministicExplanation;

      const prompt = `You are the DevPulse Developer Intelligence Assistant.
Explain the following development environment insight clearly, concisely, and actionably.
Do NOT invent facts outside the evidence provided.

Category: ${insight.category}
Title: ${insight.title}
Observation: ${insight.description}
Evidence:
${evidenceList}
Recommendation: ${insight.recommendation || 'N/A'}`;

      let resultText = '';
      await activeAdapter.chatStream(
        {
          model: activeAdapter.id === 'ollama' ? 'llama3' : 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          maxTokens: 500
        },
        apiKey,
        chunk => {
          resultText += chunk.text;
        }
      );

      return resultText.trim() || deterministicExplanation;
    } catch {
      return deterministicExplanation;
    }
  }
}
