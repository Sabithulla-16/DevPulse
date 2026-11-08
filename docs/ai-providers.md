# AI Providers & Model Configuration

DevPulse features a unified **AI Playground** that supports both local on-device LLMs and popular cloud AI APIs. All API keys and secrets are stored exclusively in VS Code `SecretStorage` and are never written to disk, SQLite, or transmitted in telemetry.

---

## 1. Local AI: Ollama (Recommended)

DevPulse provides first-class support for **Ollama**, enabling 100% private, on-device AI generation with **$0.00 spend**.

### Setup
1. Download and run [Ollama](https://ollama.ai) on your system.
2. Pull your preferred model:
   ```bash
   ollama pull llama3
   ollama pull deepseek-r1
   ollama pull qwen2.5-coder
   ```
3. In DevPulse, open the **AI Playground** and select **Models & Providers**.
4. DevPulse automatically queries `http://localhost:11434/api/tags` to discover all installed models without requiring API keys.

---

## 2. Cloud AI Providers

DevPulse provides built-in streaming adapters for major cloud LLM providers:

| Provider | Supported Models | SecretStorage Key |
|---|---|---|
| **OpenAI** | GPT-4o, GPT-4o-mini, o1, o3-mini | `devpulse.ai.apiKey.openai` |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus | `devpulse.ai.apiKey.anthropic` |
| **Google Gemini**| Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash | `devpulse.ai.apiKey.gemini` |
| **Groq** | Llama 3.3 70B, DeepSeek R1 Distill, Mixtral 8x7B | `devpulse.ai.apiKey.groq` |

### Setting Cloud API Keys
1. Open **AI Playground** → **Models & Providers** (or **Settings & Privacy**).
2. Click **Configure Key** for the desired provider.
3. Paste your API key. The key is securely saved in `context.secrets`.
4. Click **Test Connection** to verify latency and model access.

---

## 3. Custom OpenAI-Compatible Endpoints

Connect private LLM deployments, internal company proxies, or alternative cloud providers (e.g. vLLM, LM Studio, Together AI, OpenRouter, DeepSeek).

### Configuration Parameters
- **Provider Name**: Descriptive identifier (e.g., `Local LM Studio`, `Together AI`).
- **Base URL**: HTTP endpoint base (e.g., `http://localhost:1234/v1` or `https://api.together.xyz/v1`).
- **Model IDs**: Comma-separated list of model IDs available on the server.
- **Headers (Optional)**: Custom HTTP headers required for corporate gateways.
- **API Key (Optional)**: Stored in VS Code `SecretStorage`.

---

## 4. Context File Attachments

Attach relevant workspace files directly to prompt queries:
- **Limit**: Up to 5 files per message.
- **Max File Size**: 256 KB per file.
- **Token Estimation**: Live token estimator computes input overhead prior to generation.
- **Privacy Enforcement**: Files are read only upon explicit user selection via the Context Selector UI. DevPulse never scans workspace code in the background for AI ingestion.

---

## 5. Prompt Studio & Presets

- **Prompt Templates**: Create and organize reusable prompts with `{{variable}}` substitution.
- **Version Tracking**: Retain historical template versions for reproducibility.
- **Generation Presets**: Built-in and user-defined sampling profiles (`Balanced`, `Creative`, `Deterministic`, `Code Generation`).
