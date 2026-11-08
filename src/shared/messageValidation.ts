import type { WebviewToExtensionMessage, DevPulseSettings } from './types';

const VALID_MESSAGE_TYPES = new Set([
  'GET_OVERVIEW',
  'GET_SYSTEM_METRICS',
  'GET_EXTENDED_SYSTEM',
  'GET_MONITORING_STATUS',
  'REFRESH_METRICS',
  'PAUSE_MONITORING',
  'RESUME_MONITORING',
  'GET_ALERTS',
  'ACKNOWLEDGE_ALERT',
  'ACKNOWLEDGE_ALL_ALERTS',
  'GET_SETTINGS',
  'UPDATE_SETTINGS',
  'RESET_DATA',
  'EXPORT_LOCAL_DATA',
  'START_WORKSPACE_SCAN',
  'CANCEL_WORKSPACE_SCAN',
  'GET_FILE_INTELLIGENCE',
  'CLEAR_SCAN_HISTORY',
  'GET_EXTENSION_FILES',
  'OPEN_FILE',
  'REVEAL_IN_EXPLORER',
  'STOP_PROCESS',
  'FREE_PORT',
  'GET_AI_INTELLIGENCE',
  'GET_GIT_INTELLIGENCE',
  'TEST_AI_PROVIDER',
  'SET_AI_PROVIDER_KEY',
  'SET_OLLAMA_HOST',
  'UPDATE_AI_BUDGET',
  'UPDATE_AI_PRICING',
  'DELETE_AI_PRICING',
  'CLEAR_AI_DATA',
  'REFRESH_GIT',
  'SELECT_GIT_REPO',
  'GET_PROCESSES',
  'GET_DISKS',
  'GET_PORTS',
  'GET_AI_USAGE',
  'GET_WORKSPACE_STATS',
  'GET_GIT_ACTIVITY',
  'GET_CODING_STATS',
  'GET_API_STATS',
  // Phase 4 Message Types:
  'GET_CODING_INTELLIGENCE',
  'PAUSE_CODING_TRACKING',
  'RESUME_CODING_TRACKING',
  'CLEAR_CODING_DATA',
  'GET_API_INTELLIGENCE',
  'CREATE_API_SERVICE',
  'DELETE_API_SERVICE',
  'TOGGLE_API_SERVICE_MONITORING',
  'REGENERATE_API_SERVICE_TOKEN',
  'GET_API_ENDPOINT_DETAILS',
  'CLEAR_API_DATA',
  // Phase 5 Message Types (API Testing Studio):
  'API_TEST_GET_WORKSPACE_STATE',
  'API_TEST_CREATE_COLLECTION',
  'API_TEST_UPDATE_COLLECTION',
  'API_TEST_DELETE_COLLECTION',
  'API_TEST_CREATE_FOLDER',
  'API_TEST_UPDATE_FOLDER',
  'API_TEST_DELETE_FOLDER',
  'API_TEST_SAVE_REQUEST',
  'API_TEST_DELETE_REQUEST',
  'API_TEST_EXECUTE_REQUEST',
  'API_TEST_CANCEL_REQUEST',
  'API_TEST_SAVE_ENVIRONMENT',
  'API_TEST_DELETE_ENVIRONMENT',
  'API_TEST_SET_ACTIVE_ENVIRONMENT',
  'API_TEST_REVEAL_SECRET',
  'API_TEST_GET_HISTORY',
  'API_TEST_CLEAR_HISTORY',
  'API_TEST_RUN_COLLECTION',
  'API_TEST_CANCEL_RUN',
  'API_TEST_IMPORT_DATA',
  'API_TEST_EXPORT_DATA',
  'API_TEST_REORDER_ITEMS',
  // Phase 7 Message Types (AI Playground & Pulse Insights):
  'AI_PLAYGROUND_GET_DATA',
  'AI_CREATE_CONVERSATION',
  'AI_SELECT_CONVERSATION',
  'AI_DELETE_CONVERSATION',
  'AI_RENAME_CONVERSATION',
  'AI_UPDATE_CONVERSATION_SETTINGS',
  'AI_SEND_CHAT_MESSAGE',
  'AI_ABORT_STREAM',
  'AI_REGENERATE_MESSAGE',
  'AI_CONTINUE_MESSAGE',
  'AI_SAVE_TEMPLATE',
  'AI_DELETE_TEMPLATE',
  'AI_SAVE_PRESET',
  'AI_DELETE_PRESET',
  'AI_ADD_CUSTOM_PROVIDER',
  'AI_DELETE_CUSTOM_PROVIDER',
  'AI_DISCOVER_MODELS',
  'AI_GET_WORKSPACE_FILES',
  'READ_WORKSPACE_FILE',
  'PULSE_GET_INSIGHTS',
  'PULSE_UPDATE_INSIGHT_STATUS',
  'PULSE_RUN_ANALYSIS',
  'PULSE_EXPLAIN_INSIGHT'
]);

export function isValidMessage(msg: unknown): msg is WebviewToExtensionMessage {
  if (!msg || typeof msg !== 'object') {
    return false;
  }
  const candidate = msg as { type?: unknown; payload?: unknown };
  if (typeof candidate.type !== 'string' || !VALID_MESSAGE_TYPES.has(candidate.type)) {
    return false;
  }

  if (candidate.type === 'ACKNOWLEDGE_ALERT') {
    if (!candidate.payload || typeof candidate.payload !== 'object') {
      return false;
    }
    const payload = candidate.payload as { id?: unknown };
    return typeof payload.id === 'string' && payload.id.trim().length > 0;
  }

  if (candidate.type === 'UPDATE_SETTINGS') {
    if (!candidate.payload || typeof candidate.payload !== 'object') {
      return false;
    }
    const settings = candidate.payload as Record<string, unknown>;
    for (const [key, value] of Object.entries(settings)) {
      if (!isKnownSettingKey(key as keyof DevPulseSettings, value)) {
        return false;
      }
    }
  }

  if (candidate.type === 'GET_SYSTEM_METRICS' && candidate.payload !== undefined) {
    if (typeof candidate.payload !== 'object' || candidate.payload === null) {
      return false;
    }
    const payload = candidate.payload as { limit?: unknown };
    if (payload.limit !== undefined && (typeof payload.limit !== 'number' || payload.limit <= 0)) {
      return false;
    }
  }

  if (candidate.type === 'GET_EXTENSION_FILES') {
    if (!candidate.payload || typeof candidate.payload !== 'object') {
      return false;
    }
    const payload = candidate.payload as { extension?: unknown };
    return typeof payload.extension === 'string' && payload.extension.trim().length > 0;
  }

  if (candidate.type === 'OPEN_FILE' || candidate.type === 'REVEAL_IN_EXPLORER') {
    if (!candidate.payload || typeof candidate.payload !== 'object') {
      return false;
    }
    const payload = candidate.payload as { relativePath?: unknown };
    return typeof payload.relativePath === 'string' && payload.relativePath.trim().length > 0;
  }

  if (candidate.type === 'STOP_PROCESS') {
    if (!candidate.payload || typeof candidate.payload !== 'object') {
      return false;
    }
    const payload = candidate.payload as { pid?: unknown; processName?: unknown };
    return (
      typeof payload.pid === 'number' &&
      Number.isInteger(payload.pid) &&
      payload.pid > 0 &&
      typeof payload.processName === 'string' &&
      payload.processName.trim().length > 0
    );
  }

  if (candidate.type === 'FREE_PORT') {
    if (!candidate.payload || typeof candidate.payload !== 'object') {
      return false;
    }
    const payload = candidate.payload as { port?: unknown };
    return typeof payload.port === 'number' && Number.isInteger(payload.port) && payload.port >= 1 && payload.port <= 65535;
  }

  // Phase 4: Coding & API payload validations
  if (candidate.type === 'CREATE_API_SERVICE') {
    if (!candidate.payload || typeof candidate.payload !== 'object') {
      return false;
    }
    const payload = candidate.payload as { name?: unknown };
    return typeof payload.name === 'string' && payload.name.trim().length > 0;
  }

  if (candidate.type === 'DELETE_API_SERVICE' || candidate.type === 'REGENERATE_API_SERVICE_TOKEN') {
    if (!candidate.payload || typeof candidate.payload !== 'object') {
      return false;
    }
    const payload = candidate.payload as { serviceId?: unknown };
    return typeof payload.serviceId === 'string' && payload.serviceId.trim().length > 0;
  }

  if (candidate.type === 'TOGGLE_API_SERVICE_MONITORING') {
    if (!candidate.payload || typeof candidate.payload !== 'object') {
      return false;
    }
    const payload = candidate.payload as { serviceId?: unknown; enabled?: unknown };
    return typeof payload.serviceId === 'string' && payload.serviceId.trim().length > 0 && typeof payload.enabled === 'boolean';
  }

  if (candidate.type === 'GET_API_ENDPOINT_DETAILS') {
    if (!candidate.payload || typeof candidate.payload !== 'object') {
      return false;
    }
    const payload = candidate.payload as { endpointId?: unknown };
    return typeof payload.endpointId === 'string' && payload.endpointId.trim().length > 0;
  }

  return true;
}

function isKnownSettingKey(key: keyof DevPulseSettings, value: unknown): boolean {
  switch (key) {
    case 'monitoringEnabled':
    case 'enableCpuMonitoring':
    case 'enableMemoryMonitoring':
    case 'statusBarShowCpu':
    case 'statusBarShowMemory':
    case 'statusBarShowState':
    case 'aiMonitoringEnabled':
    case 'filesystemMonitoringEnabled':
    case 'gitMonitoringEnabled':
    case 'codingMonitoringEnabled':
    case 'apiMonitoringEnabled':
    case 'fsEnableScanning':
    case 'fsEnableDuplicates':
    case 'enableDiskMonitoring':
    case 'enableProcessMonitoring':
    case 'enablePortMonitoring':
    case 'aiEnableLocalAgentDetection':
    case 'gitTrackRemoteBranches':
    case 'codingTrackingEnabled':
    case 'codingPauseOnWindowBlur':
    case 'codingTrackFileSaves':
    case 'codingPrivacyMode':
    case 'apiTestingLogToApiIntelligence':
      return typeof value === 'boolean';

    case 'aiOllamaHost':
    case 'apiIngestionHost':
      return typeof value === 'string' && value.trim().length > 0;

    case 'sampleIntervalSeconds':
      return typeof value === 'number' && Number.isFinite(value) && value >= 2 && value <= 300;

    case 'processSampleIntervalSeconds':
    case 'diskSampleIntervalSeconds':
    case 'alertCpuThreshold':
    case 'alertMemoryThreshold':
    case 'alertDiskThreshold':
    case 'alertCooldownSeconds':
    case 'fsMaxHashSizeMb':
    case 'fsScanConcurrency':
    case 'aiSyncIntervalSeconds':
    case 'aiDailyBudgetLimit':
    case 'aiMonthlyBudgetLimit':
    case 'gitPollIntervalSeconds':
    case 'gitMaxCommits':
    case 'codingIdleThresholdSeconds':
    case 'codingRetentionDays':
    case 'apiIngestionPort':
    case 'apiMaxQueueSize':
    case 'apiRawEventRetentionDays':
    case 'apiAlertLatencyP95ThresholdMs':
    case 'apiAlertErrorRateThresholdPercent':
    case 'apiTestingMaxResponseBodySizeMb':
    case 'apiTestingFollowRedirectsLimit':
    case 'apiTestingScriptTimeoutMs':
    case 'apiTestingDefaultTimeoutMs':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0;

    case 'fsExcludedDirectories':
    case 'fsExcludedPatterns':
    case 'codingWorkspaceExclusions':
    case 'apiExcludedRoutes':
      return Array.isArray(value) && value.every(item => typeof item === 'string');

    case 'theme':
      return value === 'dark' || value === 'light';

    default:
      return false;
  }
}
