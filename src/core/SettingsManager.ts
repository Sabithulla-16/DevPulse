import * as vscode from 'vscode';
import type { DevPulseSettings } from '../shared/types';
import type { Database } from '../database/Database';
import { DEFAULT_SETTINGS } from '../shared/defaultSettings';

export { DEFAULT_SETTINGS };


export class SettingsManager {
  constructor(private readonly database: Database) {}

  getSettings(): DevPulseSettings {
    const config = vscode.workspace.getConfiguration('devpulse');
    const storedTheme = this.database.isInitialized()
      ? this.database.settings.get<'dark' | 'light'>('dashboard.theme', 'dark')
      : config.get<'dark' | 'light'>('dashboard.theme', 'dark');

    return {
      monitoringEnabled: config.get<boolean>('monitoring.enabled', DEFAULT_SETTINGS.monitoringEnabled),
      sampleIntervalSeconds: config.get<number>('system.sampleIntervalSeconds', DEFAULT_SETTINGS.sampleIntervalSeconds),
      enableCpuMonitoring: config.get<boolean>('system.enableCpuMonitoring', DEFAULT_SETTINGS.enableCpuMonitoring),
      enableMemoryMonitoring: config.get<boolean>('system.enableMemoryMonitoring', DEFAULT_SETTINGS.enableMemoryMonitoring),
      theme: storedTheme ?? 'dark',
      statusBarShowCpu: config.get<boolean>('statusbar.showCpu', DEFAULT_SETTINGS.statusBarShowCpu),
      statusBarShowMemory: config.get<boolean>('statusbar.showMemory', DEFAULT_SETTINGS.statusBarShowMemory),
      statusBarShowState: config.get<boolean>('statusbar.showState', DEFAULT_SETTINGS.statusBarShowState),
      aiMonitoringEnabled: config.get<boolean>('modules.ai.enabled', DEFAULT_SETTINGS.aiMonitoringEnabled),
      filesystemMonitoringEnabled: config.get<boolean>('modules.filesystem.enabled', DEFAULT_SETTINGS.filesystemMonitoringEnabled),
      gitMonitoringEnabled: config.get<boolean>('modules.git.enabled', DEFAULT_SETTINGS.gitMonitoringEnabled),
      codingMonitoringEnabled: config.get<boolean>('modules.coding.enabled', DEFAULT_SETTINGS.codingMonitoringEnabled),
      apiMonitoringEnabled: config.get<boolean>('modules.api.enabled', DEFAULT_SETTINGS.apiMonitoringEnabled),

      fsEnableScanning: config.get<boolean>('filesystem.enableScanning', DEFAULT_SETTINGS.fsEnableScanning),
      fsExcludedDirectories: config.get<string[]>('filesystem.excludedDirectories', DEFAULT_SETTINGS.fsExcludedDirectories),
      fsExcludedPatterns: config.get<string[]>('filesystem.excludedPatterns', DEFAULT_SETTINGS.fsExcludedPatterns),
      fsEnableDuplicates: config.get<boolean>('filesystem.enableDuplicates', DEFAULT_SETTINGS.fsEnableDuplicates),
      fsMaxHashSizeMb: config.get<number>('filesystem.maxHashSizeMb', DEFAULT_SETTINGS.fsMaxHashSizeMb),
      fsScanConcurrency: config.get<number>('filesystem.scanConcurrency', DEFAULT_SETTINGS.fsScanConcurrency),

      enableDiskMonitoring: config.get<boolean>('system.enableDiskMonitoring', DEFAULT_SETTINGS.enableDiskMonitoring),
      enableProcessMonitoring: config.get<boolean>('system.enableProcessMonitoring', DEFAULT_SETTINGS.enableProcessMonitoring),
      enablePortMonitoring: config.get<boolean>('system.enablePortMonitoring', DEFAULT_SETTINGS.enablePortMonitoring),
      processSampleIntervalSeconds: config.get<number>('system.processSampleIntervalSeconds', DEFAULT_SETTINGS.processSampleIntervalSeconds),
      diskSampleIntervalSeconds: config.get<number>('system.diskSampleIntervalSeconds', DEFAULT_SETTINGS.diskSampleIntervalSeconds),

      alertCpuThreshold: config.get<number>('alerts.cpuThreshold', DEFAULT_SETTINGS.alertCpuThreshold),
      alertMemoryThreshold: config.get<number>('alerts.memoryThreshold', DEFAULT_SETTINGS.alertMemoryThreshold),
      alertDiskThreshold: config.get<number>('alerts.diskThreshold', DEFAULT_SETTINGS.alertDiskThreshold),
      alertCooldownSeconds: config.get<number>('alerts.cooldownSeconds', DEFAULT_SETTINGS.alertCooldownSeconds),

      aiOllamaHost: (this.database.isInitialized() ? this.database.settings.get<string>('ai.ollamaHost', '') : '')
        || config.get<string>('ai.ollamaHost', DEFAULT_SETTINGS.aiOllamaHost),
      aiSyncIntervalSeconds: config.get<number>('ai.syncIntervalSeconds', DEFAULT_SETTINGS.aiSyncIntervalSeconds),
      aiDailyBudgetLimit: (this.database.isInitialized() ? Number(this.database.settings.get<string>('ai.dailyBudgetLimit', '')) : 0)
        || config.get<number>('ai.dailyBudgetLimit', DEFAULT_SETTINGS.aiDailyBudgetLimit),
      aiMonthlyBudgetLimit: (this.database.isInitialized() ? Number(this.database.settings.get<string>('ai.monthlyBudgetLimit', '')) : 0)
        || config.get<number>('ai.monthlyBudgetLimit', DEFAULT_SETTINGS.aiMonthlyBudgetLimit),
      aiEnableLocalAgentDetection: config.get<boolean>('ai.enableLocalAgentDetection', DEFAULT_SETTINGS.aiEnableLocalAgentDetection),

      gitPollIntervalSeconds: config.get<number>('git.pollIntervalSeconds', DEFAULT_SETTINGS.gitPollIntervalSeconds),
      gitMaxCommits: config.get<number>('git.maxCommits', DEFAULT_SETTINGS.gitMaxCommits),
      gitTrackRemoteBranches: config.get<boolean>('git.trackRemoteBranches', DEFAULT_SETTINGS.gitTrackRemoteBranches),

      // Phase 4
      codingTrackingEnabled: config.get<boolean>('coding.enabled', DEFAULT_SETTINGS.codingTrackingEnabled),
      codingIdleThresholdSeconds: config.get<number>('coding.idleThresholdSeconds', DEFAULT_SETTINGS.codingIdleThresholdSeconds),
      codingPauseOnWindowBlur: config.get<boolean>('coding.pauseOnWindowBlur', DEFAULT_SETTINGS.codingPauseOnWindowBlur),
      codingTrackFileSaves: config.get<boolean>('coding.trackFileSaves', DEFAULT_SETTINGS.codingTrackFileSaves),
      codingWorkspaceExclusions: config.get<string[]>('coding.workspaceExclusions', DEFAULT_SETTINGS.codingWorkspaceExclusions),
      codingPrivacyMode: config.get<boolean>('coding.privacyMode', DEFAULT_SETTINGS.codingPrivacyMode),
      codingRetentionDays: config.get<number>('coding.retentionDays', DEFAULT_SETTINGS.codingRetentionDays),

      apiIngestionHost: config.get<string>('api.ingestionHost', DEFAULT_SETTINGS.apiIngestionHost),
      apiIngestionPort: config.get<number>('api.ingestionPort', DEFAULT_SETTINGS.apiIngestionPort),
      apiMaxQueueSize: config.get<number>('api.maxQueueSize', DEFAULT_SETTINGS.apiMaxQueueSize),
      apiRawEventRetentionDays: config.get<number>('api.rawEventRetentionDays', DEFAULT_SETTINGS.apiRawEventRetentionDays),
      apiExcludedRoutes: config.get<string[]>('api.excludedRoutes', DEFAULT_SETTINGS.apiExcludedRoutes),
      apiAlertLatencyP95ThresholdMs: config.get<number>('api.alertLatencyP95ThresholdMs', DEFAULT_SETTINGS.apiAlertLatencyP95ThresholdMs),
      apiAlertErrorRateThresholdPercent: config.get<number>('api.alertErrorRateThresholdPercent', DEFAULT_SETTINGS.apiAlertErrorRateThresholdPercent),

      // Phase 5: API Testing Studio Settings
      apiTestingLogToApiIntelligence: config.get<boolean>('apiTesting.logToApiIntelligence', DEFAULT_SETTINGS.apiTestingLogToApiIntelligence),
      apiTestingMaxResponseBodySizeMb: config.get<number>('apiTesting.maxResponseBodySizeMb', DEFAULT_SETTINGS.apiTestingMaxResponseBodySizeMb),
      apiTestingFollowRedirectsLimit: config.get<number>('apiTesting.followRedirectsLimit', DEFAULT_SETTINGS.apiTestingFollowRedirectsLimit),
      apiTestingScriptTimeoutMs: config.get<number>('apiTesting.scriptTimeoutMs', DEFAULT_SETTINGS.apiTestingScriptTimeoutMs),
      apiTestingDefaultTimeoutMs: config.get<number>('apiTesting.defaultTimeoutMs', DEFAULT_SETTINGS.apiTestingDefaultTimeoutMs)
    };
  }

  async updateSettings(partial: Partial<DevPulseSettings>): Promise<DevPulseSettings> {
    const config = vscode.workspace.getConfiguration('devpulse');

    if (partial.monitoringEnabled !== undefined) {
      await config.update('monitoring.enabled', partial.monitoringEnabled, vscode.ConfigurationTarget.Global);
    }
    if (partial.sampleIntervalSeconds !== undefined) {
      await config.update('system.sampleIntervalSeconds', partial.sampleIntervalSeconds, vscode.ConfigurationTarget.Global);
    }
    if (partial.enableCpuMonitoring !== undefined) {
      await config.update('system.enableCpuMonitoring', partial.enableCpuMonitoring, vscode.ConfigurationTarget.Global);
    }
    if (partial.enableMemoryMonitoring !== undefined) {
      await config.update('system.enableMemoryMonitoring', partial.enableMemoryMonitoring, vscode.ConfigurationTarget.Global);
    }
    if (partial.statusBarShowCpu !== undefined) {
      await config.update('statusbar.showCpu', partial.statusBarShowCpu, vscode.ConfigurationTarget.Global);
    }
    if (partial.statusBarShowMemory !== undefined) {
      await config.update('statusbar.showMemory', partial.statusBarShowMemory, vscode.ConfigurationTarget.Global);
    }
    if (partial.statusBarShowState !== undefined) {
      await config.update('statusbar.showState', partial.statusBarShowState, vscode.ConfigurationTarget.Global);
    }
    if (partial.fsEnableScanning !== undefined) {
      await config.update('filesystem.enableScanning', partial.fsEnableScanning, vscode.ConfigurationTarget.Global);
    }
    if (partial.fsEnableDuplicates !== undefined) {
      await config.update('filesystem.enableDuplicates', partial.fsEnableDuplicates, vscode.ConfigurationTarget.Global);
    }
    if (partial.enableDiskMonitoring !== undefined) {
      await config.update('system.enableDiskMonitoring', partial.enableDiskMonitoring, vscode.ConfigurationTarget.Global);
    }
    if (partial.enableProcessMonitoring !== undefined) {
      await config.update('system.enableProcessMonitoring', partial.enableProcessMonitoring, vscode.ConfigurationTarget.Global);
    }
    if (partial.enablePortMonitoring !== undefined) {
      await config.update('system.enablePortMonitoring', partial.enablePortMonitoring, vscode.ConfigurationTarget.Global);
    }
    if (partial.theme !== undefined) {
      await config.update('dashboard.theme', partial.theme, vscode.ConfigurationTarget.Global);
      if (this.database.isInitialized()) {
        this.database.settings.set('dashboard.theme', partial.theme);
        this.database.schedulePersist();
      }
    }
    if (partial.aiOllamaHost !== undefined) {
      await config.update('ai.ollamaHost', partial.aiOllamaHost, vscode.ConfigurationTarget.Global);
      if (this.database.isInitialized()) {
        this.database.settings.set('ai.ollamaHost', partial.aiOllamaHost);
        this.database.schedulePersist();
      }
    }
    if (partial.aiDailyBudgetLimit !== undefined) {
      await config.update('ai.dailyBudgetLimit', partial.aiDailyBudgetLimit, vscode.ConfigurationTarget.Global);
      if (this.database.isInitialized()) {
        this.database.settings.set('ai.dailyBudgetLimit', String(partial.aiDailyBudgetLimit));
        this.database.schedulePersist();
      }
    }
    if (partial.aiMonthlyBudgetLimit !== undefined) {
      await config.update('ai.monthlyBudgetLimit', partial.aiMonthlyBudgetLimit, vscode.ConfigurationTarget.Global);
      if (this.database.isInitialized()) {
        this.database.settings.set('ai.monthlyBudgetLimit', String(partial.aiMonthlyBudgetLimit));
        this.database.schedulePersist();
      }
    }

    return this.getSettings();
  }
}
