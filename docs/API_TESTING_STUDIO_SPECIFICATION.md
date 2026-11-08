# DEVPULSE API TESTING STUDIO SPECIFICATION
## Independent Service Implementation | Production-Grade API Testing Platform

**Document Version:** 2.0.0 (Post-EGM Swarm Audit Approved)  
**Target Release:** DevPulse v0.5.0  
**Authors:** DevPulse Core Engineering & EGM Architecture Swarm  
**Review Status:** Approved by Architecture, Security, Implementation Readiness, and Codebase Quality Goldfish Reviewers  

---

## 1. Executive Summary & Architectural Isolation

### 1.1 Objective & Service Boundary
DevPulse **API Testing Studio** is an independent, production-grade, local-first API client, development, and automated testing platform embedded within the DevPulse VS Code extension. It provides complete feature parity with core capabilities of Postman, Insomnia, and Bruno, enabling developers to build, test, automate, and debug HTTP APIs directly inside their IDE.

### 1.2 Strict Separation: API Testing Studio vs. API Intelligence
A fundamental architectural boundary is maintained:
- **API Testing Studio** is an **active API client and testing platform**. It originates requests, manages collections, environments, secrets, scripts, test assertions, and collection runner execution. It requires **zero** instrumentation, zero middlewares, and zero service registrations in the target application.
- **API Intelligence** is a **passive API observability and monitoring platform**. It receives and analyzes telemetry ingested from instrumented backend services running in development or staging.
- **Optional Coupling Only**: When the user explicitly toggles *"Log Test Runs to API Intelligence"* (`devpulse.apiTesting.logToApiIntelligence`) in Settings, the Request Executor dispatches an opt-in telemetry payload flagged with `source: 'api_testing_studio'`, which API Intelligence records and marks so manual testing traffic is never conflated with normal application traffic. Neither module imports internal classes of the other.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        DEVPULSE EXTENSION HOST                         │
├───────────────────────────────────┬────────────────────────────────────┤
│       API TESTING STUDIO          │          API INTELLIGENCE          │
│   (Active Client & Test Suite)    │    (Passive Observability Platform)│
│                                   │                                    │
│  - Request Builder & Tabs         │  - HTTP Ingestion Server           │
│  - Collections & Folders          │  - Service Token Auth              │
│  - Environment & SecretStorage    │  - Latency Percentiles (P50/P95)   │
│  - Sandboxed Worker Scripting     │  - Error Categorization            │
│  - Node HTTP Request Executor     │  - Middleware Telemetry (/events)  │
│  - In-Memory Cookie Jar           │                                    │
│  - Test Assertion Runner          │                                    │
│  - Postman / OpenAPI / cURL I/O   │                                    │
├───────────────────────────────────┴────────────────────────────────────┤
│       OPTIONAL BRIDGE: Test telemetry with source='api_testing_studio' │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Request Execution Lifecycle & Network Architecture

### 2.1 Extension Host Execution Guarantee
**Security Invariant:** The React webview is completely untrusted for network operations. The webview **never** executes `fetch`, `XMLHttpRequest`, or opens sockets to user targets directly. This prevents Cross-Origin Resource Sharing (CORS) failures, avoids exposing sensitive credentials in the webview context, and shields the renderer from memory exhaustion.

### 2.2 Execution Lifecycle Flow
The end-to-end execution lifecycle follows an 8-stage pipeline:

```text
[Webview UI]
     │ 1. SEND_REQUEST (active tab, unsaved edits, env overrides)
     ▼
[IPC Bridge & Message Validator]
     │ 2. Validated WebviewToExtensionMessage (checked against whitelist)
     ▼
[Variable Interpolator & Secret Resolver]
     │ 3. Resolve {{baseUrl}}, decrypt secrets from VS Code SecretStorage
     ▼
[Pre-Request Script Worker Sandbox]
     │ 4. Run pm.variables.set(), timestamps, hashes, HMAC via Worker Thread
     ▼
[Security & Network Policy Validator]
     │ 5. Validate protocol (http/https), DNS pre-lookup SSRF checks
     ▼
[Node.js HTTP/HTTPS Request Executor & Cookie Jar]
     │ 6. Streaming chunk transfer, socket timing capture (DNS/TCP/TLS/TTFB)
     │    Supports user cancellation via AbortController & redirect validation
     ▼
[Post-Response Script & Test Engine]
     │ 7. Run pm.test(), assertions, response extraction in Worker Sandbox
     ▼
[Persistence & Webview Dispatch]
     │ 8. Record sanitized history (masked secrets), emit REQUEST_RESULT
```

### 2.3 Network Engine Specifications & SSRF Hardening
- **Transport**: Native Node.js `http` and `https` agents with configurable keep-alive, custom certificate handling (support self-signed certs in local dev when configured), and redirect following (up to 10 hops by default, configurable).
- **Socket Timing Instrumentation**:
  - `start`: Request initiated.
  - `dns`: `lookup` event on socket (DNS resolution duration).
  - `tcp`: `connect` event on socket (TCP handshake duration).
  - `tls`: `secureConnect` event (TLS negotiation duration, HTTPS only).
  - `ttfb`: Time to first byte received on response stream.
  - `download`: End of response payload stream.
  - `total`: End-to-end wall clock duration.
  - *No timing values are fabricated.* If a cached socket is reused, DNS and TCP are reported as 0 ms with a `socketReused: true` flag.
- **SSRF Mitigations**:
  - Implement custom DNS `lookup` hook in HTTP/HTTPS agent.
  - Evaluates resolved IP addresses: Blocks link-local metadata endpoints (`169.254.0.0/16`, `fd00:ec2::/64`, `metadata.google.internal`, and non-canonical decimal/octal equivalents).
  - Permits localhost and RFC 1918 private IP addresses (`127.0.0.1`, `localhost`, `::1`, `192.168.0.0/16`, `10.0.0.0/8`, `172.16.0.0/12`) to support standard local development workflows.
  - **Redirect Re-Validation**: Re-evaluates target URL and resolved IP on every redirect hop before following `Location` headers.
  - Whitelist allowed protocols strictly to `http:` and `https:`.
- **In-Memory Cookie Jar**:
  - Maintains an isolated in-memory Cookie Jar per environment.
  - Parses `Set-Cookie` headers and automatically attaches matching `Cookie` headers to subsequent requests.
  - Provides a toggle to enable/disable cookie sending and an action to clear jar cookies.
- **Resource Bounds & Streaming**:
  - Maximum response body size buffered in memory: 20 MB (configurable up to 100 MB). If exceeded, the stream is halted with a clear error payload (`413 Response Exceeded Studio Buffer Limit`).
  - Binary file downloads are streamed directly to disk via `vscode.window.showSaveDialog` without loading into the webview heap.
- **Cancellation**: Every execution is tied to a unique `executionId` and an `AbortController`. The cancellation manager calls `abort()`, immediately destroying the underlying socket.

---

## 3. Sandboxed Scripting & Automated Test Assertion Engine

### 3.1 Worker Thread Sandbox Architecture
To eliminate prototype pollution escapes (`this.constructor.constructor('return process')()`) and prevent infinite microtask event loop freezes from starving the Extension Host:
- **Engine**: Scripts execute inside a dedicated `node:worker_threads` Worker.
- **Watchdog Protection**: The host maintains an external watchdog timer (`devpulse.apiTesting.scriptTimeoutMs`, default 1,500 ms). If the script fails to resolve or attempts an infinite microtask chain (`Promise.resolve().then(...)`), the host immediately calls `worker.terminate()`, killing the thread with zero impact on the extension host.
- **Isolated Context**: The worker operates on an isolated realm with zero access to `process`, `require`, `fs`, `net`, `child_process`, or VS Code APIs. Data is passed strictly via JSON-serializable structured clone messages.
- **Safe Utilities Injected**:
  - `console.log`, `console.warn`, `console.error` (captured and piped to Studio Script Logs).
  - `crypto` utilities: SHA-1, SHA-256, MD5, Base64 encode/decode, UUID generation.
  - Standard primitives: `JSON`, `Math`, `Date`, `parseInt`, `RegExp`, `Array`, `Object`, `Number`, `String`.

### 3.2 Postman Compatibility Layer (`pm.*`)
The sandbox provides a comprehensive `pm` object compatible with standard Postman syntax:
```javascript
// Environment and Variable Access (In-memory session updates)
pm.environment.get(key)
pm.environment.set(key, value)
pm.environment.unset(key)
pm.variables.get(key)
pm.variables.set(key, value)
pm.globals.get(key)
pm.globals.set(key, value)

// Request & Response Context
pm.request.url
pm.request.method
pm.request.headers.get(name)
pm.response.code
pm.response.status
pm.response.headers.get(name)
pm.response.json()
pm.response.text()
pm.response.responseTime

// Test Framework
pm.test(testName, testFn)
pm.expect(actual).to.equal(expected)
pm.expect(actual).to.be.a('string' | 'number' | 'boolean' | 'object' | 'array')
pm.expect(actual).to.have.property(prop)
pm.expect(actual).to.include(val)
pm.expect(pm.response.code).to.equal(200)
pm.response.to.have.status(code)
```

---

## 4. Data Models, Database Schema & Lifecycle Segregation

### 4.1 Secret Management via VS Code SecretStorage
**Strict Rule**: No plain passwords, bearer tokens, client secrets, or private API keys are ever stored in SQLite table columns.
- All secrets are persisted using `vscode.ExtensionContext.secrets` with keys formatted as `devpulse.api_testing.secret.<uuid>`.
- In `api_test_variables`, when `is_secret = 1`, `initial_value` and `current_value` are stored as empty strings or `[MASKED]`, referencing `secret_ref = "devpulse.api_testing.secret.<uuid>"`.
- In `auth_config_json`, credentials/tokens/client secrets are stored as `{"secret_ref": "devpulse.api_testing.secret.<uuid>"}` references.
- **Secret Cleanup Service**: When collections, requests, or variables are deleted, orphaned UUIDs in `SecretStorage` are explicitly purged.
- **Webview Masking Protocol**: The webview receives `{ isSecret: true, hasValue: true, currentValue: '' }`. To inspect, an explicit `API_TEST_REVEAL_SECRET` action retrieves the plaintext temporarily on-demand.

### 4.2 Lifecycle Segregation (`devpulse.resetData`)
- Telemetry resets (`RESET_DATA` or `devpulse.resetData`) purge only transient test execution history: `api_test_history`, `api_test_runs`, `api_test_run_results`.
- User-authored assets (`api_test_collections`, `api_test_folders`, `api_test_requests`, `api_test_variables`, `api_test_environments`) are **strictly preserved** during general telemetry resets.

### 4.3 Database Schema (SQLite via SQL.js - Migration 6)
**Mandatory Requirement:** In `Database.ts` and `migrations.ts`, `db.run('PRAGMA foreign_keys = ON;');` must be executed to enable foreign key cascading in SQL.js.

```sql
-- 1. Collections
CREATE TABLE IF NOT EXISTS api_test_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  auth_type TEXT NOT NULL DEFAULT 'inherit',
  auth_config_json TEXT,
  variables_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_test_col_order ON api_test_collections(sort_order ASC, name ASC);

-- 2. Folders (Hierarchical nesting with cascading deletes)
CREATE TABLE IF NOT EXISTS api_test_folders (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  parent_folder_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  auth_type TEXT NOT NULL DEFAULT 'inherit',
  auth_config_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(collection_id) REFERENCES api_test_collections(id) ON DELETE CASCADE,
  FOREIGN KEY(parent_folder_id) REFERENCES api_test_folders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_test_fold_col ON api_test_folders(collection_id, parent_folder_id);

-- 3. Saved Requests
CREATE TABLE IF NOT EXISTS api_test_requests (
  id TEXT PRIMARY KEY,
  collection_id TEXT,
  folder_id TEXT,
  name TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  params_json TEXT NOT NULL DEFAULT '[]',
  headers_json TEXT NOT NULL DEFAULT '[]',
  body_type TEXT NOT NULL DEFAULT 'none',
  body_content TEXT,
  auth_type TEXT NOT NULL DEFAULT 'inherit',
  auth_config_json TEXT,
  pre_request_script TEXT,
  test_script TEXT,
  settings_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(collection_id) REFERENCES api_test_collections(id) ON DELETE CASCADE,
  FOREIGN KEY(folder_id) REFERENCES api_test_folders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_test_req_col_folder ON api_test_requests(collection_id, folder_id, sort_order ASC);

-- 4. Environments
CREATE TABLE IF NOT EXISTS api_test_environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 5. Variables (Scoped by environment, collection, or global)
CREATE TABLE IF NOT EXISTS api_test_variables (
  id TEXT PRIMARY KEY,
  environment_id TEXT,
  collection_id TEXT,
  key TEXT NOT NULL,
  initial_value TEXT NOT NULL,
  current_value TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0,
  secret_ref TEXT,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(environment_id) REFERENCES api_test_environments(id) ON DELETE CASCADE,
  FOREIGN KEY(collection_id) REFERENCES api_test_collections(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_test_var_env ON api_test_variables(environment_id, enabled);
CREATE INDEX IF NOT EXISTS idx_test_var_col ON api_test_variables(collection_id, enabled);

-- 6. Request History (Bounded Ring Buffer, Capped at 500 rows)
CREATE TABLE IF NOT EXISTS api_test_history (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  status_text TEXT NOT NULL,
  duration_ms REAL NOT NULL,
  response_size_bytes INTEGER NOT NULL,
  environment_name TEXT,
  collection_id TEXT,
  request_summary_json TEXT,
  response_summary_json TEXT,
  executed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_test_hist_time ON api_test_history(executed_at DESC);

-- Automated Trigger to Prune History to 500 Rows
CREATE TRIGGER IF NOT EXISTS trg_prune_api_test_history
AFTER INSERT ON api_test_history
BEGIN
  DELETE FROM api_test_history
  WHERE id NOT IN (
    SELECT id FROM api_test_history ORDER BY executed_at DESC LIMIT 500
  );
END;

-- 7. Test Runs (Collection Runner Batches)
CREATE TABLE IF NOT EXISTS api_test_runs (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  environment_id TEXT,
  iteration_count INTEGER NOT NULL,
  total_requests INTEGER NOT NULL,
  passed_assertions INTEGER NOT NULL,
  failed_assertions INTEGER NOT NULL,
  duration_ms REAL NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  FOREIGN KEY(collection_id) REFERENCES api_test_collections(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_test_runs_time ON api_test_runs(started_at DESC);

-- 8. Test Run Request Results (Nullable status_code for network exceptions)
CREATE TABLE IF NOT EXISTS api_test_run_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  request_name TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  status_code INTEGER, -- NULL or 0 on network connection failure
  duration_ms REAL NOT NULL,
  assertions_json TEXT NOT NULL,
  error_message TEXT,
  executed_at INTEGER NOT NULL,
  FOREIGN KEY(run_id) REFERENCES api_test_runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_test_run_items ON api_test_run_results(run_id, iteration);
```

---

## 5. Variable Scoping & Interpolation Precedence

### 5.1 Resolution Hierarchy
$$\text{Local (Request / Data File Iteration)} > \text{Environment} > \text{Collection} > \text{Global}$$

1. **Iteration Data**: Bound from CSV/JSON record during Collection Runner.
2. **Local / Request**: Set dynamically via `pm.variables.set()`.
3. **Active Environment**: Selected in Studio toolbar.
4. **Collection Scope**: Declared on the collection root.
5. **Global Scope**: Universal variables across collections.

### 5.2 Dynamic Variables
Supported across URL, params, headers, and body:
- `{{$guid}}`: Random UUID v4.
- `{{$timestamp}}`: Unix epoch in seconds.
- `{{$isoTimestamp}}`: ISO 8601 UTC timestamp.
- `{{$randomInt}}`: Random integer (1–1000).

---

## 6. Authentication Architecture

### 6.1 Supported Schemes
1. **Inherit**: Cascades from parent folder or collection.
2. **No Auth**: Clears auth headers.
3. **Bearer Token**: `Authorization: Bearer <token>`.
4. **Basic Auth**: `Authorization: Basic <base64(username:password)>`.
5. **API Key**: Placed in Headers or Query Params.
6. **OAuth 2.0**:
   - Grant types: `Authorization Code`, `Authorization Code with PKCE`, `Client Credentials`.
   - VS Code URI handler: `vscode.window.registerUriHandler` registered for `vscode://valtry-labs.devpulse/auth/callback` with correlation `state` verification.
   - Fallback loopback HTTP server (`http://127.0.0.1:<ephemeralPort>/callback`) for remote/SSH/WSL environments where OS protocol handlers are blocked.
   - Automatic token refresh on 401 response and manual refresh button.

---

## 7. Import, Export, and cURL Subsystem

1. **Postman Collection v2.1**:
   - Import: Recursively parses collections, folders, requests, scripts, bodies, and variables.
   - Export: Emits compliant Postman Collection v2.1 JSON file.
2. **OpenAPI 3.0 / 3.1**:
   - Import: Converts paths, methods, parameters, and bodies into structured collections.
3. **cURL**:
   - Import: Parses method, headers, bodies, cookies, and basic auth from cURL commands.
   - Export: Generates reproducible cURL commands.

---

## 8. Collection Runner & Data-Driven Testing

### 8.1 Runner Specifications
- Sequential execution of requests with interruptible inter-request delay (`delayWithAbort(delayMs, abortSignal)`).
- **Data-Driven Testing**: RFC 4180 CSV parser with BOM handling or JSON records array. `iterationCount` defaults to dataset row count.
- **Stop on Failure**: Stops only when an assertion fails or a network exception occurs. An expected 4xx/5xx asserted in `pm.test` is treated as a pass.
- **Cancellation**: Full cancellation support via `API_TEST_CANCEL_RUN`.

---

## 9. User Interface Architecture & Component Design

### 9.1 DevPulse App Shell Integration
API Testing Studio is integrated cleanly as a primary module in [`Sidebar.tsx`](file:///c:/Antigravity%20Projects/DEVPULSE/webview/src/components/Sidebar.tsx):
- Nav Item: `{ id: 'API Testing Studio', label: 'API Testing Studio', icon: FlaskConical, color: '#38bdf8' }`
- Renders into `<main className="devpulse-main-view">` when `activeTab === 'API Testing Studio'`.

### 9.2 Studio Workspace Layout
1. **Top Application Toolbar**:
   - Active Environment Selector (with bright warning badge on `Production`), Quick Environment Edit button, Import/Export, Settings.
2. **Left Explorer Sidebar (Collapsible & Resizable)**:
   - Collections tree with colored HTTP method badges (`GET: #3b82f6`, `POST: #10b981`, `PUT: #f59e0b`, `DELETE: #ef4444`, `PATCH: #8b5cf6`).
   - Environments list and recent history list.
   - Search filter and quick action buttons.
3. **Central Request/Response Workspace**:
   - Request tabs bar with dirty indicators (`•`), tab close (`×`), and in-memory draft execution.
   - URL bar with method dropdown, URL input, Send button, Save button.
   - Config tabs: `Params`, `Authorization`, `Headers`, `Body`, `Scripts`, `Tests`, `Settings`.
   - Resizable divider for Request/Response split.
   - Response Viewer with summary metrics (`200 OK`, `124 ms`, `3.2 KB`), pretty/raw JSON, cookies, headers, and test results.
   - **Render Guard for Performance**:
     - `< 2 MB`: Full syntax highlighting and folding.
     - `2 MB - 20 MB`: Raw text display with performance warning banner.
     - `> 20 MB`: Metadata summary with *"Save Response to File"* button.
4. **Bottom Developer Console (Collapsible)**:
   - Console logs, runner progress, and script logs with clear and search filters.

---

## 10. IPC Contracts & TypeScript Data Transfer Objects

### 10.1 Webview To Extension Messages (`WebviewToExtensionMessage`)
Must be whitelisted in [`messageValidation.ts`](file:///c:/Antigravity%20Projects/DEVPULSE/src/shared/messageValidation.ts):
```typescript
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
```

### 10.2 Extension To Webview Messages (`ExtensionToWebviewMessage`)
```typescript
| { type: 'API_TEST_WORKSPACE_STATE'; payload: ApiTestWorkspaceState }
| { type: 'API_TEST_REQUEST_EXECUTING'; payload: { executionId: string } }
| { type: 'API_TEST_REQUEST_RESULT'; payload: ApiTestExecutionResult }
| { type: 'API_TEST_HISTORY_DATA'; payload: ApiTestHistoryItem[] }
| { type: 'API_TEST_RUN_PROGRESS'; payload: ApiTestRunProgress }
| { type: 'API_TEST_RUN_COMPLETED'; payload: ApiTestRunSummary }
| { type: 'API_TEST_SECRET_REVEALED'; payload: { variableId: string; value: string } }
| { type: 'API_TEST_EXPORT_RESULT'; payload: { filename: string; content: string } }
```

### 10.3 TypeScript Data Transfer Object Definitions
```typescript
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

export interface ApiTestWorkspaceState {
  collections: {
    id: string;
    name: string;
    description?: string;
    auth: ApiTestAuthConfig;
    sortOrder: number;
    folders: {
      id: string;
      collectionId: string;
      parentFolderId?: string;
      name: string;
      description?: string;
      auth: ApiTestAuthConfig;
      sortOrder: number;
    }[];
    requests: ApiTestRequestPayload[];
  }[];
  environments: {
    id: string;
    name: string;
    isActive: boolean;
    variables: ApiTestVariablePayload[];
  }[];
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
```

---

## 11. Configuration Settings

The following settings are registered in `package.json` under `contributes.configuration.properties`, with matching schema validators in `messageValidation.ts` and defaults in `defaultSettings.ts`:

- `devpulse.apiTesting.logToApiIntelligence` (boolean, default: false)
- `devpulse.apiTesting.maxResponseBodySizeMb` (number, default: 20, min: 1, max: 100)
- `devpulse.apiTesting.followRedirectsLimit` (number, default: 10, min: 0, max: 20)
- `devpulse.apiTesting.scriptTimeoutMs` (number, default: 1500, min: 500, max: 10000)
- `devpulse.apiTesting.defaultTimeoutMs` (number, default: 30000, min: 1000, max: 300000)

---

## 12. Testing & Verification Strategy

1. **Network Engine Suite (`tests/ApiTestEngine.test.ts`)**:
   - HTTP methods (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS).
   - Query params, headers, JSON/form/multipart/binary bodies.
   - Socket timings, timeout enforcement, redirect validation, and cancellation.
   - SSRF protection against `169.254.169.254` while permitting `localhost`/`127.0.0.1`.
2. **Sandbox & Assertions Suite (`tests/ApiTestScripting.test.ts`)**:
   - Worker thread isolation, prototype escape protection, watchdog timeout termination.
   - `pm.*` API compatibility and assertions.
3. **Database & Secret Storage Suite (`tests/ApiTestDatabase.test.ts`)**:
   - Migration 6 execution, foreign key cascades with `PRAGMA foreign_keys = ON;`.
   - History 500-row ring buffer pruning trigger.
   - Secret masking and `SecretCleanupService`.
   - Telemetry reset segregation (`RESET_DATA` preserving collections).
4. **Collection Runner Suite (`tests/ApiTestRunner.test.ts`)**:
   - Sequential execution, iteration loops, CSV/JSON data binding.
   - Stop-on-failure handling, delay cancellation.
5. **Import/Export Suite (`tests/ApiTestImportExport.test.ts`)**:
   - Postman v2.1 import/export round-trip.
   - OpenAPI 3.0/3.1 specs conversion.
   - cURL command parsing and export.
6. **Regression Verification**:
   - Complete passing of all existing 92 tests across DevPulse phases 1–4.
