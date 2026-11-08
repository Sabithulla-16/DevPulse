import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Square,
  Sliders,
  Copy,
  Check,
  RotateCcw,
  Play,
  Edit2,
  Sparkles,
  Bot,
  User,
  AlertCircle,
  FileCode,
  Clock,
  Coins,
  PanelLeftOpen,
  Image as ImageIcon
} from 'lucide-react';
import type {
  AiConversation,
  AiMessage,
  AiProviderInfo,
  AiGenerationPreset,
  GenerationSettings,
  ContextAttachment
} from '../../types';
import { SettingsDrawer } from './SettingsDrawer';
import { ContextSelector } from './ContextSelector';
import { MarkdownMessage } from './MarkdownMessage';

interface ChatWorkspaceProps {
  conversation?: AiConversation;
  messages: AiMessage[];
  providers: AiProviderInfo[];
  presets: AiGenerationPreset[];
  onSendMessage: (content: string, attachments?: ContextAttachment[], settings?: GenerationSettings) => void;
  onAbortStream: () => void;
  onRegenerate: () => void;
  onContinue: () => void;
  onUpdateConversationSettings: (providerId: string, modelId: string, settings?: GenerationSettings) => void;
  onRequestWorkspaceFiles: (query?: string) => void;
  onSavePreset?: (input: { name: string; settings: GenerationSettings; description?: string }) => void;
  onDeletePreset?: (id: string) => void;
  workspaceFiles?: Array<{ path: string; name: string; size: number }>;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

const DEFAULT_MODELS_BY_PROVIDER: Record<string, string[]> = {
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen/qwen3.8-27b', 'llama-3.2-11b-vision-preview'],
  gemini: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-1.0-pro'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-mini'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  ollama: ['llama3:latest', 'mistral:latest', 'codellama:latest']
};

function getModelsForProvider(providerId: string, providers: AiProviderInfo[]): string[] {
  const p = providers.find(item => item.id.toLowerCase() === providerId.toLowerCase());
  if (p && p.availableModels && p.availableModels.length > 0) {
    return p.availableModels;
  }
  return DEFAULT_MODELS_BY_PROVIDER[providerId.toLowerCase()] || [];
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  conversation,
  messages,
  providers,
  presets,
  onSendMessage,
  onAbortStream,
  onRegenerate,
  onContinue,
  onUpdateConversationSettings,
  onRequestWorkspaceFiles,
  onSavePreset,
  onDeletePreset,
  workspaceFiles = [],
  isSidebarOpen = true,
  onToggleSidebar
}) => {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<ContextAttachment[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on message updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center opacity-60 p-8 select-none">
        <Bot size={44} className="mb-3 opacity-40" />
        <h3 className="text-sm font-semibold mb-1">No Conversation Selected</h3>
        <p className="text-xs opacity-70 max-w-sm text-center">
          Choose a conversation from the sidebar or click "New Conversation" to start chatting with an AI model.
        </p>
      </div>
    );
  }

  const selectedProvider = providers.find(p => p.id === conversation.providerId);
  const isLocal = selectedProvider?.isLocal ?? false;
  const isStreaming = messages.some(m => m.status === 'streaming');

  const handleSend = () => {
    if (!inputText.trim() || isStreaming) return;
    onSendMessage(inputText.trim(), attachments.length > 0 ? attachments : undefined, conversation.generationSettings);
    setInputText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStartEdit = (msg: AiMessage) => {
    setEditingMsgId(msg.id);
    setEditingText(msg.content);
  };

  const handleSaveEdit = (msg: AiMessage) => {
    if (editingText.trim()) {
      onSendMessage(editingText.trim(), msg.attachments, conversation.generationSettings);
    }
    setEditingMsgId(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
      {/* Top Action Bar */}
      <div className="playground-header flex items-center justify-between px-4 py-2 border-b select-none z-10 shrink-0">
        <div className="flex items-center gap-3">
          {/* Toggle sidebar button when collapsed */}
          {!isSidebarOpen && onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="playground-card p-1.5 rounded-lg border text-xs opacity-80 hover:opacity-100 transition cursor-pointer flex items-center justify-center mr-0.5"
              title="Expand Conversations Panel"
            >
              <PanelLeftOpen size={14} />
            </button>
          )}

          {/* Provider Select */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] opacity-70 font-medium">Provider:</span>
            <select
              value={conversation.providerId}
              onChange={e => {
                const newProviderId = e.target.value;
                const models = getModelsForProvider(newProviderId, providers);
                const newModelId = models[0] || 'default';
                onUpdateConversationSettings(newProviderId, newModelId, conversation.generationSettings);
              }}
              className="playground-select rounded px-2.5 py-1 text-xs cursor-pointer max-w-[150px] truncate"
            >
              {providers.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isLocal ? '(Local)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Model Select */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] opacity-70 font-medium">Model:</span>
            {(() => {
              const models = getModelsForProvider(conversation.providerId, providers);
              const list = models.includes(conversation.modelId) ? models : [conversation.modelId, ...models];
              return (
                <select
                  value={conversation.modelId}
                  onChange={e => onUpdateConversationSettings(conversation.providerId, e.target.value, conversation.generationSettings)}
                  className="playground-select rounded px-2.5 py-1 text-xs cursor-pointer max-w-[210px] truncate"
                  title={conversation.modelId}
                >
                  {list.map(m => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              );
            })()}
          </div>

          {/* Capability Badge */}
          <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${isLocal ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40' : 'playground-card opacity-80'}`}>
            {isLocal ? 'Offline Local' : 'Cloud API'}
          </span>
        </div>

        {/* Right Action: Settings toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="playground-card flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer"
          >
            <Sliders size={13} className="text-zinc-400" />
            <span>Parameters</span>
          </button>
        </div>
      </div>

      {/* Messages Scroll View */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 custom-scrollbar min-w-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-60 select-none py-16">
            <Sparkles size={32} className="mb-3 animate-pulse opacity-50" />
            <h4 className="text-sm font-semibold mb-1">AI Playground Workspace Ready</h4>
            <p className="text-xs opacity-70 max-w-sm text-center">
              Send a prompt, experiment with parameters, or attach files from your workspace.
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            const isAssistant = msg.role === 'assistant';
            const isLastAssistant = isAssistant && index === messages.length - 1;

            return (
              <div
                key={msg.id}
                className={`flex gap-3 w-full max-w-4xl min-w-0 ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'} group`}
              >
                {/* Avatar: Sleek Neutral */}
                <div
                  className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs font-semibold ${
                    isUser
                      ? 'chat-user-avatar'
                      : 'playground-card'
                  }`}
                >
                  {isUser ? <User size={15} /> : <Bot size={15} />}
                </div>

                {/* Message Body */}
                <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} flex-1 min-w-0 max-w-full`}>
                  <div
                    className={`p-3.5 rounded-xl text-xs leading-relaxed max-w-full min-w-0 overflow-hidden break-words ${
                      isUser
                        ? 'chat-user-bubble rounded-tr-none'
                        : 'chat-assistant-bubble rounded-tl-none w-full'
                    }`}
                  >
                    {/* Attached Context Files / Images */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mb-2 pb-2 border-b border-black/10 dark:border-white/10 flex flex-wrap gap-1.5">
                        {msg.attachments.map((att, attIdx) => {
                          const isImg = att.isImage || att.content?.startsWith('data:image/') || /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(att.name);
                          return (
                            <span
                              key={attIdx}
                              className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded bg-black/10 dark:bg-white/10 opacity-90 border border-black/5 dark:border-white/10"
                            >
                              {isImg ? (
                                <>
                                  <ImageIcon size={10} className="text-purple-400" />
                                  <span>{att.name}</span>
                                  {att.content?.startsWith('data:image/') && (
                                    <img
                                      src={att.content}
                                      alt={att.name}
                                      className="w-4 h-4 rounded object-cover ml-0.5 border"
                                    />
                                  )}
                                </>
                              ) : (
                                <>
                                  <FileCode size={10} />
                                  <span>{att.name}</span>
                                </>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Content or Edit Box */}
                    {editingMsgId === msg.id ? (
                      <div className="space-y-2">
                        <textarea
                          rows={3}
                          value={editingText}
                          onChange={e => setEditingText(e.target.value)}
                          className="playground-input w-full rounded p-2 text-xs focus:outline-none"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setEditingMsgId(null)}
                            className="px-2 py-1 rounded playground-card text-[11px]"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit(msg)}
                            className="btn-theme-primary px-2.5 py-1 rounded text-[11px] font-medium"
                          >
                            Resubmit
                          </button>
                        </div>
                      </div>
                    ) : isAssistant ? (
                      <MarkdownMessage
                        content={msg.content}
                        isStreaming={msg.status === 'streaming'}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap font-sans select-text">
                        {msg.content}
                      </div>
                    )}

                    {/* Error Banner */}
                    {msg.status === 'error' && (
                      <div className="mt-2 pt-2 border-t border-rose-500/20 text-rose-400 flex items-center gap-1 text-[11px]">
                        <AlertCircle size={12} />
                        <span>{msg.errorMessage || 'Generation failed'}</span>
                      </div>
                    )}
                  </div>

                  {/* Message Metadata & Action Row */}
                  <div className="flex items-center gap-3 mt-1.5 px-1 text-[10px] opacity-60">
                    {/* Telemetry metrics */}
                    {msg.durationMs !== undefined && (
                      <span className="flex items-center gap-0.5 font-mono">
                        <Clock size={10} />
                        <span>{(msg.durationMs / 1000).toFixed(2)}s</span>
                      </span>
                    )}

                    {msg.outputTokens > 0 && (
                      <span className="flex items-center gap-0.5 font-mono">
                        <Coins size={10} />
                        <span>{msg.outputTokens} tokens</span>
                      </span>
                    )}

                    {/* Actions */}
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition">
                      <button
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        className="hover:opacity-100 opacity-70 p-0.5"
                        title="Copy message"
                      >
                        {copiedId === msg.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      </button>

                      {isUser && !isStreaming && (
                        <button
                          onClick={() => handleStartEdit(msg)}
                          className="hover:opacity-100 opacity-70 p-0.5"
                          title="Edit message"
                        >
                          <Edit2 size={11} />
                        </button>
                      )}

                      {isLastAssistant && !isStreaming && (
                        <>
                          <button
                            onClick={onRegenerate}
                            className="hover:opacity-100 opacity-70 p-0.5"
                            title="Regenerate response"
                          >
                            <RotateCcw size={11} />
                          </button>
                          <button
                            onClick={onContinue}
                            className="hover:opacity-100 opacity-70 p-0.5 flex items-center gap-0.5 text-[9px]"
                            title="Continue generation"
                          >
                            <Play size={9} />
                            <span>Continue</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Prompt Composer & Context Bar */}
      <div className="p-3 border-t playground-header">
        {/* Context Attachments */}
        <div className="mb-2">
          <ContextSelector
            attachments={attachments}
            onAddAttachment={att => setAttachments([...attachments, att])}
            onRemoveAttachment={idx => setAttachments(attachments.filter((_, i) => i !== idx))}
            onRequestFiles={onRequestWorkspaceFiles}
            availableFiles={workspaceFiles}
            isLocalModel={isLocal}
            providerName={selectedProvider?.name || conversation.providerId}
          />
        </div>

        {/* Composer Input: Sleek Dark / Neutral */}
        <div className="playground-card relative flex items-end gap-2 rounded-xl p-2 transition">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={e => {
              setInputText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'Generating response...' : 'Type a prompt... (Enter to send, Shift+Enter for new line)'}
            disabled={isStreaming}
            className="flex-1 bg-transparent text-xs placeholder:opacity-50 resize-none focus:outline-none custom-scrollbar max-h-44 py-1"
          />

          {isStreaming ? (
            <button
              onClick={onAbortStream}
              className="p-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition shrink-0 cursor-pointer"
              title="Stop Generation"
            >
              <Square size={14} className="fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="chat-send-btn p-2 rounded-lg disabled:opacity-40 transition shrink-0 cursor-pointer"
              title="Send Prompt (Enter to send, Shift+Enter for new line)"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Settings Drawer */}
      <SettingsDrawer
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={conversation.generationSettings || { temperature: 0.7, topP: 0.9, maxTokens: 2048 }}
        onChange={newSettings => onUpdateConversationSettings(conversation.providerId, conversation.modelId, newSettings)}
        presets={presets}
        onApplyPreset={p => onUpdateConversationSettings(conversation.providerId, conversation.modelId, p.settings)}
        onSaveAsPreset={(name, s) => onSavePreset?.({ name, settings: s })}
        onDeletePreset={onDeletePreset}
      />
    </div>
  );
};
