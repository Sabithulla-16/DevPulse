export type CollectorState = 'idle' | 'running' | 'paused' | 'error';

export interface CollectorStatus {
  id: string;
  name: string;
  description: string;
  category: 'system' | 'ai' | 'filesystem' | 'git' | 'coding' | 'api';
  enabled: boolean;
  state: CollectorState;
  implemented: boolean;
  lastCollectedAt?: number;
  error?: string;
  sampleCount?: number;
}

export interface MetricEvent<T = unknown> {
  id: string;
  collectorId: string;
  type: string;
  timestamp: number;
  payload: T;
}

export interface GpuSnapshot {
  model: string;
  vendor: string;
  vramMb: number;
  utilizationGpuPercent: number;
  memoryUsedMb?: number;
  memoryTotalMb?: number;
  temperatureC?: number;
}

export interface SystemSnapshot {
  cpuPercent: number;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryUsedBytes: number;
  memoryUsedPercent: number;
  uptimeSeconds: number;
  cpuModel?: string;
  cpuCores?: number;
  gpu?: GpuSnapshot | null;
}

export interface SystemMetricRecord {
  id: string;
  timestamp: number;
  cpuPercent: number;
  memoryTotalBytes: number;
  memoryUsedBytes: number;
  memoryFreeBytes: number;
  memoryUsedPercent: number;
  uptimeSeconds: number;
}

export interface DiskSnapshot {
  fs: string;
  mount: string;
  type: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryBytes: number;
  memoryPercent: number;
  started?: string;
  ports?: number[];
  isProtected?: boolean;
}

export interface PortInfo {
  port: number;
  protocol?: 'TCP' | 'UDP';
  state: 'LISTENING' | 'BOUND' | 'CLOSED';
  pid?: number;
  processName?: string;
  localAddress?: string;
  cpuPercent?: number;
  memoryBytes?: number;
}

// ---------------------------------------------------------------------------
// Phase 3: AI Intelligence Contracts
// ---------------------------------------------------------------------------

export type AiProviderStatus =
  | 'connected'
  | 'disconnected'
  | 'requires_configuration'
  | 'error'
  | 'unsupported';

export type AiProviderConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'auth_failed'
  | 'provider_unavailable'
  | 'unsupported'
  | 'collection_error';

export type AiUsageTrackingStatus =
  | 'usage_tracking_active'
  | 'usage_tracking_inactive';

export interface AiProviderInfo {
  id: string;
  name: string;
  status: AiProviderStatus;
  connectionStatus?: AiProviderConnectionStatus;
  usageTrackingStatus?: AiUsageTrackingStatus;
  modelCatalogStatus?: 'model_catalog_available' | 'model_catalog_unavailable';
  endpoint?: string;
  isLocal: boolean;
  isConfigured?: boolean;
  isHealthy?: boolean;
  availableModels?: string[];
  lastSyncedAt?: number;
  requestCount?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  createdAt?: number;
  error?: string;
}

export interface AiModelUsage {
  model: string;
  provider: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  avgTokensPerRequest: number;
  estimatedCost: number;
  lastUsedAt: number;
}

export interface AiUsageRecord {
  id: string;
  workspaceId?: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  requestCount: number;
  durationMs?: number;
  estimatedCost?: number;
  currency?: string;
  source: string;
  requestType?: string;
  pricingSnapshotJson?: string;
  timestamp: number;
  idempotencyKey?: string;
  isEstimated?: boolean;
}

export interface AiPricingModel {
  id: string;
  provider: string;
  modelPattern: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  isCustom?: boolean;
  updatedAt: number;
}

export interface AiBudgetConfig {
  id: string;
  periodType: 'daily' | 'monthly';
  limitAmount: number;
  thresholdPercent: number;
  provider?: string;
  model?: string;
  createdAt: number;
}

export interface AiOverviewSummary {
  totalRequests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  activeProvidersCount: number;
  modelsCount: number;
  todayCost: number;
  todayTokens: number;
  todayRequests: number;
}

export interface AiTimeSeriesPoint {
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  requestCount: number;
  provider?: string;
  model?: string;
}

export interface AiIntelligenceData {
  summary: AiOverviewSummary;
  timeFilter: 'today' | '7d' | '30d' | '90d' | 'all';
  providers: AiProviderInfo[];
  models: AiModelUsage[];
  timeSeries: AiTimeSeriesPoint[];
  recentUsage: AiUsageRecord[];
  pricing: AiPricingModel[];
  budgets: AiBudgetConfig[];
  budgetConsumedPercent: number;
}

// ---------------------------------------------------------------------------
// Phase 3: Git Intelligence Contracts
// ---------------------------------------------------------------------------

export interface GitRepositoryInfo {
  id: string;
  workspacePath: string;
  name: string;
  rootPath: string;
  currentBranch?: string;
  headCommitHash?: string;
  remotes: { name: string; url: string }[];
  isClean: boolean;
  lastPolledAt: number;
  totalCommits?: number;
}

export interface GitCommitInfo {
  id: string;
  repoId: string;
  commitHash: string;
  shortHash: string;
  authorName: string;
  authorEmail?: string;
  message: string;
  timestamp: number;
  branch?: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitBranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream?: string;
  aheadCount?: number;
  behindCount?: number;
  lastCommitHash?: string;
  lastCommitAt?: number;
}

export interface GitHistoryCoverage {
  totalInRepo: number;
  syncedCommits: number;
  oldestCommitDate?: number;
  newestCommitDate?: number;
  hasMore: boolean;
}

export interface GitWorkingTreeFile {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | '?' | 'U' | 'modified' | 'added' | 'deleted' | 'untracked';
  isStaged: boolean;
  oldPath?: string;
}

export interface GitContributionStats {
  authors: {
    name: string;
    commitCount: number;
    insertions: number;
    deletions: number;
    lastCommitAt: number;
  }[];
  dailyActivity: {
    date: string;
    commits: number;
    insertions: number;
    deletions: number;
  }[];
}

export interface GitCodeChangeStats {
  frequentlyChangedFiles: { path: string; changeCount: number }[];
  extensionBreakdown: { extension: string; changeCount: number }[];
}

export interface GitHealthInsight {
  type: 'info' | 'warning' | 'alert';
  title: string;
  message: string;
}

export interface GitOverviewSummary {
  totalRepositories: number;
  currentBranch: string;
  totalCommits: number;
  commitsToday: number;
  commitsThisWeek: number;
  uncommittedChangesCount: number;
  modifiedFilesCount: number;
  addedFilesCount: number;
  deletedFilesCount: number;
  activeContributorsCount: number;
}

export interface GitIntelligenceData {
  summary: GitOverviewSummary;
  repositories: GitRepositoryInfo[];
  selectedRepoId: string | null;
  currentBranch: string;
  workingTree: GitWorkingTreeFile[];
  recentCommits: GitCommitInfo[];
  branches: GitBranchInfo[];
  contributions: GitContributionStats;
  codeChanges: GitCodeChangeStats;
  healthInsights: GitHealthInsight[];
  hasGit: boolean;
  historyCoverage?: GitHistoryCoverage;
}

export interface SystemExtendedData {
  current: SystemSnapshot | null;
  history: SystemMetricRecord[];
  intervalSeconds: number;
  monitoring: boolean;
  cpuStats: {
    current: number;
    average: number;
    peak: number;
  };
  disks: DiskSnapshot[];
  topProcesses: ProcessInfo[];
  activePorts: PortInfo[];
}

export interface AlertItem {
  id: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'critical';
  collectorId: string;
  title: string;
  message: string;
  acknowledged: boolean;
}

export interface WorkspaceFileScanSummary {
  scanId: string;
  workspacePath: string;
  workspaceName: string;
  totalSizeBytes: number;
  totalFileCount: number;
  totalFolderCount: number;
  scannedFileCount: number;
  excludedFileCount: number;
  excludedFolderCount: number;
  scanDurationMs: number;
  timestamp: number;
  status: 'idle' | 'scanning' | 'completed' | 'cancelled' | 'error';
  error?: string;
}

export interface FileEntryRecord {
  path: string; // Relative to workspace root
  name: string;
  extension: string;
  sizeBytes: number;
  lastModified: number;
}

export interface DirectoryStats {
  path: string; // Relative to workspace root
  name: string;
  directFileCount: number;
  recursiveFileCount: number;
  totalSizeBytes: number;
  childDirCount: number;
}

export interface ExtensionBreakdown {
  extension: string;
  fileCount: number;
  totalSizeBytes: number;
  percentage: number;
}

export interface ExtensionFilesQuery {
  extension: string;
  search?: string;
  sortBy?: 'name' | 'path' | 'size' | 'modified';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ExtensionFilesResult {
  extension: string;
  totalCount: number;
  totalSizeBytes: number;
  files: FileEntryRecord[];
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DuplicateGroup {
  hash: string;
  fileSizeBytes: number;
  fileCount: number;
  files: string[];
  wastedBytes: number;
}

export interface WorkspaceGrowthComparison {
  currentSizeBytes: number;
  previousSizeBytes: number | null;
  differenceBytes: number;
  growthPercentage: number;
  currentFiles: number;
  previousFiles: number | null;
}

export interface ScanProgress {
  scannedCount: number;
  currentPath: string;
  totalEstimated?: number;
  statusText?: string;
}

export interface FileIntelligenceData {
  summary: WorkspaceFileScanSummary | null;
  largestFiles: FileEntryRecord[];
  directories: DirectoryStats[];
  extensions: ExtensionBreakdown[];
  duplicates: DuplicateGroup[];
  growth: WorkspaceGrowthComparison | null;
  growthHistory: { timestamp: number; totalSizeBytes: number; fileCount: number }[];
  isScanning: boolean;
  progress?: ScanProgress;
}

export interface DevPulseSettings {
  monitoringEnabled: boolean;
  sampleIntervalSeconds: number;
  enableCpuMonitoring: boolean;
  enableMemoryMonitoring: boolean;
  theme: 'dark' | 'light';
  statusBarShowCpu: boolean;
  statusBarShowMemory: boolean;
  statusBarShowState: boolean;
  aiMonitoringEnabled: boolean;
  filesystemMonitoringEnabled: boolean;
  gitMonitoringEnabled: boolean;
  codingMonitoringEnabled: boolean;
  apiMonitoringEnabled: boolean;

  // Phase 2 Settings
  fsEnableScanning: boolean;
  fsExcludedDirectories: string[];
  fsExcludedPatterns: string[];
  fsEnableDuplicates: boolean;
  fsMaxHashSizeMb: number;
  fsScanConcurrency: number;

  enableDiskMonitoring: boolean;
  enableProcessMonitoring: boolean;
  enablePortMonitoring: boolean;
  processSampleIntervalSeconds: number;
  diskSampleIntervalSeconds: number;

  alertCpuThreshold: number;
  alertMemoryThreshold: number;
  alertDiskThreshold: number;
  alertCooldownSeconds: number;

  // Phase 3 Settings: AI Intelligence
  aiOllamaHost: string;
  aiSyncIntervalSeconds: number;
  aiDailyBudgetLimit: number;
  aiMonthlyBudgetLimit: number;
  aiEnableLocalAgentDetection: boolean;

  // Phase 3 Settings: Git Intelligence
  gitPollIntervalSeconds: number;
  gitMaxCommits: number;
  gitTrackRemoteBranches: boolean;

  // Phase 4 Settings: Coding Intelligence
  codingTrackingEnabled: boolean;
  codingIdleThresholdSeconds: number;
  codingPauseOnWindowBlur: boolean;
  codingTrackFileSaves: boolean;
  codingWorkspaceExclusions: string[];
  codingPrivacyMode: boolean;
  codingRetentionDays: number;

  // Phase 4 Settings: API Intelligence
  apiIngestionHost: string;
  apiIngestionPort: number;
  apiMaxQueueSize: number;
  apiRawEventRetentionDays: number;
  apiExcludedRoutes: string[];
  apiAlertLatencyP95ThresholdMs: number;
  apiAlertErrorRateThresholdPercent: number;

  // Phase 5 Settings: API Testing Studio
  apiTestingLogToApiIntelligence: boolean;
  apiTestingMaxResponseBodySizeMb: number;
  apiTestingFollowRedirectsLimit: number;
  apiTestingScriptTimeoutMs: number;
  apiTestingDefaultTimeoutMs: number;

  // Phase 7 Settings: AI Playground & Pulse Insights
  aiPlaygroundDefaultProvider?: string;
  aiPlaygroundDefaultModel?: string;
  aiPlaygroundMaxContextTokens?: number;
  pulseInsightsAutoRun?: boolean;
  pulseInsightsAiExplanationEnabled?: boolean;
}

export interface WorkspaceInfo {
  name: string;
  path?: string;
  folderCount: number;
  lastScanSizeBytes?: number;
  lastScanFileCount?: number;
}

export interface OverviewData {
  system: SystemSnapshot | null;
  workspace: WorkspaceInfo | null;
  collectors: CollectorStatus[];
  monitoring: boolean;
  recentEvents: MetricEvent[];
  activeAlerts: AlertItem[];
  settings: DevPulseSettings;
  fileSummary: WorkspaceFileScanSummary | null;
  disks: DiskSnapshot[];
  aiSummary?: AiOverviewSummary | null;
  gitSummary?: GitOverviewSummary | null;
  codingSummary?: CodingOverviewSummary | null;
  apiSummary?: ApiOverviewSummary | null;
}

export interface SystemMetricsData {
  current: SystemSnapshot | null;
  history: SystemMetricRecord[];
  intervalSeconds: number;
  monitoring: boolean;
}

// ---------------------------------------------------------------------------
// Phase 4: Coding Intelligence Contracts
// ---------------------------------------------------------------------------

export interface CodingSessionItem {
  id: string;
  workspaceId: string;
  workspaceName: string;
  startedAt: number;
  endedAt?: number;
  lastActivityAt: number;
  activeDurationSeconds: number;
  idleDurationSeconds: number;
  pausedDurationSeconds: number;
  status: 'active' | 'idle' | 'paused' | 'ended';
  primaryLanguage: string;
  languages: Record<string, number>;
}

export interface CodingLanguageStat {
  languageId: string;
  displayName: string;
  activeSeconds: number;
  percentage: number;
  sessionCount: number;
}

export interface CodingProjectStat {
  workspaceId: string;
  workspaceName: string;
  activeSeconds: number;
  sessionCount: number;
  lastActiveAt: number;
  primaryLanguage: string;
}

export interface CodingTimelineHour {
  hour: string;
  activeSeconds: number;
  idleSeconds: number;
}

export interface CodingStatusEvent {
  status: 'active' | 'idle' | 'paused' | 'stopped';
  activeProject?: string;
  activeLanguage?: string;
  currentSessionSeconds: number;
  activeDurationSeconds: number;
}

export interface CodingIntelligenceSummary {
  totalActiveSeconds: number;
  totalIdleSeconds: number;
  totalSessions: number;
  avgSessionSeconds: number;
  activeProjectsCount: number;
  languagesCount: number;
  weeklyActiveSeconds: number;
}

export interface CodingOverviewSummary {
  todayActiveSeconds: number;
  activeSessionsCount: number;
  topLanguage: string;
  activeProjectName?: string;
  isTracking: boolean;
  isPaused: boolean;
}

export interface CodingIntelligenceData {
  summary: CodingIntelligenceSummary;
  liveStatus: CodingStatusEvent;
  hourlyActivity: CodingTimelineHour[];
  dailyActivity: { date: string; activeSeconds: number; idleSeconds: number }[];
  languages: CodingLanguageStat[];
  projects: CodingProjectStat[];
  recentSessions: CodingSessionItem[];
}

// ---------------------------------------------------------------------------
// Phase 4: API Intelligence Contracts
// ---------------------------------------------------------------------------

export interface ApiServiceItem {
  id: string;
  name: string;
  integrationType: string;
  environment: string;
  monitoringEnabled: boolean;
  totalRequests: number;
  lastEventAt?: number;
  createdAt: number;
}

export interface ApiEndpointItem {
  id: string;
  serviceId: string;
  routeTemplate: string;
  method: string;
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  lastRequestedAt: number;
}

export interface ApiRequestEventItem {
  id: string;
  serviceId: string;
  endpointId: string;
  routeTemplate: string;
  method: string;
  statusCode: number;
  durationMs: number;
  startedAt?: number;
  completedAt: number;
  outcome: 'success' | 'failure';
  errorCategory?: string;
  environment?: string;
  requestSizeBytes?: number;
  responseSizeBytes?: number;
}

export interface ApiIntelligenceSummary {
  totalRequests: number;
  successRate: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  activeServicesCount: number;
}

export interface ApiOverviewSummary {
  totalRequestsToday: number;
  successRate: number;
  errorRate: number;
  avgLatencyMs: number;
  activeServicesCount: number;
  ingestionRunning: boolean;
  ingestionPort: number;
}

export interface ApiEndpointDetailsData {
  endpoint: ApiEndpointItem;
  recentEvents: ApiRequestEventItem[];
  latencyHistogram: { bin: string; count: number }[];
  statusCodes: { code: number; count: number }[];
}

export interface ApiIntelligenceData {
  summary: ApiIntelligenceSummary;
  ingestionStatus: {
    running: boolean;
    host: string;
    port: number;
    activeConnections: number;
    queueSize: number;
    error?: string;
  };
  services: ApiServiceItem[];
  endpoints: ApiEndpointItem[];
  recentErrors: ApiRequestEventItem[];
  volumeTimeSeries: { time: string; timestamp: number; successCount: number; errorCount: number; avgLatencyMs: number }[];
  statusCodeDistribution: { codeCategory: string; count: number; percentage: number }[];
  methodDistribution: { method: string; count: number; percentage: number }[];
}

// Typed Webview Messages (from Webview to Extension Host)
export type WebviewToExtensionMessage =
  | { type: 'GET_OVERVIEW' }
  | { type: 'GET_SYSTEM_METRICS'; payload?: { limit?: number } }
  | { type: 'GET_EXTENDED_SYSTEM' }
  | { type: 'GET_MONITORING_STATUS' }
  | { type: 'REFRESH_METRICS' }
  | { type: 'PAUSE_MONITORING' }
  | { type: 'RESUME_MONITORING' }
  | { type: 'GET_ALERTS' }
  | { type: 'ACKNOWLEDGE_ALERT'; payload: { id: string } }
  | { type: 'ACKNOWLEDGE_ALL_ALERTS' }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<DevPulseSettings> }
  | { type: 'RESET_DATA' }
  | { type: 'START_WORKSPACE_SCAN' }
  | { type: 'CANCEL_WORKSPACE_SCAN' }
  | { type: 'GET_FILE_INTELLIGENCE' }
  | { type: 'CLEAR_SCAN_HISTORY' }
  | { type: 'GET_EXTENSION_FILES'; payload: ExtensionFilesQuery }
  | { type: 'OPEN_FILE'; payload: { relativePath: string } }
  | { type: 'REVEAL_IN_EXPLORER'; payload: { relativePath: string } }
  | { type: 'STOP_PROCESS'; payload: { pid: number; processName: string; force?: boolean } }
  | { type: 'FREE_PORT'; payload: { port: number; protocol?: 'TCP' | 'UDP'; pid?: number; processName?: string; force?: boolean } }
  | { type: 'GET_AI_INTELLIGENCE'; payload?: { timeFilter?: 'today' | '7d' | '30d' | '90d' | 'all' } }
  | { type: 'GET_GIT_INTELLIGENCE'; payload?: { repoId?: string } }
  | { type: 'TEST_AI_PROVIDER'; payload: { providerId: string; endpoint?: string } }
  | { type: 'SET_AI_PROVIDER_KEY'; payload: { providerId: string; apiKey?: string; endpoint?: string; customModel?: string } }
  | { type: 'SET_OLLAMA_HOST'; payload?: { host?: string } }
  | { type: 'UPDATE_AI_BUDGET'; payload: Partial<AiBudgetConfig> }
  | { type: 'UPDATE_AI_PRICING'; payload: Partial<AiPricingModel> }
  | { type: 'DELETE_AI_PRICING'; payload: { id: string } }
  | { type: 'CLEAR_AI_DATA' }
  | { type: 'REFRESH_GIT'; payload?: { repoId?: string } }
  | { type: 'SELECT_GIT_REPO'; payload: { repoId: string } }
  | { type: 'GET_PROCESSES' }
  | { type: 'GET_DISKS' }
  | { type: 'GET_PORTS' }
  | { type: 'GET_AI_USAGE' }
  | { type: 'GET_WORKSPACE_STATS' }
  | { type: 'GET_GIT_ACTIVITY' }
  | { type: 'GET_CODING_STATS' }
  | { type: 'GET_API_STATS' }
  // Phase 4 Webview Actions:
  | { type: 'GET_CODING_INTELLIGENCE'; payload?: { timeFilter?: 'today' | '7d' | '30d' | 'all'; workspaceId?: string } }
  | { type: 'PAUSE_CODING_TRACKING' }
  | { type: 'RESUME_CODING_TRACKING' }
  | { type: 'CLEAR_CODING_DATA' }
  | { type: 'GET_API_INTELLIGENCE'; payload?: { serviceId?: string; environment?: string; timeFilter?: '1h' | '24h' | '7d' | '30d' } }
  | { type: 'CREATE_API_SERVICE'; payload: { name: string; environment?: string; integrationType?: string } }
  | { type: 'DELETE_API_SERVICE'; payload: { serviceId: string } }
  | { type: 'TOGGLE_API_SERVICE_MONITORING'; payload: { serviceId: string; enabled: boolean } }
  | { type: 'REGENERATE_API_SERVICE_TOKEN'; payload: { serviceId: string } }
  | { type: 'GET_API_ENDPOINT_DETAILS'; payload: { endpointId: string; limit?: number } }
  | { type: 'CLEAR_API_DATA'; payload?: { serviceId?: string } }
  // Phase 5: API Testing Studio Messages:
  | { type: 'API_TEST_GET_WORKSPACE_STATE' }
  | { type: 'API_TEST_CREATE_COLLECTION'; payload: { name: string; description?: string } }
  | { type: 'API_TEST_UPDATE_COLLECTION'; payload: { id: string; name?: string; description?: string; authConfig?: ApiTestAuthConfig } }
  | { type: 'API_TEST_DELETE_COLLECTION'; payload: { id: string } }
  | { type: 'API_TEST_CREATE_FOLDER'; payload: { collectionId: string; parentFolderId?: string; name: string } }
  | { type: 'API_TEST_UPDATE_FOLDER'; payload: { id: string; name?: string; parentFolderId?: string } }
  | { type: 'API_TEST_DELETE_FOLDER'; payload: { id: string } }
  | { type: 'API_TEST_SAVE_REQUEST'; payload: ApiTestRequestPayload }
  | { type: 'API_TEST_DELETE_REQUEST'; payload: { id: string } }
  | { type: 'API_TEST_EXECUTE_REQUEST'; payload: ApiTestExecutionPayload }
  | { type: 'API_TEST_CANCEL_REQUEST'; payload: { executionId: string } }
  | { type: 'API_TEST_SAVE_ENVIRONMENT'; payload: { id?: string; name: string; variables: ApiTestVariablePayload[] } }
  | { type: 'API_TEST_DELETE_ENVIRONMENT'; payload: { id: string } }
  | { type: 'API_TEST_SET_ACTIVE_ENVIRONMENT'; payload: { id: string | null } }
  | { type: 'API_TEST_REVEAL_SECRET'; payload: { variableId: string } }
  | { type: 'API_TEST_GET_HISTORY'; payload?: { limit?: number; search?: string } }
  | { type: 'API_TEST_CLEAR_HISTORY' }
  | { type: 'API_TEST_RUN_COLLECTION'; payload: ApiTestCollectionRunConfig }
  | { type: 'API_TEST_CANCEL_RUN'; payload: { runId: string } }
  | { type: 'API_TEST_IMPORT_DATA'; payload: { format: 'postman' | 'openapi' | 'curl'; content: string } }
  | { type: 'API_TEST_EXPORT_DATA'; payload: { format: 'postman'; collectionId: string } }
  | { type: 'API_TEST_REORDER_ITEMS'; payload: { itemType: 'collection' | 'folder' | 'request'; items: { id: string; sortOrder: number }[] } }
  // Phase 7: AI Playground Messages
  | { type: 'AI_PLAYGROUND_GET_DATA'; payload?: { conversationId?: string } }
  | { type: 'AI_CREATE_CONVERSATION'; payload: { providerId: string; modelId: string; title?: string; systemPrompt?: string; settings?: Record<string, unknown> } }
  | { type: 'AI_SELECT_CONVERSATION'; payload: { conversationId: string } }
  | { type: 'AI_DELETE_CONVERSATION'; payload: { conversationId: string } }
  | { type: 'AI_RENAME_CONVERSATION'; payload: { conversationId: string; title: string } }
  | { type: 'AI_UPDATE_CONVERSATION_SETTINGS'; payload: { conversationId: string; providerId: string; modelId: string; settings?: Record<string, unknown>; systemPrompt?: string } }
  | { type: 'AI_SEND_CHAT_MESSAGE'; payload: { conversationId: string; content: string; attachments?: ContextAttachment[]; settings?: Record<string, unknown> } }
  | { type: 'AI_ABORT_STREAM'; payload: { conversationId: string } }
  | { type: 'AI_REGENERATE_MESSAGE'; payload: { conversationId: string; messageId?: string } }
  | { type: 'AI_CONTINUE_MESSAGE'; payload: { conversationId: string; messageId?: string } }
  | { type: 'AI_SAVE_TEMPLATE'; payload: PromptTemplateInput }
  | { type: 'AI_DELETE_TEMPLATE'; payload: { id: string } }
  | { type: 'AI_SAVE_PRESET'; payload: GenerationPresetInput }
  | { type: 'AI_DELETE_PRESET'; payload: { id: string } }
  | { type: 'AI_ADD_CUSTOM_PROVIDER'; payload: { name: string; baseUrl: string; modelIds: string[]; apiKey?: string; headers?: Record<string, string> } }
  | { type: 'AI_DELETE_CUSTOM_PROVIDER'; payload: { id: string } }
  | { type: 'AI_DISCOVER_MODELS'; payload: { providerId: string } }
  | { type: 'AI_GET_WORKSPACE_FILES'; payload?: { query?: string } }
  | { type: 'READ_WORKSPACE_FILE'; payload: { path: string } }
  // Phase 7: Pulse Insights Messages
  | { type: 'PULSE_GET_INSIGHTS'; payload?: { timeRange: 'today' | '7d' | '30d' | '90d'; category?: string } }
  | { type: 'PULSE_UPDATE_INSIGHT_STATUS'; payload: { id: string; status: 'viewed' | 'dismissed' | 'resolved' } }
  | { type: 'PULSE_RUN_ANALYSIS'; payload?: { timeRange?: 'today' | '7d' | '30d' | '90d' } }
  | { type: 'PULSE_EXPLAIN_INSIGHT'; payload: { insightId: string } }
  | { type: 'EXPORT_LOCAL_DATA' };

// Typed Extension to Webview Messages
export type ExtensionToWebviewMessage =
  | { type: 'OVERVIEW_DATA'; payload: OverviewData }
  | { type: 'SYSTEM_METRICS_DATA'; payload: SystemMetricsData }
  | { type: 'SYSTEM_EXTENDED_DATA'; payload: SystemExtendedData }
  | { type: 'FILE_INTELLIGENCE_DATA'; payload: FileIntelligenceData }
  | { type: 'EXTENSION_FILES_DATA'; payload: ExtensionFilesResult }
  | { type: 'AI_INTELLIGENCE_DATA'; payload: AiIntelligenceData }
  | { type: 'GIT_INTELLIGENCE_DATA'; payload: GitIntelligenceData }
  | { type: 'AI_PROVIDER_TEST_RESULT'; payload: { providerId: string; success: boolean; message: string; models?: string[] } }
  | { type: 'GIT_OPERATION_RESULT'; payload: { success: boolean; message: string } }
  | { type: 'PROCESS_TERMINATION_RESULT'; payload: { success: boolean; pid: number; processName: string; message: string; requiresForce?: boolean } }
  | { type: 'PORT_FREED_RESULT'; payload: { success: boolean; port: number; pid?: number; message: string; requiresForce?: boolean } }
  | { type: 'FILE_SCAN_PROGRESS'; payload: ScanProgress }
  | { type: 'MONITORING_STATUS_DATA'; payload: { running: boolean; collectors: CollectorStatus[] } }
  | { type: 'ALERTS_DATA'; payload: AlertItem[] }
  | { type: 'SETTINGS_DATA'; payload: DevPulseSettings }
  | { type: 'SETTINGS_UPDATED'; payload: DevPulseSettings }
  | { type: 'NAVIGATE_TO'; payload: { tab: string } }
  | { type: 'OPERATION_SUCCESS'; payload: { message: string } }
  | { type: 'OPERATION_ERROR'; payload: { message: string } }
  // Phase 4 Extension Responses:
  | { type: 'CODING_INTELLIGENCE_DATA'; payload: CodingIntelligenceData }
  | { type: 'CODING_STATUS_CHANGED'; payload: { status: 'active' | 'idle' | 'paused' | 'stopped'; activeProject?: string; currentSessionSeconds: number } }
  | { type: 'API_INTELLIGENCE_DATA'; payload: ApiIntelligenceData }
  | { type: 'API_ENDPOINT_DETAILS_DATA'; payload: ApiEndpointDetailsData }
  | { type: 'API_SERVICE_TOKEN_CREATED'; payload: { serviceId: string; serviceName: string; token: string } }
  // Phase 5: API Testing Studio Responses:
  | { type: 'API_TEST_WORKSPACE_STATE'; payload: ApiTestWorkspaceState }
  | { type: 'API_TEST_REQUEST_EXECUTING'; payload: { executionId: string } }
  | { type: 'API_TEST_REQUEST_RESULT'; payload: ApiTestExecutionResult }
  | { type: 'API_TEST_HISTORY_DATA'; payload: ApiTestHistoryItem[] }
  | { type: 'API_TEST_RUN_PROGRESS'; payload: ApiTestRunProgress }
  | { type: 'API_TEST_RUN_COMPLETED'; payload: ApiTestRunSummary }
  | { type: 'API_TEST_SECRET_REVEALED'; payload: { variableId: string; value: string } }
  | { type: 'API_TEST_EXPORT_RESULT'; payload: { filename: string; content: string } }
  // Phase 7: AI Playground Responses:
  | { type: 'AI_PLAYGROUND_DATA'; payload: AiPlaygroundData }
  | { type: 'AI_STREAM_CHUNK'; payload: { conversationId: string; messageId: string; chunk: string } }
  | { type: 'AI_STREAM_END'; payload: { conversationId: string; messageId: string; fullContent: string; inputTokens: number; outputTokens: number; durationMs: number; estimatedCost?: number } }
  | { type: 'AI_STREAM_ERROR'; payload: { conversationId: string; messageId: string; error: string } }
  | { type: 'AI_WORKSPACE_FILES_RESULT'; payload: { files: Array<{ path: string; name: string; size: number }> } }
  | { type: 'WORKSPACE_FILE_CONTENT'; payload: { path: string; content: string; isImage?: boolean; mimeType?: string; error?: string } }
  // Phase 7: Pulse Insights Responses:
  | { type: 'PULSE_INSIGHTS_DATA'; payload: PulseInsightsData }
  | { type: 'PULSE_INSIGHT_EXPLANATION'; payload: { insightId: string; explanation: string } };

// ---------------------------------------------------------------------------
// Phase 5: API Testing Studio Data Models & Contracts
// ---------------------------------------------------------------------------

export interface ApiTestCollectionRecord {
  id: string;
  name: string;
  description?: string;
  authType: string;
  authConfigJson?: string;
  variablesJson?: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface ApiTestFolderRecord {
  id: string;
  collectionId: string;
  parentFolderId?: string;
  name: string;
  description?: string;
  authType: string;
  authConfigJson?: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface ApiTestRequestRecord {
  id: string;
  collectionId?: string;
  folderId?: string;
  name: string;
  method: string;
  url: string;
  paramsJson: string;
  headersJson: string;
  bodyType: string;
  bodyContent?: string;
  authType: string;
  authConfigJson?: string;
  preRequestScript?: string;
  testScript?: string;
  settingsJson?: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface ApiTestEnvironmentRecord {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ApiTestVariableRecord {
  id: string;
  environmentId?: string;
  collectionId?: string;
  key: string;
  initialValue: string;
  currentValue: string;
  isSecret: boolean;
  secretRef?: string;
  description?: string;
  enabled: boolean;
  updatedAt: number;
}

export interface ApiTestHistoryRecord {
  id: string;
  requestId?: string;
  method: string;
  url: string;
  statusCode: number;
  statusText: string;
  durationMs: number;
  responseSizeBytes: number;
  environmentName?: string;
  collectionId?: string;
  requestSummaryJson?: string;
  responseSummaryJson?: string;
  executedAt: number;
}

export interface ApiTestRunRecord {
  id: string;
  collectionId: string;
  environmentId?: string;
  iterationCount: number;
  totalRequests: number;
  passedAssertions: number;
  failedAssertions: number;
  durationMs: number;
  status: 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  completedAt: number;
}

export interface ApiTestRunResultRecord {
  id: string;
  runId: string;
  iteration: number;
  requestId: string;
  requestName: string;
  method: string;
  url: string;
  statusCode?: number;
  durationMs: number;
  assertionsJson: string;
  errorMessage?: string;
  executedAt: number;
}

export interface ApiTestKeyValuePair {
  id: string;
  key: string;
  value: string;
  description?: string;
  enabled: boolean;
}

export type ApiTestAuthType = 'inherit' | 'none' | 'bearer' | 'basic' | 'apikey' | 'oauth2';

export interface ApiTestAuthConfig {
  type: ApiTestAuthType;
  bearer?: { token?: string; secretRef?: string };
  basic?: { username?: string; password?: string; secretRef?: string };
  apiKey?: { key: string; value: string; in: 'header' | 'query'; secretRef?: string };
  oauth2?: {
    grantType: 'authorization_code' | 'client_credentials';
    authUrl?: string;
    tokenUrl?: string;
    clientId?: string;
    clientSecret?: string;
    clientSecretRef?: string;
    scope?: string;
    accessToken?: string;
    accessTokenRef?: string;
    refreshToken?: string;
    refreshTokenRef?: string;
  };
}

export interface ApiTestRequestPayload {
  id?: string;
  collectionId?: string;
  folderId?: string;
  name: string;
  method: string;
  url: string;
  params: ApiTestKeyValuePair[];
  headers: ApiTestKeyValuePair[];
  bodyType: 'none' | 'json' | 'raw' | 'urlencoded' | 'formdata' | 'binary';
  bodyContent?: string;
  auth: ApiTestAuthConfig;
  preRequestScript?: string;
  testScript?: string;
  settings?: {
    timeoutMs?: number;
    followRedirects?: boolean;
    rejectUnauthorized?: boolean;
  };
  sortOrder?: number;
}

export interface ApiTestExecutionPayload {
  executionId: string;
  request: ApiTestRequestPayload;
  environmentId?: string | null;
  unsavedDraft?: boolean;
}

export interface ApiTestVariablePayload {
  id?: string;
  key: string;
  initialValue: string;
  currentValue: string;
  isSecret: boolean;
  hasValue?: boolean;
  description?: string;
  enabled: boolean;
}

export interface ApiTestFolderItem {
  id: string;
  collectionId: string;
  parentFolderId?: string;
  name: string;
  description?: string;
  auth: ApiTestAuthConfig;
  sortOrder: number;
}

export interface ApiTestCollectionItem {
  id: string;
  name: string;
  description?: string;
  auth: ApiTestAuthConfig;
  sortOrder: number;
  folders: ApiTestFolderItem[];
  requests: ApiTestRequestPayload[];
}

export interface ApiTestEnvironmentItem {
  id: string;
  name: string;
  isActive: boolean;
  variables: ApiTestVariablePayload[];
}

export interface ApiTestWorkspaceState {
  collections: ApiTestCollectionItem[];
  environments: ApiTestEnvironmentItem[];
  activeEnvironmentId: string | null;
  history: ApiTestHistoryItem[];
}

export interface ApiTestExecutionResult {
  executionId: string;
  requestId?: string;
  statusCode: number;
  statusText: string;
  durationMs: number;
  timing: {
    dnsMs: number;
    tcpMs: number;
    tlsMs: number;
    ttfbMs: number;
    downloadMs: number;
    totalMs: number;
    socketReused: boolean;
  };
  headers: Record<string, string>;
  cookies: { name: string; value: string; domain?: string; path?: string; httpOnly?: boolean; secure?: boolean }[];
  body: string;
  responseSizeBytes: number;
  testResults: {
    name: string;
    passed: boolean;
    errorMessage?: string;
  }[];
  scriptLogs: { level: 'log' | 'warn' | 'error'; message: string; timestamp: number }[];
  executedAt: number;
  error?: string;
}

export interface ApiTestHistoryItem {
  id: string;
  requestId?: string;
  method: string;
  url: string;
  statusCode: number;
  statusText: string;
  durationMs: number;
  responseSizeBytes: number;
  environmentName?: string;
  collectionId?: string;
  executedAt: number;
}

export interface ApiTestCollectionRunConfig {
  runId: string;
  collectionId: string;
  folderId?: string;
  environmentId?: string | null;
  iterations: number;
  delayMs: number;
  stopOnFailure: boolean;
  dataFileContent?: string;
  dataFileType?: 'csv' | 'json';
}

export interface ApiTestRunProgress {
  runId: string;
  iteration: number;
  totalIterations: number;
  requestIndex: number;
  totalRequests: number;
  currentRequestName: string;
  status: 'running' | 'paused';
}

export interface ApiTestRunSummary {
  runId: string;
  collectionId: string;
  environmentId?: string | null;
  iterationCount: number;
  totalRequests: number;
  passedAssertions: number;
  failedAssertions: number;
  durationMs: number;
  status: 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  completedAt: number;
  results: {
    iteration: number;
    requestId: string;
    requestName: string;
    method: string;
    url: string;
    statusCode: number | null;
    durationMs: number;
    assertions: { name: string; passed: boolean; errorMessage?: string }[];
    errorMessage?: string;
    executedAt: number;
  }[];
}

// ---------------------------------------------------------------------------
// Phase 7: AI Playground & Pulse Insights Data Models
// ---------------------------------------------------------------------------

export interface ContextAttachment {
  name: string;
  path: string;
  size: number;
  content: string;
  language?: string;
  isImage?: boolean;
  mimeType?: string;
}

export interface GenerationSettings {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  seed?: number;
  systemPrompt?: string;
}

export interface AiConversation {
  id: string;
  title: string;
  providerId: string;
  modelId: string;
  systemPrompt?: string;
  generationSettings?: GenerationSettings;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  status: 'streaming' | 'completed' | 'error' | 'stopped';
  inputTokens: number;
  outputTokens: number;
  durationMs?: number;
  errorMessage?: string;
  attachments?: ContextAttachment[];
  createdAt: number;
  updatedAt: number;
}

export interface AiPromptTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  systemPrompt?: string;
  userPrompt: string;
  variables: string[];
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AiPromptVersion {
  id: string;
  templateId: string;
  version: number;
  systemPrompt?: string;
  userPrompt: string;
  createdAt: number;
}

export interface AiGenerationPreset {
  id: string;
  name: string;
  description?: string;
  settings: GenerationSettings;
  isBuiltin: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AiCustomProvider {
  id: string;
  name: string;
  baseUrl: string;
  modelIds: string[];
  hasKey?: boolean;
  headers?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface PromptTemplateInput {
  id?: string;
  name: string;
  description?: string;
  category: string;
  systemPrompt?: string;
  userPrompt: string;
  variables: string[];
  isFavorite?: boolean;
}

export interface GenerationPresetInput {
  id?: string;
  name: string;
  description?: string;
  settings: GenerationSettings;
}

export interface AiPlaygroundData {
  conversations: AiConversation[];
  activeConversation?: AiConversation;
  activeMessages: AiMessage[];
  templates: AiPromptTemplate[];
  presets: AiGenerationPreset[];
  providers: AiProviderInfo[];
  customProviders: AiCustomProvider[];
  usageSummary?: AiOverviewSummary;
}

export interface InsightEvidence {
  label: string;
  value: string | number;
  module: 'system' | 'workspace' | 'git' | 'coding' | 'api' | 'ai';
  timestamp?: number;
  unit?: string;
  threshold?: string | number;
}

export interface PulseInsight {
  id: string;
  category: 'system' | 'workspace' | 'git' | 'coding' | 'api' | 'ai' | 'cross-module';
  title: string;
  description: string;
  severity: 'info' | 'low' | 'medium' | 'high';
  confidence: number;
  evidence: InsightEvidence[];
  recommendation?: string;
  timeRangeStart: number;
  timeRangeEnd: number;
  status: 'new' | 'viewed' | 'dismissed' | 'resolved';
  dedupeHash: string;
  generatedAt: number;
  updatedAt: number;
}

export interface ModuleHealthStatus {
  category: 'system' | 'workspace' | 'git' | 'coding' | 'api' | 'ai';
  status: 'healthy' | 'warning' | 'degraded' | 'unavailable' | 'insufficient_data';
  score: number;
  label: string;
  explanation: string;
  metrics: Record<string, string | number>;
  lastUpdated: number;
}

export interface EnvironmentHealthOverview {
  modules: Record<'system' | 'workspace' | 'git' | 'coding' | 'api' | 'ai', ModuleHealthStatus>;
  overallStatus: 'healthy' | 'attention_required' | 'degraded';
  totalInsightsCount: number;
  unresolvedAlertsCount: number;
  evaluatedAt: number;
}

export interface PulseInsightsData {
  insights: PulseInsight[];
  health: EnvironmentHealthOverview;
  timeRange: 'today' | '7d' | '30d' | '90d';
  lastEvaluatedAt: number;
  moduleSummaries: {
    system?: Record<string, unknown>;
    workspace?: Record<string, unknown>;
    git?: Record<string, unknown>;
    coding?: Record<string, unknown>;
    api?: Record<string, unknown>;
    ai?: Record<string, unknown>;
  };
}
