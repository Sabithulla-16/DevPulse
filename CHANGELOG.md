# DevPulse Changelog

All notable changes to the DevPulse extension will be documented in this file.

## [1.0.0] — Phase 8: Production Release & Stabilization

### Added & Unified
- **Centralized Navigation Architecture**:
  - Unified navigation registry shared across the VS Code sidebar (`MonitorTreeProvider`) and the React dashboard (`Sidebar.tsx`).
  - Structured 6-category hierarchy: `OVERVIEW`, `INTELLIGENCE`, `AI`, `DEVELOPMENT TOOLS`, `MONITORING`, and `CONFIGURATION`.
  - Comprehensive elimination of all development-stage labels (`Phase 2`, `Phase 4 Reserved`, `Preview`, `Temporary`).
  - Direct deep linking between sidebar items and webview routes.
- **Overview Dashboard Finalization**:
  - Clickable KPI metric cards linking to detailed modules (CPU/RAM to System Intelligence, Storage to File Intelligence, AI Tokens to AI Playground, Git commits to Git Intelligence, Coding time to Coding Intelligence, API volume to API Intelligence).
  - Quick action modules for Pulse Insights and API Testing Studio.
  - 100% real telemetry data with graceful, context-rich empty states for non-active services or unscanned folders.
- **Settings & Privacy Center**:
  - Granular threshold controls for CPU, RAM, Disk, and Alert cooldown intervals.
  - Git synchronization intervals and commit history depth configuration.
  - Local AI Ollama host configuration and token budget caps.
  - API Ingestion port configuration, batch size limits, and test request timeouts.
  - Pulse Insights AI explanation toggle.
  - Local Telemetry Data Export saving sanitized JSON logs via VS Code file dialog.

### Security Hardening & Isolation
- **Path Traversal Protection (SEC-01)**: Enforced strict canonical workspace root containment in `READ_WORKSPACE_FILE`, preventing access outside active workspace folders.
- **Cross-Origin Credential Stripping (SEC-02)**: Request executor automatically purges `Authorization`, `Cookie`, and `Proxy-Authorization` headers when handling cross-domain HTTP redirects.
- **SecretStorage Offloading (SEC-03)**: API Testing Studio automatically offloads Basic Auth passwords, API keys, and OAuth2 tokens into VS Code `SecretStorage`, replacing plaintext values with secure references.
- **Multi-Workspace Isolation (ISO-01)**: AI Intelligence repository queries strictly filtered by `workspaceId` to prevent cross-workspace telemetry leakage.

### Database Durability & Lifecycle
- **Zero Data Loss Fallback (DAT-01)**: Database initialization creates a timestamped backup (`devpulse.sqlite.bak-<timestamp>`) before attempting corruption recovery.
- **Transactional Migrations (DAT-02)**: All database migrations wrapped in atomic `BEGIN TRANSACTION` / `COMMIT` blocks with automatic rollback on error.
- **Clean Extension Deactivation (DAT-03)**: Extension `deactivate()` safely stops and awaits background polling engines and the API ingestion server.
- **Database Migration 8**: Added a circular 10,000-event ring buffer prune trigger on `api_request_events` and composite performance indices.

---

## [0.6.0] — Phase 7: AI Playground & Pulse Insights

### Added
- **AI Playground**: Complete architectural and UI replacement of legacy AI Intelligence with a full-fledged local/cloud AI workspace.
  - **Single-Model Interaction**: Enforced single-model conversations (strictly no model comparison).
  - **Streaming Chat Engine**: Real-time token streaming with server-sent events (SSE) and NDJSON support across all providers.
  - **Provider Ecosystem**:
    - Built-in adapters for **OpenAI**, **Anthropic**, **Gemini**, and **Groq**.
    - First-class local **Ollama** integration for zero-cost, private on-device generation.
    - User-defined **Custom OpenAI-Compatible Providers** (vLLM, LM Studio, Together AI, OpenRouter, DeepSeek).
  - **Context Selection**: Explicit workspace file attachments (max 5 files, 256KB per file limit) with instant preview and syntax badges.
  - **Prompt Studio**:
    - Reusable prompt template library with variable substitution (`{{variable}}`).
    - Template categorization (Coding, Architecture, Review, Refactoring, General).
    - Template versioning and snapshot tracking.
  - **Generation Parameter Controls**:
    - Interactive parameter controls: Temperature, Top-P, Top-K, Max Tokens, Frequency/Presence Penalties, Stop Sequences.
    - Pre-configured presets (Deterministic, Balanced, Creative, Code Generation, Quick Summary, Strict JSON).
    - Custom preset persistence.
  - **AI Telemetry & Usage Analytics**:
    - In-depth token consumption (input vs. output tokens) and estimated cloud cost calculation.
    - Local vs. cloud token distribution metrics.
    - Comprehensive historical AI request log with provider, model, latency, and duration tracking.
- **Pulse Insights**: Unified cross-module intelligence layer analyzing correlations across all 6 DevPulse modules.
  - **Environment Health Overview**: 6 module health scorecards (System, Workspace, Git, Coding, API, AI) with deterministic 0–100 health scoring and status classification.
  - **Correlation Engine**:
    - 5 deterministic cross-module correlation rules (Coding + AI, System + API, Git + Coding, Workspace + System, Multi-factor anomaly).
    - 15-minute time binning with strict mathematical trigger thresholds.
    - Safe, non-causal phrasing (e.g. "coincided with", "increased during periods of") to ensure explainable, objective reporting.
  - **Evidence Drawer**: Detailed evidence metric breakdown for every generated insight (values, thresholds, modules, timestamps).
  - **Explain with AI**: Deep-dive contextual explanation generator for any detected pattern using connected LLMs.
  - **Insight Lifecycle**: Mark as resolved, dismiss, and filter by module category or severity.
- **SQLite Database Migration 7**:
  - Tables added: `ai_conversations`, `ai_messages`, `ai_prompt_templates`, `ai_prompt_versions`, `ai_generation_presets`, `ai_custom_providers`, `pulse_insights`, and `pulse_insight_rules_state`.
  - Automatic 1,000-row ring buffer prune trigger on `pulse_insights`.
  - Built-in preset seed data.

### Security & Privacy
- **Zero Plaintext Secrets**: Custom provider and cloud provider API keys are exclusively stored in VS Code `SecretStorage` (`context.secrets`) and never written to SQLite or transmitted to the webview.
- **Explicit Privacy Safeguards**: Zero automatic workspace scanning or file ingestion for AI; only explicitly selected user files are attached.

---

## [0.5.0] — Phase 5: API Testing Studio
- Interactive API testing client embedded in VS Code.
- Multi-collection management, request builder, environments, variables, test scripts, and test runner.

## [0.4.0] — Phase 4: Coding & API Intelligence
- Coding session tracking, active intervals, and language distribution.
- Dev API telemetry server, latency tracking, P95 metrics, and endpoint observability.

## [0.3.0] — Phase 3: AI & Git Intelligence
- Multi-provider AI telemetry, Ollama model discovery, token accounting, and budget alerts.
- Multi-root Git repository observability, uncommitted diffs, and branch topology.

## [0.2.0] — Phase 2: System & Workspace Intelligence
- Node.js OS hardware telemetry (CPU, RAM, mounted disks, top processes, dynamic port probing).
- Fast asynchronous workspace file scanner, duplicate detection, and size analytics.

## [0.1.0] — Initial Foundation
- Core DevPulse engine, collector registry, event bus, and WebAssembly SQLite database.
