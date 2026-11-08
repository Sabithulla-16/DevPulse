# DevPulse Configuration & Settings

DevPulse is configurable through standard VS Code Settings (`settings.json`) or directly from the **Settings & Privacy** page inside the DevPulse dashboard.

---

## Configuration Settings

Settings can be customized under the `devpulse` namespace in your user or workspace settings.

### System & Telemetry Monitoring

| Setting Key | Default | Description |
|---|---|---|
| `devpulse.monitoring.enabled` | `true` | Enables or pauses background system metrics collection. |
| `devpulse.monitoring.intervalSeconds` | `5` | Sampling cadence for CPU, RAM, and system resource telemetry (1–60s). |
| `devpulse.monitoring.showStatusBar` | `true` | Toggles the real-time CPU/RAM telemetry indicator in the VS Code status bar. |

### Resource Thresholds & Alerting

| Setting Key | Default | Description |
|---|---|---|
| `devpulse.alerts.cpuThreshold` | `85` | CPU load percentage trigger threshold (1–100%). |
| `devpulse.alerts.memoryThreshold` | `90` | System RAM usage percentage trigger threshold (1–100%). |
| `devpulse.alerts.diskThreshold` | `90` | Disk volume capacity usage percentage trigger threshold (1–100%). |
| `devpulse.alerts.cooldownMinutes` | `15` | Minimum cooldown period between consecutive alerts for the same condition. |

### Git & Workspace Intelligence

| Setting Key | Default | Description |
|---|---|---|
| `devpulse.git.syncIntervalSeconds` | `30` | Interval for polling Git repository status and branch topology. |
| `devpulse.git.commitHistoryDepth` | `100` | Maximum number of historical commits to analyze for author velocity. |
| `devpulse.workspace.autoScanOnOpen` | `false` | Automatically scans the workspace filesystem when a folder is opened. |
| `devpulse.workspace.maxScanDepth` | `10` | Maximum folder depth recursion for workspace storage scans. |

### AI Playground & Providers

| Setting Key | Default | Description |
|---|---|---|
| `devpulse.ai.ollamaHost` | `http://localhost:11434` | Local Ollama API server endpoint. |
| `devpulse.ai.maxContextFiles` | `5` | Maximum number of workspace files attached to a chat prompt (up to 256KB/file). |
| `devpulse.ai.tokenBudgetCap` | `100000` | Optional monthly cloud token budget cap before warning notifications trigger. |

### API Intelligence & Testing Studio

| Setting Key | Default | Description |
|---|---|---|
| `devpulse.api.ingestionPort` | `4318` | Local HTTP port for the inbound developer telemetry ingestion server. |
| `devpulse.api.batchSize` | `50` | Maximum request events buffered before batch flushing into SQLite. |
| `devpulse.apiTest.timeoutMs` | `30000` | HTTP request execution timeout in API Testing Studio. |
| `devpulse.apiTest.followRedirects` | `true` | Automatically follow HTTP redirects with secure cross-origin header sanitization. |

---

## Command Palette Integration

Execute these commands via `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS):

- **`DevPulse: Open Dashboard`** (`devpulse.openDashboard`): Opens the primary observability dashboard.
- **`DevPulse: Open AI Playground`** (`devpulse.openAiPlayground`): Launches the AI Playground workspace.
- **`DevPulse: View Pulse Insights`** (`devpulse.openPulseInsights`): Opens cross-module correlation analytics.
- **`DevPulse: View Git Intelligence`** (`devpulse.openGitIntelligence`): Displays repository topology and commit metrics.
- **`DevPulse: View Coding Intelligence`** (`devpulse.openCodingIntelligence`): Opens active coding session telemetry.
- **`DevPulse: View API Intelligence`** (`devpulse.openApiIntelligence`): Displays API latency and request events.
- **`DevPulse: Open API Testing Studio`** (`devpulse.openApiTestingStudio`): Launches the embedded API testing client.
- **`DevPulse: Scan Workspace`** (`devpulse.scanWorkspace`): Starts workspace storage analytics.
- **`DevPulse: Reset Local Data`** (`devpulse.resetData`): Wipes local metrics with automatic backup copy.
