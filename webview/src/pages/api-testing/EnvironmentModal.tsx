import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  Check,
  Layers
} from 'lucide-react';
import type {
  ApiTestEnvironmentItem,
  ApiTestVariablePayload
} from '../../types';

interface EnvironmentModalProps {
  environments: ApiTestEnvironmentItem[];
  activeEnvironmentId: string | null;
  onClose: () => void;
  onSaveEnvironment: (payload: { id?: string; name: string; variables: ApiTestVariablePayload[] }) => void;
  onDeleteEnvironment: (id: string) => void;
  onSetActiveEnvironment: (id: string | null) => void;
  onRevealSecret: (variableId: string) => void;
  revealedSecrets: Record<string, string>;
}

export const EnvironmentModal: React.FC<EnvironmentModalProps> = ({
  environments,
  activeEnvironmentId,
  onClose,
  onSaveEnvironment,
  onDeleteEnvironment,
  onSetActiveEnvironment,
  onRevealSecret,
  revealedSecrets
}) => {
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(activeEnvironmentId || (environments[0]?.id || null));
  const [envName, setEnvName] = useState<string>(
    environments.find(e => e.id === selectedEnvId)?.name || 'New Environment'
  );
  const [variables, setVariables] = useState<ApiTestVariablePayload[]>(
    environments.find(e => e.id === selectedEnvId)?.variables || []
  );

  const selectEnv = (env: ApiTestEnvironmentItem | null) => {
    if (!env) {
      setSelectedEnvId(null);
      setEnvName('New Environment');
      setVariables([]);
    } else {
      setSelectedEnvId(env.id);
      setEnvName(env.name);
      setVariables([...env.variables]);
    }
  };

  const addVariable = () => {
    setVariables(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        key: '',
        initialValue: '',
        currentValue: '',
        isSecret: false,
        enabled: true
      }
    ]);
  };

  const updateVariable = (idx: number, patch: Partial<ApiTestVariablePayload>) => {
    setVariables(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...patch };
      return copy;
    });
  };

  const removeVariable = (idx: number) => {
    setVariables(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    onSaveEnvironment({
      id: selectedEnvId || undefined,
      name: envName,
      variables
    });
    onClose();
  };

  return (
    <div className="studio-modal-overlay">
      <div className="studio-modal-container env-modal">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <Layers size={18} />
            <span>Manage Environments & Variables</span>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="env-modal-layout">
          {/* Left: Environments List */}
          <div className="env-sidebar-list">
            <div className="sidebar-list-header">
              <span>ENVIRONMENTS</span>
              <button
                type="button"
                className="add-env-btn"
                onClick={() => selectEnv(null)}
                title="Create New Environment"
              >
                <Plus size={13} />
              </button>
            </div>

            {environments.map(env => (
              <div
                key={env.id}
                className={`env-sidebar-item ${selectedEnvId === env.id ? 'is-selected' : ''}`}
                onClick={() => selectEnv(env)}
              >
                <div className="item-info">
                  <span className="name">{env.name}</span>
                  {activeEnvironmentId === env.id && (
                    <span className="active-tag">Active</span>
                  )}
                </div>

                <div className="item-actions">
                  <button
                    type="button"
                    className="env-set-active-btn"
                    onClick={e => {
                      e.stopPropagation();
                      onSetActiveEnvironment(env.id);
                    }}
                    title="Set as Active Environment"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    type="button"
                    className="env-delete-btn"
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteEnvironment(env.id);
                      if (selectedEnvId === env.id) selectEnv(null);
                    }}
                    title="Delete Environment"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Right: Environment Editor Table */}
          <div className="env-content-editor">
            <div className="env-editor-top">
              <label>Environment Name:</label>
              <input
                type="text"
                className="studio-input env-name-input"
                value={envName}
                onChange={e => setEnvName(e.target.value)}
                placeholder="e.g. Staging, Production, Local"
              />
            </div>

            <div className="env-vars-table">
              <div className="vars-table-header">
                <span className="col-chk" />
                <span className="col-key">VARIABLE</span>
                <span className="col-type">SECRET</span>
                <span className="col-init">INITIAL VALUE</span>
                <span className="col-curr">CURRENT VALUE</span>
                <span className="col-actions" />
              </div>

              <div className="vars-table-rows">
                {variables.length === 0 ? (
                  <div className="vars-empty">No variables in this environment. Click "Add Variable" below.</div>
                ) : (
                  variables.map((v, idx) => {
                    const isRevealed = v.id && revealedSecrets[v.id];
                    return (
                      <div key={v.id || idx} className="var-row">
                        <input
                          type="checkbox"
                          className="kv-checkbox"
                          checked={v.enabled}
                          onChange={e => updateVariable(idx, { enabled: e.target.checked })}
                        />
                        <input
                          type="text"
                          className="var-input"
                          placeholder="baseUrl"
                          value={v.key}
                          onChange={e => updateVariable(idx, { key: e.target.value })}
                        />

                        {/* Secret Toggle */}
                        <button
                          type="button"
                          className={`secret-toggle-btn ${v.isSecret ? 'is-secret' : ''}`}
                          onClick={() => updateVariable(idx, { isSecret: !v.isSecret })}
                          title={v.isSecret ? 'Secret variable (stored encrypted)' : 'Plain text variable'}
                        >
                          <Lock size={12} />
                        </button>

                        <input
                          type="text"
                          className="var-input"
                          placeholder={v.isSecret ? 'Masked' : 'Initial'}
                          value={v.initialValue}
                          disabled={v.isSecret}
                          onChange={e => updateVariable(idx, { initialValue: e.target.value })}
                        />

                        <div className="current-val-wrap">
                          <input
                            type={v.isSecret && !isRevealed ? 'password' : 'text'}
                            className="var-input"
                            placeholder={v.isSecret ? (v.hasValue ? '••••••••' : 'Empty Secret') : 'Value'}
                            value={isRevealed ? isRevealed : v.currentValue}
                            onChange={e => updateVariable(idx, { currentValue: e.target.value })}
                          />
                          {v.isSecret && v.id && (
                            <button
                              type="button"
                              className="reveal-btn"
                              onClick={() => onRevealSecret(v.id!)}
                              title="Reveal secret temporarily"
                            >
                              {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          className="var-del-btn"
                          onClick={() => removeVariable(idx)}
                          title="Remove Variable"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <button type="button" className="studio-btn studio-btn-ghost add-var-btn" onClick={addVariable}>
                <Plus size={13} />
                <span>Add Variable</span>
              </button>
            </div>

            <div className="modal-footer">
              <button type="button" className="studio-btn studio-btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="studio-btn studio-btn-primary" onClick={handleSave}>
                Save Environment
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
