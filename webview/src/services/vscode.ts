import type { DevPulseSettings, ExtensionMessage } from '../types';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let vscodeInstance: VsCodeApi | undefined;

function getVsCode(): VsCodeApi {
  if (!vscodeInstance) {
    try {
      vscodeInstance = acquireVsCodeApi();
    } catch {
      // Running outside VS Code (e.g. dev browser)
      vscodeInstance = {
        postMessage: (msg: unknown) => {
          console.log('[DevPulse Mock VsCode] postMessage:', msg);
        },
        getState: () => ({}),
        setState: () => {}
      };
    }
  }
  return vscodeInstance;
}

export function requestOverview(): void {
  getVsCode().postMessage({ type: 'GET_OVERVIEW' });
}

export function requestSystemMetrics(limit = 60): void {
  getVsCode().postMessage({ type: 'GET_SYSTEM_METRICS', payload: { limit } });
}

export function requestExtendedSystem(): void {
  getVsCode().postMessage({ type: 'GET_EXTENDED_SYSTEM' });
}

export function requestFileIntelligence(): void {
  getVsCode().postMessage({ type: 'GET_FILE_INTELLIGENCE' });
}

export function startWorkspaceScan(): void {
  getVsCode().postMessage({ type: 'START_WORKSPACE_SCAN' });
}

export function cancelWorkspaceScan(): void {
  getVsCode().postMessage({ type: 'CANCEL_WORKSPACE_SCAN' });
}

export function clearScanHistory(): void {
  getVsCode().postMessage({ type: 'CLEAR_SCAN_HISTORY' });
}

export function requestExtensionFiles(query: {
  extension: string;
  search?: string;
  sortBy?: 'name' | 'path' | 'size' | 'modified';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}): void {
  getVsCode().postMessage({ type: 'GET_EXTENSION_FILES', payload: query });
}

export function openFile(relativePath: string): void {
  getVsCode().postMessage({ type: 'OPEN_FILE', payload: { relativePath } });
}

export function revealInExplorer(relativePath: string): void {
  getVsCode().postMessage({ type: 'REVEAL_IN_EXPLORER', payload: { relativePath } });
}

export function stopProcess(pid: number, processName: string, force = false): void {
  getVsCode().postMessage({ type: 'STOP_PROCESS', payload: { pid, processName, force } });
}

export function freePort(port: number, protocol: 'TCP' | 'UDP' = 'TCP', pid?: number, processName?: string, force = false): void {
  getVsCode().postMessage({ type: 'FREE_PORT', payload: { port, protocol, pid, processName, force } });
}

export function requestProcesses(): void {
  getVsCode().postMessage({ type: 'GET_PROCESSES' });
}

export function requestDisks(): void {
  getVsCode().postMessage({ type: 'GET_DISKS' });
}

export function requestPorts(): void {
  getVsCode().postMessage({ type: 'GET_PORTS' });
}

export function requestAlerts(): void {
  getVsCode().postMessage({ type: 'GET_ALERTS' });
}

export function acknowledgeAlert(id: string): void {
  getVsCode().postMessage({ type: 'ACKNOWLEDGE_ALERT', payload: { id } });
}

export function acknowledgeAllAlerts(): void {
  getVsCode().postMessage({ type: 'ACKNOWLEDGE_ALL_ALERTS' });
}

export function requestSettings(): void {
  getVsCode().postMessage({ type: 'GET_SETTINGS' });
}

export function updateSettings(partial: Partial<DevPulseSettings>): void {
  getVsCode().postMessage({ type: 'UPDATE_SETTINGS', payload: partial });
}

export function refreshMetrics(): void {
  getVsCode().postMessage({ type: 'REFRESH_METRICS' });
}

export function pauseMonitoring(): void {
  getVsCode().postMessage({ type: 'PAUSE_MONITORING' });
}

export function resumeMonitoring(): void {
  getVsCode().postMessage({ type: 'RESUME_MONITORING' });
}

export function toggleMonitoring(currentlyRunning: boolean): void {
  if (currentlyRunning) {
    pauseMonitoring();
  } else {
    resumeMonitoring();
  }
}

export function resetData(): void {
  getVsCode().postMessage({ type: 'RESET_DATA' });
}

export function exportLocalData(): void {
  getVsCode().postMessage({ type: 'EXPORT_LOCAL_DATA' });
}

export function requestAiData(timeFilter?: 'today' | '7d' | '30d' | '90d' | 'all'): void {
  getVsCode().postMessage({ type: 'GET_AI_INTELLIGENCE', payload: { timeFilter } });
}

export function testAiProvider(providerId: string): void {
  getVsCode().postMessage({ type: 'TEST_AI_PROVIDER', payload: { providerId } });
}

export function setAiProviderKey(providerId: string, apiKey?: string, endpoint?: string, customModel?: string): void {
  getVsCode().postMessage({ type: 'SET_AI_PROVIDER_KEY', payload: { providerId, apiKey, endpoint, customModel } });
}

export function setOllamaHost(host?: string): void {
  getVsCode().postMessage({ type: 'SET_OLLAMA_HOST', payload: host ? { host } : undefined });
}

export function updateAiBudget(budget: { periodType?: 'daily' | 'monthly'; limitAmount?: number; thresholdPercent?: number; id?: string }): void {
  getVsCode().postMessage({ type: 'UPDATE_AI_BUDGET', payload: budget });
}

export function updateAiPricing(pricing: { provider: string; modelPattern: string; inputCostPerMillion?: number; outputCostPerMillion?: number; id?: string }): void {
  getVsCode().postMessage({ type: 'UPDATE_AI_PRICING', payload: pricing });
}

export function deleteAiPricing(id: string): void {
  getVsCode().postMessage({ type: 'DELETE_AI_PRICING', payload: { id } });
}

export function clearAiData(): void {
  getVsCode().postMessage({ type: 'CLEAR_AI_DATA' });
}

export function requestGitData(repoId?: string): void {
  getVsCode().postMessage({ type: 'GET_GIT_INTELLIGENCE', payload: { repoId } });
}

export function selectGitRepo(repoId: string): void {
  getVsCode().postMessage({ type: 'SELECT_GIT_REPO', payload: { repoId } });
}

export function refreshGit(repoId?: string, limit?: number): void {
  getVsCode().postMessage({ type: 'REFRESH_GIT', payload: { repoId, limit } });
}

// ---------------------------------------------------------------------------
// Phase 4: Coding Intelligence IPC Actions
// ---------------------------------------------------------------------------

export function requestCodingData(timeFilter?: 'today' | '7d' | '30d' | 'all', workspaceId?: string): void {
  getVsCode().postMessage({ type: 'GET_CODING_INTELLIGENCE', payload: { timeFilter, workspaceId } });
}

export function pauseCodingTracking(): void {
  getVsCode().postMessage({ type: 'PAUSE_CODING_TRACKING' });
}

export function resumeCodingTracking(): void {
  getVsCode().postMessage({ type: 'RESUME_CODING_TRACKING' });
}

export function clearCodingData(): void {
  getVsCode().postMessage({ type: 'CLEAR_CODING_DATA' });
}

// ---------------------------------------------------------------------------
// Phase 4: API Intelligence IPC Actions
// ---------------------------------------------------------------------------

export function requestApiData(options?: {
  serviceId?: string;
  environment?: string;
  timeFilter?: '1h' | '24h' | '7d' | '30d';
}): void {
  getVsCode().postMessage({ type: 'GET_API_INTELLIGENCE', payload: options });
}

export function createApiService(name: string, environment?: string, integrationType?: string): void {
  getVsCode().postMessage({ type: 'CREATE_API_SERVICE', payload: { name, environment, integrationType } });
}

export function deleteApiService(serviceId: string): void {
  getVsCode().postMessage({ type: 'DELETE_API_SERVICE', payload: { serviceId } });
}

export function toggleApiServiceMonitoring(serviceId: string, enabled: boolean): void {
  getVsCode().postMessage({ type: 'TOGGLE_API_SERVICE_MONITORING', payload: { serviceId, enabled } });
}

export function regenerateApiServiceToken(serviceId: string): void {
  getVsCode().postMessage({ type: 'REGENERATE_API_SERVICE_TOKEN', payload: { serviceId } });
}

export function requestApiEndpointDetails(endpointId: string, limit = 50): void {
  getVsCode().postMessage({ type: 'GET_API_ENDPOINT_DETAILS', payload: { endpointId, limit } });
}

export function clearApiData(serviceId?: string): void {
  getVsCode().postMessage({ type: 'CLEAR_API_DATA', payload: serviceId ? { serviceId } : undefined });
}

// ---------------------------------------------------------------------------
// Phase 5: API Testing Studio IPC Actions
// ---------------------------------------------------------------------------

export function requestApiTestWorkspaceState(): void {
  getVsCode().postMessage({ type: 'API_TEST_GET_WORKSPACE_STATE' });
}

export function createApiTestCollection(name: string, description?: string): void {
  getVsCode().postMessage({ type: 'API_TEST_CREATE_COLLECTION', payload: { name, description } });
}

export function updateApiTestCollection(id: string, updates: { name?: string; description?: string; authConfig?: any }): void {
  getVsCode().postMessage({ type: 'API_TEST_UPDATE_COLLECTION', payload: { id, ...updates } });
}

export function deleteApiTestCollection(id: string): void {
  getVsCode().postMessage({ type: 'API_TEST_DELETE_COLLECTION', payload: { id } });
}

export function createApiTestFolder(collectionId: string, name: string, parentFolderId?: string): void {
  getVsCode().postMessage({ type: 'API_TEST_CREATE_FOLDER', payload: { collectionId, name, parentFolderId } });
}

export function updateApiTestFolder(id: string, updates: { name?: string; parentFolderId?: string }): void {
  getVsCode().postMessage({ type: 'API_TEST_UPDATE_FOLDER', payload: { id, ...updates } });
}

export function deleteApiTestFolder(id: string): void {
  getVsCode().postMessage({ type: 'API_TEST_DELETE_FOLDER', payload: { id } });
}

export function saveApiTestRequest(payload: any): void {
  getVsCode().postMessage({ type: 'API_TEST_SAVE_REQUEST', payload });
}

export function deleteApiTestRequest(id: string): void {
  getVsCode().postMessage({ type: 'API_TEST_DELETE_REQUEST', payload: { id } });
}

export function executeApiTestRequest(payload: any): void {
  getVsCode().postMessage({ type: 'API_TEST_EXECUTE_REQUEST', payload });
}

export function cancelApiTestRequest(executionId: string): void {
  getVsCode().postMessage({ type: 'API_TEST_CANCEL_REQUEST', payload: { executionId } });
}

export function saveApiTestEnvironment(payload: { id?: string; name: string; variables: any[] }): void {
  getVsCode().postMessage({ type: 'API_TEST_SAVE_ENVIRONMENT', payload });
}

export function deleteApiTestEnvironment(id: string): void {
  getVsCode().postMessage({ type: 'API_TEST_DELETE_ENVIRONMENT', payload: { id } });
}

export function setActiveApiTestEnvironment(id: string | null): void {
  getVsCode().postMessage({ type: 'API_TEST_SET_ACTIVE_ENVIRONMENT', payload: { id } });
}

export function revealApiTestSecret(variableId: string): void {
  getVsCode().postMessage({ type: 'API_TEST_REVEAL_SECRET', payload: { variableId } });
}

export function requestApiTestHistory(limit = 100, search?: string): void {
  getVsCode().postMessage({ type: 'API_TEST_GET_HISTORY', payload: { limit, search } });
}

export function clearApiTestHistory(): void {
  getVsCode().postMessage({ type: 'API_TEST_CLEAR_HISTORY' });
}

export function runApiTestCollection(payload: any): void {
  getVsCode().postMessage({ type: 'API_TEST_RUN_COLLECTION', payload });
}

export function cancelApiTestRun(runId: string): void {
  getVsCode().postMessage({ type: 'API_TEST_CANCEL_RUN', payload: { runId } });
}

export function importApiTestData(format: 'postman' | 'openapi' | 'curl', content: string): void {
  getVsCode().postMessage({ type: 'API_TEST_IMPORT_DATA', payload: { format, content } });
}

export function exportApiTestData(format: 'postman', collectionId: string): void {
  getVsCode().postMessage({ type: 'API_TEST_EXPORT_DATA', payload: { format, collectionId } });
}

export function reorderApiTestItems(itemType: 'collection' | 'folder' | 'request', items: { id: string; sortOrder: number }[]): void {
  getVsCode().postMessage({ type: 'API_TEST_REORDER_ITEMS', payload: { itemType, items } });
}

// ---------------------------------------------------------------------------
// Phase 7: AI Playground & Pulse Insights
// ---------------------------------------------------------------------------

export function requestPlaygroundData(conversationId?: string): void {
  getVsCode().postMessage({ type: 'AI_PLAYGROUND_GET_DATA', payload: { conversationId } });
}

export function createConversation(
  providerId: string,
  modelId: string,
  title?: string,
  systemPrompt?: string,
  settings?: Record<string, unknown> | any
): void {
  getVsCode().postMessage({
    type: 'AI_CREATE_CONVERSATION',
    payload: { providerId, modelId, title, systemPrompt, settings }
  });
}

export function selectConversation(conversationId: string): void {
  getVsCode().postMessage({ type: 'AI_SELECT_CONVERSATION', payload: { conversationId } });
}

export function deleteConversation(conversationId: string): void {
  getVsCode().postMessage({ type: 'AI_DELETE_CONVERSATION', payload: { conversationId } });
}

export function renameConversation(conversationId: string, title: string): void {
  getVsCode().postMessage({ type: 'AI_RENAME_CONVERSATION', payload: { conversationId, title } });
}

export function updateConversationSettings(
  conversationId: string,
  providerId: string,
  modelId: string,
  settings?: any,
  systemPrompt?: string
): void {
  getVsCode().postMessage({
    type: 'AI_UPDATE_CONVERSATION_SETTINGS',
    payload: { conversationId, providerId, modelId, settings, systemPrompt }
  });
}

export function sendChatMessage(
  conversationId: string,
  content: string,
  attachments?: any[],
  settings?: Record<string, unknown> | any
): void {
  getVsCode().postMessage({
    type: 'AI_SEND_CHAT_MESSAGE',
    payload: { conversationId, content, attachments, settings }
  });
}

export function abortStream(conversationId: string): void {
  getVsCode().postMessage({ type: 'AI_ABORT_STREAM', payload: { conversationId } });
}

export function regenerateMessage(conversationId: string, messageId?: string): void {
  getVsCode().postMessage({ type: 'AI_REGENERATE_MESSAGE', payload: { conversationId, messageId } });
}

export function continueMessage(conversationId: string, messageId?: string): void {
  getVsCode().postMessage({ type: 'AI_CONTINUE_MESSAGE', payload: { conversationId, messageId } });
}

export function savePromptTemplate(payload: any): void {
  getVsCode().postMessage({ type: 'AI_SAVE_TEMPLATE', payload });
}

export function deletePromptTemplate(id: string): void {
  getVsCode().postMessage({ type: 'AI_DELETE_TEMPLATE', payload: { id } });
}

export function saveGenerationPreset(payload: any): void {
  getVsCode().postMessage({ type: 'AI_SAVE_PRESET', payload });
}

export function deleteGenerationPreset(id: string): void {
  getVsCode().postMessage({ type: 'AI_DELETE_PRESET', payload: { id } });
}

export function addCustomProvider(
  name: string,
  baseUrl: string,
  modelIds: string[],
  apiKey?: string,
  headers?: Record<string, string>
): void {
  getVsCode().postMessage({
    type: 'AI_ADD_CUSTOM_PROVIDER',
    payload: { name, baseUrl, modelIds, apiKey, headers }
  });
}

export function deleteCustomProvider(id: string): void {
  getVsCode().postMessage({ type: 'AI_DELETE_CUSTOM_PROVIDER', payload: { id } });
}

export function discoverModels(providerId: string): void {
  getVsCode().postMessage({ type: 'AI_DISCOVER_MODELS', payload: { providerId } });
}

export function requestWorkspaceFiles(query?: string): void {
  getVsCode().postMessage({ type: 'AI_GET_WORKSPACE_FILES', payload: { query } });
}

export function requestPulseInsights(timeRange: 'today' | '7d' | '30d' | '90d' = '7d', category?: string): void {
  getVsCode().postMessage({ type: 'PULSE_GET_INSIGHTS', payload: { timeRange, category } });
}

export function updatePulseInsightStatus(id: string, status: 'viewed' | 'dismissed' | 'resolved'): void {
  getVsCode().postMessage({ type: 'PULSE_UPDATE_INSIGHT_STATUS', payload: { id, status } });
}

export function runPulseAnalysis(timeRange: 'today' | '7d' | '30d' | '90d' = '7d'): void {
  getVsCode().postMessage({ type: 'PULSE_RUN_ANALYSIS', payload: { timeRange } });
}

export function explainPulseInsight(insightId: string): void {
  getVsCode().postMessage({ type: 'PULSE_EXPLAIN_INSIGHT', payload: { insightId } });
}

export function readWorkspaceFile(filePath: string): void {
  getVsCode().postMessage({ type: 'READ_WORKSPACE_FILE', payload: { path: filePath } });
}

export function subscribeToMessages(callback: (message: ExtensionMessage) => void): () => void {
  const handler = (event: MessageEvent<ExtensionMessage>) => {
    if (event.data && typeof event.data === 'object' && 'type' in event.data) {
      callback(event.data);
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
