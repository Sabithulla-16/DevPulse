import type { DevPulseSettings } from './types';

export const DEFAULT_SETTINGS: DevPulseSettings = {
  monitoringEnabled: true,
  sampleIntervalSeconds: 5,
  enableCpuMonitoring: true,
  enableMemoryMonitoring: true,
  theme: 'dark',
  statusBarShowCpu: true,
  statusBarShowMemory: true,
  statusBarShowState: true,
  aiMonitoringEnabled: false,
  filesystemMonitoringEnabled: true,
  gitMonitoringEnabled: false,
  codingMonitoringEnabled: false,
  apiMonitoringEnabled: false,

  // Phase 2 Settings
  fsEnableScanning: true,
  fsExcludedDirectories: ['node_modules', '.git', '.vscode', '.gemini', '.agents', 'dist', 'build', 'out'],
  fsExcludedPatterns: ['*.log', '*.lock', 'package-lock.json'],
  fsEnableDuplicates: true,
  fsMaxHashSizeMb: 50,
  fsScanConcurrency: 8,

  enableDiskMonitoring: true,
  enableProcessMonitoring: true,
  enablePortMonitoring: true,
  processSampleIntervalSeconds: 15,
  diskSampleIntervalSeconds: 30,

  alertCpuThreshold: 90,
  alertMemoryThreshold: 90,
  alertDiskThreshold: 90,
  alertCooldownSeconds: 60,

  // Phase 3 Settings
  aiOllamaHost: 'http://localhost:11434',
  aiSyncIntervalSeconds: 60,
  aiDailyBudgetLimit: 10,
  aiMonthlyBudgetLimit: 100,
  aiEnableLocalAgentDetection: true,

  gitPollIntervalSeconds: 15,
  gitMaxCommits: 200,
  gitTrackRemoteBranches: true,

  // Phase 4 Settings: Coding Intelligence
  codingTrackingEnabled: true,
  codingIdleThresholdSeconds: 300,
  codingPauseOnWindowBlur: true,
  codingTrackFileSaves: true,
  codingWorkspaceExclusions: [],
  codingPrivacyMode: false,
  codingRetentionDays: 30,

  // Phase 4 Settings: API Intelligence
  apiIngestionHost: '127.0.0.1',
  apiIngestionPort: 49152,
  apiMaxQueueSize: 1000,
  apiRawEventRetentionDays: 7,
  apiExcludedRoutes: ['/health', '/favicon.ico'],
  apiAlertLatencyP95ThresholdMs: 1000,
  apiAlertErrorRateThresholdPercent: 5.0,

  // Phase 5 Settings: API Testing Studio
  apiTestingLogToApiIntelligence: false,
  apiTestingMaxResponseBodySizeMb: 20,
  apiTestingFollowRedirectsLimit: 10,
  apiTestingScriptTimeoutMs: 1500,
  apiTestingDefaultTimeoutMs: 30000
};
