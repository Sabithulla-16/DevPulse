# Changelog

All notable changes to the DevPulse extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-11-08

### Added
- **Unified Overview Dashboard**: Interactive KPI metrics across CPU, RAM, disk storage, active coding session, Git status, API telemetry, and AI token accounting.
- **Deep-Link Navigation**: Clickable metric cards with seamless routing into detailed intelligence modules.
- **Pulse Insights**: Cross-module correlation engine analyzing patterns across System, Workspace, Git, Coding, API, and AI modules with evidence drawers and health scorecards.
- **AI Playground**: Single-model streaming chat supporting local Ollama (`$0.00` cost), OpenAI, Anthropic, Gemini, Groq, and custom OpenAI-compatible endpoints.
- **Prompt Studio**: Built-in template manager supporting `{{variable}}` substitution, categorization, and version snapshots.
- **Context Attachments**: Selective file attachments (up to 5 files, 256KB max) with real-time input token estimation.
- **API Testing Studio**: Full-featured HTTP client embedded in VS Code with collection management, environments, pre-request & assertion scripts, and collection runners.
- **API Intelligence**: Local developer telemetry ingestion server (`http://127.0.0.1:4318`) with Express middleware integration, tracking HTTP request volume, error rates, and exact P95/P99 latency percentiles.
- **Coding Intelligence**: Privacy-preserving active session focus tracking and programming language distribution.
- **Git Intelligence**: Multi-root repository observability, branch topology, uncommitted diffs, and commit velocity charts.
- **System Monitoring**: Hardware load telemetry, active process monitor with safe termination, and dynamic localhost port probing with a 1-click Free Port action.
- **Workspace File Scanner**: Fast asynchronous filesystem scanner with extension breakdowns, duplicate file detection, and largest files audit.
- **Settings & Privacy Center**: Granular threshold controls for CPU, RAM, and Disk alerts, Ollama host endpoints, and local telemetry export.

### Improved
- **Centralized Navigation Architecture**: Aligned VS Code activity bar tree view and webview dashboard sidebar under a unified navigation registry.
- **Production UI Polish**: Purged all development-stage tags and placeholders across the entire interface.
- **High-DPI Branding**: 256 × 256 PNG extension icon optimized for high-resolution displays and the Visual Studio Marketplace.
- **Circular Ring Buffers**: Implemented SQLite trigger-based pruning capping API request events at 10,000 rows, request history at 500 rows, and pulse insights at 1,000 items.

### Security
- **Path Traversal Protection**: Enforced strict canonical workspace root containment in `READ_WORKSPACE_FILE`, preventing access outside active workspace folders.
- **Cross-Origin Credential Stripping**: Automatic sanitization of `Authorization`, `Cookie`, and `Proxy-Authorization` headers upon cross-domain redirects in API Testing Studio.
- **SecretStorage Offloading**: Moved all cloud provider API keys, Basic Auth passwords, and OAuth tokens exclusively into VS Code `SecretStorage` (`context.secrets`) with opaque database references.
- **Multi-Workspace Isolation**: Strictly scoped all AI and coding repository queries by `workspaceId` to prevent telemetry bleed across projects.
- **Credential Masking**: Sanitized Git remote URLs and API error logs to ensure credentials are never exposed in user interfaces.

### Fixed
- **Database Durability Fallback**: Added automatic creation of timestamped `.bak` copies before any corruption recovery attempts to prevent accidental data loss.
- **Transactional Migrations**: Wrapped all SQLite migrations in atomic `BEGIN TRANSACTION` and `COMMIT` blocks with automatic rollback on error.
- **Extension Deactivation**: Clean cooperative teardown of `PulseEngine` collectors and `ApiIngestionServer` on extension shutdown.
- **Port Probing Resilience**: Extended timeouts for Windows socket discovery and child process cleanup.

---

## [0.6.0] - 2026-11-08

### Added
- Dedicated AI Playground with real-time SSE/NDJSON streaming chat.
- Ollama local model auto-discovery via `/api/tags`.
- Prompt Studio template library and generation parameter controls.
- Initial Pulse Insights correlation engine and environment health overview.

---

## [0.5.0] - 2026-11-07

### Added
- API Testing Studio with request editor, headers, params, and response viewer.
- Environment variables and collection management.
- Test script runner with assertion execution.
- OpenAPI 3.0, HAR, and cURL import/export support.

---

## [0.4.0] - 2026-11-07

### Added
- Coding Intelligence session tracker with active versus idle duration calculation.
- API Intelligence telemetry server and Express middleware adapter.
- Deterministic P95 and P99 latency percentiles calculation.

---

## [0.3.0] - 2026-11-07

### Added
- Git Intelligence repository discovery, branch tracking, and commit velocity charts.
- AI token accounting, cost calculator, and provider key management.

---

## [0.2.0] - 2026-11-07

### Added
- System resource monitoring (CPU delta ticks, RAM utilization, mounted disk volumes).
- Top process monitoring and safe process termination.
- Workspace file scanner with extension breakdown and duplicate file detection.

---

## [0.1.0] - 2026-11-07

### Added
- Core DevPulse engine, collector registry, and event bus.
- WebAssembly SQLite database integration via SQL.js.
