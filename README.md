<div align="center">

# DevPulse

**A local-first developer intelligence and observability platform for Visual Studio Code.**

[![Release](https://img.shields.io/badge/Release-v1.0.0-0284c7?style=flat-square)](https://github.com/Sabithulla-16/DevPulse/releases/tag/v1.0.0)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.95.0-007acc?style=flat-square&logo=visualstudiocode)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Local First](https://img.shields.io/badge/Architecture-Local--First-10b981?style=flat-square)](#privacy--data-sovereignty)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://react.dev/)

<p align="center">
  <a href="#introduction">Introduction</a> •
  <a href="#core-features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#installation">Installation</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#ai-providers">AI Providers</a> •
  <a href="#api-intelligence">API Intelligence</a> •
  <a href="#privacy--data-sovereignty">Privacy</a> •
  <a href="#docs">Documentation</a>
</p>

</div>

---

## Introduction

Modern software development requires balancing local machine resources, Git workflows, coding sessions, cloud AI expenditures, and microservice APIs. Developers typically juggle separate terminal windows, activity monitors, Git GUIs, API clients, and browser dashboards just to understand the state of their development environment.

**DevPulse** consolidates this fragmented tooling into a single, cohesive observability center embedded directly within Visual Studio Code. Operating with a strict **local-first** philosophy, DevPulse captures real-time hardware telemetry, analyzes Git commit velocity, tracks active coding focus, logs API response latency, and monitors on-device/cloud AI tokens — **storing 100% of data locally on your device with zero telemetry tracking**.

---

## Core Features

### 1. Overview Dashboard
- **Unified Health Snapshot**: Real-time KPI summary across system CPU, RAM, storage, active coding session, Git status, API requests, and AI tokens.
- **Deep-Link Navigation**: Click any KPI card to transition directly into the corresponding detailed intelligence module.
- **Authentic Telemetry**: Zero synthetic or mock metrics. Intuitive empty states guide service setup when integrations are inactive.

### 2. Pulse Insights
- **Cross-Module Correlation Engine**: Synthesizes telemetry across System, Files, Git, Coding, API, and AI modules to identify meaningful development trends.
- **Deterministic Rule Triggers**: Evaluates mathematical anomalies (e.g., elevated API error rates coinciding with high CPU utilization or heavy Git commit cycles).
- **Explainable Evidence Drawer**: Inspect the underlying evidence, sample values, confidence scores, and time-window bounds for every generated insight.
- **Explain with AI**: Generate deep-dive diagnostic contextual explanations on detected patterns using your configured LLM provider.

### 3. System Intelligence & Monitoring
- **Hardware Telemetry**: Delta-calculated CPU utilization, RAM usage, and mounted storage capacity.
- **Active Process Monitor**: Real-time list of top resource-consuming processes with safe termination capabilities for runaway development servers.
- **Dynamic Port Probing**: Automatically detects active localhost development ports (`3000`, `5173`, `8080`, `11434`, etc.) and provides a 1-click **Free Port** action to release occupied sockets.

### 4. Workspace & File Intelligence
- **Asynchronous Filesystem Scanner**: Recursively scans workspace folders without blocking the VS Code UI thread.
- **File Distribution & Extension Breakdown**: Size distribution charts and file-type categorizations.
- **Duplicate File Detection**: Identifies redundant duplicate files using fast hash comparisons.
- **Largest Files Audit**: Quickly find oversized assets or unignored build directories consuming workspace storage.

### 5. Git Intelligence
- **Repository Observability**: Multi-root workspace discovery, branch tracking, and uncommitted diff counts.
- **Commit History & Author Analytics**: Commit frequency charts, commit velocity, and author contribution rankings.
- **Credential Masking**: Automatically sanitizes sensitive basic auth credentials or tokens in Git remote URLs before display.

### 6. Coding Intelligence
- **Focus & Session Tracking**: Tracks active keyboard/editor engagement versus idle time without ever logging raw code or keystrokes.
- **Language Distribution**: Breaks down time spent across languages (TypeScript, Python, Rust, Go, CSS, etc.).
- **Multi-Workspace Isolation**: Keeps telemetry strictly isolated per project root to prevent client data leakage.

### 7. AI Playground & Usage Analytics
- **Unified AI Workspace**: Single-model streaming chat (SSE/NDJSON) supporting local Ollama (`$0.00` spend), OpenAI, Anthropic, Google Gemini, Groq, and custom OpenAI-compatible endpoints.
- **Prompt Studio**: Built-in template manager with `{{variable}}` substitution and snapshot versioning.
- **Context Attachments**: Securely attach up to 5 workspace files (256 KB limit per file) with live input token calculation.
- **Token Telemetry**: In-depth prompt and completion token accounting with estimated cloud cost tracking and budget caps.

### 8. API Intelligence & Testing Studio
- **Inbound Server Telemetry**: Embedded local ingestion server (`http://127.0.0.1:4318`) with Express middleware integration, tracking HTTP request counts, status codes, and exact P95/P99 latency percentiles.
- **API Testing Studio**: Embedded HTTP client with collection management, environment variables, secret variable offloading into VS Code `SecretStorage`, and assertion scripts.
- **Cross-Origin Security**: Strips sensitive `Authorization` and `Cookie` headers upon cross-domain redirects.

### 9. Alerts & Notification Center
- **Configurable Thresholds**: Set custom warning triggers for CPU load, RAM usage, and disk capacity.
- **Cooldown Safeguards**: Configurable cooldown intervals prevent alert storms during heavy compilation bursts.

---

## Architecture

DevPulse is built using modern VS Code Extension Architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension Host                   │
│                                                             │
│  PulseEngine ──┬── CollectorRegistry (System, Git, Coding)  │
│                ├── EventBus & Normalizer                     │
│                ├── SQLite Database (SQL.js WebAssembly)     │
│                ├── AI Provider Registry & Adapters          │
│                ├── API Ingestion Server (Express/HTTP)      │
│                └── AlertEngine                              │
└──────────────────────────────┬──────────────────────────────┘
                               │ IPC (JSON RPC Messages)
┌──────────────────────────────▼──────────────────────────────┐
│                  VS Code Webview Panel                      │
│                                                             │
│  React 19 Dashboard ──┬── Overview & Health Scorecards      │
│                       ├── Pulse Insights & Evidence Drawer  │
│                       ├── AI Playground & Prompt Studio     │
│                       ├── API Testing Studio & Collections  │
│                       └── System & Git Visualizations       │
└─────────────────────────────────────────────────────────────┘
```

- **Extension Host**: Pure TypeScript running on Node.js inside the VS Code Extension Runtime.
- **Webview UI**: Built with React 19, Tailwind CSS, Monaco Editor, Lucide Icons, and bundled via Vite.
- **Local Persistence**: Embedded SQLite WebAssembly runtime (`sql-wasm.wasm`) executing 8 transactional migrations with automatic circular ring buffer triggers.
- **Secret Storage**: Provider API keys and environment secrets reside in VS Code `SecretStorage` (`context.secrets`).

---

## Installation

### Method 1: Visual Studio Code Marketplace
1. Open VS Code and press `Ctrl+Shift+X` (or `Cmd+Shift+X` on macOS).
2. Search for **DevPulse**.
3. Click **Install**.

### Method 2: Manual VSIX Package
Download the latest `devpulse-1.0.0.vsix` from [GitHub Releases](https://github.com/Sabithulla-16/DevPulse/releases) and install via CLI:

```bash
code --install-extension devpulse-1.0.0.vsix
```

Alternatively, open the Extensions view in VS Code, click `...` → **Install from VSIX...**, and choose the `.vsix` file.

---

## Getting Started

1. **Open DevPulse**: Click the DevPulse icon in the Activity Bar or press `Ctrl+Shift+P` and execute `DevPulse: Open Dashboard`.
2. **Review System Health**: The Overview dashboard immediately surfaces your CPU, memory, and storage utilization.
3. **Connect AI (Optional)**: Open **AI Playground** → **Models & Providers** to discover local Ollama models (`http://localhost:11434`) or input cloud API keys.
4. **Scan Workspace**: Navigate to **File Intelligence** and click **Scan Workspace** to audit disk space and duplicate files.
5. **Monitor APIs**: Follow the [API Intelligence Guide](docs/api-intelligence.md) to integrate the local telemetry middleware with your backend services.

---

## AI Providers

DevPulse supports both zero-cost local LLMs and major cloud inference providers:

| Provider | Supported Models | Key Storage |
|---|---|---|
| **Ollama** | Llama 3, DeepSeek R1, Qwen 2.5 Coder, Mistral, Phi | Zero key required (Auto-discovery) |
| **OpenAI** | GPT-4o, GPT-4o-mini, o1, o3-mini | VS Code `SecretStorage` |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus | VS Code `SecretStorage` |
| **Google Gemini** | Gemini 2.0 Flash, Gemini 1.5 Pro | VS Code `SecretStorage` |
| **Groq** | Llama 3.3 70B, DeepSeek R1 Distill | VS Code `SecretStorage` |
| **Custom OpenAI** | vLLM, LM Studio, Together AI, OpenRouter | VS Code `SecretStorage` |

For detailed setup instructions, refer to [`docs/ai-providers.md`](docs/ai-providers.md).

---

## API Intelligence Setup

Connect your backend applications to DevPulse's local telemetry server (`http://127.0.0.1:4318`):

```javascript
const express = require('express');
const app = express();

const DEVPULSE_TOKEN = process.env.DEVPULSE_SERVICE_TOKEN;

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    fetch('http://127.0.0.1:4318/v1/telemetry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEVPULSE_TOKEN}`
      },
      body: JSON.stringify({
        serviceName: 'backend-api',
        method: req.method,
        routeTemplate: req.route ? req.route.path : req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start
      })
    }).catch(() => {});
  });
  next();
});
```

For advanced testing studio features, assertion scripts, and collection runners, see [`docs/api-intelligence.md`](docs/api-intelligence.md).

---

## Privacy & Data Sovereignty

- **100% On-Device Persistence**: Metrics are written to your local SQLite database file in VS Code global storage.
- **Zero Remote Telemetry**: DevPulse never transmits tracking telemetry, analytics, or background pings to external servers.
- **SecretStorage Isolation**: API keys and secrets are never stored in SQLite or exposed to webviews.
- **Local Data Export**: Export your complete historical dataset in human-readable JSON format at any time via **Settings & Privacy**.
- **Transparent Disclosures**: External network requests occur exclusively when you explicitly prompt a cloud AI provider or execute a request in API Testing Studio.

Read our complete policy in [`docs/privacy.md`](docs/privacy.md).

---

## Documentation

Detailed guides are available in the [`docs/`](docs/) directory:

- [Installation Guide](docs/installation.md)
- [Configuration & Settings](docs/configuration.md)
- [AI Providers & Model Setup](docs/ai-providers.md)
- [API Intelligence & Testing Studio](docs/api-intelligence.md)
- [Privacy & Data Sovereignty](docs/privacy.md)

---

## Project Structure

```text
DEVPULSE/
├── .github/workflows/    # CI/CD and release automation
├── docs/                 # User-facing product documentation
├── resources/icons/      # Extension vector & 256x256 PNG icons
├── src/                  # VS Code extension host (TypeScript)
│   ├── collectors/       # Hardware, process, port, git, and file collectors
│   ├── core/             # Engine, scheduler, event bus, alert engine
│   ├── database/         # SQLite SQL.js WASM repository layer & migrations
│   ├── services/         # AI registry, API ingestion server, coding tracker
│   └── shared/           # Navigation registry and IPC message schemas
├── tests/                # Vitest automated test suite (141 tests)
├── webview/              # React 19 dashboard application (Vite + Tailwind)
├── package.json          # Extension manifest & contributes definitions
└── esbuild.js            # Node CommonJS extension bundler
```

---

## Contributing

Contributions, bug reports, and suggestions are welcome! Please open an issue or pull request on [GitHub](https://github.com/Sabithulla-16/DevPulse).

1. Fork the repository and clone it locally.
2. Install dependencies: `npm install`
3. Run the development build: `npm run watch`
4. Run tests and typechecking: `npm test && npm run typecheck`
5. Submit a pull request with clear release notes.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## Acknowledgements

DevPulse is built with and powered by:
- [Visual Studio Code Extension API](https://code.visualstudio.com/api)
- [SQL.js (SQLite WebAssembly)](https://sql.js.org/)
- [React](https://react.dev/) & [Tailwind CSS](https://tailwindcss.com/)
- [Vite](https://vite.dev/) & [esbuild](https://esbuild.github.io/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [Lucide Icons](https://lucide.dev/)
