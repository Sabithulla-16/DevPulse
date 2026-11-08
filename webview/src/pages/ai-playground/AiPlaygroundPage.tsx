import React, { useState } from 'react';
import {
  MessageSquare,
  FileCode,
  Server,
  BarChart3,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { ConversationSidebar } from './ConversationSidebar';
import { ChatWorkspace } from './ChatWorkspace';
import { PromptStudioView } from './PromptStudioView';
import { ModelsAndProvidersView } from './ModelsAndProvidersView';
import { UsageAnalyticsView } from './UsageAnalyticsView';
import type {
  AiPlaygroundData,
  AiIntelligenceData,
  ContextAttachment,
  GenerationSettings,
  PromptTemplateInput,
  GenerationPresetInput
} from '../../types';

export interface AiPlaygroundPageProps {
  data: AiPlaygroundData;
  analyticsData?: AiIntelligenceData;
  streamingMessageId?: string | null;
  streamingContent?: string;
  isStreaming?: boolean;
  workspaceFiles: Array<{ path: string; name: string; size: number }>;
  analyticsTimeFilter: 'today' | '7d' | '30d' | '90d' | 'all';
  onSendMessage: (
    conversationId: string,
    content: string,
    attachments?: ContextAttachment[],
    settings?: GenerationSettings
  ) => void;
  onAbortStream: (conversationId: string) => void;
  onRegenerateMessage: (conversationId: string, messageId?: string) => void;
  onContinueMessage: (conversationId: string, messageId?: string) => void;
  onCreateConversation: (
    providerId: string,
    modelId: string,
    title?: string,
    systemPrompt?: string,
    settings?: GenerationSettings
  ) => void;
  onUpdateConversationSettings: (
    conversationId: string,
    providerId: string,
    modelId: string,
    settings?: GenerationSettings,
    systemPrompt?: string
  ) => void;
  onSelectConversation: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onRenameConversation: (conversationId: string, title: string) => void;
  onSaveTemplate: (input: PromptTemplateInput) => void;
  onDeleteTemplate: (id: string) => void;
  onSavePreset: (input: GenerationPresetInput) => void;
  onDeletePreset: (id: string) => void;
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
  onRequestWorkspaceFiles: (query?: string) => void;
  onAnalyticsTimeFilterChange: (filter: 'today' | '7d' | '30d' | '90d' | 'all') => void;
}

type PlaygroundTab = 'chat' | 'prompt-studio' | 'models' | 'analytics';

export const AiPlaygroundPage: React.FC<AiPlaygroundPageProps> = ({
  data,
  analyticsData,
  workspaceFiles,
  analyticsTimeFilter,
  onSendMessage,
  onAbortStream,
  onRegenerateMessage,
  onContinueMessage,
  onCreateConversation,
  onUpdateConversationSettings,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onSaveTemplate,
  onDeleteTemplate,
  onSavePreset,
  onDeletePreset,
  onTestProvider,
  onSetProviderKey,
  onSetOllamaHost,
  onDiscoverModels,
  onAddCustomProvider,
  onDeleteCustomProvider,
  onRequestWorkspaceFiles,
  onAnalyticsTimeFilterChange
}) => {
  const [activeTab, setActiveTab] = useState<PlaygroundTab>('chat');
  const [isConvSidebarOpen, setIsConvSidebarOpen] = useState(true);

  // Active settings for current conversation
  const [activeSettings, setActiveSettings] = useState<GenerationSettings>(
    data.activeConversation?.generationSettings || {
      temperature: 0.7,
      topP: 1.0,
      maxTokens: 2048
    }
  );

  const handleApplyPreset = (preset: any) => {
    const nextSettings = preset.settings;
    setActiveSettings(nextSettings);
    if (data.activeConversation) {
      onUpdateConversationSettings(
        data.activeConversation.id,
        data.activeConversation.providerId,
        data.activeConversation.modelId,
        nextSettings,
        nextSettings.systemPrompt
      );
    }
  };

  const handleUseTemplateInChat = (userPrompt: string, systemPrompt?: string) => {
    setActiveTab('chat');
    if (systemPrompt && data.activeConversation) {
      setActiveSettings(prev => ({ ...prev, systemPrompt }));
      onUpdateConversationSettings(
        data.activeConversation.id,
        data.activeConversation.providerId,
        data.activeConversation.modelId,
        { ...activeSettings, systemPrompt },
        systemPrompt
      );
    }
    // Pre-fill or start conversation
    if (!data.activeConversation) {
      const defaultProvider = data.providers.find(p => p.status === 'connected' || p.isConfigured) || data.providers[0];
      const defaultModel = defaultProvider?.availableModels?.[0] || 'default';
      onCreateConversation(
        defaultProvider?.id || 'ollama',
        defaultModel,
        'Template Chat',
        systemPrompt,
        activeSettings
      );
    }
  };

  const handleSelectModelFromList = (providerId: string, modelId: string) => {
    if (data.activeConversation) {
      onUpdateConversationSettings(
        data.activeConversation.id,
        providerId,
        modelId,
        activeSettings,
        activeSettings.systemPrompt
      );
    } else {
      onCreateConversation(
        providerId,
        modelId,
        `Chat with ${modelId}`,
        activeSettings.systemPrompt,
        activeSettings
      );
    }
    setActiveTab('chat');
  };

  const handleNewChat = () => {
    const defaultProvider = data.providers.find(p => p.status === 'connected' || p.isConfigured) || data.providers[0];
    const defaultModel = defaultProvider?.availableModels?.[0] || 'default';
    onCreateConversation(
      defaultProvider?.id || 'ollama',
      defaultModel,
      'New Chat',
      activeSettings.systemPrompt,
      activeSettings
    );
  };

  return (
    <div className="playground-shell flex flex-col h-full overflow-hidden select-none">
      {/* Top Header / Sub-Nav */}
      <header className="playground-header h-14 border-b px-4 flex items-center justify-between shrink-0 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3">
          {activeTab === 'chat' && (
            <button
              onClick={() => setIsConvSidebarOpen(prev => !prev)}
              className="playground-card p-1.5 rounded-lg border text-xs opacity-75 hover:opacity-100 transition cursor-pointer flex items-center justify-center mr-1"
              title={isConvSidebarOpen ? "Collapse Conversations Sidebar" : "Expand Conversations Sidebar"}
            >
              {isConvSidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>
          )}

          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <span className="font-semibold tracking-wide text-sm">AI Playground</span>
          </div>

          <div className="h-4 w-px bg-slate-700/50" />

          {/* Tab Navigation */}
          <nav className="playground-nav-pill flex items-center gap-1 p-0.5 rounded-lg border">
            <button
              onClick={() => setActiveTab('chat')}
              className={`playground-nav-btn flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition ${
                activeTab === 'chat' ? 'is-active tab-active-neutral' : ''
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat
            </button>
            <button
              onClick={() => setActiveTab('prompt-studio')}
              className={`playground-nav-btn flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition ${
                activeTab === 'prompt-studio' ? 'is-active tab-active-neutral' : ''
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              Prompt Studio
            </button>
            <button
              onClick={() => setActiveTab('models')}
              className={`playground-nav-btn flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition ${
                activeTab === 'models' ? 'is-active tab-active-neutral' : ''
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              Models &amp; Providers
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`playground-nav-btn flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition ${
                activeTab === 'analytics' ? 'is-active tab-active-neutral' : ''
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Usage &amp; Telemetry
            </button>
          </nav>
        </div>

        {/* Right side controls */}
        {activeTab === 'chat' && data.activeConversation && (
          <div className="flex items-center gap-2">
            <div className="playground-card hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="opacity-60">{data.activeConversation.providerId}/</span>
              <span className="font-semibold">{data.activeConversation.modelId}</span>
            </div>
          </div>
        )}
      </header>

      {/* Main Tab Content */}
      <main className="flex-1 flex overflow-hidden relative">
        {activeTab === 'chat' && (
          <>
            {/* Conversation list sidebar */}
            {isConvSidebarOpen && (
              <ConversationSidebar
                conversations={data.conversations}
                activeConversationId={data.activeConversation?.id}
                onSelect={onSelectConversation}
                onNewChat={handleNewChat}
                onDelete={onDeleteConversation}
                onRename={onRenameConversation}
                onClose={() => setIsConvSidebarOpen(false)}
              />
            )}

            {/* Chat message thread & prompt composer */}
            <ChatWorkspace
              conversation={data.activeConversation}
              messages={data.activeMessages}
              providers={data.providers}
              presets={data.presets}
              workspaceFiles={workspaceFiles}
              isSidebarOpen={isConvSidebarOpen}
              onToggleSidebar={() => setIsConvSidebarOpen(prev => !prev)}
              onSavePreset={onSavePreset}
              onDeletePreset={onDeletePreset}
              onSendMessage={(content, attachments, settings) => {
                if (data.activeConversation) {
                  onSendMessage(data.activeConversation.id, content, attachments, settings);
                }
              }}
              onAbortStream={() => {
                if (data.activeConversation) {
                  onAbortStream(data.activeConversation.id);
                }
              }}
              onRegenerate={() => {
                if (data.activeConversation) {
                  onRegenerateMessage(data.activeConversation.id);
                }
              }}
              onContinue={() => {
                if (data.activeConversation) {
                  onContinueMessage(data.activeConversation.id);
                }
              }}
              onUpdateConversationSettings={(pId, mId, s) => {
                const next = s || activeSettings;
                setActiveSettings(next);
                if (data.activeConversation) {
                  onUpdateConversationSettings(
                    data.activeConversation.id,
                    pId,
                    mId,
                    next,
                    next.systemPrompt
                  );
                } else {
                  onCreateConversation(pId, mId, 'New Chat', next.systemPrompt, next);
                }
              }}
              onRequestWorkspaceFiles={onRequestWorkspaceFiles}
            />
          </>
        )}

        {activeTab === 'prompt-studio' && (
          <PromptStudioView
            templates={data.templates}
            onSaveTemplate={onSaveTemplate}
            onDeleteTemplate={onDeleteTemplate}
            onUseInChat={handleUseTemplateInChat}
          />
        )}

        {activeTab === 'models' && (
          <ModelsAndProvidersView
            providers={data.providers}
            customProviders={data.customProviders}
            onTestProvider={onTestProvider}
            onSetProviderKey={onSetProviderKey}
            onSetOllamaHost={onSetOllamaHost}
            onDiscoverModels={onDiscoverModels}
            onAddCustomProvider={onAddCustomProvider}
            onDeleteCustomProvider={onDeleteCustomProvider}
            onSelectModelForChat={handleSelectModelFromList}
          />
        )}

        {activeTab === 'analytics' && (
          <UsageAnalyticsView
            summary={analyticsData?.summary || data.usageSummary}
            models={analyticsData?.models}
            recentUsage={analyticsData?.recentUsage}
            providers={data.providers}
            timeFilter={analyticsTimeFilter}
            onTimeFilterChange={onAnalyticsTimeFilterChange}
          />
        )}
      </main>
    </div>
  );
};
