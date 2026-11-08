import React from 'react';
import {
  Play,
  Settings2,
  Download,
  Upload,
  AlertTriangle,
  Layers,
  FlaskConical,
  Plus
} from 'lucide-react';
import type { ApiTestEnvironmentItem } from '../../types';

interface StudioToolbarProps {
  environments: ApiTestEnvironmentItem[];
  activeEnvironmentId: string | null;
  onSelectEnvironment: (id: string | null) => void;
  onOpenEnvironmentModal: () => void;
  onOpenImportModal: () => void;
  onOpenExportModal: () => void;
  onOpenRunner: () => void;
  onNewRequest: () => void;
}

export const StudioToolbar: React.FC<StudioToolbarProps> = ({
  environments,
  activeEnvironmentId,
  onSelectEnvironment,
  onOpenEnvironmentModal,
  onOpenImportModal,
  onOpenExportModal,
  onOpenRunner,
  onNewRequest
}) => {
  const activeEnv = environments.find(e => e.id === activeEnvironmentId);
  const isProduction = activeEnv?.name.toLowerCase().includes('prod');

  return (
    <div className="studio-toolbar">
      <div className="studio-toolbar-left">
        <div className="studio-brand">
          <FlaskConical size={18} className="studio-brand-icon" />
          <span className="studio-title">API Testing Studio</span>
          <span className="studio-version-tag">v1.0.0</span>
        </div>

        <button
          type="button"
          className="studio-btn studio-btn-primary"
          onClick={onNewRequest}
          title="Create New Request (Ctrl+N)"
        >
          <Plus size={14} />
          <span>New Request</span>
        </button>

        <button
          type="button"
          className="studio-btn studio-btn-secondary"
          onClick={onOpenRunner}
          title="Run Collection"
        >
          <Play size={14} />
          <span>Runner</span>
        </button>
      </div>

      <div className="studio-toolbar-right">
        {/* Environment Selector */}
        <div className="studio-env-picker">
          <Layers size={14} className="studio-env-icon" />
          <select
            className={`studio-env-select ${isProduction ? 'is-production' : ''}`}
            value={activeEnvironmentId || ''}
            onChange={e => onSelectEnvironment(e.target.value || null)}
          >
            <option value="">No Environment (Globals)</option>
            {environments.map(env => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
          </select>

          {isProduction && (
            <span className="studio-prod-badge" title="Production environment selected - caution when executing mutating requests">
              <AlertTriangle size={12} />
              <span>PROD</span>
            </span>
          )}

          <button
            type="button"
            className="studio-icon-btn"
            onClick={onOpenEnvironmentModal}
            title="Manage Environments & Variables"
          >
            <Settings2 size={15} />
          </button>
        </div>

        <div className="studio-toolbar-divider" />

        <button
          type="button"
          className="studio-btn studio-btn-ghost"
          onClick={onOpenImportModal}
          title="Import Postman / OpenAPI / cURL"
        >
          <Upload size={14} />
          <span>Import</span>
        </button>

        <button
          type="button"
          className="studio-btn studio-btn-ghost"
          onClick={onOpenExportModal}
          title="Export Postman Collection"
        >
          <Download size={14} />
          <span>Export</span>
        </button>
      </div>
    </div>
  );
};
