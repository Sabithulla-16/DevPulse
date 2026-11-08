import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { PulseEngine } from '../core/PulseEngine';
import type { SettingsManager } from '../core/SettingsManager';
import { isValidMessage } from '../shared/messageValidation';
import type {
  AiIntelligenceData,
  ExtensionToWebviewMessage,
  GitIntelligenceData,
  GitRepositoryInfo,
  OverviewData,
  SystemMetricsData,
  WebviewToExtensionMessage,
  CodingIntelligenceData,
  CodingOverviewSummary,
  ApiIntelligenceData,
  ApiOverviewSummary,
  ApiEndpointDetailsData,
  AiPlaygroundData,
  PulseInsightsData,
  AiConversation,
  AiMessage,
  ContextAttachment
} from '../shared/types';
import type { FilesystemCollector } from '../collectors/filesystem/FilesystemCollector';
import type { ProcessCollector } from '../collectors/process/ProcessCollector';
import type { PortCollector } from '../collectors/port/PortCollector';
import type { GitCollector } from '../collectors/git/GitCollector';
import type { AiCollector } from '../collectors/ai/AiCollector';
import type { AiProviderRegistry } from '../services/ai/AiProviderRegistry';
import type { CodingSessionManager } from '../services/coding/CodingSessionManager';
import type { ApiIngestionServer } from '../services/api/ApiIngestionServer';
import { DEFAULT_AI_PRICING, CostCalculator } from '../services/ai/CostCalculator';
import { CustomOpenAIAdapter } from '../services/ai/adapters/CustomOpenAIAdapter';
import type { AiImagePart } from '../services/ai/adapters/IAiAdapter';
import {
  validateImageAttachment,
  validateModelVisionCapability,
  normalizeImageMime
} from '../services/ai/multimodal/ImageAttachmentValidator';
import { CorrelationEngine } from '../services/insights/CorrelationEngine';
import { ProcessManager } from '../services/ProcessManager';
import { randomUUID } from 'node:crypto';
import { ApiTestingService } from '../api-testing/core/ApiTestingService';

const IMAGE_MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.avif': 'image/avif'
};

function isImageFilePath(filePath: string): boolean {
  if (!filePath) return false;
  const ext = path.extname(filePath).toLowerCase();
  return Boolean(IMAGE_MIME_MAP[ext]);
}

function getImageMime(filePath: string): string {
  if (!filePath) return 'image/png';
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_MIME_MAP[ext] || 'image/png';
}

export class DashboardProvider {
  private panel: vscode.WebviewPanel | undefined;
  private unsubscribe: (() => void) | undefined;
  private currentAiFilter: 'today' | '7d' | '30d' | '90d' | 'all' = '7d';
  private currentSelectedRepoId: string | null = null;
  private currentCodingFilter: 'today' | '7d' | '30d' | 'all' = '7d';
  private currentCodingWorkspaceId: string | undefined;
  private currentApiServiceId: string | undefined;
  private currentApiEnvironment: string | undefined;
  private currentApiTimeFilter: '1h' | '24h' | '7d' | '30d' = '24h';
  private currentSelectedConversationId: string | null = null;
  private activeStreamControllers = new Map<string, AbortController>();
  readonly apiTestingService: ApiTestingService;
  readonly correlationEngine: CorrelationEngine;
  readonly costCalculator: CostCalculator;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly engine: PulseEngine,
    private readonly settingsManager: SettingsManager,
    private readonly aiRegistry?: AiProviderRegistry,
    private readonly codingSessionManager?: CodingSessionManager,
    private readonly apiIngestionServer?: ApiIngestionServer
  ) {
    this.apiTestingService = new ApiTestingService(
      this.engine.database,
      this.context.secrets,
      event => {
        if (this.settingsManager.getSettings().apiTestingLogToApiIntelligence) {
          const service = this.engine.database.api.getServices()[0];
          if (service) {
            this.engine.database.api.recordBatchEvents([
              {
                id: randomUUID(),
                serviceId: service.id,
                endpointId: 'studio_test',
                routeTemplate: event.url,
                method: event.method,
                statusCode: event.statusCode,
                durationMs: event.durationMs,
                startedAt: event.timestamp - Math.round(event.durationMs),
                completedAt: event.timestamp,
                outcome: event.statusCode >= 200 && event.statusCode < 400 ? 'success' : 'failure',
                environment: 'testing_studio'
              }
            ]);
            this.engine.database.schedulePersist();
          }
        }
      }
    );

    if (this.codingSessionManager) {
      this.codingSessionManager.onStatusChange(status => {
        this.postMessage({
          type: 'CODING_STATUS_CHANGED',
          payload: status
        });
      });
    }

    this.costCalculator = new CostCalculator(this.engine.database.ai);
    this.correlationEngine = new CorrelationEngine(this.engine.database, this.aiRegistry);

    // Hydrate custom providers into AiProviderRegistry
    if (this.aiRegistry) {
      const customList = this.engine.database.playground.getCustomProviders();
      for (const cp of customList) {
        this.aiRegistry.register(
          new CustomOpenAIAdapter(cp.id, cp.name, cp.baseUrl, cp.modelIds, cp.headers || {})
        );
      }
    }
  }

  open(initialTab?: string): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      if (initialTab) {
        this.postMessage({ type: 'NAVIGATE_TO', payload: { tab: initialTab } });
      }
      void this.sendOverview();
      void this.sendFileIntelligence();
      void this.sendExtendedSystem();
      void this.sendAiData();
      void this.sendGitData();
      void this.sendCodingData();
      void this.sendApiData();
      void this.sendApiTestData();
      void this.sendPlaygroundData();
      void this.sendPulseInsightsData();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'devpulse.dashboard',
      'DevPulse Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dist')]
      }
    );

    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'icons', 'devpulse.svg');
    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        void this.handleMessage(message);
      },
      undefined,
      this.context.subscriptions
    );

    // Push live telemetry to webview on engine events
    this.unsubscribe = this.engine.events.subscribe(event => {
      if (!this.panel) return;
      if (event.type === 'system.snapshot') {
        void this.sendSystemMetrics();
        void this.sendOverview();
        void this.sendExtendedSystem();
      } else if (event.type === 'disk.snapshot' || event.type === 'process.snapshot' || event.type === 'port.snapshot') {
        void this.sendExtendedSystem();
        void this.sendOverview();
      } else if (event.type === 'ai.usage') {
        void this.sendAiData(this.currentAiFilter);
        void this.sendOverview();
      } else if (event.type === 'git.activity') {
        void this.sendGitData(this.currentSelectedRepoId || undefined);
        void this.sendOverview();
      }
    });

    this.panel.onDidDispose(
      () => {
        if (this.unsubscribe) {
          this.unsubscribe();
          this.unsubscribe = undefined;
        }
        this.panel = undefined;
      },
      null,
      this.context.subscriptions
    );

    // Initial data hydration
    setTimeout(() => {
      if (initialTab) {
        this.postMessage({ type: 'NAVIGATE_TO', payload: { tab: initialTab } });
      }
      void this.sendOverview();
      void this.sendSystemMetrics();
      void this.sendExtendedSystem();
      void this.sendFileIntelligence();
      void this.sendAiData();
      void this.sendGitData();
      void this.sendCodingData();
      void this.sendApiData();
      void this.sendApiTestData();
      void this.sendPlaygroundData();
      void this.sendPulseInsightsData();
    }, 150);
  }

  async refresh(): Promise<void> {
    await this.engine.refresh();
    await this.sendOverview();
    await this.sendSystemMetrics();
    await this.sendExtendedSystem();
    await this.sendFileIntelligence();
    await this.sendAiData(this.currentAiFilter);
    await this.sendGitData(this.currentSelectedRepoId || undefined);
    await this.sendCodingData(this.currentCodingFilter, this.currentCodingWorkspaceId);
    await this.sendApiData();
  }

  public postMessage(message: ExtensionToWebviewMessage): void {
    if (this.panel) {
      void this.panel.webview.postMessage(message);
    }
  }

  public async sendOverview(): Promise<void> {
    if (!this.panel) return;
    const system = this.engine.getLatestSystemSnapshot();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const settings = this.settingsManager.getSettings();

    const fsCol = this.engine.getCollector<FilesystemCollector>('filesystem');
    const fileSummary = fsCol ? fsCol.getCurrentScan() : null;
    const disks = this.engine.database.diskMetrics.getLatest();

    const aiSummary = this.engine.database.ai.getSummary();
    const gitSummary = this.engine.database.git.getSummary(this.currentSelectedRepoId || undefined);

    const todayD = new Date();
    todayD.setHours(0, 0, 0, 0);
    const todaySince = todayD.getTime();

    const codingRaw = this.engine.database.coding.getSummary(todaySince);
    const langStats = this.engine.database.coding.getLanguageStats(todaySince);
    const liveCoding = this.codingSessionManager?.getLiveStatus();
    const codingSummary: CodingOverviewSummary = {
      todayActiveSeconds: codingRaw.totalActiveSeconds,
      activeSessionsCount: codingRaw.totalSessions,
      topLanguage: langStats[0]?.displayName || 'None',
      activeProjectName: liveCoding?.activeProject,
      isTracking: liveCoding?.status === 'active' || liveCoding?.status === 'idle',
      isPaused: liveCoding?.status === 'paused'
    };

    const apiRaw = this.engine.database.api.getSummary(todaySince);
    const ingStatus = this.apiIngestionServer?.getStatus();
    const apiSummary: ApiOverviewSummary = {
      totalRequestsToday: apiRaw.totalRequests,
      successRate: apiRaw.successRate,
      errorRate: apiRaw.errorRate,
      avgLatencyMs: apiRaw.avgLatencyMs,
      activeServicesCount: apiRaw.activeServicesCount,
      ingestionRunning: ingStatus?.running ?? false,
      ingestionPort: ingStatus?.port ?? 49152
    };

    const data: OverviewData = {
      system,
      workspace: workspaceFolder
        ? {
            name: workspaceFolder.name,
            path: workspaceFolder.uri.fsPath,
            folderCount: vscode.workspace.workspaceFolders?.length ?? 1,
            lastScanSizeBytes: fileSummary?.totalSizeBytes,
            lastScanFileCount: fileSummary?.totalFileCount
          }
        : null,
      collectors: this.engine.getStatuses(),
      monitoring: this.engine.isRunning(),
      recentEvents: this.engine
        .getRecentEvents(40)
        .filter(e => e.collectorId !== 'port' && !e.type.startsWith('port.'))
        .slice(0, 15),
      activeAlerts: this.engine.getActiveAlerts(5, true),
      settings,
      fileSummary,
      disks,
      aiSummary,
      gitSummary,
      codingSummary,
      apiSummary
    };

    this.postMessage({ type: 'OVERVIEW_DATA', payload: data });
  }

  public async sendSystemMetrics(limit = 60): Promise<void> {
    if (!this.panel) return;
    const current = this.engine.getLatestSystemSnapshot();
    const history = this.engine.getSystemHistory(limit);
    const settings = this.settingsManager.getSettings();

    const data: SystemMetricsData = {
      current,
      history,
      intervalSeconds: settings.sampleIntervalSeconds,
      monitoring: this.engine.isRunning()
    };

    this.postMessage({ type: 'SYSTEM_METRICS_DATA', payload: data });
  }

  public async sendExtendedSystem(): Promise<void> {
    if (!this.panel) return;
    const settings = this.settingsManager.getSettings();
    const extended = this.engine.getExtendedSystemData(settings.sampleIntervalSeconds);
    this.postMessage({ type: 'SYSTEM_EXTENDED_DATA', payload: extended });
  }

  public async sendFileIntelligence(): Promise<void> {
    if (!this.panel) return;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const rootPath = workspaceFolder?.uri.fsPath;
    const data = this.engine.getFileIntelligenceData(rootPath);
    this.postMessage({ type: 'FILE_INTELLIGENCE_DATA', payload: data });
  }

  public async sendAiData(timeFilter: 'today' | '7d' | '30d' | '90d' | 'all' = this.currentAiFilter): Promise<void> {
    if (!this.panel) return;
    this.currentAiFilter = timeFilter;

    let since: number | undefined;
    const now = Date.now();
    if (timeFilter === 'today') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      since = d.getTime();
    } else if (timeFilter === '7d') {
      since = now - 7 * 86400 * 1000;
    } else if (timeFilter === '30d') {
      since = now - 30 * 86400 * 1000;
    } else if (timeFilter === '90d') {
      since = now - 90 * 86400 * 1000;
    }

    const summary = this.engine.database.ai.getSummary(since);
    let providers = this.engine.database.ai.getProviders();
    if (providers.length <= 1 && this.aiRegistry) {
      await this.aiRegistry.pollAllProviders();
      providers = this.engine.database.ai.getProviders();
    }

    const models = this.engine.database.ai.getModelStats(since);
    const timeSeries = this.engine.database.ai.getTimeSeries(since);
    const recentUsage = this.engine.database.ai.getUsageRecords({ since, limit: 100 });
    let pricing = this.engine.database.ai.getPricing();

    if (pricing.length === 0) {
      for (const p of DEFAULT_AI_PRICING) {
        this.engine.database.ai.savePricing({
          ...p,
          updatedAt: Date.now()
        });
      }
      pricing = this.engine.database.ai.getPricing();
    }

    const budgets = this.engine.database.ai.getBudgets();

    // Calculate budget consumption
    const settings = this.settingsManager.getSettings();
    const dailyLimit = settings.aiDailyBudgetLimit || 10.0;
    const budgetConsumedPercent = dailyLimit > 0
      ? Math.min(100, Math.round(((summary.todayCost || 0) / dailyLimit) * 100))
      : 0;

    const payload: AiIntelligenceData = {
      summary,
      timeFilter,
      providers,
      models,
      timeSeries,
      recentUsage,
      pricing,
      budgets,
      budgetConsumedPercent
    };

    this.postMessage({ type: 'AI_INTELLIGENCE_DATA', payload });
  }

  public async sendGitData(repoId?: string, commitLimit: number = 100): Promise<void> {
    if (!this.panel) return;

    let repos = this.engine.database.git.getRepositories();

    // If no repos discovered yet in database, run a scan now
    if (repos.length === 0) {
      const gitCol = this.engine.getCollector<GitCollector>('git');
      if (gitCol) {
        await gitCol.collect(commitLimit);
        repos = this.engine.database.git.getRepositories();
      }
    }

    const activeRepoId = repoId || (repos[0] ? repos[0].id : null);
    this.currentSelectedRepoId = activeRepoId;

    const summary = this.engine.database.git.getSummary(activeRepoId || undefined);
    const branches = activeRepoId ? this.engine.database.git.getBranches(activeRepoId) : [];
    const commits = activeRepoId ? this.engine.database.git.getCommits(activeRepoId, { limit: commitLimit }) : [];
    const workingTree = activeRepoId ? this.engine.database.git.getWorkingTree(activeRepoId) : [];
    const contributions = activeRepoId
      ? this.engine.database.git.getContributionStats(activeRepoId)
      : { authors: [], dailyActivity: [] };

    // Compute frequently changed files and extension breakdown from workingTree
    const pathCounts = new Map<string, number>();
    const extCounts = new Map<string, number>();

    for (const f of workingTree) {
      pathCounts.set(f.path, (pathCounts.get(f.path) || 0) + 1);
      const ext = path.extname(f.path).toLowerCase();
      if (ext) {
        extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
      }
    }

    const frequentlyChangedFiles = Array.from(pathCounts.entries())
      .map(([fPath, changeCount]) => ({ path: fPath, changeCount }))
      .sort((a, b) => b.changeCount - a.changeCount)
      .slice(0, 10);

    const extensionBreakdown = Array.from(extCounts.entries())
      .map(([extension, changeCount]) => ({ extension, changeCount }))
      .sort((a, b) => b.changeCount - a.changeCount);

    const activeRepo = repos.find((r: GitRepositoryInfo) => r.id === activeRepoId);
    const currentBranchName = activeRepo?.currentBranch || summary.currentBranch || 'main';

    const totalInRepo = activeRepo?.totalCommits || summary.totalCommits || commits.length;
    const historyCoverage = {
      totalInRepo,
      syncedCommits: commits.length,
      oldestCommitDate: commits[commits.length - 1]?.timestamp,
      newestCommitDate: commits[0]?.timestamp,
      hasMore: totalInRepo > commits.length
    };

    const gitCol = this.engine.getCollector<GitCollector>('git');
    const healthInsights = gitCol?.getService
      ? gitCol.getService().analyzeRepoHealth(workingTree, branches, commits)
      : [
          ...(workingTree.length > 25
            ? [{
                type: 'warning' as const,
                title: 'High Uncommitted Changes',
                message: `${workingTree.length} modified or untracked files pending commit.`
              }]
            : []),
          ...(workingTree.length === 0
            ? [{
                type: 'info' as const,
                title: 'Working Tree Clean',
                message: 'Local branch is cleanly synchronized with no staged changes.'
              }]
            : [])
        ];

    const payload: GitIntelligenceData = {
      summary,
      repositories: repos,
      selectedRepoId: activeRepoId,
      currentBranch: currentBranchName,
      branches,
      recentCommits: commits,
      workingTree,
      contributions,
      codeChanges: {
        frequentlyChangedFiles,
        extensionBreakdown
      },
      healthInsights,
      hasGit: true,
      historyCoverage
    };

    this.postMessage({ type: 'GIT_INTELLIGENCE_DATA', payload });
  }

  public async sendCodingData(
    timeFilter: 'today' | '7d' | '30d' | 'all' = this.currentCodingFilter,
    workspaceId?: string
  ): Promise<void> {
    if (!this.panel) return;
    this.currentCodingFilter = timeFilter;
    this.currentCodingWorkspaceId = workspaceId;

    let since: number | undefined;
    const now = Date.now();
    if (timeFilter === 'today') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      since = d.getTime();
    } else if (timeFilter === '7d') {
      since = now - 7 * 86400 * 1000;
    } else if (timeFilter === '30d') {
      since = now - 30 * 86400 * 1000;
    }

    const summary = this.engine.database.coding.getSummary(since, workspaceId);
    const live = this.codingSessionManager?.getLiveStatus() || {
      status: 'stopped',
      currentSessionSeconds: 0,
      activeDurationSeconds: 0
    };
    const hourlyActivity = this.engine.database.coding.getHourlyActivity(since, workspaceId);
    const dailyActivity = this.engine.database.coding.getDailyActivity(14, workspaceId);
    const languages = this.engine.database.coding.getLanguageStats(since, workspaceId);
    const projects = this.engine.database.coding.getProjectStats(since);
    const recentSessions = this.engine.database.coding.getRecentSessions({ workspaceId, since, limit: 50 });

    const payload: CodingIntelligenceData = {
      summary,
      liveStatus: live,
      hourlyActivity,
      dailyActivity,
      languages,
      projects,
      recentSessions
    };

    this.postMessage({ type: 'CODING_INTELLIGENCE_DATA', payload });
  }

  public async sendApiData(options?: {
    serviceId?: string;
    environment?: string;
    timeFilter?: '1h' | '24h' | '7d' | '30d';
  }): Promise<void> {
    if (!this.panel) return;
    if (options?.serviceId !== undefined) this.currentApiServiceId = options.serviceId;
    if (options?.environment !== undefined) this.currentApiEnvironment = options.environment;
    if (options?.timeFilter !== undefined) this.currentApiTimeFilter = options.timeFilter;

    let since: number | undefined;
    const now = Date.now();
    const filter = this.currentApiTimeFilter;
    if (filter === '1h') since = now - 3600 * 1000;
    else if (filter === '24h') since = now - 24 * 3600 * 1000;
    else if (filter === '7d') since = now - 7 * 86400 * 1000;
    else if (filter === '30d') since = now - 30 * 86400 * 1000;

    const activeServiceId = this.currentApiServiceId || undefined;
    const summary = this.engine.database.api.getSummary(since, activeServiceId);
    const ingestionStatus = this.apiIngestionServer?.getStatus() || {
      running: false,
      host: '127.0.0.1',
      port: 49152,
      activeConnections: 0,
      queueSize: 0
    };

    const services = this.engine.database.api.getServices();
    const endpoints = this.engine.database.api.getEndpoints(activeServiceId);
    const recentErrors = this.engine.database.api.getRecentErrors(25, activeServiceId);
    const volumeTimeSeries = this.engine.database.api.getTimeSeries(since, activeServiceId);
    const statusCodeDistribution = this.engine.database.api.getStatusCodeDistribution(since, activeServiceId);
    const methodDistribution = this.engine.database.api.getMethodDistribution(since, activeServiceId);

    const payload: ApiIntelligenceData = {
      summary,
      ingestionStatus,
      services,
      endpoints,
      recentErrors,
      volumeTimeSeries,
      statusCodeDistribution,
      methodDistribution
    };

    this.postMessage({ type: 'API_INTELLIGENCE_DATA', payload });
  }

  public async sendApiTestData(): Promise<void> {
    if (!this.panel) return;
    try {
      const state = await this.apiTestingService.getWorkspaceState();
      this.postMessage({ type: 'API_TEST_WORKSPACE_STATE', payload: state });
    } catch (err) {
      console.error('[DevPulse] Error sending API Testing Studio workspace state:', err);
    }
  }

  public async sendPlaygroundData(selectedConversationId?: string): Promise<void> {
    if (!this.panel) return;
    try {
      const conversations = this.engine.database.playground.getConversations();
      const activeId = selectedConversationId || this.currentSelectedConversationId || conversations[0]?.id;
      this.currentSelectedConversationId = activeId || null;

      let activeConversation: AiConversation | undefined;
      let activeMessages: AiMessage[] = [];

      if (activeId) {
        activeConversation = this.engine.database.playground.getConversation(activeId);
        activeMessages = this.engine.database.playground.getMessages(activeId);
      }

      const templates = this.engine.database.playground.getTemplates();
      const presets = this.engine.database.playground.getPresets();
      const customProviders = this.engine.database.playground.getCustomProviders();
      let providers = this.engine.database.ai.getProviders();
      if (providers.length <= 1 && this.aiRegistry) {
        await this.aiRegistry.pollAllProviders();
        providers = this.engine.database.ai.getProviders();
      }
      const usageSummary = this.engine.database.ai.getSummary();

      const payload: AiPlaygroundData = {
        conversations,
        activeConversation,
        activeMessages,
        templates,
        presets,
        providers,
        customProviders,
        usageSummary
      };

      this.postMessage({ type: 'AI_PLAYGROUND_DATA', payload });
    } catch (err) {
      console.error('[DevPulse] Error sending AI Playground data:', err);
    }
  }

  public async sendPulseInsightsData(timeRange: 'today' | '7d' | '30d' | '90d' = '7d'): Promise<void> {
    if (!this.panel) return;
    try {
      const data = await this.correlationEngine.evaluateInsights(timeRange);
      this.postMessage({ type: 'PULSE_INSIGHTS_DATA', payload: data });
    } catch (err) {
      console.error('[DevPulse] Error sending Pulse Insights data:', err);
    }
  }

  public async getWorkspaceFiles(query?: string): Promise<Array<{ path: string; name: string; size: number }>> {
    try {
      const uris = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/.vscode/**}', 150);
      const results: Array<{ path: string; name: string; size: number }> = [];
      const lowerQ = (query || '').trim().toLowerCase();

      for (const uri of uris) {
        const base = path.basename(uri.fsPath);
        const nameMatches = !lowerQ || base.toLowerCase().includes(lowerQ) || uri.fsPath.toLowerCase().includes(lowerQ);

        try {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat.size > 256 * 1024) continue;

          if (nameMatches) {
            results.push({
              path: uri.fsPath,
              name: base,
              size: stat.size
            });
            if (results.length >= 50) break;
            continue;
          }

          // If query did not match filename or path, check content if query is provided
          if (lowerQ && lowerQ.length >= 2) {
            try {
              const bytes = await vscode.workspace.fs.readFile(uri);
              // Quick check for binary file by inspecting initial bytes
              const isBinary = bytes.subarray(0, 512).some(b => b === 0);
              if (!isBinary) {
                const text = Buffer.from(bytes).toString('utf8').toLowerCase();
                if (text.includes(lowerQ)) {
                  results.push({
                    path: uri.fsPath,
                    name: base,
                    size: stat.size
                  });
                  if (results.length >= 50) break;
                }
              }
            } catch {}
          }
        } catch {}
      }
      return results;
    } catch {
      return [];
    }
  }

  public async startScan(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showWarningMessage('DevPulse: Open a folder or workspace to perform a file scan.');
      return;
    }

    const fsCol = this.engine.getCollector<FilesystemCollector>('filesystem');
    if (!fsCol) return;

    const settings = this.settingsManager.getSettings();

    this.postMessage({
      type: 'FILE_SCAN_PROGRESS',
      payload: { scannedCount: 0, currentPath: 'Starting workspace scan...', statusText: 'Initializing scanner...' }
    });

    try {
      const result = await fsCol.runScan(workspaceFolder.uri.fsPath, workspaceFolder.name, {
        exclusions: settings.fsExcludedPatterns.concat(settings.fsExcludedDirectories),
        enableDuplicates: settings.fsEnableDuplicates,
        maxHashSizeMb: settings.fsMaxHashSizeMb,
        concurrency: settings.fsScanConcurrency,
        onProgress: progress => {
          this.postMessage({ type: 'FILE_SCAN_PROGRESS', payload: progress });
        }
      });

      this.postMessage({ type: 'FILE_INTELLIGENCE_DATA', payload: result });
      await this.sendOverview();
      this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: `Scan completed in ${result.summary?.scanDurationMs}ms.` } });
      vscode.window.showInformationMessage(`DevPulse: Workspace scan complete (${result.summary?.scannedFileCount} files analyzed).`);
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? 'Scan failed';
      this.postMessage({ type: 'OPERATION_ERROR', payload: { message: msg } });
      if (msg !== 'Scan cancelled by user') {
        vscode.window.showErrorMessage(`DevPulse file scan error: ${msg}`);
      }
    }
  }

  private async handleMessage(rawMessage: unknown): Promise<void> {
    if (!isValidMessage(rawMessage)) {
      console.warn('[DevPulse Dashboard] Received invalid webview message:', rawMessage);
      this.postMessage({ type: 'OPERATION_ERROR', payload: { message: 'Invalid message structure or payload.' } });
      return;
    }

    const message: WebviewToExtensionMessage = rawMessage;

    switch (message.type) {
      case 'GET_OVERVIEW':
        await this.sendOverview();
        break;

      case 'GET_SYSTEM_METRICS':
        await this.sendSystemMetrics(message.payload?.limit ?? 60);
        break;

      case 'GET_EXTENDED_SYSTEM':
      case 'GET_PROCESSES':
      case 'GET_DISKS':
      case 'GET_PORTS':
        await this.sendExtendedSystem();
        break;

      case 'GET_FILE_INTELLIGENCE':
        await this.sendFileIntelligence();
        break;

      case 'GET_AI_INTELLIGENCE':
        await this.sendAiData(message.payload?.timeFilter);
        break;

      case 'TEST_AI_PROVIDER': {
        const { providerId } = message.payload;
        if (this.aiRegistry) {
          const res = await this.aiRegistry.testProvider(providerId);
          this.postMessage({
            type: 'AI_PROVIDER_TEST_RESULT',
            payload: {
              providerId,
              success: res.success,
              message: res.message,
              models: res.models
            }
          });
          await this.sendAiData();
        } else {
          this.postMessage({
            type: 'AI_PROVIDER_TEST_RESULT',
            payload: {
              providerId,
              success: false,
              message: 'AI Provider Registry is unavailable.'
            }
          });
        }
        break;
      }

      case 'SET_AI_PROVIDER_KEY': {
        const providerId = (message.payload as any)?.providerId;
        const inlineKey = (message.payload as any)?.apiKey;
        if (providerId) {
          let key = inlineKey;
          if (key === undefined) {
            key = await vscode.window.showInputBox({
              title: `Configure ${providerId.toUpperCase()} API Key`,
              prompt: `Enter API key for ${providerId} (saved securely to VS Code SecretStorage)`,
              password: true,
              ignoreFocusOut: true
            });
          }
          if (key !== undefined) {
            await this.context.secrets.store(`devpulse.ai.${providerId.toLowerCase()}.apiKey`, key.trim());
            if (this.aiRegistry) {
              await this.aiRegistry.testProvider(providerId);
            }
            this.engine.database.schedulePersist();
            await this.sendAiData();
            this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: `${providerId.toUpperCase()} API key saved securely.` } });
          }
        }
        break;
      }

      case 'SET_OLLAMA_HOST': {
        let host = (message.payload as any)?.host;
        if (!host) {
          host = await vscode.window.showInputBox({
            title: 'Configure Ollama Host Endpoint',
            prompt: 'Enter local Ollama daemon URL (default: http://localhost:11434)',
            value: this.settingsManager.getSettings().aiOllamaHost || 'http://localhost:11434',
            ignoreFocusOut: true
          });
        }
        if (host !== undefined && host.trim()) {
          await this.settingsManager.updateSettings({ aiOllamaHost: host.trim() });
          if (this.aiRegistry) {
            this.aiRegistry.setOllamaHost(host.trim());
            await this.aiRegistry.testProvider('ollama');
          }
          this.engine.database.schedulePersist();
          await this.sendAiData();
          this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: `Ollama endpoint updated to ${host.trim()}` } });
        }
        break;
      }

      case 'UPDATE_AI_BUDGET': {
        const periodType = message.payload.periodType || 'daily';
        const limitAmount = message.payload.limitAmount || 10;
        this.engine.database.ai.saveBudget({
          periodType,
          limitAmount,
          thresholdPercent: message.payload.thresholdPercent || 85,
          provider: message.payload.provider,
          model: message.payload.model,
          id: message.payload.id,
          createdAt: Date.now()
        });
        if (periodType === 'daily') {
          await this.settingsManager.updateSettings({ aiDailyBudgetLimit: limitAmount });
        } else if (periodType === 'monthly') {
          await this.settingsManager.updateSettings({ aiMonthlyBudgetLimit: limitAmount });
        }
        this.engine.database.schedulePersist();
        await this.sendAiData();
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'AI budget updated.' } });
        break;
      }

      case 'UPDATE_AI_PRICING': {
        if (message.payload.provider && message.payload.modelPattern !== undefined) {
          this.engine.database.ai.savePricing({
            provider: message.payload.provider,
            modelPattern: message.payload.modelPattern,
            inputCostPerMillion: message.payload.inputCostPerMillion || 0,
            outputCostPerMillion: message.payload.outputCostPerMillion || 0,
            isCustom: true,
            id: message.payload.id,
            updatedAt: Date.now()
          });
          this.engine.database.schedulePersist();
          await this.sendAiData();
          this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'AI pricing rule updated.' } });
        }
        break;
      }

      case 'DELETE_AI_PRICING': {
        if (message.payload?.id) {
          this.engine.database.ai.deletePricing(message.payload.id);
          this.engine.database.schedulePersist();
          await this.sendAiData();
          this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'AI pricing rule removed.' } });
        }
        break;
      }

      case 'CLEAR_AI_DATA': {
        const choice = await vscode.window.showWarningMessage(
          'DevPulse: Clear all local AI token usage history from SQLite?',
          { modal: true },
          'Clear Data'
        );
        if (choice === 'Clear Data') {
          this.engine.database.ai.clearData();
          await this.sendAiData();
          await this.sendOverview();
          this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'AI usage data cleared.' } });
        }
        break;
      }

      case 'GET_GIT_INTELLIGENCE':
        await this.sendGitData(message.payload?.repoId);
        break;

      case 'SELECT_GIT_REPO':
        await this.sendGitData(message.payload.repoId);
        break;

      case 'REFRESH_GIT': {
        const gitCol = this.engine.getCollector<GitCollector>('git');
        const limit = (message.payload as any)?.limit || 100;
        if (gitCol) {
          await gitCol.collect(limit);
        }
        await this.sendGitData((message.payload as any)?.repoId || this.currentSelectedRepoId || undefined, limit);
        await this.sendOverview();
        this.postMessage({ type: 'GIT_OPERATION_RESULT', payload: { success: true, message: 'Git intelligence refreshed.' } });
        break;
      }

      case 'GET_EXTENSION_FILES': {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const res = this.engine.database.fileScans.getFilesByExtension(
          workspaceFolder?.uri.fsPath,
          message.payload.extension,
          {
            search: message.payload.search,
            sortBy: message.payload.sortBy,
            sortOrder: message.payload.sortOrder,
            page: message.payload.page,
            pageSize: message.payload.pageSize
          }
        );
        this.postMessage({ type: 'EXTENSION_FILES_DATA', payload: res });
        break;
      }

      case 'OPEN_FILE': {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;
        const root = workspaceFolder.uri.fsPath;
        const targetPath = path.isAbsolute(message.payload.relativePath)
          ? message.payload.relativePath
          : path.resolve(root, message.payload.relativePath);

        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
          await vscode.window.showTextDocument(doc, { preview: true });
        } catch (err: unknown) {
          vscode.window.showErrorMessage(`DevPulse: Failed to open file: ${(err as Error)?.message}`);
        }
        break;
      }

      case 'REVEAL_IN_EXPLORER': {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;
        const root = workspaceFolder.uri.fsPath;
        const targetPath = path.isAbsolute(message.payload.relativePath)
          ? message.payload.relativePath
          : path.resolve(root, message.payload.relativePath);
        try {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(targetPath));
        } catch {
          try {
            await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(targetPath));
          } catch {}
        }
        break;
      }

      case 'STOP_PROCESS': {
        const { pid, processName, force } = message.payload;
        const result = await ProcessManager.stopProcess(pid, processName, force);
        this.postMessage({ type: 'PROCESS_TERMINATION_RESULT', payload: result });

        if (result.success) {
          vscode.window.showInformationMessage(`DevPulse: ${result.message}`);
          const procCol = this.engine.getCollector<ProcessCollector>('process');
          const portCol = this.engine.getCollector<PortCollector>('port');
          if (procCol) await procCol.collect();
          if (portCol) await portCol.collect();
          await this.sendExtendedSystem();
        } else if (!result.requiresForce) {
          vscode.window.showErrorMessage(`DevPulse: ${result.message}`);
        }
        break;
      }

      case 'FREE_PORT': {
        const { port, protocol, pid, processName, force } = message.payload;
        const result = await ProcessManager.freePort(port, protocol ?? 'TCP', pid, processName, force);
        this.postMessage({ type: 'PORT_FREED_RESULT', payload: result });

        if (result.success) {
          vscode.window.showInformationMessage(`DevPulse: ${result.message}`);
          const procCol = this.engine.getCollector<ProcessCollector>('process');
          const portCol = this.engine.getCollector<PortCollector>('port');
          if (procCol) await procCol.collect();
          if (portCol) await portCol.collect();
          await this.sendExtendedSystem();
        } else if (!result.requiresForce) {
          vscode.window.showErrorMessage(`DevPulse: ${result.message}`);
        }
        break;
      }

      case 'START_WORKSPACE_SCAN':
        void this.startScan();
        break;

      case 'CANCEL_WORKSPACE_SCAN': {
        const fsCol = this.engine.getCollector<FilesystemCollector>('filesystem');
        if (fsCol) {
          fsCol.cancelScan();
          this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Workspace scan cancelled.' } });
          vscode.window.showInformationMessage('DevPulse: Workspace scan cancelled.');
        }
        break;
      }

      case 'CLEAR_SCAN_HISTORY': {
        const choice = await vscode.window.showWarningMessage(
          'DevPulse: Delete all historical file scans from your local SQLite database?',
          { modal: true },
          'Clear History'
        );
        if (choice === 'Clear History') {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          this.engine.database.fileScans.clearScanHistory(workspaceFolder?.uri.fsPath);
          this.engine.database.schedulePersist();
          await this.sendFileIntelligence();
          await this.sendOverview();
          this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Scan history cleared.' } });
        }
        break;
      }

      case 'GET_MONITORING_STATUS':
        this.postMessage({
          type: 'MONITORING_STATUS_DATA',
          payload: {
            running: this.engine.isRunning(),
            collectors: this.engine.getStatuses()
          }
        });
        break;

      case 'REFRESH_METRICS':
        await this.refresh();
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Metrics refreshed.' } });
        break;

      case 'PAUSE_MONITORING':
        await this.engine.pause();
        await this.settingsManager.updateSettings({ monitoringEnabled: false });
        await this.sendOverview();
        await this.sendSystemMetrics();
        await this.sendExtendedSystem();
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Monitoring paused.' } });
        break;

      case 'RESUME_MONITORING':
        await this.engine.start();
        await this.settingsManager.updateSettings({ monitoringEnabled: true });
        await this.sendOverview();
        await this.sendSystemMetrics();
        await this.sendExtendedSystem();
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Monitoring resumed.' } });
        break;

      case 'GET_ALERTS':
        this.postMessage({
          type: 'ALERTS_DATA',
          payload: this.engine.getActiveAlerts(50)
        });
        break;

      case 'ACKNOWLEDGE_ALERT':
        this.engine.acknowledgeAlert(message.payload.id);
        this.postMessage({
          type: 'ALERTS_DATA',
          payload: this.engine.getActiveAlerts(50)
        });
        break;

      case 'ACKNOWLEDGE_ALL_ALERTS':
        this.engine.acknowledgeAllAlerts();
        this.postMessage({
          type: 'ALERTS_DATA',
          payload: this.engine.getActiveAlerts(50)
        });
        await this.sendOverview();
        break;

      case 'GET_SETTINGS':
        this.postMessage({
          type: 'SETTINGS_DATA',
          payload: this.settingsManager.getSettings()
        });
        break;

      case 'UPDATE_SETTINGS': {
        const updated = await this.settingsManager.updateSettings(message.payload);
        if (message.payload.sampleIntervalSeconds) {
          this.engine.setSampleInterval(message.payload.sampleIntervalSeconds);
        }
        if (message.payload.aiOllamaHost && this.aiRegistry) {
          this.aiRegistry.setOllamaHost(message.payload.aiOllamaHost);
        }
        if (message.payload.monitoringEnabled !== undefined) {
          if (message.payload.monitoringEnabled && !this.engine.isRunning()) {
            await this.engine.start();
          } else if (!message.payload.monitoringEnabled && this.engine.isRunning()) {
            await this.engine.pause();
          }
        }
        this.postMessage({ type: 'SETTINGS_UPDATED', payload: updated });
        await this.sendOverview();
        await this.sendSystemMetrics();
        await this.sendExtendedSystem();
        break;
      }

      case 'RESET_DATA': {
        const choice = await vscode.window.showWarningMessage(
          'DevPulse: Reset all locally recorded metrics from your local SQLite database?',
          { modal: true },
          'Reset Data'
        );
        if (choice === 'Reset Data') {
          await this.engine.reset();
          await this.sendOverview();
          await this.sendSystemMetrics();
          await this.sendExtendedSystem();
          await this.sendFileIntelligence();
          await this.sendAiData();
          await this.sendGitData();
          await this.sendCodingData();
          await this.sendApiData();
          this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Local data reset successfully.' } });
        }
        break;
      }

      case 'GET_CODING_INTELLIGENCE':
        await this.sendCodingData(message.payload?.timeFilter, message.payload?.workspaceId);
        break;

      case 'PAUSE_CODING_TRACKING':
        this.codingSessionManager?.pause();
        await this.sendCodingData();
        await this.sendOverview();
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Coding tracking paused.' } });
        break;

      case 'RESUME_CODING_TRACKING':
        this.codingSessionManager?.resume();
        await this.sendCodingData();
        await this.sendOverview();
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Coding tracking resumed.' } });
        break;

      case 'CLEAR_CODING_DATA': {
        const choice = await vscode.window.showWarningMessage(
          'DevPulse: Clear all recorded coding sessions from your local SQLite database?',
          { modal: true },
          'Clear Data'
        );
        if (choice === 'Clear Data') {
          this.engine.database.coding.clear();
          this.engine.database.schedulePersist();
          await this.sendCodingData();
          await this.sendOverview();
          this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Coding sessions cleared.' } });
        }
        break;
      }

      case 'GET_API_INTELLIGENCE':
        await this.sendApiData(message.payload);
        break;

      case 'CREATE_API_SERVICE': {
        const serviceName = message.payload.name.trim();
        if (!serviceName) break;
        const serviceId = 'svc_' + randomUUID().slice(0, 8);
        const plainToken = 'devpulse_sec_' + randomUUID().replace(/-/g, '');
        let secretHash = '';
        if (this.apiIngestionServer) {
          secretHash = this.apiIngestionServer.registerServiceToken(serviceId, plainToken);
        }
        await this.context.secrets.store(`devpulse.api.${serviceId}.token`, plainToken);
        this.engine.database.api.saveService(
          {
            id: serviceId,
            name: serviceName,
            integrationType: message.payload.integrationType || 'express',
            environment: message.payload.environment || 'development',
            monitoringEnabled: true,
            totalRequests: 0,
            createdAt: Date.now()
          },
          secretHash
        );
        this.engine.database.schedulePersist();
        this.postMessage({
          type: 'API_SERVICE_TOKEN_CREATED',
          payload: {
            serviceId,
            serviceName,
            token: plainToken
          }
        });
        await this.sendApiData();
        await this.sendOverview();
        break;
      }

      case 'DELETE_API_SERVICE': {
        await this.context.secrets.delete(`devpulse.api.${message.payload.serviceId}.token`);
        this.engine.database.api.deleteService(message.payload.serviceId);
        this.apiIngestionServer?.refreshTokenCache();
        this.engine.database.schedulePersist();
        await this.sendApiData();
        await this.sendOverview();
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Service removed.' } });
        break;
      }

      case 'TOGGLE_API_SERVICE_MONITORING': {
        this.engine.database.api.updateServiceMonitoring(message.payload.serviceId, message.payload.enabled);
        this.apiIngestionServer?.refreshTokenCache();
        this.engine.database.schedulePersist();
        await this.sendApiData();
        await this.sendOverview();
        break;
      }

      case 'REGENERATE_API_SERVICE_TOKEN': {
        const serviceId = message.payload.serviceId;
        const plainToken = 'devpulse_sec_' + randomUUID().replace(/-/g, '');
        let secretHash = '';
        if (this.apiIngestionServer) {
          secretHash = this.apiIngestionServer.registerServiceToken(serviceId, plainToken);
        }
        await this.context.secrets.store(`devpulse.api.${serviceId}.token`, plainToken);
        this.engine.database.api.updateServiceSecret(serviceId, secretHash);
        this.engine.database.schedulePersist();
        const service = this.engine.database.api.getService(serviceId);
        this.postMessage({
          type: 'API_SERVICE_TOKEN_CREATED',
          payload: {
            serviceId,
            serviceName: service?.name || 'Service',
            token: plainToken
          }
        });
        await this.sendApiData();
        break;
      }

      case 'GET_API_ENDPOINT_DETAILS': {
        const details = this.engine.database.api.getEndpointDetails(message.payload.endpointId, message.payload.limit);
        if (details) {
          this.postMessage({ type: 'API_ENDPOINT_DETAILS_DATA', payload: details });
        }
        break;
      }

      case 'CLEAR_API_DATA': {
        const choice = await vscode.window.showWarningMessage(
          'DevPulse: Clear all logged API request metrics from your local SQLite database?',
          { modal: true },
          'Clear API Data'
        );
        if (choice === 'Clear API Data') {
          this.engine.database.api.clear(message.payload?.serviceId);
          this.engine.database.schedulePersist();
          await this.sendApiData();
          await this.sendOverview();
          this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'API telemetry cleared.' } });
        }
        break;
      }

      // -----------------------------------------------------------------------
      // Phase 5: API Testing Studio Message Handlers
      // -----------------------------------------------------------------------

      case 'API_TEST_GET_WORKSPACE_STATE':
        await this.sendApiTestData();
        break;

      case 'API_TEST_CREATE_COLLECTION': {
        this.apiTestingService.createCollection(message.payload.name, message.payload.description);
        await this.sendApiTestData();
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: `Collection "${message.payload.name}" created.` } });
        break;
      }

      case 'API_TEST_UPDATE_COLLECTION': {
        this.apiTestingService.updateCollection(message.payload.id, message.payload);
        await this.sendApiTestData();
        break;
      }

      case 'API_TEST_DELETE_COLLECTION': {
        this.apiTestingService.deleteCollection(message.payload.id);
        await this.sendApiTestData();
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Collection deleted.' } });
        break;
      }

      case 'API_TEST_CREATE_FOLDER': {
        this.apiTestingService.createFolder(message.payload.collectionId, message.payload.name, message.payload.parentFolderId);
        await this.sendApiTestData();
        break;
      }

      case 'API_TEST_UPDATE_FOLDER': {
        this.apiTestingService.updateFolder(message.payload.id, message.payload);
        await this.sendApiTestData();
        break;
      }

      case 'API_TEST_DELETE_FOLDER': {
        this.apiTestingService.deleteFolder(message.payload.id);
        await this.sendApiTestData();
        break;
      }

      case 'API_TEST_SAVE_REQUEST': {
        await this.apiTestingService.saveRequest(message.payload);
        await this.sendApiTestData();
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: `Request "${message.payload.name}" saved.` } });
        break;
      }

      case 'API_TEST_DELETE_REQUEST': {
        this.apiTestingService.deleteRequest(message.payload.id);
        await this.sendApiTestData();
        break;
      }

      case 'API_TEST_EXECUTE_REQUEST': {
        this.postMessage({ type: 'API_TEST_REQUEST_EXECUTING', payload: { executionId: message.payload.executionId } });
        const result = await this.apiTestingService.executeRequest(message.payload, this.settingsManager.getSettings());
        this.postMessage({ type: 'API_TEST_REQUEST_RESULT', payload: result });
        await this.sendApiTestData();
        break;
      }

      case 'API_TEST_CANCEL_REQUEST': {
        this.apiTestingService.cancelRequest(message.payload.executionId);
        break;
      }

      case 'API_TEST_SAVE_ENVIRONMENT': {
        await this.apiTestingService.saveEnvironment(message.payload);
        await this.sendApiTestData();
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: `Environment "${message.payload.name}" saved.` } });
        break;
      }

      case 'API_TEST_DELETE_ENVIRONMENT': {
        this.apiTestingService.deleteEnvironment(message.payload.id);
        await this.sendApiTestData();
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Environment deleted.' } });
        break;
      }

      case 'API_TEST_SET_ACTIVE_ENVIRONMENT': {
        this.apiTestingService.setActiveEnvironment(message.payload.id);
        await this.sendApiTestData();
        break;
      }

      case 'API_TEST_REVEAL_SECRET': {
        const val = await this.apiTestingService.revealSecret(message.payload.variableId);
        if (val !== undefined) {
          this.postMessage({ type: 'API_TEST_SECRET_REVEALED', payload: { variableId: message.payload.variableId, value: val } });
        }
        break;
      }

      case 'API_TEST_GET_HISTORY': {
        const history = this.apiTestingService.getHistory(message.payload?.limit, message.payload?.search);
        this.postMessage({ type: 'API_TEST_HISTORY_DATA', payload: history });
        break;
      }

      case 'API_TEST_CLEAR_HISTORY': {
        this.apiTestingService.clearHistory();
        await this.sendApiTestData();
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'History cleared.' } });
        break;
      }

      case 'API_TEST_RUN_COLLECTION': {
        try {
          const runSummary = await this.apiTestingService.runCollection(
            message.payload,
            this.settingsManager.getSettings(),
            progress => {
              this.postMessage({ type: 'API_TEST_RUN_PROGRESS', payload: progress });
            }
          );
          this.postMessage({ type: 'API_TEST_RUN_COMPLETED', payload: runSummary });
          await this.sendApiTestData();
        } catch (err: any) {
          this.postMessage({ type: 'OPERATION_ERROR', payload: { message: err?.message || 'Collection run failed' } });
        }
        break;
      }

      case 'API_TEST_CANCEL_RUN': {
        this.apiTestingService.cancelRun(message.payload.runId);
        break;
      }

      case 'API_TEST_IMPORT_DATA': {
        try {
          const colId = await this.apiTestingService.importData(message.payload.format, message.payload.content);
          await this.sendApiTestData();
          this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: `Successfully imported API collection.` } });
        } catch (err: any) {
          this.postMessage({ type: 'OPERATION_ERROR', payload: { message: `Import error: ${err?.message || String(err)}` } });
        }
        break;
      }

      case 'API_TEST_EXPORT_DATA': {
        try {
          const exportContent = this.apiTestingService.exportData(message.payload.format, message.payload.collectionId);
          this.postMessage({
            type: 'API_TEST_EXPORT_RESULT',
            payload: {
              filename: `devpulse-collection-${message.payload.collectionId}.json`,
              content: exportContent
            }
          });
        } catch (err: any) {
          this.postMessage({ type: 'OPERATION_ERROR', payload: { message: `Export error: ${err?.message || String(err)}` } });
        }
        break;
      }

      case 'API_TEST_REORDER_ITEMS': {
        this.apiTestingService.reorderItems(message.payload.itemType, message.payload.items);
        await this.sendApiTestData();
        break;
      }

      // Phase 7: AI Playground Message Handlers
      case 'AI_PLAYGROUND_GET_DATA': {
        await this.sendPlaygroundData(message.payload?.conversationId);
        break;
      }

      case 'AI_CREATE_CONVERSATION': {
        const conv = this.engine.database.playground.createConversation({
          title: message.payload.title || 'New Chat',
          providerId: message.payload.providerId,
          modelId: message.payload.modelId,
          systemPrompt: message.payload.systemPrompt,
          generationSettings: message.payload.settings
        });
        await this.sendPlaygroundData(conv.id);
        break;
      }

      case 'AI_SELECT_CONVERSATION': {
        await this.sendPlaygroundData(message.payload.conversationId);
        break;
      }

      case 'AI_DELETE_CONVERSATION': {
        this.engine.database.playground.deleteConversation(message.payload.conversationId);
        if (this.currentSelectedConversationId === message.payload.conversationId) {
          this.currentSelectedConversationId = null;
        }
        await this.sendPlaygroundData();
        break;
      }

      case 'AI_RENAME_CONVERSATION': {
        this.engine.database.playground.renameConversation(message.payload.conversationId, message.payload.title);
        await this.sendPlaygroundData(message.payload.conversationId);
        break;
      }

      case 'AI_UPDATE_CONVERSATION_SETTINGS': {
        const { conversationId, providerId, modelId, settings, systemPrompt } = message.payload;
        this.engine.database.playground.updateConversationSettings(
          conversationId,
          providerId,
          modelId,
          settings,
          systemPrompt
        );
        await this.sendPlaygroundData(conversationId);
        break;
      }

      case 'AI_ABORT_STREAM': {
        const ctrl = this.activeStreamControllers.get(message.payload.conversationId);
        if (ctrl) {
          ctrl.abort();
          this.activeStreamControllers.delete(message.payload.conversationId);
        }
        break;
      }

      case 'AI_SEND_CHAT_MESSAGE': {
        await this.handleChatTurn(message.payload);
        break;
      }

      case 'AI_REGENERATE_MESSAGE': {
        const convId = message.payload.conversationId;
        const msgs = this.engine.database.playground.getMessages(convId);
        if (msgs.length >= 2) {
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg.role === 'assistant') {
            this.engine.database.playground.deleteMessage(lastMsg.id);
            const userMsg = msgs[msgs.length - 2];
            await this.handleChatTurn({
              conversationId: convId,
              content: userMsg.content,
              attachments: userMsg.attachments,
              isRetry: true
            });
          }
        }
        break;
      }

      case 'AI_CONTINUE_MESSAGE': {
        await this.handleChatTurn({
          conversationId: message.payload.conversationId,
          content: 'Continue your response from where you left off without repeating yourself.'
        });
        break;
      }

      case 'AI_SAVE_TEMPLATE': {
        this.engine.database.playground.saveTemplate(message.payload);
        await this.sendPlaygroundData(this.currentSelectedConversationId || undefined);
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: `Prompt template "${message.payload.name}" saved.` } });
        break;
      }

      case 'AI_DELETE_TEMPLATE': {
        this.engine.database.playground.deleteTemplate(message.payload.id);
        await this.sendPlaygroundData(this.currentSelectedConversationId || undefined);
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Prompt template removed.' } });
        break;
      }

      case 'AI_SAVE_PRESET': {
        this.engine.database.playground.savePreset(message.payload);
        await this.sendPlaygroundData(this.currentSelectedConversationId || undefined);
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: `Preset "${message.payload.name}" saved.` } });
        break;
      }

      case 'AI_DELETE_PRESET': {
        this.engine.database.playground.deletePreset(message.payload.id);
        await this.sendPlaygroundData(this.currentSelectedConversationId || undefined);
        break;
      }

      case 'AI_ADD_CUSTOM_PROVIDER': {
        const { name, baseUrl, modelIds, apiKey, headers } = message.payload;
        const id = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        this.engine.database.playground.saveCustomProvider({
          id,
          name,
          baseUrl,
          modelIds,
          headers
        });
        if (apiKey && apiKey.trim()) {
          await this.context.secrets.store(`devpulse.ai.custom.${id}.apiKey`, apiKey.trim());
        }
        if (this.aiRegistry) {
          this.aiRegistry.register(new CustomOpenAIAdapter(id, name, baseUrl, modelIds, headers || {}));
        }
        await this.sendPlaygroundData(this.currentSelectedConversationId || undefined);
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: `Custom provider "${name}" configured.` } });
        break;
      }

      case 'AI_DELETE_CUSTOM_PROVIDER': {
        const id = message.payload.id;
        this.engine.database.playground.deleteCustomProvider(id);
        await this.context.secrets.delete(`devpulse.ai.custom.${id}.apiKey`);
        if (this.aiRegistry) {
          this.aiRegistry.unregister(id);
        }
        await this.sendPlaygroundData(this.currentSelectedConversationId || undefined);
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Custom provider removed.' } });
        break;
      }

      case 'AI_DISCOVER_MODELS': {
        if (this.aiRegistry) {
          await this.aiRegistry.testProvider(message.payload.providerId);
          await this.sendPlaygroundData(this.currentSelectedConversationId || undefined);
        }
        break;
      }

      case 'AI_GET_WORKSPACE_FILES': {
        const files = await this.getWorkspaceFiles(message.payload?.query);
        this.postMessage({ type: 'AI_WORKSPACE_FILES_RESULT', payload: { files } });
        break;
      }

      case 'READ_WORKSPACE_FILE': {
        const filePath = (message.payload as any)?.path;
        if (filePath) {
          // SEC-01: Path traversal protection - verify file is within an active workspace folder
          const workspaceFolders = vscode.workspace.workspaceFolders || [];
          const isContained = workspaceFolders.some(f => {
            const rel = path.relative(f.uri.fsPath, filePath);
            return !rel.startsWith('..') && !path.isAbsolute(rel);
          });

          if (!isContained) {
            console.warn(`[DevPulse Security] Blocked read of file outside workspace: ${filePath}`);
            this.postMessage({
              type: 'WORKSPACE_FILE_CONTENT',
              payload: { path: filePath, content: '', isImage: false, error: 'Access denied: File is outside workspace' }
            });
            break;
          }

          let content = '';
          const isImage = isImageFilePath(filePath);
          const mimeType = isImage ? normalizeImageMime(getImageMime(filePath)) : undefined;
          if (isImage) {
            try {
              const buffer = await fs.promises.readFile(filePath);
              content = `data:${mimeType};base64,${buffer.toString('base64')}`;
            } catch {
              try {
                const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
                content = `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
              } catch (readErr) {
                console.warn(`[DevPulse] Failed to read image file at ${filePath}:`, readErr);
              }
            }
          } else {
            try {
              content = await fs.promises.readFile(filePath, 'utf8');
            } catch {
              try {
                const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
                content = Buffer.from(bytes).toString('utf8');
              } catch {}
            }
          }
          this.postMessage({
            type: 'WORKSPACE_FILE_CONTENT',
            payload: { path: filePath, content, isImage, mimeType }
          });
        }
        break;
      }

      // Phase 7: Pulse Insights Message Handlers
      case 'PULSE_GET_INSIGHTS': {
        await this.sendPulseInsightsData(message.payload?.timeRange || '7d');
        break;
      }

      case 'PULSE_UPDATE_INSIGHT_STATUS': {
        this.engine.database.insights.updateStatus(message.payload.id, message.payload.status);
        await this.sendPulseInsightsData();
        break;
      }

      case 'PULSE_RUN_ANALYSIS': {
        await this.sendPulseInsightsData(message.payload?.timeRange || '7d');
        this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Pulse Insights analysis refreshed.' } });
        break;
      }

      case 'PULSE_EXPLAIN_INSIGHT': {
        const settings = this.settingsManager.getSettings();
        const explanation = await this.correlationEngine.explainInsight(
          message.payload.insightId,
          Boolean(settings.pulseInsightsAiExplanationEnabled)
        );
        this.postMessage({
          type: 'PULSE_INSIGHT_EXPLANATION',
          payload: { insightId: message.payload.insightId, explanation }
        });
        break;
      }

      case 'EXPORT_LOCAL_DATA': {
        try {
          const system = this.engine.getLatestSystemSnapshot();
          const aiSummary = this.engine.database.ai.getSummary();
          const gitSummary = this.engine.database.git.getSummary();
          const codingSummary = this.engine.database.coding.getSummary();
          const apiSummary = this.engine.database.api.getSummary();
          const latestScan = this.engine.database.fileScans.getLatestScan();
          const alerts = this.engine.getActiveAlerts(100, false);
          const recentEvents = this.engine.database.metricEvents.getRecent(200);

          const exportPayload = {
            devpulseVersion: '1.0.0',
            exportedAt: new Date().toISOString(),
            system,
            aiSummary,
            gitSummary,
            codingSummary,
            apiSummary,
            fileScanSummary: latestScan,
            alerts,
            recentEvents
          };

          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`devpulse-telemetry-export-${Date.now()}.json`),
            filters: { 'JSON Files': ['json'] },
            title: 'Export DevPulse Local Telemetry Data'
          });

          if (uri) {
            await vscode.workspace.fs.writeFile(
              uri,
              Buffer.from(JSON.stringify(exportPayload, null, 2), 'utf8')
            );
            vscode.window.showInformationMessage(`DevPulse: Exported telemetry successfully to ${path.basename(uri.fsPath)}`);
            this.postMessage({ type: 'OPERATION_SUCCESS', payload: { message: 'Local telemetry exported successfully.' } });
          }
        } catch (err) {
          vscode.window.showErrorMessage(`DevPulse: Export failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        break;
      }

      case 'GET_AI_USAGE':
        await this.sendAiData();
        break;
      case 'GET_WORKSPACE_STATS':
        await this.sendFileIntelligence();
        break;
      case 'GET_GIT_ACTIVITY':
        await this.sendGitData();
        break;
      case 'GET_CODING_STATS':
        await this.sendCodingData();
        break;
      case 'GET_API_STATS':
        await this.sendApiData();
        break;
    }
  }

  private async handleChatTurn(payload: {
    conversationId: string;
    content: string;
    attachments?: ContextAttachment[];
    settings?: Record<string, unknown>;
    isRetry?: boolean;
  }): Promise<void> {
    const conv = this.engine.database.playground.getConversation(payload.conversationId);
    if (!conv) {
      this.postMessage({ type: 'OPERATION_ERROR', payload: { message: 'Conversation not found.' } });
      return;
    }

    let resolvedAttachments = payload.attachments;
    if (resolvedAttachments && resolvedAttachments.length > 0) {
      resolvedAttachments = await Promise.all(
        resolvedAttachments.map(async att => {
          const isImg = att.isImage || isImageFilePath(att.path) || (att.content && att.content.startsWith('data:image/'));
          const mime = normalizeImageMime(att.mimeType || (att.path ? getImageMime(att.path) : 'image/jpeg'));

          if (isImg) {
            let dataUrl = att.content || '';
            if (!dataUrl || dataUrl.startsWith('[File:') || dataUrl.startsWith('\x89PNG') || dataUrl.charCodeAt(0) === 0x89) {
              if (att.path) {
                try {
                  const buf = await fs.promises.readFile(att.path);
                  dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
                } catch {
                  try {
                    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(att.path));
                    dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
                  } catch (readErr) {
                    console.warn(`[DevPulse] Failed to read image attachment at ${att.path}:`, readErr);
                  }
                }
              }
            }
            return {
              ...att,
              isImage: true,
              mimeType: mime,
              content: dataUrl
            };
          }

          let text = att.content || '';
          if (!text || text.startsWith('[File:')) {
            if (att.path) {
              try {
                text = await fs.promises.readFile(att.path, 'utf8');
              } catch {
                try {
                  const fileUri = vscode.Uri.file(att.path);
                  const bytes = await vscode.workspace.fs.readFile(fileUri);
                  text = Buffer.from(bytes).toString('utf8');
                } catch (readErr) {
                  console.warn(`[DevPulse] Failed to read attachment file at ${att.path}:`, readErr);
                }
              }
            }
          }
          return {
            ...att,
            content: text
          };
        })
      );
    }

    if (!payload.isRetry) {
      this.engine.database.playground.addMessage({
        conversationId: conv.id,
        role: 'user',
        content: payload.content,
        attachments: resolvedAttachments,
        status: 'completed'
      });

      if (conv.title === 'New Chat') {
        const autoTitle = payload.content.slice(0, 30).trim() + (payload.content.length > 30 ? '...' : '');
        this.engine.database.playground.renameConversation(conv.id, autoTitle);
      }
    }

    const assistantMsg = this.engine.database.playground.addMessage({
      conversationId: conv.id,
      role: 'assistant',
      content: '',
      status: 'streaming'
    });

    await this.sendPlaygroundData(conv.id);

    const abortCtrl = new AbortController();
    this.activeStreamControllers.set(conv.id, abortCtrl);

    const adapter = this.aiRegistry?.getAdapter(conv.providerId);
    if (!adapter) {
      this.engine.database.playground.updateMessage(assistantMsg.id, {
        status: 'error',
        errorMessage: `AI Provider "${conv.providerId}" is not available.`
      });
      this.postMessage({
        type: 'AI_STREAM_ERROR',
        payload: {
          conversationId: conv.id,
          messageId: assistantMsg.id,
          error: `Provider "${conv.providerId}" not available or registered.`
        }
      });
      await this.sendPlaygroundData(conv.id);
      return;
    }

    // Model reconciliation when switching providers in the same conversation
    let effectiveModelId = conv.modelId;
    const pId = conv.providerId.toLowerCase();
    if (pId === 'gemini' && !effectiveModelId.toLowerCase().includes('gemini')) {
      effectiveModelId = 'gemini-1.5-flash';
    } else if (pId === 'anthropic' && !effectiveModelId.toLowerCase().includes('claude')) {
      effectiveModelId = 'claude-3-5-sonnet-20241022';
    } else if (pId === 'openai' && (effectiveModelId.includes('gemini') || effectiveModelId.includes('claude'))) {
      effectiveModelId = 'gpt-4o';
    } else if (pId === 'groq' && (effectiveModelId.includes('gemini') || effectiveModelId.includes('claude'))) {
      effectiveModelId = 'llama-3.3-70b-versatile';
    }

    if (effectiveModelId !== conv.modelId) {
      this.engine.database.playground.updateConversationSettings(
        conv.id,
        conv.providerId,
        effectiveModelId,
        conv.generationSettings as unknown as Record<string, unknown> | undefined,
        conv.systemPrompt
      );
    }

    // Explicit Vision Capability Safeguard: Check if user attached images to a text-only model
    const activeCaps = adapter.getModelCapabilities(effectiveModelId);
    const activeSupportsVision = Boolean(activeCaps.supportsVision);
    const hasIncomingImages = resolvedAttachments && resolvedAttachments.some(a => a.isImage || isImageFilePath(a.path) || (a.content && a.content.startsWith('data:image/')));
    if (hasIncomingImages && !activeSupportsVision) {
      const visionCheck = validateModelVisionCapability(adapter.name, effectiveModelId, activeSupportsVision);
      if (!visionCheck.supported) {
        this.engine.database.playground.updateMessage(assistantMsg.id, {
          status: 'error',
          errorMessage: visionCheck.error || 'Selected model does not support image/vision inputs.'
        });
        this.postMessage({
          type: 'AI_STREAM_ERROR',
          payload: {
            conversationId: conv.id,
            messageId: assistantMsg.id,
            error: visionCheck.error || 'Selected model does not support image/vision inputs.'
          }
        });
        await this.sendPlaygroundData(conv.id);
        return;
      }
    }

    try {
      const allMsgs = this.engine.database.playground.getMessages(conv.id);
      const chatHistory = allMsgs.filter(m => m.id !== assistantMsg.id);

      const llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string; images?: AiImagePart[] }> = [];
      if (conv.systemPrompt && conv.systemPrompt.trim()) {
        llmMessages.push({ role: 'system', content: conv.systemPrompt.trim() });
      }

      for (const m of chatHistory) {
        let msgContent = m.content || '';
        const msgImages: AiImagePart[] = [];

        if (m.attachments && m.attachments.length > 0) {
          const contextParts: string[] = [];

          for (const att of m.attachments) {
            const isImg = att.isImage || isImageFilePath(att.path) || (att.content && att.content.startsWith('data:image/'));
            const mime = normalizeImageMime(att.mimeType || (att.path ? getImageMime(att.path) : 'image/jpeg'));

            if (isImg) {
              let dataUrl = att.content || '';
              if (!dataUrl || dataUrl.startsWith('[File:') || dataUrl.startsWith('\x89PNG') || dataUrl.charCodeAt(0) === 0x89) {
                if (att.path) {
                  try {
                    const buf = await fs.promises.readFile(att.path);
                    dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
                  } catch {
                    try {
                      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(att.path));
                      dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
                    } catch {}
                  }
                }
              }

              if (dataUrl) {
                const validation = validateImageAttachment({
                  name: att.name,
                  path: att.path,
                  mimeType: mime,
                  content: dataUrl
                });

                if (validation.valid && validation.dataUrl) {
                  msgImages.push({
                    mimeType: validation.normalizedMimeType || mime,
                    base64Data: validation.dataUrl
                  });
                  contextParts.push(`[Attached Image: ${att.name || 'image'}]`);
                } else if (!validation.valid) {
                  console.warn(`[DevPulse] Image validation warning for ${att.name}: ${validation.error}`);
                }
              }
            } else {
              let text = att.content || '';
              if (!text || text.startsWith('[File:')) {
                if (att.path) {
                  try {
                    text = await fs.promises.readFile(att.path, 'utf8');
                  } catch {
                    try {
                      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(att.path));
                      text = Buffer.from(bytes).toString('utf8');
                    } catch {}
                  }
                }
              }
              const ext = path.extname(att.name).replace(/^\./, '') || 'text';
              contextParts.push(`--- Attached Workspace File: ${att.name} (${att.path}) ---\n\`\`\`${ext}\n${text || '// [File empty or inaccessible]'}\n\`\`\`\n--- End of ${att.name} ---`);
            }
          }

          if (contextParts.length > 0) {
            msgContent = msgContent ? `${msgContent}\n\n[Attached Workspace Context]:\n${contextParts.join('\n\n')}` : `[Attached Workspace Context]:\n${contextParts.join('\n\n')}`;
          }
        }

        // Clean any accidental binary UTF-8 headers from past corrupted sessions
        if (msgContent && (msgContent.includes('\x89PNG') || msgContent.includes('```png\n\x89PNG'))) {
          msgContent = msgContent.replace(/--- Attached Workspace File: [^\n]+\.png[\s\S]*?--- End of [^\n]+ ---/gi, '[Attached PNG Image]');
        }

        llmMessages.push({
          role: m.role,
          content: msgContent,
          images: (activeSupportsVision && msgImages.length > 0) ? msgImages : undefined
        });
      }

      const apiKey = await this.aiRegistry?.getApiKey(conv.providerId);

      const effectiveSettings = {
        ...(conv.generationSettings || {}),
        ...(payload.settings || {})
      };

      let streamedText = '';
      const result = await adapter.chatStream(
        {
          model: effectiveModelId,
          messages: llmMessages,
          temperature: effectiveSettings.temperature as number | undefined,
          topP: effectiveSettings.topP as number | undefined,
          topK: effectiveSettings.topK as number | undefined,
          maxTokens: effectiveSettings.maxTokens as number | undefined,
          frequencyPenalty: effectiveSettings.frequencyPenalty as number | undefined,
          presencePenalty: effectiveSettings.presencePenalty as number | undefined,
          stopSequences: effectiveSettings.stopSequences as string[] | undefined,
          seed: effectiveSettings.seed as number | undefined,
          signal: abortCtrl.signal
        },
        apiKey,
        chunk => {
          streamedText += chunk.text;
          this.postMessage({
            type: 'AI_STREAM_CHUNK',
            payload: {
              conversationId: conv.id,
              messageId: assistantMsg.id,
              chunk: chunk.text
            }
          });
        }
      );

      const cost = this.costCalculator.calculateCost(
        conv.providerId,
        conv.modelId,
        result.inputTokens,
        result.outputTokens
      );

      this.engine.database.playground.updateMessage(assistantMsg.id, {
        content: result.fullText,
        status: 'completed',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: result.durationMs
      });

      this.engine.database.ai.saveUsageRecord({
        provider: conv.providerId,
        model: conv.modelId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens: result.inputTokens + result.outputTokens,
        requestCount: 1,
        durationMs: result.durationMs,
        estimatedCost: cost,
        currency: 'USD',
        source: 'playground',
        timestamp: Date.now()
      });
      this.engine.database.schedulePersist();

      this.postMessage({
        type: 'AI_STREAM_END',
        payload: {
          conversationId: conv.id,
          messageId: assistantMsg.id,
          fullContent: result.fullText,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          durationMs: result.durationMs,
          estimatedCost: cost
        }
      });

      // Automatically refresh playground data, telemetry, and overview metrics
      await this.sendPlaygroundData(conv.id);
      await this.sendAiData(this.currentAiFilter);
      await this.sendOverview();
    } catch (err: unknown) {
      const isAbort = (err as any)?.name === 'AbortError' || abortCtrl.signal.aborted;
      const status = isAbort ? 'stopped' : 'error';
      const errMsg = err instanceof Error ? err.message : String(err);

      this.engine.database.playground.updateMessage(assistantMsg.id, {
        status,
        errorMessage: isAbort ? 'Generation stopped by user' : errMsg
      });

      this.postMessage({
        type: 'AI_STREAM_ERROR',
        payload: {
          conversationId: conv.id,
          messageId: assistantMsg.id,
          error: isAbort ? 'Generation stopped.' : errMsg
        }
      });
    } finally {
      this.activeStreamControllers.delete(conv.id);
      await this.sendPlaygroundData(conv.id);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'dist');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'assets', 'index.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'assets', 'index.css'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource} 'unsafe-eval'; worker-src blob: ${webview.cspSource}; font-src ${webview.cspSource} https: data:; img-src ${webview.cspSource} data:; connect-src ${webview.cspSource};">
  <link rel="stylesheet" href="${style}">
  <title>DevPulse</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let value = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}
