import React, { useState } from 'react';
import {
  Send,
  Save,
  Square,
  Copy,
  Plus,
  Trash2,
  Code,
  Sparkles,
  Shield,
  Key,
  Sliders,
  Check,
  ChevronDown
} from 'lucide-react';
import type {
  ApiTestRequestPayload,
  ApiTestKeyValuePair,
  ApiTestAuthConfig
} from '../../types';

interface RequestEditorProps {
  request: ApiTestRequestPayload;
  isExecuting: boolean;
  onExecute: () => void;
  onCancel: () => void;
  onSave: () => void;
  onChange: (updated: ApiTestRequestPayload) => void;
  onExportCurl: () => void;
}

export const RequestEditor: React.FC<RequestEditorProps> = ({
  request,
  isExecuting,
  onExecute,
  onCancel,
  onSave,
  onChange,
  onExportCurl
}) => {
  const [activeTab, setActiveTab] = useState<'params' | 'auth' | 'headers' | 'body' | 'scripts' | 'tests' | 'settings'>('params');
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [protocol, setProtocol] = useState<'https://' | 'http://'>('https://');

  const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

  const updateField = <K extends keyof ApiTestRequestPayload>(field: K, value: ApiTestRequestPayload[K]) => {
    onChange({ ...request, [field]: value });
  };

  // Determine current protocol and URL path without protocol
  let urlDisplayValue = request.url || '';
  let activeProtocol = protocol;
  if (urlDisplayValue.startsWith('https://')) {
    activeProtocol = 'https://';
    urlDisplayValue = urlDisplayValue.slice(8);
  } else if (urlDisplayValue.startsWith('http://')) {
    activeProtocol = 'http://';
    urlDisplayValue = urlDisplayValue.slice(7);
  }

  const handleUrlInputChange = (rawValue: string) => {
    let clean = rawValue.trim();
    let newProto = activeProtocol;

    // Auto-strip pasted protocols
    if (clean.toLowerCase().startsWith('https://')) {
      newProto = 'https://';
      clean = clean.slice(8);
    } else if (clean.toLowerCase().startsWith('http://')) {
      newProto = 'http://';
      clean = clean.slice(7);
    }

    setProtocol(newProto);
    const finalUrl = clean ? `${newProto}${clean}` : '';
    updateField('url', finalUrl);
  };

  const handleToggleProtocol = () => {
    const nextProto = activeProtocol === 'https://' ? 'http://' : 'https://';
    setProtocol(nextProto);
    if (urlDisplayValue) {
      updateField('url', `${nextProto}${urlDisplayValue}`);
    }
  };

  const handleCopyCurl = () => {
    onExportCurl();
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  // Key-Value Rows Helpers
  const addParam = () => {
    const params = [...(request.params || [])];
    params.push({ id: Math.random().toString(), key: '', value: '', enabled: true });
    updateField('params', params);
  };

  const updateParam = (idx: number, patch: Partial<ApiTestKeyValuePair>) => {
    const params = [...(request.params || [])];
    params[idx] = { ...params[idx], ...patch };
    updateField('params', params);
  };

  const removeParam = (idx: number) => {
    const params = [...(request.params || [])];
    params.splice(idx, 1);
    updateField('params', params);
  };

  const addHeader = () => {
    const headers = [...(request.headers || [])];
    headers.push({ id: Math.random().toString(), key: '', value: '', enabled: true });
    updateField('headers', headers);
  };

  const updateHeader = (idx: number, patch: Partial<ApiTestKeyValuePair>) => {
    const headers = [...(request.headers || [])];
    headers[idx] = { ...headers[idx], ...patch };
    updateField('headers', headers);
  };

  const removeHeader = (idx: number) => {
    const headers = [...(request.headers || [])];
    headers.splice(idx, 1);
    updateField('headers', headers);
  };

  const formatJsonBody = () => {
    if (!request.bodyContent) return;
    try {
      const parsed = JSON.parse(request.bodyContent);
      updateField('bodyContent', JSON.stringify(parsed, null, 2));
    } catch {
      // Keep as-is if invalid JSON
    }
  };

  const insertSnippet = (snippet: string, field: 'preRequestScript' | 'testScript') => {
    const current = request[field] || '';
    const updated = current ? `${current}\n\n${snippet}` : snippet;
    updateField(field, updated);
  };

  return (
    <div className="request-editor">
      {/* URL & Method Toolbar */}
      <div className="request-url-bar">
        <div className="method-select-wrap">
          <select
            className={`method-select method-${request.method.toLowerCase()}`}
            value={request.method}
            onChange={e => updateField('method', e.target.value)}
          >
            {HTTP_METHODS.map(m => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="method-chevron-icon" />
        </div>

        <div className="url-input-container">
          <button
            type="button"
            className="url-protocol-badge"
            onClick={handleToggleProtocol}
            title="Click to toggle HTTPS / HTTP"
          >
            {activeProtocol}
          </button>
          <input
            type="text"
            className="url-input"
            placeholder="api.example.com/v1/resource or {{baseUrl}}/api"
            value={urlDisplayValue}
            onChange={e => handleUrlInputChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                onExecute();
              }
            }}
          />
        </div>

        {isExecuting ? (
          <button type="button" className="action-btn cancel-btn" onClick={onCancel}>
            <Square size={14} />
            <span>Cancel</span>
          </button>
        ) : (
          <button type="button" className="action-btn send-btn" onClick={onExecute}>
            <Send size={14} />
            <span>Send</span>
          </button>
        )}

        <button type="button" className="action-btn save-btn" onClick={onSave} title="Save Request (Ctrl+S)">
          <Save size={14} />
          <span>Save</span>
        </button>

        <button
          type="button"
          className="action-btn ghost-btn"
          onClick={handleCopyCurl}
          title="Copy as cURL"
        >
          {copiedCurl ? <Check size={14} /> : <Copy size={14} />}
          <span>{copiedCurl ? 'Copied' : 'cURL'}</span>
        </button>
      </div>

      {/* Configuration Tabs Bar */}
      <div className="request-config-tabs">
        <button
          type="button"
          className={`config-tab-btn ${activeTab === 'params' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('params')}
        >
          <span>Params</span>
          {request.params?.filter(p => p.enabled && p.key).length > 0 && (
            <span className="tab-count">{request.params.filter(p => p.enabled && p.key).length}</span>
          )}
        </button>

        <button
          type="button"
          className={`config-tab-btn ${activeTab === 'auth' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('auth')}
        >
          <span>Authorization</span>
          {request.auth?.type !== 'none' && request.auth?.type !== 'inherit' && (
            <span className="tab-indicator" />
          )}
        </button>

        <button
          type="button"
          className={`config-tab-btn ${activeTab === 'headers' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('headers')}
        >
          <span>Headers</span>
          {request.headers?.filter(h => h.enabled && h.key).length > 0 && (
            <span className="tab-count">{request.headers.filter(h => h.enabled && h.key).length}</span>
          )}
        </button>

        <button
          type="button"
          className={`config-tab-btn ${activeTab === 'body' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('body')}
        >
          <span>Body</span>
          {request.bodyType !== 'none' && <span className="tab-indicator" />}
        </button>

        <button
          type="button"
          className={`config-tab-btn ${activeTab === 'scripts' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('scripts')}
        >
          <span>Pre-request</span>
          {request.preRequestScript && <span className="tab-indicator" />}
        </button>

        <button
          type="button"
          className={`config-tab-btn ${activeTab === 'tests' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('tests')}
        >
          <span>Tests</span>
          {request.testScript && <span className="tab-indicator" />}
        </button>

        <button
          type="button"
          className={`config-tab-btn ${activeTab === 'settings' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <span>Settings</span>
        </button>
      </div>

      {/* Config Panels */}
      <div className="request-tab-body">
        {/* PARAMS */}
        {activeTab === 'params' && (
          <div className="kv-editor">
            <div className="kv-table-header">
              <span className="col-check" />
              <span className="col-key">KEY</span>
              <span className="col-val">VALUE</span>
              <span className="col-desc">DESCRIPTION</span>
              <span className="col-actions" />
            </div>

            {(request.params || []).map((p, idx) => (
              <div key={p.id || idx} className="kv-row">
                <input
                  type="checkbox"
                  className="kv-checkbox"
                  checked={p.enabled}
                  onChange={e => updateParam(idx, { enabled: e.target.checked })}
                />
                <input
                  type="text"
                  className="kv-input"
                  placeholder="Key"
                  value={p.key}
                  onChange={e => updateParam(idx, { key: e.target.value })}
                />
                <input
                  type="text"
                  className="kv-input"
                  placeholder="Value or {{variable}}"
                  value={p.value}
                  onChange={e => updateParam(idx, { value: e.target.value })}
                />
                <input
                  type="text"
                  className="kv-input"
                  placeholder="Description"
                  value={p.description || ''}
                  onChange={e => updateParam(idx, { description: e.target.value })}
                />
                <button
                  type="button"
                  className="kv-del-btn"
                  onClick={() => removeParam(idx)}
                  title="Remove Parameter"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            <button type="button" className="studio-btn studio-btn-ghost kv-add-btn" onClick={addParam}>
              <Plus size={13} />
              <span>Add Parameter</span>
            </button>
          </div>
        )}

        {/* AUTH */}
        {activeTab === 'auth' && (
          <div className="auth-editor">
            <div className="auth-type-row">
              <label>Type:</label>
              <select
                className="studio-select"
                value={request.auth?.type || 'inherit'}
                onChange={e => {
                  const type = e.target.value as ApiTestAuthConfig['type'];
                  updateField('auth', { ...request.auth, type });
                }}
              >
                <option value="inherit">Inherit auth from parent</option>
                <option value="none">No Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
                <option value="apikey">API Key</option>
                <option value="oauth2">OAuth 2.0</option>
              </select>
            </div>

            {request.auth?.type === 'bearer' && (
              <div className="auth-form">
                <div className="auth-field">
                  <label>Token:</label>
                  <input
                    type="password"
                    className="studio-input"
                    placeholder="Bearer token or {{token}}"
                    value={request.auth.bearer?.token || ''}
                    onChange={e =>
                      updateField('auth', {
                        ...request.auth,
                        bearer: { ...request.auth.bearer, token: e.target.value }
                      })
                    }
                  />
                </div>
              </div>
            )}

            {request.auth?.type === 'basic' && (
              <div className="auth-form">
                <div className="auth-field">
                  <label>Username:</label>
                  <input
                    type="text"
                    className="studio-input"
                    placeholder="Username or {{user}}"
                    value={request.auth.basic?.username || ''}
                    onChange={e =>
                      updateField('auth', {
                        ...request.auth,
                        basic: { ...request.auth.basic, username: e.target.value }
                      })
                    }
                  />
                </div>
                <div className="auth-field">
                  <label>Password:</label>
                  <input
                    type="password"
                    className="studio-input"
                    placeholder="Password"
                    value={request.auth.basic?.password || ''}
                    onChange={e =>
                      updateField('auth', {
                        ...request.auth,
                        basic: { ...request.auth.basic, password: e.target.value }
                      })
                    }
                  />
                </div>
              </div>
            )}

            {request.auth?.type === 'apikey' && (
              <div className="auth-form">
                <div className="auth-field">
                  <label>Key:</label>
                  <input
                    type="text"
                    className="studio-input"
                    placeholder="e.g. X-API-Key"
                    value={request.auth.apiKey?.key || ''}
                    onChange={e =>
                      updateField('auth', {
                        ...request.auth,
                        apiKey: {
                          key: e.target.value,
                          value: request.auth.apiKey?.value || '',
                          in: request.auth.apiKey?.in || 'header'
                        }
                      })
                    }
                  />
                </div>
                <div className="auth-field">
                  <label>Value:</label>
                  <input
                    type="password"
                    className="studio-input"
                    placeholder="API key value or {{apiKey}}"
                    value={request.auth.apiKey?.value || ''}
                    onChange={e =>
                      updateField('auth', {
                        ...request.auth,
                        apiKey: {
                          key: request.auth.apiKey?.key || '',
                          value: e.target.value,
                          in: request.auth.apiKey?.in || 'header'
                        }
                      })
                    }
                  />
                </div>
                <div className="auth-field">
                  <label>Add to:</label>
                  <select
                    className="studio-select"
                    value={request.auth.apiKey?.in || 'header'}
                    onChange={e =>
                      updateField('auth', {
                        ...request.auth,
                        apiKey: {
                          key: request.auth.apiKey?.key || '',
                          value: request.auth.apiKey?.value || '',
                          in: e.target.value as 'header' | 'query'
                        }
                      })
                    }
                  >
                    <option value="header">Header</option>
                    <option value="query">Query Params</option>
                  </select>
                </div>
              </div>
            )}

            {request.auth?.type === 'oauth2' && (
              <div className="auth-form">
                <div className="auth-field">
                  <label>Access Token:</label>
                  <input
                    type="password"
                    className="studio-input"
                    placeholder="OAuth 2.0 Access Token or {{oauthToken}}"
                    value={request.auth.oauth2?.accessToken || ''}
                    onChange={e =>
                      updateField('auth', {
                        ...request.auth,
                        oauth2: { ...request.auth.oauth2, accessToken: e.target.value, grantType: request.auth.oauth2?.grantType || 'authorization_code' }
                      })
                    }
                  />
                </div>
              </div>
            )}

            {(request.auth?.type === 'none' || request.auth?.type === 'inherit') && (
              <div className="auth-info-note">
                {request.auth?.type === 'inherit'
                  ? 'This request inherits authentication configuration from its parent collection or folder.'
                  : 'This request will be sent without authentication headers.'}
              </div>
            )}
          </div>
        )}

        {/* HEADERS */}
        {activeTab === 'headers' && (
          <div className="kv-editor">
            <div className="kv-table-header">
              <span className="col-check" />
              <span className="col-key">HEADER</span>
              <span className="col-val">VALUE</span>
              <span className="col-desc">DESCRIPTION</span>
              <span className="col-actions" />
            </div>

            {(request.headers || []).map((h, idx) => (
              <div key={h.id || idx} className="kv-row">
                <input
                  type="checkbox"
                  className="kv-checkbox"
                  checked={h.enabled}
                  onChange={e => updateHeader(idx, { enabled: e.target.checked })}
                />
                <input
                  type="text"
                  className="kv-input"
                  placeholder="Header Name"
                  value={h.key}
                  onChange={e => updateHeader(idx, { key: e.target.value })}
                />
                <input
                  type="text"
                  className="kv-input"
                  placeholder="Value or {{variable}}"
                  value={h.value}
                  onChange={e => updateHeader(idx, { value: e.target.value })}
                />
                <input
                  type="text"
                  className="kv-input"
                  placeholder="Description"
                  value={h.description || ''}
                  onChange={e => updateHeader(idx, { description: e.target.value })}
                />
                <button
                  type="button"
                  className="kv-del-btn"
                  onClick={() => removeHeader(idx)}
                  title="Remove Header"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            <button type="button" className="studio-btn studio-btn-ghost kv-add-btn" onClick={addHeader}>
              <Plus size={13} />
              <span>Add Header</span>
            </button>
          </div>
        )}

        {/* BODY */}
        {activeTab === 'body' && (
          <div className="body-editor">
            <div className="body-type-bar">
              {(['none', 'json', 'raw', 'urlencoded'] as const).map(type => (
                <label key={type} className="body-type-option">
                  <input
                    type="radio"
                    name="bodyType"
                    value={type}
                    checked={request.bodyType === type}
                    onChange={() => updateField('bodyType', type)}
                  />
                  <span>{type.toUpperCase()}</span>
                </label>
              ))}

              {request.bodyType === 'json' && (
                <button type="button" className="studio-btn studio-btn-ghost format-btn" onClick={formatJsonBody}>
                  <Code size={13} />
                  <span>Format JSON</span>
                </button>
              )}
            </div>

            {request.bodyType !== 'none' ? (
              <textarea
                className="body-textarea"
                placeholder={
                  request.bodyType === 'json'
                    ? '{\n  "key": "value"\n}'
                    : 'Enter raw request body content...'
                }
                value={request.bodyContent || ''}
                onChange={e => updateField('bodyContent', e.target.value)}
              />
            ) : (
              <div className="body-none-notice">
                <span>This request does not have a body payload.</span>
              </div>
            )}
          </div>
        )}

        {/* PRE-REQUEST SCRIPT */}
        {activeTab === 'scripts' && (
          <div className="script-editor-wrap">
            <div className="script-sidebar">
              <span className="snippet-title">SNIPPETS</span>
              <button
                type="button"
                className="snippet-btn"
                onClick={() =>
                  insertSnippet('pm.environment.set("token", "secret123");', 'preRequestScript')
                }
              >
                + Set environment variable
              </button>
              <button
                type="button"
                className="snippet-btn"
                onClick={() =>
                  insertSnippet('pm.variables.set("timestamp", Math.floor(Date.now() / 1000));', 'preRequestScript')
                }
              >
                + Generate Unix timestamp
              </button>
              <button
                type="button"
                className="snippet-btn"
                onClick={() =>
                  insertSnippet('console.log("Preparing request to:", pm.request.url);', 'preRequestScript')
                }
              >
                + Log request URL
              </button>
            </div>
            <textarea
              className="script-textarea"
              placeholder="// Pre-request JavaScript executed in isolated sandbox&#10;pm.variables.set('ts', Date.now());"
              value={request.preRequestScript || ''}
              onChange={e => updateField('preRequestScript', e.target.value)}
            />
          </div>
        )}

        {/* TESTS */}
        {activeTab === 'tests' && (
          <div className="script-editor-wrap">
            <div className="script-sidebar">
              <span className="snippet-title">ASSERTION SNIPPETS</span>
              <button
                type="button"
                className="snippet-btn"
                onClick={() =>
                  insertSnippet(
                    'pm.test("Status code is 200", function () {\n    pm.response.to.have.status(200);\n});',
                    'testScript'
                  )
                }
              >
                + Status: Code is 200
              </button>
              <button
                type="button"
                className="snippet-btn"
                onClick={() =>
                  insertSnippet(
                    'pm.test("Response time is less than 500ms", function () {\n    pm.expect(pm.response.responseTime).to.be.below(500);\n});',
                    'testScript'
                  )
                }
              >
                + Response time &lt; 500ms
              </button>
              <button
                type="button"
                className="snippet-btn"
                onClick={() =>
                  insertSnippet(
                    'pm.test("Response body contains property", function () {\n    const jsonData = pm.response.json();\n    pm.expect(jsonData).to.have.property("id");\n});',
                    'testScript'
                  )
                }
              >
                + JSON property exists
              </button>
              <button
                type="button"
                className="snippet-btn"
                onClick={() =>
                  insertSnippet(
                    'const data = pm.response.json();\npm.environment.set("savedId", data.id);',
                    'testScript'
                  )
                }
              >
                + Extract value to environment
              </button>
            </div>
            <textarea
              className="script-textarea"
              placeholder="// Post-response test assertions&#10;pm.test('Status is 200', () => {&#10;  pm.response.to.have.status(200);&#10;});"
              value={request.testScript || ''}
              onChange={e => updateField('testScript', e.target.value)}
            />
          </div>
        )}

        {/* SETTINGS */}
        {activeTab === 'settings' && (
          <div className="settings-panel">
            <div className="setting-row">
              <label>Request Timeout (ms):</label>
              <input
                type="number"
                className="studio-input"
                placeholder="30000"
                value={request.settings?.timeoutMs || 30000}
                onChange={e =>
                  updateField('settings', {
                    ...request.settings,
                    timeoutMs: parseInt(e.target.value, 10) || 30000
                  })
                }
              />
            </div>
            <div className="setting-row-check">
              <input
                type="checkbox"
                id="followRedirects"
                checked={request.settings?.followRedirects ?? true}
                onChange={e =>
                  updateField('settings', {
                    ...request.settings,
                    followRedirects: e.target.checked
                  })
                }
              />
              <label htmlFor="followRedirects">Follow HTTP Redirects (3xx)</label>
            </div>
            <div className="setting-row-check">
              <input
                type="checkbox"
                id="rejectUnauthorized"
                checked={request.settings?.rejectUnauthorized ?? true}
                onChange={e =>
                  updateField('settings', {
                    ...request.settings,
                    rejectUnauthorized: e.target.checked
                  })
                }
              />
              <label htmlFor="rejectUnauthorized">Validate TLS Certificates (Disable for self-signed in local dev)</label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
