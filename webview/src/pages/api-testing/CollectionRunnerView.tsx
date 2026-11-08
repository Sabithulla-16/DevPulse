import React, { useState } from 'react';
import {
  Play,
  Square,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
  Download,
  AlertTriangle,
  UploadCloud,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import type {
  ApiTestCollectionItem,
  ApiTestEnvironmentItem,
  ApiTestCollectionRunConfig,
  ApiTestRunProgress,
  ApiTestRunSummary
} from '../../types';

interface CollectionRunnerViewProps {
  collections: ApiTestCollectionItem[];
  environments: ApiTestEnvironmentItem[];
  activeEnvironmentId: string | null;
  isRunning: boolean;
  progress: ApiTestRunProgress | null;
  summary: ApiTestRunSummary | null;
  onStartRun: (config: ApiTestCollectionRunConfig) => void;
  onCancelRun: (runId: string) => void;
  onBackToEditor: () => void;
}

export const CollectionRunnerView: React.FC<CollectionRunnerViewProps> = ({
  collections,
  environments,
  activeEnvironmentId,
  isRunning,
  progress,
  summary,
  onStartRun,
  onCancelRun,
  onBackToEditor
}) => {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>(collections[0]?.id || '');
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(activeEnvironmentId);
  const [iterations, setIterations] = useState<number>(1);
  const [delayMs, setDelayMs] = useState<number>(0);
  const [stopOnFailure, setStopOnFailure] = useState<boolean>(false);
  const [dataFileContent, setDataFileContent] = useState<string>('');
  const [dataFileType, setDataFileType] = useState<'csv' | 'json'>('csv');
  const [showDataFileModal, setShowDataFileModal] = useState<boolean>(false);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const toggleRow = (idx: number) => {
    setExpandedRows(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const activeCollection = collections.find(c => c.id === selectedCollectionId);
  const passedRequestsCount = summary?.results.filter(r => (r.statusCode || 0) >= 200 && (r.statusCode || 0) < 400).length ?? 0;

  const handleStart = () => {
    if (!selectedCollectionId) return;
    onStartRun({
      runId: Math.random().toString(),
      collectionId: selectedCollectionId,
      environmentId: selectedEnvId,
      iterations,
      delayMs,
      stopOnFailure,
      dataFileContent: dataFileContent || undefined,
      dataFileType: dataFileContent ? dataFileType : undefined
    });
  };

  const handleExportResultsJson = () => {
    if (!summary) return;
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `run-results-${summary.runId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="collection-runner-workspace">
      {/* Top Runner Navigation Bar */}
      <div className="runner-topbar">
        <button type="button" className="studio-btn studio-btn-ghost" onClick={onBackToEditor}>
          <ArrowLeft size={14} />
          <span>Back to Request Editor</span>
        </button>

        <div className="runner-title">COLLECTION RUNNER</div>

        <div className="runner-top-actions">
          {summary && (
            <button
              type="button"
              className="studio-btn studio-btn-ghost"
              onClick={handleExportResultsJson}
              title="Export Run Results JSON"
            >
              <Download size={14} />
              <span>Export Report</span>
            </button>
          )}

          {isRunning ? (
            <button
              type="button"
              className="studio-btn studio-btn-danger"
              onClick={() => progress?.runId && onCancelRun(progress.runId)}
            >
              <Square size={14} />
              <span>Cancel Run</span>
            </button>
          ) : (
            <button
              type="button"
              className="studio-btn studio-btn-primary"
              disabled={!selectedCollectionId || (activeCollection?.requests.length === 0)}
              onClick={handleStart}
            >
              <Play size={14} />
              <span>Run Collection</span>
            </button>
          )}
        </div>
      </div>

      <div className="runner-body-split">
        {/* Left: Configuration Sidebar */}
        <div className="runner-config-panel">
          <div className="config-section">
            <label className="section-label">Collection to Execute</label>
            <select
              className="studio-select"
              value={selectedCollectionId}
              disabled={isRunning}
              onChange={e => setSelectedCollectionId(e.target.value)}
            >
              {collections.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.requests.length} requests)
                </option>
              ))}
            </select>
          </div>

          <div className="config-section">
            <label className="section-label">Environment</label>
            <select
              className="studio-select"
              value={selectedEnvId || ''}
              disabled={isRunning}
              onChange={e => setSelectedEnvId(e.target.value || null)}
            >
              <option value="">No Environment (Globals)</option>
              {environments.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          <div className="config-row-2">
            <div className="config-section">
              <label className="section-label">Iterations</label>
              <input
                type="number"
                min="1"
                max="1000"
                className="studio-input"
                value={iterations}
                disabled={isRunning || !!dataFileContent}
                onChange={e => setIterations(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </div>

            <div className="config-section">
              <label className="section-label">Delay (ms)</label>
              <input
                type="number"
                min="0"
                max="10000"
                step="50"
                className="studio-input"
                value={delayMs}
                disabled={isRunning}
                onChange={e => setDelayMs(Math.max(0, parseInt(e.target.value, 10) || 0))}
              />
            </div>
          </div>

          <div className="config-section checkbox-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={stopOnFailure}
                disabled={isRunning}
                onChange={e => setStopOnFailure(e.target.checked)}
              />
              <span>Stop Run on Assertion Failure</span>
            </label>
          </div>

          {/* Data File Attachment */}
          <div className="config-section">
            <label className="section-label">Data-Driven Testing File</label>
            <div className="data-file-control">
              {dataFileContent ? (
                <div className="attached-file-badge">
                  <FileSpreadsheet size={15} />
                  <span>Data attached ({dataFileType.toUpperCase()})</span>
                  <button
                    type="button"
                    className="clear-file-btn"
                    onClick={() => setDataFileContent('')}
                    disabled={isRunning}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="studio-btn studio-btn-ghost file-upload-btn"
                  onClick={() => setShowDataFileModal(true)}
                  disabled={isRunning}
                >
                  <UploadCloud size={14} />
                  <span>Load CSV / JSON Data</span>
                </button>
              )}
            </div>
          </div>

          {/* Request Order Preview */}
          <div className="config-section request-order-preview">
            <label className="section-label">Request Sequence ({activeCollection?.requests.length || 0})</label>
            <div className="sequence-list">
              {activeCollection?.requests.map((r, i) => (
                <div key={r.id || i} className="seq-item">
                  <span className="seq-num">{i + 1}</span>
                  <span className={`method-badge badge-${r.method.toLowerCase()}`}>{r.method}</span>
                  <span className="seq-name">{r.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Results Workspace */}
        <div className="runner-results-panel">
          {/* Live Progress Bar when running */}
          {isRunning && progress && (
            <div className="runner-progress-banner">
              <div className="progress-info">
                <span className="progress-status">
                  Running Iteration {progress.iteration} / {progress.totalIterations}
                </span>
                <span className="progress-target">
                  Executing: {progress.currentRequestName} ({progress.requestIndex} / {progress.totalRequests})
                </span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${((progress.requestIndex + (progress.iteration - 1) * progress.totalRequests) /
                      (progress.totalIterations * progress.totalRequests)) *
                      100}%`
                  }}
                />
              </div>
            </div>
          )}

          {/* Summary Metric Header */}
          {summary && (
            <div className="runner-summary-header">
              <div className="summary-col">
                <span className="metric-label">STATUS</span>
                <span
                  className={`metric-val status-${summary.status}`}
                >
                  {summary.status.toUpperCase()}
                </span>
              </div>
              <div className="summary-col">
                <span className="metric-label">COMPLETED REQUESTS</span>
                <span className="metric-val text-info">
                  {passedRequestsCount} / {summary.totalRequests}
                </span>
              </div>
              <div className="summary-col">
                <span className="metric-label">PASSED ASSERTIONS</span>
                <span className="metric-val text-success">{summary.passedAssertions}</span>
              </div>
              <div className="summary-col">
                <span className="metric-label">FAILED ASSERTIONS</span>
                <span className="metric-val text-danger">{summary.failedAssertions}</span>
              </div>
              <div className="summary-col">
                <span className="metric-label">DURATION</span>
                <span className="metric-val">{Math.round(summary.durationMs)} ms</span>
              </div>
              <div className="summary-col">
                <span className="metric-label">TOTAL REQUESTS</span>
                <span className="metric-val">{summary.totalRequests}</span>
              </div>
            </div>
          )}

          {/* Results Table */}
          <div className="runner-table-wrap">
            {!summary && !isRunning ? (
              <div className="runner-empty-state">
                <Play size={40} className="empty-icon" />
                <div className="empty-title">Ready to Execute Collection</div>
                <div className="empty-desc">
                  Select iterations and configuration on the left, then click "Run Collection" to execute automated tests.
                </div>
              </div>
            ) : (
              <div className="runner-results-table">
                <div className="table-header">
                  <span className="col-expand" />
                  <span className="col-iter">ITERATION</span>
                  <span className="col-status">STATUS</span>
                  <span className="col-req">REQUEST</span>
                  <span className="col-time">TIME</span>
                  <span className="col-assertions">ASSERTIONS</span>
                </div>

                {summary?.results.map((res, i) => {
                  const passCount = res.assertions.filter(a => a.passed).length;
                  const failCount = res.assertions.filter(a => !a.passed).length;
                  const isSuccess = failCount === 0 && res.statusCode !== null && res.statusCode < 400;
                  const isExpanded = !!expandedRows[i];

                  return (
                    <div key={i} className={`table-row-group ${isExpanded ? 'is-row-expanded' : ''}`}>
                      <div
                        className="table-row is-clickable"
                        onClick={() => toggleRow(i)}
                        title="Click to view full execution details"
                      >
                        <span className="col-expand">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        <span className="col-iter">#{res.iteration}</span>
                        <span className="col-status">
                          <span
                            className={`status-pill ${
                              isSuccess ? 'status-pill-success' : 'status-pill-error'
                            }`}
                          >
                            {res.statusCode || 'ERR'}
                          </span>
                        </span>
                        <span className="col-req">
                          <span className={`method-badge badge-${res.method.toLowerCase()}`}>
                            {res.method}
                          </span>
                          <span className="req-name">{res.requestName}</span>
                        </span>
                        <span className="col-time">{Math.round(res.durationMs)}ms</span>
                        <span className="col-assertions">
                          {res.assertions.length > 0 ? (
                            <span className="assertion-stats">
                              {passCount > 0 && <span className="pass-text">✓ {passCount}</span>}
                              {failCount > 0 && <span className="fail-text">✕ {failCount}</span>}
                            </span>
                          ) : (
                            <span className="no-assertions">—</span>
                          )}
                        </span>
                      </div>

                      {/* Expandable Accordion Output Details */}
                      {isExpanded && (
                        <div className="runner-row-expanded-output">
                          <div className="expanded-output-header">
                            <div className="expanded-url-info">
                              <span className={`method-badge badge-${res.method.toLowerCase()}`}>{res.method}</span>
                              <span className="expanded-url-text">{res.url}</span>
                            </div>
                            <span className="expanded-meta-text">
                              Executed at {new Date(res.executedAt).toLocaleTimeString()} ({Math.round(res.durationMs)}ms)
                            </span>
                          </div>

                          {res.errorMessage && (
                            <div className="expanded-error-banner">
                              <AlertTriangle size={14} />
                              <span>{res.errorMessage}</span>
                            </div>
                          )}

                          <div className="expanded-assertions-section">
                            <div className="expanded-section-title">Test Assertions:</div>
                            {res.assertions.length === 0 ? (
                              <div className="expanded-empty-assertions">
                                No test assertions configured. Request returned HTTP {res.statusCode || 'ERR'}.
                              </div>
                            ) : (
                              <div className="expanded-assertions-list">
                                {res.assertions.map((a, aIdx) => (
                                  <div
                                    key={aIdx}
                                    className={`expanded-assert-item ${a.passed ? 'is-pass' : 'is-fail'}`}
                                  >
                                    {a.passed ? (
                                      <CheckCircle2 size={14} className="assert-icon pass" />
                                    ) : (
                                      <XCircle size={14} className="assert-icon fail" />
                                    )}
                                    <div className="assert-text-wrap">
                                      <span className="assert-name">{a.name}</span>
                                      {a.errorMessage && <span className="assert-err">{a.errorMessage}</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal for Pasting CSV / JSON Data */}
      {showDataFileModal && (
        <div className="studio-modal-overlay">
          <div className="studio-modal-container data-file-modal">
            <div className="modal-header">
              <span>Attach Data File for Iterations</span>
              <button type="button" className="modal-close-btn" onClick={() => setShowDataFileModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="data-type-toggle">
                <button
                  type="button"
                  className={`type-btn ${dataFileType === 'csv' ? 'is-active' : ''}`}
                  onClick={() => setDataFileType('csv')}
                >
                  CSV Format
                </button>
                <button
                  type="button"
                  className={`type-btn ${dataFileType === 'json' ? 'is-active' : ''}`}
                  onClick={() => setDataFileType('json')}
                >
                  JSON Format
                </button>
              </div>
              <textarea
                className="data-textarea"
                placeholder={
                  dataFileType === 'csv'
                    ? 'username,token,expectedRole\nalice,tok_123,admin\nbob,tok_456,user'
                    : '[\n  { "username": "alice", "token": "tok_123" },\n  { "username": "bob", "token": "tok_456" }\n]'
                }
                value={dataFileContent}
                onChange={e => setDataFileContent(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="studio-btn studio-btn-ghost" onClick={() => setShowDataFileModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="studio-btn studio-btn-primary"
                onClick={() => setShowDataFileModal(false)}
              >
                Attach Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
