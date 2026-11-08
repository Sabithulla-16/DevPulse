# DEVPULSE PHASE 4 SPECIFICATION (APPROVED)
## Coding Intelligence + API Intelligence Architecture, Schema, Lifecycle & UI

**Document Version:** 2.0.0 (Post-EGM Swarm Audit Approved)  
**Target Release:** DevPulse 0.4.0  
**Authors:** DevPulse Core Engineering Team  
**Review Status:** Approved by Architecture, Technical Quality, Implementation Readiness, and Zoom-Out Goldfish Reviewers  

---

## 1. Executive Summary & Architectural Principles

DevPulse Phase 4 completes the local-first developer intelligence platform by implementing two core modules:
1. **Coding Intelligence**: Non-intrusive focus and coding session telemetry, active duration tracking, language distribution, and project velocity without capturing source code, keystrokes, clipboard, or screenshots.
2. **API Intelligence**: Explicitly instrumented HTTP/REST telemetry for developer applications via a secure localhost ingestion server, zero-crash Node.js/Express middleware, endpoint latency percentiles (P50/P95/P99), error categorization, and service management without packet sniffing or TLS interception.

### Goldfish Swarm Decisions Incorporated:
- **Zero WASM Write-Amplification**: Avoid logging fine-grained event rows on individual keystrokes. Accumulate durations in memory with debounced batch flushes to durable `coding_sessions`.
- **Bounded Circular Buffers**: Cap raw `api_request_events` at a maximum circular ring buffer (default 10,000 rows in SQLite) with automatic FIFO pruning to prevent WASM heap bloat.
- **Fast In-Memory Token Authentication**: Cache SHA-256 token hashes in memory to prevent blocking the Extension Host event loop with asynchronous `SecretStorage` lookups on every HTTP request.
- **Graceful Socket Teardown**: Track open sockets and invoke `server.closeAllConnections()` on deactivation to guarantee immediate port release without `EADDRINUSE` leaks.
- **Strict Express Zero-Crash Contract**: Enforce query parameter stripping, route parameter normalization (`/users/:id`), and error event suppression so client applications never crash if DevPulse is closed.
- **Deterministic Percentiles**: Calculate exact P50/P95/P99 latency percentiles via indexed lookups on sorted observation sets and histogram bins.
- **Sanctioned URI Scheme Filtering**: Restrict Coding Intelligence to `file` and `untitled` document schemes, ignoring internal VS Code virtual documents (`output:`, `debug:`, `git:`, etc.).

---

## 2. Module 1: Coding Intelligence

### 2.1 Sanctioned VS Code Signals & Non-Intrusive Capture
The `CodingActivityCollector` listens exclusively to sanctioned VS Code APIs:
- `vscode.workspace.onDidChangeTextDocument`: Filtered strictly to `document.uri.scheme === 'file' || document.uri.scheme === 'untitled'` and `e.contentChanges.length > 0`. High-frequency events are debounced with a 1,000ms sliding buffer in memory.
- `vscode.window.onDidChangeActiveTextEditor`: Detects editor switches, language transitions, and workspace context changes.
- `vscode.workspace.onDidSaveTextDocument`: Records save markers for session language tracking.
- `vscode.window.onDidChangeWindowState`: Tracks VS Code window focus/blur. When blurred and `codingPauseOnWindowBlur` is enabled, the session immediately ceases active duration accumulation.
- `vscode.workspace.onDidChangeWorkspaceFolders`: Handles workspace additions, removals, and multi-root switching.

#### Privacy Constraints:
- **Zero Keystroke Logging**: No key codes, scan codes, or typing cadence are stored.
- **Zero Source Code Persistence**: No file content, ASTs, text diffs, or comments are inspected or saved.
- **Zero Clipboard & Screenshots**: System clipboard and display pixels are untouched.
- **Privacy Mode**: When enabled, file paths and names are redacted or hashed.

### 2.2 Heartbeat Chunking & Active Duration Calculation
To prevent phantom active time accumulation (e.g., walking away for 5 minutes falsely adding 300s of active coding):
- **Heartbeat Chunking**: Active coding duration is accumulated in heartbeat chunks. For any two consecutive user events at timestamps $T_{n-1}$ and $T_n$:
  $$\Delta t = T_n - T_{n-1}$$
  - If $\Delta t \le \text{idleThreshold}$ (default 300s / 5 min): $\Delta t$ is credited to `active_duration_seconds`.
  - If $\Delta t > \text{idleThreshold}$: The interval up to the idle threshold is closed, the session transitions to `idle`, and subsequent time until $T_n$ is credited to `idle_duration_seconds`.
- **Duration Invariant**:
  $$\text{total\_duration\_seconds} = \text{active\_duration\_seconds} + \text{idle\_duration\_seconds} + \text{paused\_duration\_seconds}$$
- **State Transitions**: `active` $\leftrightarrow$ `idle` $\leftrightarrow$ `paused` $\rightarrow$ `ended`.
- **Manual Pause / Resume**: Developers can pause/resume tracking at any time from the status bar or webview without corrupting historical records.
- **Crash Recovery & Graceful Shutdown**:
  - In `CodingSessionManager.initialize()`: Orphaned open sessions from previous crashes (`status IN ('active', 'idle', 'paused')`) are reconciled by setting `status = 'ended'` and `ended_at = last_activity_at`.
  - In `deactivate()`: Active sessions are immediately flushed and closed synchronously to prevent dangling sessions.

### 2.3 Language Intelligence & Multi-Project Aggregation
- Languages detected via `document.languageId` (TypeScript, JavaScript, Python, Rust, Go, C++, HTML, CSS, JSON, SQL, etc.).
- Active editing time is tracked per language within `languages_json` (`{ [lang]: activeSeconds }`).
- Multi-root workspaces are tracked independently using normalized workspace root paths (lowercase drive letters on Windows, forward slashes).

---

## 3. Module 2: API Intelligence

### 3.1 Local Ingestion Server Architecture
- **Protocol**: HTTP/1.1 REST endpoint running via native Node.js `http.createServer` bound strictly to `127.0.0.1` (or user-configured host).
- **Default Port**: `49152` (configurable in settings).
- **Socket Lifecycle & Deactivation**: All client sockets are tracked in a `Set<net.Socket>`. Upon extension deactivation, `server.closeAllConnections()` destroys persistent keep-alive sockets, allowing clean unbound ports.
- **Authentication**:
  - Each registered service has a secret token (`devpulse_sec_<random-hex>`).
  - Stored in VS Code `SecretStorage`.
  - On activation and service mutation, SHA-256 hashes of all active service tokens are cached in an in-memory `Map<tokenHash, serviceId>`.
  - Ingestion requests check `Authorization: Bearer <token>` or `x-devpulse-token` using `crypto.timingSafeEqual` in $O(1)$ constant time without async main-thread IPC.
- **Ingestion Endpoints & HTTP Response Codes**:
  - `POST /api/v1/events`: Ingest single event or batch events array.
    - `200 OK`: `{ "accepted": true, "count": N }`
    - `400 Bad Request`: `{ "error": "Invalid JSON or event schema" }`
    - `401 Unauthorized`: `{ "error": "Invalid or missing service token" }`
    - `413 Payload Too Large`: If body > 64 KB (`{ "error": "Payload exceeds 64KB limit" }`)
    - `429 Too Many Requests`: If rate exceeds 500 req/s (`{ "error": "Rate limit exceeded" }` with `Retry-After: 1`)
  - `GET /api/v1/health`: Ingestion status check returning `{ "status": "ok", "version": "0.4.0", "serviceCount": N }`.

### 3.2 Express Middleware Contract (`@devpulse/express` snippet / helper)
A zero-dependency, non-blocking middleware helper for Node.js Express applications:
- **Zero-Crash Guarantee**:
  - Attaches `req.on('error', () => {})` to internal telemetry dispatch.
  - Asynchronous background dispatch with reusable HTTP agent (`keepAlive: true, maxSockets: 5`).
  - If DevPulse is not running or socket connection fails, the error is swallowed completely without interrupting the Express application request/response flow.
- **Route Normalization**:
  - Uses `req.baseUrl + req.route?.path || req.path`.
  - Automatically parameterizes UUIDs, Mongo ObjectIDs, and numeric IDs (e.g., `/api/users/12345` $\rightarrow$ `/api/users/:id`).
- **Privacy Redaction**:
  - All query strings (`req.query`, `?token=...`) are completely stripped.
  - Authorization headers, cookies, request bodies, and response bodies are **never** captured.

### 3.3 Latency Percentiles (P50 / P95 / P99)
- Exact percentiles calculated on sorted durations from the bounded query set:
  $$\text{index} = \lfloor N \times 0.50 \rfloor, \quad \lfloor N \times 0.95 \rfloor, \quad \lfloor N \times 0.99 \rfloor$$
- Never computed using averaged averages.

---

## 4. SQLite Database Schema & Migration 5

Migration 5 cleanly drops legacy placeholder tables from Migration 1 (`coding_sessions`, `api_requests`) and creates the optimized Phase 4 schema.

```sql
-- 1. Clean up legacy Migration 1 stubs
DROP TABLE IF EXISTS coding_sessions;
DROP TABLE IF EXISTS api_requests;

-- 2. Durable Coding Sessions
CREATE TABLE IF NOT EXISTS coding_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workspace_name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  last_activity_at INTEGER NOT NULL,
  active_duration_seconds INTEGER NOT NULL DEFAULT 0,
  idle_duration_seconds INTEGER NOT NULL DEFAULT 0,
  paused_duration_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'idle', 'paused', 'ended'
  primary_language TEXT NOT NULL,
  languages_json TEXT NOT NULL DEFAULT '{}', -- JSON map: { [lang]: activeSeconds }
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coding_sessions_ws_start ON coding_sessions(workspace_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_coding_sessions_status ON coding_sessions(status);
CREATE INDEX IF NOT EXISTS idx_coding_sessions_start ON coding_sessions(started_at DESC);

-- 3. API Monitored Services
CREATE TABLE IF NOT EXISTS api_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  integration_type TEXT NOT NULL DEFAULT 'express',
  environment TEXT NOT NULL DEFAULT 'development',
  monitoring_enabled INTEGER NOT NULL DEFAULT 1,
  secret_hash TEXT NOT NULL,
  total_requests INTEGER NOT NULL DEFAULT 0,
  last_event_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_services_name ON api_services(name);

-- 4. Normalized Endpoints Directory
CREATE TABLE IF NOT EXISTS api_endpoints (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  route_template TEXT NOT NULL,
  method TEXT NOT NULL,
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms REAL NOT NULL DEFAULT 0,
  p95_latency_ms REAL NOT NULL DEFAULT 0,
  last_requested_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(service_id, route_template, method)
);
CREATE INDEX IF NOT EXISTS idx_api_endpoints_service ON api_endpoints(service_id, last_requested_at DESC);

-- 5. Bounded API Request Events (Circular ring buffer capped at 10,000 rows max)
CREATE TABLE IF NOT EXISTS api_request_events (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  route_template TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms REAL NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  outcome TEXT NOT NULL, -- 'success', 'failure'
  error_category TEXT,   -- '4xx', '5xx', 'timeout', 'network'
  environment TEXT NOT NULL,
  request_size_bytes INTEGER,
  response_size_bytes INTEGER
);
CREATE INDEX IF NOT EXISTS idx_api_events_service_endpoint ON api_request_events(service_id, endpoint_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_events_time ON api_request_events(completed_at DESC);
```

---

## 5. Typed IPC Wire Contracts & Interfaces

### 5.1 Extension Host $\leftrightarrow$ Webview IPC Messages

```typescript
// Shared message types added to src/shared/types.ts

// Webview -> Extension
export type WebviewToExtensionMessage =
  | { type: 'GET_CODING_INTELLIGENCE'; payload?: { timeFilter?: 'today' | '7d' | '30d' | 'all'; workspaceId?: string } }
  | { type: 'PAUSE_CODING_TRACKING' }
  | { type: 'RESUME_CODING_TRACKING' }
  | { type: 'CLEAR_CODING_DATA' }
  | { type: 'GET_API_INTELLIGENCE'; payload?: { serviceId?: string; environment?: string; timeFilter?: '1h' | '24h' | '7d' | '30d' } }
  | { type: 'CREATE_API_SERVICE'; payload: { name: string; environment?: string; integrationType?: string } }
  | { type: 'DELETE_API_SERVICE'; payload: { serviceId: string } }
  | { type: 'TOGGLE_API_SERVICE_MONITORING'; payload: { serviceId: string; enabled: boolean } }
  | { type: 'REGENERATE_API_SERVICE_TOKEN'; payload: { serviceId: string } }
  | { type: 'GET_API_ENDPOINT_DETAILS'; payload: { endpointId: string; limit?: number } }
  | { type: 'CLEAR_API_DATA'; payload?: { serviceId?: string } }
  // (Existing Phase 1-3 messages preserved...)

// Extension -> Webview
export type ExtensionToWebviewMessage =
  | { type: 'CODING_INTELLIGENCE_DATA'; payload: CodingIntelligenceData }
  | { type: 'CODING_STATUS_CHANGED'; payload: { status: 'active' | 'idle' | 'paused' | 'stopped'; activeProject?: string; currentSessionSeconds: number } }
  | { type: 'API_INTELLIGENCE_DATA'; payload: ApiIntelligenceData }
  | { type: 'API_ENDPOINT_DETAILS_DATA'; payload: ApiEndpointDetailsData }
  | { type: 'API_SERVICE_TOKEN_CREATED'; payload: { serviceId: string; serviceName: string; token: string } }
  // (Existing Phase 1-3 messages preserved...)
```

### 5.2 Data Payload Contracts

```typescript
export interface CodingSessionItem {
  id: string;
  workspaceId: string;
  workspaceName: string;
  startedAt: number;
  endedAt?: number;
  lastActivityAt: number;
  activeDurationSeconds: number;
  idleDurationSeconds: number;
  pausedDurationSeconds: number;
  status: 'active' | 'idle' | 'paused' | 'ended';
  primaryLanguage: string;
  languages: Record<string, number>; // { typescript: 1200, json: 60 }
}

export interface CodingLanguageStat {
  languageId: string;
  displayName: string;
  activeSeconds: number;
  percentage: number;
  sessionCount: number;
}

export interface CodingProjectStat {
  workspaceId: string;
  workspaceName: string;
  activeSeconds: number;
  sessionCount: number;
  lastActiveAt: number;
  primaryLanguage: string;
}

export interface CodingTimelineHour {
  hour: string; // "00:00", "01:00", ... "23:00"
  activeSeconds: number;
  idleSeconds: number;
}

export interface CodingIntelligenceData {
  summary: {
    totalActiveSeconds: number;
    totalIdleSeconds: number;
    totalSessions: number;
    avgSessionSeconds: number;
    activeProjectsCount: number;
    languagesCount: number;
    weeklyActiveSeconds: number;
  };
  liveStatus: {
    status: 'active' | 'idle' | 'paused' | 'stopped';
    activeWorkspaceName?: string;
    activeLanguage?: string;
    sessionDurationSeconds: number;
    activeDurationSeconds: number;
  };
  hourlyActivity: CodingTimelineHour[];
  dailyActivity: { date: string; activeSeconds: number; idleSeconds: number }[];
  languages: CodingLanguageStat[];
  projects: CodingProjectStat[];
  recentSessions: CodingSessionItem[];
}

export interface ApiServiceItem {
  id: string;
  name: string;
  integrationType: string;
  environment: string;
  monitoringEnabled: boolean;
  totalRequests: number;
  lastEventAt?: number;
  createdAt: number;
}

export interface ApiEndpointItem {
  id: string;
  serviceId: string;
  routeTemplate: string;
  method: string;
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  lastRequestedAt: number;
}

export interface ApiRequestEventItem {
  id: string;
  serviceId: string;
  endpointId: string;
  routeTemplate: string;
  method: string;
  statusCode: number;
  durationMs: number;
  completedAt: number;
  outcome: 'success' | 'failure';
  errorCategory?: string;
}

export interface ApiIntelligenceData {
  summary: {
    totalRequests: number;
    successRate: number;
    errorRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    activeServicesCount: number;
  };
  ingestionStatus: {
    running: boolean;
    host: string;
    port: number;
    activeConnections: number;
    queueSize: number;
  };
  services: ApiServiceItem[];
  endpoints: ApiEndpointItem[];
  recentErrors: ApiRequestEventItem[];
  volumeTimeSeries: { time: string; timestamp: number; successCount: number; errorCount: number; avgLatencyMs: number }[];
  statusCodeDistribution: { codeCategory: string; count: number; percentage: number }[];
  methodDistribution: { method: string; count: number; percentage: number }[];
}

export interface ApiEndpointDetailsData {
  endpoint: ApiEndpointItem;
  recentEvents: ApiRequestEventItem[];
  latencyHistogram: { bin: string; count: number }[];
  statusCodes: { code: number; count: number }[];
}
```

---

## 6. Frontend Specifications & Navigation

### 6.1 Updated Navigation Order (Prompt Section 12)
1. **Overview** (`Activity`)
2. **AI Intelligence** (`BrainCircuit`)
3. **Git Intelligence** (`GitBranch`)
4. **Coding Intelligence** (`Clock3`) — *Live in Phase 4*
5. **API Intelligence** (`Network`) — *Live in Phase 4*
6. **File Intelligence** (`FolderTree`)
7. **System Intelligence** (`Cpu`)
8. **Alerts** (`Bell`)
9. **Settings** (`Settings`)

### 6.2 Coding Intelligence Screen (`CodingIntelligencePage.tsx`)
- **6 Primary Metric Cards**: Active Coding Time, Total Sessions, Avg Session Duration, Active Projects, Languages Used, Weekly Active Time.
- **Live Status Control Panel**:
  - Live pulse indicator (Coding / Idle / Paused / Inactive).
  - Current session clock, active workspace, active language.
  - Manual Pause/Resume button.
- **Hourly Activity Bar Chart**: 24-hour bins (`00:00` to `23:00`) showing active vs idle focus split.
- **Language Analytics**: Colored distribution bars and ranking table with duration formatters.
- **Project Analytics**: Workspace rank cards with active times.
- **Session History Table**:
  - Columns: Workspace, Start Time, Total Duration, Active Duration, Idle Duration, Primary Language, Status badge.
  - Search, sort, and pagination.

### 6.3 API Intelligence Screen (`ApiIntelligencePage.tsx`)
- **6 Primary Metric Cards**: Total Requests, Success Rate %, Error Rate %, Avg Latency (ms), P95 Latency (ms), Active Services.
- **Live Ingestion Pill**: Displays `127.0.0.1:49152` status with active queue and port badge.
- **Volume & Latency Area Chart**: Synchronized stacked success vs error bars and latency trend line.
- **HTTP Method & Status Code Donut Charts**.
- **Endpoint Performance Table**:
  - Columns: Route Template, Method badge (`GET`, `POST`, `PUT`, `DELETE`), Requests, Avg Latency, P95, Error Rate %.
  - Row click opens **Endpoint Detail Drawer**.
- **Services & Integration Management Drawer / Modal**:
  - Registered services list with test connection button and delete control.
  - "Register New Service" button generating a new token.
  - Single-view Token Disclosure Modal with copyable Express middleware snippet.

---

## 7. Alerts & Scoped Deduplication Keys

### Scoped Deduplication Keys:
- `api_high_error_rate:${serviceId}:${endpointId}`
- `api_high_latency:${serviceId}:${endpointId}`
- `api_server_offline:${port}`
- `coding_session_paused:${workspaceId}`

### Alert Threshold Floors:
- API Error Rate Alert: Triggers only when `total_requests >= 20` AND `error_rate >= 5.0%` within a sliding 5-minute window.
- API P95 Latency Alert: Triggers only when `total_requests >= 20` AND `p95_latency >= 1000ms`.
- Alert cooldown: Minimum 5 minutes between repeating alerts.

---

## 8. Implementation Milestones

- **Milestone 1**: Database Migration 5, `CodingIntelligenceRepository`, and `ApiIntelligenceRepository`.
- **Milestone 2**: `CodingActivityCollector` and `CodingSessionManager` with heartbeat debouncing.
- **Milestone 3**: `ApiIngestionServer`, token authentication cache, and zero-crash Express middleware.
- **Milestone 4**: Shared IPC types, message validation, and `DashboardProvider` wiring.
- **Milestone 5**: Webview UI (`CodingIntelligencePage`, `ApiIntelligencePage`, `Sidebar` navigation, and `OverviewPage` summary).
- **Milestone 6**: Settings & Alerts integration.
- **Milestone 7**: Testing (unit, integration, regression, Windows 11 compatibility), packaging DevPulse 0.4.0 VSIX, and EGM Drift Report.

---
*DevPulse Phase 4 Implementation Specification — Final Approved Version.*
