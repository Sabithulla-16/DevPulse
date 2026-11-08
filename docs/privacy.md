# Privacy & Data Sovereignty Policy

DevPulse is designed from the ground up as a **local-first** developer observability and intelligence tool. Your code, telemetry, and metrics belong to you.

---

## 1. Local-First Architecture

- **100% On-Device Persistence**: All telemetry metrics, historical records, and configuration settings are stored locally in an on-device SQLite database via **SQL.js WebAssembly** located in your VS Code extension global storage (`globalStorageUri`).
- **Zero Remote Telemetry**: DevPulse contains **no tracking beacons**, no telemetry collectors, and no analytic reporting pings.
- **Offline Capable**: System monitoring, workspace scanning, Git analysis, coding intelligence, and local Ollama AI generation operate completely offline without network access.

---

## 2. Secrets & Credential Security

- **VS Code SecretStorage**: API keys for cloud AI providers (OpenAI, Anthropic, Gemini, Groq, custom endpoints) and API Testing Studio authentication credentials (Basic passwords, tokens) are stored exclusively in VS Code's encrypted `SecretStorage` (`context.secrets`).
- **Zero Plaintext Credentials**: Credentials are never written to the SQLite database file, never output in logs, and never exposed in webview state.
- **Credential Masking**: All Git remote URLs and API error logs automatically mask basic auth credentials and tokens before display.

---

## 3. Disclosures: When External Network Calls Occur

DevPulse makes external network requests only under the following user-initiated conditions:

1. **Cloud AI Generation**: When you explicitly send a message in the AI Playground configured with a cloud provider (OpenAI, Anthropic, Gemini, Groq, or custom endpoints). Only the active prompt and explicitly selected context files (up to 5 files, 256KB max) are transmitted.
2. **API Testing Studio**: When you click **Send** or execute a collection runner in API Testing Studio, the extension dispatches HTTP requests to the target endpoints you specified.
3. **Local Ingestion Server**: When you configure your backend application with the DevPulse middleware, your application posts local HTTP metrics to `http://127.0.0.1:4318`. This server binds strictly to localhost and does not listen on public interfaces.

---

## 4. User Data Sovereignty & Export

- **Export Local Telemetry**: Export your complete historical SQLite telemetry dataset in human-readable JSON format via **Settings & Privacy** → **Export Telemetry Data**.
- **Database Reset & Backups**: Clearing your local database generates an automatic timestamped backup copy (`devpulse.sqlite.bak-<timestamp>`) before re-initializing a clean schema, eliminating accidental data loss.
- **Multi-Workspace Isolation**: Telemetry and coding sessions are strictly isolated by workspace ID to prevent telemetry bleeding across distinct client repositories or proprietary projects.
