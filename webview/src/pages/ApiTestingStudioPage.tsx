import React, { useState, useEffect, useRef } from 'react';
import {
  StudioToolbar
} from './api-testing/StudioToolbar';
import {
  StudioSidebar
} from './api-testing/StudioSidebar';
import {
  RequestEditor
} from './api-testing/RequestEditor';
import {
  ResponseViewer
} from './api-testing/ResponseViewer';
import {
  EnvironmentModal
} from './api-testing/EnvironmentModal';
import {
  ImportExportModal
} from './api-testing/ImportExportModal';
import {
  CollectionRunnerView
} from './api-testing/CollectionRunnerView';
import {
  ConsolePanel,
  type ConsoleLogItem
} from './api-testing/ConsolePanel';
import {
  requestApiTestWorkspaceState,
  createApiTestCollection,
  deleteApiTestCollection,
  createApiTestFolder,
  deleteApiTestFolder,
  saveApiTestRequest,
  deleteApiTestRequest,
  executeApiTestRequest,
  cancelApiTestRequest,
  saveApiTestEnvironment,
  deleteApiTestEnvironment,
  setActiveApiTestEnvironment,
  revealApiTestSecret,
  clearApiTestHistory,
  runApiTestCollection,
  cancelApiTestRun,
  importApiTestData,
  exportApiTestData
} from '../services/vscode';
import { exportRequestToCurl } from './api-testing/curlHelper';
import type {
  ApiTestWorkspaceState,
  ApiTestRequestPayload,
  ApiTestExecutionResult,
  ApiTestRunProgress,
  ApiTestRunSummary,
  ApiTestCollectionRunConfig,
  ExtensionMessage
} from '../types';
import { Plus, X } from 'lucide-react';

interface RequestTab {
  id: string;
  title: string;
  request: ApiTestRequestPayload;
  isDirty?: boolean;
}

const DEFAULT_NEW_REQUEST: ApiTestRequestPayload = {
  name: 'Untitled Request',
  method: 'GET',
  url: '',
  params: [],
  headers: [],
  bodyType: 'none',
  auth: { type: 'none' }
};

interface ApiTestingStudioPageProps {
  workspaceState: ApiTestWorkspaceState | null;
  incomingMessage?: ExtensionMessage | null;
}

export const ApiTestingStudioPage: React.FC<ApiTestingStudioPageProps> = ({
  workspaceState: initialWorkspaceState,
  incomingMessage
}) => {
  const [workspaceState, setWorkspaceState] = useState<ApiTestWorkspaceState>(
    initialWorkspaceState || {
      collections: [],
      environments: [],
      activeEnvironmentId: null,
      history: []
    }
  );

  // Tabs State
  const [tabs, setTabs] = useState<RequestTab[]>([
    {
      id: 'tab-initial',
      title: 'Untitled Request',
      request: { ...DEFAULT_NEW_REQUEST }
    }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-initial');

  // Execution & Response State
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<ApiTestExecutionResult | null>(null);

  // Collection Runner State
  const [isRunnerOpen, setIsRunnerOpen] = useState(false);
  const [isRunnerExecuting, setIsRunnerExecuting] = useState(false);
  const [runnerProgress, setRunnerProgress] = useState<ApiTestRunProgress | null>(null);
  const [runnerSummary, setRunnerSummary] = useState<ApiTestRunSummary | null>(null);

  // Console State
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogItem[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);

  // Modals
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [importExportModal, setImportExportModal] = useState<{ open: boolean; mode: 'import' | 'export' }>({
    open: false,
    mode: 'import'
  });
  const [exportResult, setExportResult] = useState<{ filename: string; content: string } | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});

  // Layout Sizing
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [requestPaneHeight, setRequestPaneHeight] = useState(250);
  const isDraggingSidebar = useRef(false);
  const isDraggingDivider = useRef(false);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  }>({ startX: 0, startY: 0, startWidth: 300, startHeight: 250 });

  // Dialog state for collection / folder creation
  const [promptModal, setPromptModal] = useState<{
    open: boolean;
    title: string;
    label: string;
    placeholder: string;
    defaultValue?: string;
    onSubmit: (value: string) => void;
  } | null>(null);
  const [promptValue, setPromptValue] = useState('');

  useEffect(() => {
    requestApiTestWorkspaceState();
  }, []);

  useEffect(() => {
    if (initialWorkspaceState) {
      setWorkspaceState(initialWorkspaceState);
    }
  }, [initialWorkspaceState]);

  // Handle incoming IPC messages
  useEffect(() => {
    if (!incomingMessage) return;

    switch (incomingMessage.type) {
      case 'API_TEST_WORKSPACE_STATE':
        setWorkspaceState(incomingMessage.payload);
        break;

      case 'API_TEST_REQUEST_EXECUTING':
        setIsExecuting(true);
        setActiveExecutionId(incomingMessage.payload.executionId);
        break;

      case 'API_TEST_REQUEST_RESULT': {
        setIsExecuting(false);
        setActiveExecutionId(null);
        setExecutionResult(incomingMessage.payload);
        const res = incomingMessage.payload;
        const statusLevel: 'log' | 'error' = res.statusCode >= 200 && res.statusCode < 400 ? 'log' : 'error';
        const resLogs: ConsoleLogItem[] = [
          {
            id: Math.random().toString(),
            level: statusLevel,
            message: `[Response] ${res.statusCode || 'ERR'} ${res.statusText || ''} (${Math.round(res.durationMs)}ms, ${(res.responseSizeBytes / 1024).toFixed(1)} KB)`,
            timestamp: Date.now()
          }
        ];

        if (res.testResults?.length) {
          for (const t of res.testResults) {
            resLogs.push({
              id: Math.random().toString(),
              level: t.passed ? 'log' : 'error',
              message: `[Test] ${t.passed ? 'PASS' : 'FAIL'} - ${t.name}${t.errorMessage ? `: ${t.errorMessage}` : ''}`,
              timestamp: Date.now()
            });
          }
        }

        if (incomingMessage.payload.scriptLogs?.length) {
          const scriptLogItems: ConsoleLogItem[] = incomingMessage.payload.scriptLogs.map((l: { level: 'log' | 'info' | 'warn' | 'error'; message: string; timestamp: number }) => ({
            id: Math.random().toString(),
            level: l.level,
            message: `[Script] ${l.message}`,
            timestamp: l.timestamp
          }));
          resLogs.push(...scriptLogItems);
        }
        setConsoleLogs(prev => [...prev, ...resLogs]);
        break;
      }

      case 'API_TEST_RUN_PROGRESS':
        setRunnerProgress(incomingMessage.payload);
        break;

      case 'API_TEST_RUN_COMPLETED':
        setIsRunnerExecuting(false);
        setRunnerSummary(incomingMessage.payload);
        setConsoleLogs(prev => [
          ...prev,
          {
            id: Math.random().toString(),
            level: incomingMessage.payload.status === 'completed' ? 'log' : 'error',
            message: `Collection Run completed: ${incomingMessage.payload.passedAssertions} passed, ${incomingMessage.payload.failedAssertions} failed in ${Math.round(incomingMessage.payload.durationMs)}ms`,
            timestamp: Date.now()
          }
        ]);
        break;

      case 'API_TEST_SECRET_REVEALED':
        setRevealedSecrets(prev => ({
          ...prev,
          [incomingMessage.payload.variableId]: incomingMessage.payload.value
        }));
        setTimeout(() => {
          setRevealedSecrets(prev => {
            const copy = { ...prev };
            delete copy[incomingMessage.payload.variableId];
            return copy;
          });
        }, 10000);
        break;

      case 'API_TEST_EXPORT_RESULT':
        setExportResult(incomingMessage.payload);
        break;
    }
  }, [incomingMessage]);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  // Request Tab Actions
  const handleNewRequest = (collectionId?: string, folderId?: string) => {
    setIsRunnerOpen(false); // Return to request editor from runner
    const newId = `tab-${Date.now()}`;
    const newReq: ApiTestRequestPayload = {
      ...DEFAULT_NEW_REQUEST,
      url: '',
      bodyContent: '',
      collectionId,
      folderId
    };
    setTabs(prev => [...prev, { id: newId, title: 'Untitled Request', request: newReq }]);
    setActiveTabId(newId);
  };

  const handleSelectRequestFromTree = (req: ApiTestRequestPayload) => {
    // Check if already open
    const existing = tabs.find(t => t.request.id === req.id);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const newId = `tab-${req.id || Date.now()}`;
    setTabs(prev => [...prev, { id: newId, title: req.name, request: { ...req } }]);
    setActiveTabId(newId);
  };

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      // Keep at least one empty tab
      setTabs([{ id: `tab-${Date.now()}`, title: 'Untitled Request', request: { ...DEFAULT_NEW_REQUEST } }]);
      return;
    }
    const newTabs = tabs.filter(t => t.id !== tabId);
    setTabs(newTabs);
    if (activeTabId === tabId) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  const handleUpdateRequest = (updated: ApiTestRequestPayload) => {
    setTabs(prev =>
      prev.map(t =>
        t.id === activeTabId
          ? { ...t, title: updated.name || 'Untitled', request: updated, isDirty: true }
          : t
      )
    );
  };

  // Execution
  const handleExecuteRequest = () => {
    if (!activeTab) return;
    const executionId = Math.random().toString();
    setIsExecuting(true);
    setActiveExecutionId(executionId);

    // Immediate console feedback
    setConsoleLogs(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        level: 'info',
        message: `[Request] ${activeTab.request.method} ${activeTab.request.url}`,
        timestamp: Date.now()
      }
    ]);

    executeApiTestRequest({
      executionId,
      request: activeTab.request,
      environmentId: workspaceState.activeEnvironmentId,
      unsavedDraft: activeTab.isDirty
    });
  };

  const handleCancelRequest = () => {
    if (activeExecutionId) {
      cancelApiTestRequest(activeExecutionId);
      setIsExecuting(false);
      setActiveExecutionId(null);
      setConsoleLogs(prev => [
        ...prev,
        {
          id: Math.random().toString(),
          level: 'warn',
          message: '[Request Cancelled by User]',
          timestamp: Date.now()
        }
      ]);
    }
  };

  const handleSaveRequest = () => {
    if (!activeTab) return;
    saveApiTestRequest(activeTab.request);
    setTabs(prev =>
      prev.map(t => (t.id === activeTabId ? { ...t, isDirty: false } : t))
    );
  };

  const handleExportCurl = () => {
    if (!activeTab) return;
    const curl = exportRequestToCurl(activeTab.request, false);
    navigator.clipboard.writeText(curl);
  };

  // Silky-smooth 60fps relative resizing
  useEffect(() => {
    let animFrame: number;

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingSidebar.current && !isDraggingDivider.current) return;

      cancelAnimationFrame(animFrame);
      animFrame = requestAnimationFrame(() => {
        if (isDraggingSidebar.current) {
          const deltaX = e.clientX - dragStartRef.current.startX;
          const newWidth = Math.max(270, Math.min(550, dragStartRef.current.startWidth + deltaX));
          setSidebarWidth(newWidth);
        }
        if (isDraggingDivider.current) {
          const deltaY = e.clientY - dragStartRef.current.startY;
          const newHeight = Math.max(160, Math.min(window.innerHeight - 200, dragStartRef.current.startHeight + deltaY));
          setRequestPaneHeight(newHeight);
        }
      });
    };

    const onMouseUp = () => {
      if (isDraggingSidebar.current || isDraggingDivider.current) {
        isDraggingSidebar.current = false;
        isDraggingDivider.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div className="studio-app-container">
      {/* Top Application Toolbar */}
      <StudioToolbar
        environments={workspaceState.environments}
        activeEnvironmentId={workspaceState.activeEnvironmentId}
        onSelectEnvironment={setActiveApiTestEnvironment}
        onOpenEnvironmentModal={() => setIsEnvModalOpen(true)}
        onOpenImportModal={() => setImportExportModal({ open: true, mode: 'import' })}
        onOpenExportModal={() => setImportExportModal({ open: true, mode: 'export' })}
        onOpenRunner={() => setIsRunnerOpen(true)}
        onNewRequest={() => handleNewRequest()}
      />

      {isRunnerOpen ? (
        /* DEDICATED COLLECTION RUNNER VIEW */
        <CollectionRunnerView
          collections={workspaceState.collections}
          environments={workspaceState.environments}
          activeEnvironmentId={workspaceState.activeEnvironmentId}
          isRunning={isRunnerExecuting}
          progress={runnerProgress}
          summary={runnerSummary}
          onStartRun={(config: ApiTestCollectionRunConfig) => {
            setIsRunnerExecuting(true);
            setRunnerSummary(null);
            runApiTestCollection(config);
          }}
          onCancelRun={(runId: string) => {
            cancelApiTestRun(runId);
            setIsRunnerExecuting(false);
          }}
          onBackToEditor={() => setIsRunnerOpen(false)}
        />
      ) : (
        /* MAIN STUDIO WORKSPACE (Split Left Explorer, Central Editor, Right Response) */
        <div className="studio-main-workspace">
          {/* Left Explorer Sidebar */}
          <div className="studio-sidebar-wrapper" style={{ width: sidebarWidth }}>
            <StudioSidebar
              collections={workspaceState.collections}
              environments={workspaceState.environments}
              history={workspaceState.history}
              activeEnvironmentId={workspaceState.activeEnvironmentId}
              activeRequestId={activeTab?.request.id}
              onSelectRequest={handleSelectRequestFromTree}
              onCreateCollection={() => {
                setPromptValue('');
                setPromptModal({
                  open: true,
                  title: 'Create Collection',
                  label: 'Collection Name',
                  placeholder: 'e.g. User Authentication API',
                  onSubmit: (name) => createApiTestCollection(name)
                });
              }}
              onDeleteCollection={deleteApiTestCollection}
              onCreateFolder={(colId: string) => {
                setPromptValue('');
                setPromptModal({
                  open: true,
                  title: 'Create Folder',
                  label: 'Folder Name',
                  placeholder: 'e.g. Auth Endpoints',
                  onSubmit: (name) => createApiTestFolder(colId, name)
                });
              }}
              onDeleteFolder={deleteApiTestFolder}
              onCreateRequest={(colId: string, folderId?: string) => handleNewRequest(colId, folderId)}
              onDeleteRequest={deleteApiTestRequest}
              onSelectEnvironment={setActiveApiTestEnvironment}
              onOpenEnvironmentModal={() => setIsEnvModalOpen(true)}
              onClearHistory={clearApiTestHistory}
              onOpenImportModal={() => setImportExportModal({ open: true, mode: 'import' })}
            />
          </div>

          {/* Sidebar Draggable Splitter */}
          <div
            className="studio-vertical-splitter"
            onMouseDown={(e) => {
              e.preventDefault();
              isDraggingSidebar.current = true;
              dragStartRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                startWidth: sidebarWidth,
                startHeight: requestPaneHeight
              };
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
          />

          {/* Central Workspace Area */}
          <div className="studio-central-workspace">
            {/* Multi-Request Tabs Bar */}
            <div className="studio-tabs-bar">
              <div className="tabs-scroll-area">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`request-tab ${activeTabId === tab.id ? 'is-active' : ''}`}
                    onClick={() => setActiveTabId(tab.id)}
                  >
                    <span className={`method-badge-sm badge-${tab.request.method.toLowerCase()}`}>
                      {tab.request.method}
                    </span>
                    <span className="tab-title">
                      {tab.title}
                      {tab.isDirty && <span className="tab-dirty-dot">•</span>}
                    </span>
                    <span
                      className="tab-close"
                      onClick={e => handleCloseTab(tab.id, e)}
                      title="Close tab"
                    >
                      <X size={12} />
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="new-tab-btn"
                onClick={() => handleNewRequest()}
                title="New Request Tab"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Request Editor & Response Viewer Vertical Split */}
            <div className="studio-editor-response-split">
              <div className="request-pane" style={{ height: requestPaneHeight }}>
                {activeTab && (
                  <RequestEditor
                    request={activeTab.request}
                    isExecuting={isExecuting}
                    onExecute={handleExecuteRequest}
                    onCancel={handleCancelRequest}
                    onSave={handleSaveRequest}
                    onChange={handleUpdateRequest}
                    onExportCurl={handleExportCurl}
                  />
                )}
              </div>

              {/* Horizontal Resizable Divider */}
              <div
                className="studio-horizontal-divider"
                onMouseDown={(e) => {
                  e.preventDefault();
                  isDraggingDivider.current = true;
                  dragStartRef.current = {
                    startX: e.clientX,
                    startY: e.clientY,
                    startWidth: sidebarWidth,
                    startHeight: requestPaneHeight
                  };
                  document.body.style.cursor = 'row-resize';
                  document.body.style.userSelect = 'none';
                }}
              >
                <div className="divider-handle" />
              </div>

              {/* Response Workspace */}
              <div className="response-pane">
                <ResponseViewer result={executionResult} isExecuting={isExecuting} />
              </div>
            </div>

            {/* Bottom Collapsible Console Panel */}
            <ConsolePanel
              logs={consoleLogs}
              onClear={() => setConsoleLogs([])}
              isOpen={isConsoleOpen}
              onToggle={() => setIsConsoleOpen(prev => !prev)}
            />
          </div>
        </div>
      )}

      {/* Environment Manager Modal */}
      {isEnvModalOpen && (
        <EnvironmentModal
          environments={workspaceState.environments}
          activeEnvironmentId={workspaceState.activeEnvironmentId}
          onClose={() => setIsEnvModalOpen(false)}
          onSaveEnvironment={saveApiTestEnvironment}
          onDeleteEnvironment={deleteApiTestEnvironment}
          onSetActiveEnvironment={setActiveApiTestEnvironment}
          onRevealSecret={revealApiTestSecret}
          revealedSecrets={revealedSecrets}
        />
      )}

      {/* Import / Export Modal */}
      {importExportModal.open && (
        <ImportExportModal
          mode={importExportModal.mode}
          collections={workspaceState.collections}
          onClose={() => setImportExportModal({ open: false, mode: 'import' })}
          onImport={importApiTestData}
          onExport={exportApiTestData}
          exportResult={exportResult}
        />
      )}

      {/* Quick Prompt Modal for Collections & Folders */}
      {promptModal && promptModal.open && (
        <div className="studio-modal-overlay" onClick={() => setPromptModal(null)}>
          <div className="studio-modal-card prompt-modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{promptModal.title}</span>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setPromptModal(null)}
              >
                <X size={15} />
              </button>
            </div>
            <form
              onSubmit={e => {
                e.preventDefault();
                if (promptValue.trim()) {
                  promptModal.onSubmit(promptValue.trim());
                  setPromptModal(null);
                  setPromptValue('');
                }
              }}
            >
              <div className="modal-body" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-foreground)' }}>
                  {promptModal.label}
                </label>
                <input
                  type="text"
                  autoFocus
                  className="studio-input"
                  style={{
                    height: '36px',
                    padding: '0 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-card)',
                    color: 'var(--color-foreground)',
                    fontSize: '13px',
                    outline: 'none',
                    width: '100%'
                  }}
                  placeholder={promptModal.placeholder}
                  value={promptValue}
                  onChange={e => setPromptValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      setPromptModal(null);
                    }
                  }}
                />
              </div>
              <div className="modal-footer" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="studio-btn studio-btn-ghost"
                  onClick={() => setPromptModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!promptValue.trim()}
                  className="studio-btn studio-btn-primary"
                >
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
