import React, { useState, useEffect } from 'react';
import { X, Sliders, RotateCcw, Check, Plus, Trash2 } from 'lucide-react';
import type { GenerationSettings, AiGenerationPreset } from '../../types';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GenerationSettings;
  onChange: (settings: GenerationSettings) => void;
  presets: AiGenerationPreset[];
  onApplyPreset: (preset: AiGenerationPreset) => void;
  onSaveAsPreset?: (name: string, settings: GenerationSettings) => void;
  onDeletePreset?: (id: string) => void;
  supportedParameters?: string[];
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  settings,
  onChange,
  presets,
  onApplyPreset,
  onSaveAsPreset,
  onDeletePreset,
  supportedParameters = ['temperature', 'topP', 'maxTokens', 'frequencyPenalty', 'presencePenalty', 'stopSequences']
}) => {
  const [stopSeqInput, setStopSeqInput] = useState((settings.stopSequences || []).join(', '));
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');

  useEffect(() => {
    setStopSeqInput((settings.stopSequences || []).join(', '));
  }, [settings.stopSequences]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isParamSupported = (param: string) => supportedParameters.includes(param);

  const updateSetting = <K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  const handleReset = () => {
    onChange({
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 2048,
      frequencyPenalty: 0,
      presencePenalty: 0,
      stopSequences: [],
      systemPrompt: ''
    });
  };

  const handleStopSeqBlur = () => {
    const seqs = stopSeqInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    updateSetting('stopSequences', seqs);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="playground-card fixed inset-y-0 right-0 w-84 border-l shadow-2xl z-50 flex flex-col select-none animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="playground-header flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2 font-semibold text-xs uppercase tracking-wide">
            <Sliders size={14} className="opacity-70" />
            <span>Generation Parameters</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleReset}
              className="p-1 hover:opacity-100 opacity-60 transition cursor-pointer"
              title="Reset to Defaults"
            >
              <RotateCcw size={13} />
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:opacity-100 opacity-60 transition cursor-pointer"
              title="Close Settings (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar text-xs">
          {/* Presets */}
          <div>
            <label className="text-[11px] font-medium opacity-70 uppercase tracking-wider block mb-2">
              Parameter Presets
            </label>
            <div className="grid grid-cols-2 gap-2">
              {presets.map(p => {
                const isActive =
                  settings.temperature === p.settings.temperature &&
                  settings.topP === p.settings.topP;
                return (
                  <button
                    key={p.id}
                    onClick={() => onApplyPreset(p)}
                    className={`playground-card py-2 px-2.5 rounded-lg text-left transition border cursor-pointer relative group ${
                      isActive ? 'border-indigo-500 bg-indigo-500/10' : 'hover:border-[var(--color-border)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[11px] truncate">{p.name}</span>
                      <div className="flex items-center gap-1">
                        {!p.isBuiltin && onDeletePreset && (
                          <span
                            onClick={e => {
                              e.stopPropagation();
                              onDeletePreset(p.id);
                            }}
                            className="opacity-0 group-hover:opacity-80 hover:opacity-100 p-0.5 text-red-400 hover:text-red-300 transition"
                            title="Delete custom preset"
                          >
                            <Trash2 size={11} />
                          </span>
                        )}
                        {isActive && <Check size={11} className="text-indigo-400" />}
                      </div>
                    </div>
                    <div className="text-[9px] opacity-60 truncate mt-0.5">{p.description}</div>
                  </button>
                );
              })}
            </div>

            {onSaveAsPreset && (
              <div className="mt-2.5">
                {isSavingPreset ? (
                  <div className="flex items-center gap-1.5 p-1.5 bg-black/20 rounded border border-indigo-500/30">
                    <input
                      type="text"
                      className="flex-1 bg-transparent border-0 text-[11px] px-1 outline-hidden"
                      placeholder="Preset name..."
                      value={presetNameInput}
                      onChange={e => setPresetNameInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && presetNameInput.trim()) {
                          onSaveAsPreset(presetNameInput.trim(), settings);
                          setPresetNameInput('');
                          setIsSavingPreset(false);
                        } else if (e.key === 'Escape') {
                          setIsSavingPreset(false);
                        }
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      disabled={!presetNameInput.trim()}
                      onClick={() => {
                        if (presetNameInput.trim()) {
                          onSaveAsPreset(presetNameInput.trim(), settings);
                          setPresetNameInput('');
                          setIsSavingPreset(false);
                        }
                      }}
                      className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-medium transition cursor-pointer disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSavingPreset(false)}
                      className="px-1 py-0.5 opacity-60 hover:opacity-100 transition cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsSavingPreset(true)}
                    className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 font-medium transition cursor-pointer"
                  >
                    <Plus size={11} />
                    <span>Save Current Settings as Preset</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Temperature */}
          <div className={!isParamSupported('temperature') ? 'opacity-40 pointer-events-none' : ''}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">Temperature</span>
              <span className="opacity-70 font-mono">{(settings.temperature ?? 0.7).toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={settings.temperature ?? 0.7}
              onChange={e => updateSetting('temperature', parseFloat(e.target.value))}
              className="w-full accent-zinc-500 dark:accent-zinc-300 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] opacity-60 mt-0.5">
              <span>Precise (0.0)</span>
              <span>Balanced (0.7)</span>
              <span>Creative (1.5+)</span>
            </div>
          </div>

          {/* Top P */}
          <div className={!isParamSupported('topP') ? 'opacity-40 pointer-events-none' : ''}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">Top P (Nucleus Sampling)</span>
              <span className="opacity-70 font-mono">{(settings.topP ?? 0.9).toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.topP ?? 0.9}
              onChange={e => updateSetting('topP', parseFloat(e.target.value))}
              className="w-full accent-zinc-500 dark:accent-zinc-300 cursor-pointer"
            />
          </div>

          {/* Max Tokens */}
          <div className={!isParamSupported('maxTokens') ? 'opacity-40 pointer-events-none' : ''}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">Max Output Tokens</span>
              <span className="opacity-70 font-mono">{settings.maxTokens ?? 2048}</span>
            </div>
            <input
              type="range"
              min="64"
              max="8192"
              step="64"
              value={settings.maxTokens ?? 2048}
              onChange={e => updateSetting('maxTokens', parseInt(e.target.value, 10))}
              className="w-full accent-zinc-500 dark:accent-zinc-300 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] opacity-60 mt-0.5">
              <span>Short (256)</span>
              <span>Standard (2048)</span>
              <span>Max (8192)</span>
            </div>
          </div>

          {/* Frequency Penalty */}
          <div className={!isParamSupported('frequencyPenalty') ? 'opacity-40 pointer-events-none' : ''}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">Frequency Penalty</span>
              <span className="opacity-70 font-mono">{(settings.frequencyPenalty ?? 0).toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="-2"
              max="2"
              step="0.1"
              value={settings.frequencyPenalty ?? 0}
              onChange={e => updateSetting('frequencyPenalty', parseFloat(e.target.value))}
              className="w-full accent-zinc-500 dark:accent-zinc-300 cursor-pointer"
            />
          </div>

          {/* Stop Sequences */}
          <div className={!isParamSupported('stopSequences') ? 'opacity-40 pointer-events-none' : ''}>
            <label className="font-medium block mb-1">Stop Sequences (comma-separated)</label>
            <input
              type="text"
              placeholder="e.g. END, ###"
              value={stopSeqInput}
              onChange={e => setStopSeqInput(e.target.value)}
              onBlur={handleStopSeqBlur}
              onKeyDown={e => {
                if (e.key === 'Enter') handleStopSeqBlur();
              }}
              className="playground-input w-full rounded-lg px-2.5 py-1.5 text-xs font-mono"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="font-medium block mb-1">System Instructions</label>
            <textarea
              rows={4}
              placeholder="Instructions defining the assistant's behavior..."
              value={settings.systemPrompt ?? ''}
              onChange={e => updateSetting('systemPrompt', e.target.value)}
              className="playground-input w-full rounded-lg p-2 text-xs resize-none"
            />
          </div>
        </div>
      </div>
    </>
  );
};
