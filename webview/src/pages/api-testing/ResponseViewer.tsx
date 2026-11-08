import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Copy,
  Clock,
  HardDrive,
  Check,
  AlertCircle,
  Layers,
  Activity
} from 'lucide-react';
import type { ApiTestExecutionResult } from '../../types';

interface ResponseViewerProps {
  result: ApiTestExecutionResult | null;
  isExecuting: boolean;
}

export const ResponseViewer: React.FC<ResponseViewerProps> = ({ result, isExecuting }) => {
  const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'cookies' | 'tests' | 'timeline'>('body');
  const [bodyMode, setBodyMode] = useState<'pretty' | 'raw'>('pretty');
  const [copied, setCopied] = useState(false);

  if (isExecuting) {
    return (
      <div className="response-viewer response-loading">
        <Activity size={24} className="spin-icon" />
        <span className="loading-text">Sending request and awaiting response...</span>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="response-viewer response-empty">
        <Activity size={32} className="empty-icon" />
        <div className="empty-title">Response Workspace</div>
        <div className="empty-desc">Click Send to execute the request and inspect the response payload, headers, cookies, and test assertions.</div>
      </div>
    );
  }

  const isSuccess = result.statusCode >= 200 && result.statusCode < 300;
  const isError = result.statusCode >= 400 || result.statusCode === 0;

  const handleCopyBody = () => {
    navigator.clipboard.writeText(result.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatBody = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  };

  const isPayloadLarge = result.responseSizeBytes > 2 * 1024 * 1024;
  const displayBody = bodyMode === 'pretty' && !isPayloadLarge ? formatBody(result.body) : result.body;

  const passedTests = result.testResults.filter(t => t.passed).length;
  const failedTests = result.testResults.filter(t => !t.passed).length;

  return (
    <div className="response-viewer">
      {/* Response Summary Header */}
      <div className="response-summary-bar">
        <div className="summary-left">
          <span
            className={`status-pill ${
              isSuccess ? 'status-pill-success' : isError ? 'status-pill-error' : 'status-pill-warn'
            }`}
          >
            {result.statusCode || 'ERR'} {result.statusText}
          </span>

          <span className="summary-metric">
            <Clock size={13} />
            <span>{Math.round(result.durationMs)} ms</span>
          </span>

          <span className="summary-metric">
            <HardDrive size={13} />
            <span>
              {result.responseSizeBytes > 1024 * 1024
                ? `${(result.responseSizeBytes / 1024 / 1024).toFixed(2)} MB`
                : `${(result.responseSizeBytes / 1024).toFixed(1)} KB`}
            </span>
          </span>
        </div>

        <div className="summary-right">
          <button
            type="button"
            className="copy-btn"
            onClick={handleCopyBody}
            title="Copy Response Body"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Response Navigation Tabs */}
      <div className="response-nav-tabs">
        <button
          type="button"
          className={`res-tab-btn ${activeTab === 'body' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('body')}
        >
          <span>Body</span>
        </button>

        <button
          type="button"
          className={`res-tab-btn ${activeTab === 'headers' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('headers')}
        >
          <span>Headers</span>
          <span className="tab-count">{Object.keys(result.headers || {}).length}</span>
        </button>

        <button
          type="button"
          className={`res-tab-btn ${activeTab === 'cookies' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('cookies')}
        >
          <span>Cookies</span>
          {result.cookies?.length > 0 && <span className="tab-count">{result.cookies.length}</span>}
        </button>

        <button
          type="button"
          className={`res-tab-btn ${activeTab === 'tests' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('tests')}
        >
          <span>Test Results</span>
          {result.testResults.length > 0 && (
            <span className={`tab-count ${failedTests > 0 ? 'has-failures' : 'all-passed'}`}>
              {passedTests}/{result.testResults.length}
            </span>
          )}
        </button>

        <button
          type="button"
          className={`res-tab-btn ${activeTab === 'timeline' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          <span>Timeline</span>
        </button>
      </div>

      {/* Response Body Content */}
      <div className="response-content-area">
        {activeTab === 'body' && (
          <div className="response-body-view">
            <div className="body-subbar">
              <div className="mode-toggle">
                <button
                  type="button"
                  className={`mode-btn ${bodyMode === 'pretty' ? 'is-active' : ''}`}
                  onClick={() => setBodyMode('pretty')}
                  disabled={isPayloadLarge}
                >
                  Pretty
                </button>
                <button
                  type="button"
                  className={`mode-btn ${bodyMode === 'raw' ? 'is-active' : ''}`}
                  onClick={() => setBodyMode('raw')}
                >
                  Raw
                </button>
              </div>

              {isPayloadLarge && (
                <div className="payload-warning">
                  <AlertCircle size={13} />
                  <span>Payload is large (&gt;2MB). Formatted view disabled for UI performance.</span>
                </div>
              )}
            </div>

            {result.error && (
              <div className="response-error-banner">
                <AlertCircle size={15} />
                <span>{result.error}</span>
              </div>
            )}

            <pre className="response-body-pre">
              <code>{displayBody || '(Empty response body)'}</code>
            </pre>
          </div>
        )}

        {/* Response Headers */}
        {activeTab === 'headers' && (
          <div className="response-table-view">
            <div className="res-table-header">
              <span className="col-name">HEADER</span>
              <span className="col-value">VALUE</span>
            </div>
            {Object.entries(result.headers || {}).map(([key, val]) => (
              <div key={key} className="res-table-row">
                <span className="header-name">{key}</span>
                <span className="header-value">{val}</span>
              </div>
            ))}
          </div>
        )}

        {/* Response Cookies */}
        {activeTab === 'cookies' && (
          <div className="response-table-view">
            <div className="res-table-header">
              <span className="col-name">COOKIE NAME</span>
              <span className="col-value">VALUE</span>
              <span className="col-domain">DOMAIN</span>
              <span className="col-path">PATH</span>
            </div>
            {result.cookies?.length === 0 ? (
              <div className="table-empty-notice">No cookies set or sent with this response.</div>
            ) : (
              result.cookies.map((c, idx) => (
                <div key={idx} className="res-table-row">
                  <span className="cookie-name">{c.name}</span>
                  <span className="cookie-val">{c.value}</span>
                  <span className="cookie-domain">{c.domain || '/'}</span>
                  <span className="cookie-path">{c.path || '/'}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Test Results */}
        {activeTab === 'tests' && (
          <div className="response-tests-view">
            <div className="tests-summary-bar">
              <span className="test-badge pass-badge">
                <CheckCircle2 size={13} />
                <span>{passedTests} Passed</span>
              </span>
              <span className="test-badge fail-badge">
                <XCircle size={13} />
                <span>{failedTests} Failed</span>
              </span>
            </div>

            {result.testResults.length === 0 ? (
              <div className="table-empty-notice">
                No test assertions were executed. Add test assertions in the "Tests" tab of the request editor.
              </div>
            ) : (
              <div className="test-items-list">
                {result.testResults.map((t, idx) => (
                  <div key={idx} className={`test-result-row ${t.passed ? 'is-pass' : 'is-fail'}`}>
                    <div className="test-status-icon">
                      {t.passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                    </div>
                    <div className="test-details">
                      <div className="test-name">{t.name}</div>
                      {t.errorMessage && <div className="test-error-msg">{t.errorMessage}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Network Timeline */}
        {activeTab === 'timeline' && (
          <div className="response-timeline-view">
            <div className="timeline-title">Real Network Socket Measurements</div>
            <div className="timeline-breakdown">
              <div className="timeline-row">
                <span className="stage-name">DNS Resolution:</span>
                <span className="stage-val">{result.timing.dnsMs} ms</span>
              </div>
              <div className="timeline-row">
                <span className="stage-name">TCP Connection:</span>
                <span className="stage-val">{result.timing.tcpMs} ms</span>
              </div>
              {result.timing.tlsMs > 0 && (
                <div className="timeline-row">
                  <span className="stage-name">TLS Handshake:</span>
                  <span className="stage-val">{result.timing.tlsMs} ms</span>
                </div>
              )}
              <div className="timeline-row">
                <span className="stage-name">Time to First Byte (TTFB):</span>
                <span className="stage-val">{result.timing.ttfbMs} ms</span>
              </div>
              <div className="timeline-row">
                <span className="stage-name">Content Download:</span>
                <span className="stage-val">{result.timing.downloadMs} ms</span>
              </div>
              <div className="timeline-row total-row">
                <span className="stage-name">Total Request Duration:</span>
                <span className="stage-val">{result.timing.totalMs} ms</span>
              </div>
            </div>
            {result.timing.socketReused && (
              <div className="reused-socket-note">
                ⚡ Socket was reused from connection pool (DNS & TCP handshakes bypassed).
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
