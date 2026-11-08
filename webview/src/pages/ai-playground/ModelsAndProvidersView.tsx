import React, { useState, useEffect } from 'react';
import {
  Server,
  Cloud,
  Cpu,
  Key,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sliders,
  Check,
  X,
  Eye,
  EyeOff,
  Activity
} from 'lucide-react';
import type { AiProviderInfo, AiCustomProvider } from '../../types';

interface ModelsAndProvidersViewProps {
  providers: AiProviderInfo[];
  customProviders: AiCustomProvider[];
  onTestProvider: (providerId: string) => void;
  onSetProviderKey: (providerId: string, apiKey?: string, endpoint?: string, customModel?: string) => void;
  onSetOllamaHost: (host?: string) => void;
  onDiscoverModels: (providerId: string) => void;
  onAddCustomProvider: (
    name: string,
    baseUrl: string,
    modelIds: string[],
    apiKey?: string,
    headers?: Record<string, string>
  ) => void;
  onDeleteCustomProvider: (id: string) => void;
  onSelectModelForChat?: (providerId: string, modelId: string) => void;
}

export const ModelsAndProvidersView: React.FC<ModelsAndProvidersViewProps> = ({
  providers,
  customProviders,
  onTestProvider,
  onSetProviderKey,
  onSetOllamaHost,
  onDiscoverModels,
  onAddCustomProvider,
  onDeleteCustomProvider,
  onSelectModelForChat
}) => {
  // Key configuration modal state
  const [keyModalProvider, setKeyModalProvider] = useState<AiProviderInfo | null>(null);
  const [inputApiKey, setInputApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [ollamaHostInput, setOllamaHostInput] = useState('http://localhost:11434');

  // Custom provider modal state
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [customModelIds, setCustomModelIds] = useState('');
  const [customHeadersJson, setCustomHeadersJson] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (keyModalProvider) setKeyModalProvider(null);
        if (showCustomModal) setShowCustomModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyModalProvider, showCustomModal]);

  const ollamaProvider = providers.find(p => p.id === 'ollama');
  const cloudProviders = providers.filter(p => p.id !== 'ollama' && !p.id.startsWith('custom:'));

  const handleSaveKey = () => {
    if (!keyModalProvider) return;
    onSetProviderKey(keyModalProvider.id, inputApiKey.trim() || undefined);
    setKeyModalProvider(null);
    setInputApiKey('');
  };

  const handleSaveCustomProvider = () => {
    setCustomError(null);
    if (!customName.trim()) {
      setCustomError('Provider name is required');
      return;
    }
    if (!customBaseUrl.trim()) {
      setCustomError('Base URL is required');
      return;
    }

    const models = customModelIds
      .split(',')
      .map(m => m.trim())
      .filter(Boolean);

    if (models.length === 0) {
      setCustomError('At least one model ID is required (e.g. llama-3, mistral-large)');
      return;
    }

    let parsedHeaders: Record<string, string> | undefined;
    if (customHeadersJson.trim()) {
      try {
        parsedHeaders = JSON.parse(customHeadersJson);
      } catch (e: any) {
        setCustomError('Invalid headers JSON format');
        return;
      }
    }

    onAddCustomProvider(
      customName.trim(),
      customBaseUrl.trim(),
      models,
      customApiKey.trim() || undefined,
      parsedHeaders
    );

    setShowCustomModal(false);
    setCustomName('');
    setCustomBaseUrl('');
    setCustomApiKey('');
    setCustomModelIds('');
    setCustomHeadersJson('');
  };

  return (
    <div className="playground-shell flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Server className="w-6 h-6 text-indigo-400" />
          AI Models &amp; Providers
        </h1>
        <p className="text-sm opacity-70 mt-1">
          Manage cloud AI credentials, local Ollama endpoints, and custom OpenAI-compatible providers.
        </p>
      </div>

      {/* Cloud Providers Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider opacity-70 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-sky-400" />
            Cloud AI Providers
          </h2>
          <span className="text-xs opacity-60">API keys stored securely in VS Code SecretStorage</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cloudProviders.map(provider => {
            const isConfigured = provider.isConfigured ?? (provider.status === 'connected' || provider.status === 'disconnected');
            const isHealthy = provider.isHealthy ?? (provider.connectionStatus === 'connected' || provider.status === 'connected');
            const models = provider.availableModels || [];

            return (
              <div
                key={provider.id}
                className="playground-card rounded-xl p-5 flex flex-col justify-between min-h-[220px]"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-base">{provider.name}</span>
                        {isConfigured ? (
                          isHealthy ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-950/40 text-amber-400 border border-amber-800/40 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" /> Check Key
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium opacity-60 playground-card px-2 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" /> Not Configured
                          </span>
                        )}
                      </div>
                      <p className="text-xs opacity-60 mt-1">
                        ID: <code className="font-mono font-medium">{provider.id}</code>
                        {provider.lastSyncedAt ? (
                          <span className="ml-2 opacity-50">
                            • Synced {new Date(provider.lastSyncedAt).toLocaleTimeString()}
                          </span>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onDiscoverModels(provider.id)}
                        title="Discover Available Models"
                        className="playground-card flex items-center gap-1 px-2.5 py-1 rounded-md text-xs opacity-75 hover:opacity-100 transition cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline text-[11px]">Sync</span>
                      </button>
                      <button
                        onClick={() => {
                          setKeyModalProvider(provider);
                          setInputApiKey('');
                          setShowKey(false);
                        }}
                        title="Configure API Key"
                        className="playground-card flex items-center gap-1 px-2.5 py-1 rounded-md text-xs opacity-75 hover:opacity-100 transition cursor-pointer"
                      >
                        <Key className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[11px]">Key</span>
                      </button>
                    </div>
                  </div>

                  {/* Models list */}
                  <div className="mt-4">
                    <span className="text-[11px] font-medium uppercase tracking-wider opacity-60">
                      Models ({models.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5 max-h-28 overflow-y-auto models-badge-scroll pr-1">
                      {models.length > 0 ? (
                        models.map(m => (
                          <button
                            key={m}
                            onClick={() => onSelectModelForChat?.(provider.id, m)}
                            title={`Start conversation with ${m}`}
                            className="text-xs font-mono playground-card hover:tab-active-neutral px-2 py-0.5 rounded transition cursor-pointer"
                          >
                            {m}
                          </button>
                        ))
                      ) : (
                        <span className="text-xs opacity-50 italic">No models discovered yet. Set key &amp; sync.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-xs opacity-70">
                  <span>
                    Tokens: <strong className="font-semibold">{(provider.totalTokens || 0).toLocaleString()}</strong>
                  </span>
                  <button
                    onClick={() => onTestProvider(provider.id)}
                    className="playground-card flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer hover:border-[var(--color-foreground-muted)] active:scale-95"
                  >
                    <Activity className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Test Connection</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Local Ollama Section */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider opacity-70 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-emerald-400" />
          Local AI — Ollama
        </h2>

        <div className="playground-card rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base">Ollama Local Instance</span>
                {(ollamaProvider?.isConfigured ?? ollamaProvider?.status === 'connected') &&
                (ollamaProvider?.isHealthy ?? (ollamaProvider?.connectionStatus === 'connected' || ollamaProvider?.status === 'connected')) ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" /> Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium opacity-60 playground-card px-2 py-0.5 rounded-full">
                    <AlertTriangle className="w-3 h-3" /> Offline / Unreachable
                  </span>
                )}
              </div>
              <p className="text-xs opacity-60 mt-1">
                Zero cloud cost, private on-device execution. Requires local Ollama running.
              </p>
            </div>

            {/* Host Configuration */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={ollamaHostInput}
                onChange={e => setOllamaHostInput(e.target.value)}
                placeholder="http://localhost:11434"
                className="playground-input text-xs rounded-lg px-3 py-2 focus:outline-none font-mono w-60 border"
              />
              <button
                onClick={() => onSetOllamaHost(ollamaHostInput.trim())}
                className="btn-theme-primary px-3.5 py-2 text-xs rounded-lg font-medium transition cursor-pointer"
              >
                Save Host
              </button>
              <button
                onClick={() => onDiscoverModels('ollama')}
                className="playground-card flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition cursor-pointer"
                title="Discover installed Ollama models"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sync</span>
              </button>
            </div>
          </div>

          {/* Ollama Models */}
          <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10">
            <span className="text-[11px] font-medium uppercase tracking-wider opacity-60">
              Installed Models ({ollamaProvider?.availableModels?.length || 0})
            </span>
            <div className="flex flex-wrap gap-2 mt-2">
              {ollamaProvider?.availableModels && ollamaProvider.availableModels.length > 0 ? (
                ollamaProvider.availableModels.map(m => (
                  <button
                    key={m}
                    onClick={() => onSelectModelForChat?.('ollama', m)}
                    title={`Start conversation with ${m}`}
                    className="text-xs font-mono playground-card hover:tab-active-neutral px-2.5 py-1 rounded transition cursor-pointer"
                  >
                    {m}
                  </button>
                ))
              ) : (
                <div className="text-xs opacity-50 italic">
                  No models detected. Ensure Ollama is running and pull models using <code className="opacity-80">ollama run llama3</code>.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Custom OpenAI-Compatible Providers */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider opacity-70 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-400" />
              Custom OpenAI-Compatible Endpoints
            </h2>
            <p className="text-xs opacity-60 mt-0.5">
              Connect to vLLM, LM Studio, LocalAI, Together AI, DeepSeek, or OpenRouter.
            </p>
          </div>
          <button
            onClick={() => setShowCustomModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 btn-theme-primary text-xs font-medium rounded-lg transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add Provider
          </button>
        </div>

        {customProviders.length === 0 ? (
          <div className="playground-card border-dashed rounded-xl p-8 text-center opacity-60 text-xs">
            No custom providers added yet. Connect any API that supports the OpenAI chat completion format.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customProviders.map(cp => (
              <div
                key={cp.id}
                className="playground-card rounded-xl p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-base">{cp.name}</span>
                        <span className="text-[11px] font-mono bg-purple-950/40 text-purple-400 border border-purple-800/40 px-2 py-0.5 rounded-full">
                          OpenAI Compatible
                        </span>
                      </div>
                      <p className="text-xs font-mono opacity-60 mt-1 truncate max-w-xs">{cp.baseUrl}</p>
                    </div>

                    <button
                      onClick={() => onDeleteCustomProvider(cp.id)}
                      className="p-1.5 opacity-60 hover:text-red-400 rounded transition cursor-pointer"
                      title="Delete Provider"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-4">
                    <span className="text-[11px] font-medium uppercase tracking-wider opacity-60">
                      Registered Models ({cp.modelIds.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5 max-h-28 overflow-y-auto models-badge-scroll pr-1">
                      {cp.modelIds.map(m => (
                        <button
                          key={m}
                          onClick={() => onSelectModelForChat?.(`custom:${cp.id}`, m)}
                          title={`Start conversation with ${m}`}
                          className="text-xs font-mono playground-card hover:tab-active-neutral px-2 py-0.5 rounded transition cursor-pointer"
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-xs opacity-70">
                  <span>Has API Key: <strong className="font-semibold">{cp.hasKey ? 'Yes' : 'No'}</strong></span>
                  <button
                    onClick={() => onTestProvider(`custom:${cp.id}`)}
                    className="playground-card flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer hover:border-[var(--color-foreground-muted)] active:scale-95"
                  >
                    <Activity className="w-3.5 h-3.5 text-purple-400" />
                    <span>Test Connection</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Set API Key Modal */}
      {keyModalProvider && (
        <div
          onClick={e => {
            if (e.target === e.currentTarget) setKeyModalProvider(null);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="playground-card rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl border">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                Configure Key for {keyModalProvider.name}
              </h3>
              <button
                onClick={() => setKeyModalProvider(null)}
                className="opacity-60 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs opacity-70">
              API keys are stored exclusively in your local VS Code SecretStorage and are never saved in SQLite or synced externally.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium opacity-80">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={inputApiKey}
                  onChange={e => setInputApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="playground-input w-full rounded-lg px-3 py-2 pr-10 text-xs focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 cursor-pointer"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] opacity-50">Leave blank to remove existing key.</p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setKeyModalProvider(null)}
                className="px-4 py-2 playground-card rounded-lg text-xs opacity-70 hover:opacity-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveKey}
                className="px-4 py-2 btn-theme-primary rounded-lg text-xs font-medium transition cursor-pointer"
              >
                Save Secret
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Provider Modal */}
      {showCustomModal && (
        <div
          onClick={e => {
            if (e.target === e.currentTarget) setShowCustomModal(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="playground-card rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl border">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Sliders className="w-4 h-4 text-purple-400" />
                Add Custom OpenAI-Compatible Provider
              </h3>
              <button
                onClick={() => setShowCustomModal(false)}
                className="opacity-60 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {customError && (
              <div className="bg-red-950/40 border border-red-800/60 text-red-300 px-3 py-2 rounded text-xs">
                {customError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium opacity-80">Provider Name *</label>
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="e.g. Local vLLM, Together AI, OpenRouter"
                  className="playground-input w-full rounded-lg px-3 py-2 text-xs focus:outline-none mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-medium opacity-80">Base URL *</label>
                <input
                  type="text"
                  value={customBaseUrl}
                  onChange={e => setCustomBaseUrl(e.target.value)}
                  placeholder="e.g. http://localhost:8000/v1 or https://api.together.xyz/v1"
                  className="playground-input w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-medium opacity-80">Model IDs (comma-separated) *</label>
                <input
                  type="text"
                  value={customModelIds}
                  onChange={e => setCustomModelIds(e.target.value)}
                  placeholder="e.g. mistralai/Mixtral-8x7B-Instruct-v0.1, llama3:70b"
                  className="playground-input w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-medium opacity-80">API Key (Optional)</label>
                <input
                  type="password"
                  value={customApiKey}
                  onChange={e => setCustomApiKey(e.target.value)}
                  placeholder="Bearer token or API Key"
                  className="playground-input w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-medium opacity-80">Custom Headers JSON (Optional)</label>
                <textarea
                  value={customHeadersJson}
                  onChange={e => setCustomHeadersJson(e.target.value)}
                  rows={2}
                  placeholder='{"HTTP-Referer": "https://devpulse.local", "X-Title": "DevPulse"}'
                  className="playground-input w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none mt-1 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setShowCustomModal(false)}
                className="px-4 py-2 playground-card rounded-lg text-xs opacity-70 hover:opacity-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustomProvider}
                className="px-4 py-2 btn-theme-primary rounded-lg text-xs font-medium transition cursor-pointer"
              >
                Register Provider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
