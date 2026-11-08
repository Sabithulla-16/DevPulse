import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { OverviewPage } from './pages/OverviewPage';
import { FileIntelligencePage } from './pages/FileIntelligencePage';
import { SystemMetricsPage } from './pages/SystemMetricsPage';
import { AiPlaygroundPage } from './pages/ai-playground/AiPlaygroundPage';
import { PulseInsightsPage } from './pages/pulse-insights/PulseInsightsPage';
import { GitIntelligencePage } from './pages/GitIntelligencePage';
import { CodingIntelligencePage } from './pages/CodingIntelligencePage';
import { ApiIntelligencePage } from './pages/ApiIntelligencePage';
import { ApiTestingStudioPage } from './pages/ApiTestingStudioPage';
import { ModulePlaceholderPage } from './pages/ModulePlaceholderPage';
import { AlertsPage } from './pages/AlertsPage';
import { SettingsPage } from './pages/SettingsPage';
import {
  requestOverview,
  requestSystemMetrics,
  requestExtendedSystem,
  requestFileIntelligence,
  requestAiData,
  requestGitData,
  requestCodingData,
  requestApiData,
  requestApiTestWorkspaceState,
  requestAlerts,
  requestSettings,
  subscribeToMessages,
  updateSettings,
  requestPlaygroundData,
  sendChatMessage,
  abortStream,
  regenerateMessage,
  continueMessage,
  createConversation,
  selectConversation,
  deleteConversation,
  renameConversation,
  updateConversationSettings,
  savePromptTemplate,
  deletePromptTemplate,
  saveGenerationPreset,
  deleteGenerationPreset,
  testAiProvider,
  setAiProviderKey,
  setOllamaHost,
  discoverModels,
  addCustomProvider,
  deleteCustomProvider,
  requestWorkspaceFiles,
  requestPulseInsights,
  updatePulseInsightStatus,
  runPulseAnalysis,
  explainPulseInsight
} from './services/vscode';
import type {
  OverviewData,
  SystemMetricsData,
  SystemExtendedData,
  FileIntelligenceData,
  AiIntelligenceData,
  AiPlaygroundData,
  PulseInsightsData,
  GitIntelligenceData,
  CodingIntelligenceData,
  ApiIntelligenceData,
  ApiEndpointDetailsData,
  ApiTestWorkspaceState,
  AlertItem,
  DevPulseSettings,
  ExtensionMessage,
  ExtensionFilesResult
} from './types';
import './styles.css';

const DEFAULT_SETTINGS: DevPulseSettings = {
  monitoringEnabled: true,
  sampleIntervalSeconds: 5,
  enableCpuMonitoring: true,
  enableMemoryMonitoring: true,
  theme: 'dark',
  statusBarShowCpu: true,
  statusBarShowMemory: true,
  statusBarShowState: true,
  aiMonitoringEnabled: true,
  filesystemMonitoringEnabled: true,
  gitMonitoringEnabled: true,
  codingMonitoringEnabled: false,
  apiMonitoringEnabled: false,

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

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('Overview');
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [systemMetricsData, setSystemMetricsData] = useState<SystemMetricsData | null>(null);
  const [extendedSystemData, setExtendedSystemData] = useState<SystemExtendedData | null>(null);
  const [fileData, setFileData] = useState<FileIntelligenceData | null>(null);
  const [aiData, setAiData] = useState<AiIntelligenceData | null>(null);
  const [gitData, setGitData] = useState<GitIntelligenceData | null>(null);
  const [codingData, setCodingData] = useState<CodingIntelligenceData | null>(null);
  const [apiData, setApiData] = useState<ApiIntelligenceData | null>(null);
  const [apiEndpointDetails, setApiEndpointDetails] = useState<ApiEndpointDetailsData | null>(null);
  const [newServiceTokenData, setNewServiceTokenData] = useState<{ serviceId: string; serviceName: string; token: string } | null>(null);
  const [apiTestWorkspaceState, setApiTestWorkspaceState] = useState<ApiTestWorkspaceState | null>(null);
  const [apiTestIncomingMessage, setApiTestIncomingMessage] = useState<ExtensionMessage | null>(null);
  const [extensionFilesData, setExtensionFilesData] = useState<ExtensionFilesResult | null>(null);
  const [terminationResult, setTerminationResult] = useState<{ success: boolean; pid: number; processName: string; message: string; requiresForce?: boolean } | null>(null);
  const [portFreedResult, setPortFreedResult] = useState<{ success: boolean; port: number; pid?: number; message: string; requiresForce?: boolean } | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [settings, setSettings] = useState<DevPulseSettings>(DEFAULT_SETTINGS);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Phase 7 States
  const [playgroundData, setPlaygroundData] = useState<AiPlaygroundData>({
    conversations: [],
    activeMessages: [],
    templates: [],
    presets: [],
    providers: [],
    customProviders: []
  });
  const [pulseInsightsData, setPulseInsightsData] = useState<PulseInsightsData | null>(null);
  const [pulseExplanations, setPulseExplanations] = useState<Record<string, string>>({});
  const [pulseIsExplaining, setPulseIsExplaining] = useState<Record<string, boolean>>({});
  const [pulseTimeRange, setPulseTimeRange] = useState<'today' | '7d' | '30d' | '90d'>('7d');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [workspaceFiles, setWorkspaceFiles] = useState<Array<{ path: string; name: string; size: number }>>([]);
  const [aiAnalyticsTimeFilter, setAiAnalyticsTimeFilter] = useState<'today' | '7d' | '30d' | '90d' | 'all'>('7d');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    const unsubscribe = subscribeToMessages((message: ExtensionMessage) => {
      switch (message.type) {
        case 'OVERVIEW_DATA':
          setOverviewData(message.payload);
          if (message.payload.settings) {
            setSettings(message.payload.settings);
          }
          if (message.payload.activeAlerts) {
            setAlerts(message.payload.activeAlerts);
          }
          break;

        case 'SYSTEM_METRICS_DATA':
          setSystemMetricsData(message.payload);
          break;

        case 'SYSTEM_EXTENDED_DATA':
          setExtendedSystemData(message.payload);
          break;

        case 'FILE_INTELLIGENCE_DATA':
          setFileData(message.payload);
          break;

        case 'AI_INTELLIGENCE_DATA':
          setAiData(message.payload);
          break;

        case 'GIT_INTELLIGENCE_DATA':
          setGitData(message.payload);
          break;

        case 'CODING_INTELLIGENCE_DATA':
          setCodingData(message.payload);
          break;

        case 'CODING_STATUS_CHANGED':
          setCodingData(prev =>
            prev
              ? {
                  ...prev,
                  liveStatus: {
                    ...prev.liveStatus,
                    ...message.payload
                  }
                }
              : null
          );
          break;

        case 'API_INTELLIGENCE_DATA':
          setApiData(message.payload);
          break;

        case 'API_ENDPOINT_DETAILS_DATA':
          setApiEndpointDetails(message.payload);
          break;

        case 'API_SERVICE_TOKEN_CREATED':
          setNewServiceTokenData(message.payload);
          break;

        case 'API_TEST_WORKSPACE_STATE':
          setApiTestWorkspaceState(message.payload);
          setApiTestIncomingMessage(message);
          break;

        case 'API_TEST_REQUEST_EXECUTING':
        case 'API_TEST_REQUEST_RESULT':
        case 'API_TEST_HISTORY_DATA':
        case 'API_TEST_RUN_PROGRESS':
        case 'API_TEST_RUN_COMPLETED':
        case 'API_TEST_SECRET_REVEALED':
        case 'API_TEST_EXPORT_RESULT':
          setApiTestIncomingMessage(message);
          break;

        case 'EXTENSION_FILES_DATA':
          setExtensionFilesData(message.payload);
          break;

        case 'PROCESS_TERMINATION_RESULT':
          setTerminationResult(message.payload);
          break;

        case 'PORT_FREED_RESULT':
          setPortFreedResult(message.payload);
          break;

        case 'FILE_SCAN_PROGRESS':
          setFileData(prev => prev ? { ...prev, isScanning: true, progress: message.payload } : {
            summary: null,
            largestFiles: [],
            directories: [],
            extensions: [],
            duplicates: [],
            growth: null,
            growthHistory: [],
            isScanning: true,
            progress: message.payload
          });
          break;

        case 'ALERTS_DATA':
          setAlerts(message.payload);
          break;

        case 'SETTINGS_DATA':
        case 'SETTINGS_UPDATED':
          setSettings(message.payload);
          break;

        case 'NAVIGATE_TO':
          setActiveTab(message.payload.tab);
          break;

        case 'OPERATION_SUCCESS':
          setIsRefreshing(false);
          break;

        case 'OPERATION_ERROR':
          setIsRefreshing(false);
          break;

        // Phase 7: AI Playground and Pulse Insights Message Handlers
        case 'AI_PLAYGROUND_DATA':
          setPlaygroundData(message.payload);
          break;

        case 'AI_STREAM_CHUNK':
          setStreamingMessageId(message.payload.messageId);
          setStreamingContent(prev => prev + message.payload.chunk);
          setIsStreaming(true);
          break;

        case 'AI_STREAM_END':
          setIsStreaming(false);
          setStreamingMessageId(null);
          setStreamingContent('');
          requestPlaygroundData(message.payload.conversationId);
          requestAiData();
          requestOverview();
          break;

        case 'AI_STREAM_ERROR':
          setIsStreaming(false);
          setStreamingMessageId(null);
          setStreamingContent('');
          break;

        case 'PULSE_INSIGHTS_DATA':
          setPulseInsightsData(message.payload);
          break;

        case 'PULSE_INSIGHT_EXPLANATION':
          setPulseExplanations(prev => ({
            ...prev,
            [message.payload.insightId]: message.payload.explanation
          }));
          setPulseIsExplaining(prev => ({
            ...prev,
            [message.payload.insightId]: false
          }));
          break;

        case 'AI_WORKSPACE_FILES_RESULT':
          setWorkspaceFiles(message.payload.files || []);
          break;
      }
    });

    // Initial hydration requests
    requestOverview();
    requestSystemMetrics(60);
    requestExtendedSystem();
    requestFileIntelligence();
    requestAiData();
    requestPlaygroundData();
    requestPulseInsights('7d');
    requestGitData();
    requestCodingData();
    requestApiData();
    requestApiTestWorkspaceState();
    requestAlerts();
    requestSettings();

    // Fallback heartbeat polling every 5s
    const timer = setInterval(() => {
      requestOverview();
      requestSystemMetrics(60);
      requestExtendedSystem();
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    setSettings(prev => ({ ...prev, theme: nextTheme }));
    updateSettings({ theme: nextTheme });
  };

  const renderActivePage = () => {
    switch (activeTab) {
      case 'Overview':
        return <OverviewPage data={overviewData} onNavigate={setActiveTab} />;

      case 'File Intelligence':
        return (
          <FileIntelligencePage
            data={fileData}
            extensionFilesData={extensionFilesData}
            onClearExtensionFiles={() => setExtensionFilesData(null)}
          />
        );

      case 'System Intelligence':
        return (
          <SystemMetricsPage
            data={systemMetricsData}
            extendedData={extendedSystemData}
            terminationResult={terminationResult}
            portFreedResult={portFreedResult}
            onClearTerminationResult={() => setTerminationResult(null)}
            onClearPortFreedResult={() => setPortFreedResult(null)}
          />
        );

      case 'AI Playground':
      case 'AI Intelligence':
        return (
          <AiPlaygroundPage
            data={playgroundData}
            analyticsData={aiData || undefined}
            streamingMessageId={streamingMessageId}
            streamingContent={streamingContent}
            isStreaming={isStreaming}
            workspaceFiles={workspaceFiles}
            analyticsTimeFilter={aiAnalyticsTimeFilter}
            onSendMessage={(convId, content, attachments, settingsPayload) => {
              setStreamingContent('');
              setIsStreaming(true);
              sendChatMessage(convId, content, attachments, settingsPayload);
            }}
            onAbortStream={abortStream}
            onRegenerateMessage={(convId, msgId) => {
              setStreamingContent('');
              setIsStreaming(true);
              regenerateMessage(convId, msgId);
            }}
            onContinueMessage={(convId, msgId) => {
              setIsStreaming(true);
              continueMessage(convId, msgId);
            }}
            onCreateConversation={createConversation}
            onUpdateConversationSettings={updateConversationSettings}
            onSelectConversation={selectConversation}
            onDeleteConversation={deleteConversation}
            onRenameConversation={renameConversation}
            onSaveTemplate={savePromptTemplate}
            onDeleteTemplate={deletePromptTemplate}
            onSavePreset={saveGenerationPreset}
            onDeletePreset={deleteGenerationPreset}
            onTestProvider={testAiProvider}
            onSetProviderKey={setAiProviderKey}
            onSetOllamaHost={setOllamaHost}
            onDiscoverModels={discoverModels}
            onAddCustomProvider={addCustomProvider}
            onDeleteCustomProvider={deleteCustomProvider}
            onRequestWorkspaceFiles={requestWorkspaceFiles}
            onAnalyticsTimeFilterChange={filter => {
              setAiAnalyticsTimeFilter(filter);
              requestAiData(filter);
            }}
          />
        );

      case 'Pulse Insights':
        return (
          <PulseInsightsPage
            data={pulseInsightsData || undefined}
            timeRange={pulseTimeRange}
            onTimeRangeChange={range => {
              setPulseTimeRange(range);
              requestPulseInsights(range);
            }}
            onRunAnalysis={() => runPulseAnalysis(pulseTimeRange)}
            onUpdateStatus={(id, status) => {
              updatePulseInsightStatus(id, status);
              setPulseInsightsData(prev => {
                if (!prev) return null;
                return {
                  ...prev,
                  insights: prev.insights.map(ins => ins.id === id ? { ...ins, status } : ins)
                };
              });
            }}
            onExplainInsight={id => {
              setPulseIsExplaining(prev => ({ ...prev, [id]: true }));
              explainPulseInsight(id);
            }}
            explanations={pulseExplanations}
            isExplaining={pulseIsExplaining}
          />
        );

      case 'Git Intelligence':
        return <GitIntelligencePage data={gitData} onNavigateTab={setActiveTab} />;

      case 'Coding Intelligence':
        return <CodingIntelligencePage data={codingData} onRefresh={requestCodingData} />;

      case 'API Intelligence':
        return (
          <ApiIntelligencePage
            data={apiData}
            endpointDetails={apiEndpointDetails}
            onRefresh={requestApiData}
            newServiceTokenData={newServiceTokenData}
            onClearNewServiceToken={() => setNewServiceTokenData(null)}
          />
        );

      case 'API Testing Studio':
        return (
          <ApiTestingStudioPage
            workspaceState={apiTestWorkspaceState}
            incomingMessage={apiTestIncomingMessage}
          />
        );

      case 'Alerts':
        return <AlertsPage alerts={alerts} />;

      case 'Settings':
      case 'Privacy & Settings':
        return <SettingsPage settings={settings} />;

      default:
        return (
          <ModulePlaceholderPage
            moduleName={activeTab}
            onBackToOverview={() => setActiveTab('Overview')}
          />
        );
    }
  };

  const unacknowledgedAlertsCount = alerts.filter(a => !a.acknowledged).length;

  return (
    <div className="devpulse-shell" data-theme={settings.theme}>
      <Header
        workspaceName={overviewData?.workspace?.name}
        isMonitoring={overviewData?.monitoring ?? true}
        theme={settings.theme}
        onToggleTheme={handleToggleTheme}
        onOpenSettings={() => setActiveTab('Settings')}
        isRefreshing={isRefreshing}
      />

      <div className="devpulse-body">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          collectors={overviewData?.collectors ?? []}
          alertCount={unacknowledgedAlertsCount}
        />

        <main
          className={`devpulse-main-view custom-scrollbar ${
            activeTab === 'API Testing Studio' || activeTab === 'AI Playground' || activeTab === 'Pulse Insights'
              ? 'is-full-bleed'
              : ''
          }`}
        >
          {renderActivePage()}
        </main>
      </div>
    </div>
  );
}
