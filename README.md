# DevPulse

A professional, local-first Developer Intelligence and Monitoring Platform embedded inside Visual Studio Code.

DevPulse provides a unified observability center for your local development environment—tracking system hardware resources, workspace files, local AI token telemetry, and Git repository activity with 100% on-device privacy.

---

## Architecture Overview

DevPulse is built with an asynchronous, collector-based architecture:

```
PulseEngine
  |-- CollectorRegistry  (Error-isolated collector manager)
  |-- EventBus           (Type-safe pub/sub event bus)
  |-- Scheduler          (Asynchronous tick & interval coordinator)
  |-- EventNormalizer    (Event schema validation & timestamping)
  |-- MetricsProcessor   (Repository routing & statistical rollups)
  |-- Database           (SQLite engine via SQL.js WebAssembly)
  |-- AlertEngine        (Autonomous threshold & anomaly detector with cooldowns)
```

### Collector Ecosystem

| Collector | Category | Status | Telemetry Captured |
|---|---|---|---|
| **System** | `system` | **Active** | Host CPU % (delta tick calculation), RAM (total, used, free), Uptime |
| **Disk** | `system` | **Active** | Mounted disk storage (total, used, free, utilization %) |
| **Process** | `system` | **Active** | Top active processes (PID, name, CPU %, memory bytes, memory %, safe termination) |
| **Port** | `system` | **Active** | Dynamic dev ports (3000, 5173, 8080, 11434, etc.), listening state, PID, Free Port |
| **Filesystem** | `filesystem` | **Active** | Workspace size, recursive folders, largest files, extension drill-down, duplicate detection |
| **AI Playground** | `ai` | **Active** | Local Ollama & cloud model chat, streaming responses, context selection, Prompt Studio, token telemetry |
| **Pulse Insights** | `insights` | **Active** | Cross-module correlation engine, 6-module environment health overview, explainable evidence |
| **Git Intelligence** | `git` | **Active** | Branch topology, uncommitted diffs, commit velocity, author contributions, repo health |
| **Coding Intelligence**| `coding` | **Active** | Active session intervals, keystroke/file edit tracking, language distribution |
| **API Intelligence** | `api` | **Active** | Outbound/inbound dev HTTP requests, latency, errors, endpoint observability |
| **API Testing Studio** | `api_test` | **Active** | Interactive request runner, collections, environments, assertion scripts |

---

## Phase 3 Modules: AI & Git Intelligence

### 1. AI Intelligence (`ai`)

- **Flagship Local Ollama Integration**:
  - Connects to local Ollama instance (`http://localhost:11434`) without requiring external API keys.
  - Automatically queries `/api/tags` and `/api/version` to discover installed models (`llama3`, `mistral`, `deepseek-r1`, `phi`, `qwen`, etc.).
  - Accurately tracks local inference at **$0.00 spend**.
- **Multi-Provider Cloud Connectors**:
  - Out-of-the-box adapters for **OpenAI**, **Anthropic**, **Google Gemini**, and **Groq**.
  - Secure credential storage using VS Code `SecretStorage` (`context.secrets`)—API keys are never stored in plain text or written to SQLite.
  - One-click "Test Connection" with latency calculation and error sanitization (masks credentials).
- **Local Agent Telemetry**:
  - Safe discovery of local CLI coding agent sessions (e.g. Claude Code metadata in `~/.claude/`).
  - Strictly reads numeric token counts and timestamps. **Never reads or stores prompts, code, or outputs**.
- **Comprehensive Cost Calculator & Pricing Catalog**:
  - Built-in pricing catalog covering major models (GPT-4o, GPT-4o-mini, Claude 3.5 Sonnet, Claude 3.5 Haiku, Gemini 1.5 Pro/Flash, Groq Llama 3.3).
  - Ability to customize input and output pricing rules per 1M tokens.
- **Budget Tracking & Safeguards**:
  - Real-time daily spending tracker with configurable limits (e.g. $10.00/day).
  - Progress bar with 85% threshold warning alerts.

### 2. Git Intelligence (`git`)

- **Multi-Root & Sub-Repository Discovery**:
  - Detects active workspace git repositories, including monorepos and nested project folders.
- **Safe CLI Command Execution**:
  - Uses `child_process.execFile` with argument arrays to prevent shell command injection.
  - Regex stripping of sensitive authentication credentials from remote URLs (`https://user:token@github.com/...` -> `https://github.com/...`).
- **Working Tree Observability**:
  - Real-time inspection of uncommitted files via `git status --porcelain=v1 -uall`.
  - Classifies status: Modified (`M`), Added/Untracked (`A` / `?`), Deleted (`D`), Renamed (`R`), Conflicted (`U`).
  - Staged vs. Unstaged indicators.
  - **Click to Open**: Clicking any uncommitted file immediately opens it in the active VS Code editor.
- **Commit History & Search**:
  - Full commit history with short hash, message, author, timestamp, insertions, and deletions.
  - Instant live filtering by commit message, hash, or author name.
- **Branch Topology & Tracking**:
  - Full local and remote branch listing (`git branch -a -vv`).
  - Current active branch indicator.
  - Upstream tracking status with ahead / behind commit counters (`↑ ahead`, `↓ behind`).
- **Contributor Analytics**:
  - Author contribution rankings by commit count, lines inserted, lines deleted, and last active date.
- **Repository Health Insights**:
  - Automatic detection of large working tree backlogs (> 30 files).
  - High churn refactoring alerts (> 2,000 line changes).
  - Branch out-of-sync warnings.

---

## Phase 2 Modules (Preserved & Enhanced)

### File Intelligence
- Full workspace scanning with `.gitignore` integration and symlink cycle safety.
- **Extension Analytics with Click-to-View Drilldown**: Clicking any file format (`.ts`, `.json`, `.png`, etc.) lists all matching files with pagination, sorting, search, and click-to-open.
- Recursive directory hierarchy and folder weight analytics.
- Top largest asset detection.
- Streaming SHA-256 duplicate content detection.
- Historical workspace growth comparison.

### Advanced System Intelligence
- Real-time CPU load (average, peak, time-series history).
- System RAM utilization.
- Mounted filesystem storage capacity.
- **Process Monitoring with Safe Termination**: View active processes and stop runaway dev tasks.
- **Dynamic Port Discovery & Free Port**: Detect listening dev ports (`3000`, `5173`, `8080`, `11434`, etc.) and release occupied ports with 1-click confirmation and automatic notification dismissals.

---

## Local Database Foundation (SQLite)

All metrics are stored locally in an on-device SQLite database via **SQL.js** (WebAssembly) in `globalStorageUri`.

### Complete 27-Table Relational Schema Across 3 Migrations

- **Migration 1 (Phase 1 Foundation)**: `schema_migrations`, `metric_events`, `system_metrics`, `ai_usage`, `workspace_snapshots`, `git_activity`, `coding_sessions`, `api_requests`, `alerts`, `budgets`, `settings`.
- **Migration 2 (Phase 2 Workspace & System)**: `file_scans`, `file_entries`, `folder_stats`, `duplicate_groups`, `disk_metrics`, `process_metrics`, `port_metrics`.
- **Migration 3 (Phase 3 AI & Git Intelligence)**:
  - `ai_providers`: Discovered AI engines, connectivity status, endpoints, local/cloud classification.
  - `ai_models`: Model registry, parameter size, context windows, discovery timestamps.
  - `ai_usage_records`: High-fidelity prompt/completion token consumption, duration, estimated cost, source agent.
  - `ai_pricing`: Custom and catalog pricing rates per 1M tokens.
  - `ai_budgets`: Spending limits and threshold triggers.
  - `git_repositories`: Tracked local repositories, root paths, current branch, clean status.
  - `git_commits`: Commit hash, short hash, author, message, timestamp, file diffs, lines changed.
  - `git_branches`: Local/remote branch list, upstream tracking, ahead/behind counts.
  - `git_working_tree`: Current uncommitted files, staged status, modification states.

---

## Installation

### Method 1: Visual Studio Code Marketplace
1. Open Visual Studio Code.
2. Open the Extensions view (`Ctrl+Shift+X` on Windows/Linux, `Cmd+Shift+X` on macOS).
3. Search for **DevPulse**.
4. Click **Install**.

### Method 2: Manual VSIX Installation
Download the `devpulse-1.0.0.vsix` package from [GitHub Releases](https://github.com/Sabithulla-16/DevPulse/releases) and run:
```powershell
code --install-extension devpulse-1.0.0.vsix
```
Alternatively, in VS Code, open the Extensions view, click the `...` (Views and More Actions) menu at the top, select **Install from VSIX...**, and choose `devpulse-1.0.0.vsix`.

---

## Getting Started

1. **Open the Dashboard**: Click the DevPulse icon in the VS Code Activity Bar or run `DevPulse: Open Dashboard` from the Command Palette (`Ctrl+Shift+P`).
2. **Review Environment Health**: The Overview Dashboard automatically displays real-time CPU, RAM, active coding session duration, and mounted storage.
3. **Configure AI Models**: Navigate to **AI Playground** or **Settings & Privacy** to connect local Ollama (`http://localhost:11434`) or input API keys for OpenAI, Anthropic, Gemini, or custom OpenAI-compatible providers. Keys are stored safely in VS Code `SecretStorage`.
4. **Scan Workspace**: Navigate to **File Intelligence** and click **Scan Workspace** to inspect file distribution, extension breakdown, and duplicate files.
5. **Explore Pulse Insights**: Run cross-module correlation analysis across system telemetry, git commits, coding activity, API requests, and AI usage.

---

## AI Playground & Pulse Insights (v1.0.0)

### 1. AI Playground (`ai`)
- **Single-Model Interaction**: Enforced single-model conversations for focused, distraction-free prompting and testing (strictly no model comparison).
- **Streaming Token Delivery**: Real-time generation feedback powered by SSE and NDJSON streaming across OpenAI, Anthropic, Gemini, Groq, local Ollama, and custom OpenAI-compatible endpoints.
- **Context Selection**: Explicitly attach up to 5 workspace files (up to 256KB/file) with live token estimation.
- **Prompt Studio**: Built-in template manager with parameter variables (`{{variable}}`), version tracking, and quick insertion into chat.
- **Custom OpenAI-Compatible Providers**: Connect local vLLM, LM Studio, Together AI, DeepSeek, or OpenRouter with secure API key storage.
- **Usage & Cost Telemetry**: Detailed token accounting, cloud vs. local inference ratios, latency trends, and historical usage logs.

### 2. Pulse Insights (`insights`)
- **Unified Intelligence Layer**: Cross-module analytics synthesizing telemetry from System, Workspace, Git, Coding, API, and AI modules.
- **Environment Health Overview**: 6 module health cards with real-time deterministic scoring (0–100) and health indicators.
- **Correlation Engine**: 5 deterministic cross-module rules identifying non-trivial correlations with safe, non-causal phrasing and mathematical thresholds.
- **Explainable Evidence Drawer**: Transparent breakdown of thresholds, values, and timestamps supporting each insight.
- **Explain with AI**: One-click in-depth diagnostic explanations generated via your connected AI provider.

---

## Commands Palette Integration

- `DevPulse: Open Dashboard` (`devpulse.openDashboard`)
- `DevPulse: Open AI Playground` (`devpulse.openAiPlayground`)
- `DevPulse: View Git Intelligence` (`devpulse.openGitIntelligence`)
- `DevPulse: View File Intelligence` (`devpulse.openFileIntelligence`)
- `DevPulse: View System Intelligence` (`devpulse.openSystemIntelligence`)
- `DevPulse: Scan Workspace` (`devpulse.scanWorkspace`)
- `DevPulse: Cancel Workspace Scan` (`devpulse.cancelScan`)
- `DevPulse: Refresh Git Metrics` (`devpulse.refreshGit`)
- `DevPulse: Refresh Metrics` (`devpulse.refreshMetrics`)
- `DevPulse: Pause Monitoring` (`devpulse.pauseMonitoring`)
- `DevPulse: Resume Monitoring` (`devpulse.resumeMonitoring`)
- `DevPulse: Reset Local Data` (`devpulse.resetData`)

---

## Privacy & Security Guarantees

1. **Local-First Architecture**: 100% on-device operation. No external telemetry servers, no telemetry pings.
2. **Zero Code Extraction**: Source code files and AI prompts are never read or stored.
3. **Secret Storage Isolation**: Cloud API keys are stored exclusively in VS Code `SecretStorage`.
4. **Credential Masking**: All Git remote URLs and API error logs automatically mask basic auth credentials and keys.
5. **No Synthetic Data**: Real telemetry only. If an integration or repo is not present, clean informational empty states are presented.

---

## Troubleshooting

- **Webview does not load**: Run `Developer: Reload Window` from the Command Palette (`Ctrl+R` / `Cmd+R`).
- **Ollama not detected**: Verify Ollama is running locally via `ollama list` in your terminal and accessible at `http://localhost:11434`.
- **Database reset**: If local database needs to be reset, use `DevPulse: Reset Local Data` or click **Clear Local Telemetry Database** in the Settings & Privacy view. A timestamped `.bak` backup will be created automatically before reset.
- **Port conflicts**: DevPulse dynamically checks ports via local socket probing. Use the System Intelligence port table to view and safely free occupied developer ports.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
