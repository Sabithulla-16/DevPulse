import React from 'react';
import {
  Layers,
  ArrowLeft,
  CheckCircle2,
  Shield
} from 'lucide-react';

interface ModulePlaceholderPageProps {
  moduleName: string;
  onBackToOverview: () => void;
}

export const ModulePlaceholderPage: React.FC<ModulePlaceholderPageProps> = ({
  moduleName,
  onBackToOverview
}) => {
  return (
    <div className="page-container">
      <div className="module-placeholder-hero card">
        <div className="module-placeholder-top">
          <div className="module-placeholder-icon">
            <Layers size={28} />
          </div>
          <div className="module-placeholder-headings">
            <div className="module-phase-tag">
              <Shield size={12} />
              <span>DEVPULSE MODULE</span>
            </div>
            <h2 className="module-title">{moduleName}</h2>
            <p className="module-tagline">
              Select an active telemetry or development intelligence tool from the sidebar navigation.
            </p>
          </div>
        </div>

        <div className="empty-state-notice">
          <span className="notice-dot" />
          <span className="notice-text">
            All DevPulse v1.0.0 monitoring and intelligence modules are active.
          </span>
        </div>

        <div className="module-placeholder-actions">
          <button type="button" className="btn-primary" onClick={onBackToOverview}>
            <ArrowLeft size={14} />
            <span>Return to Unified Dashboard</span>
          </button>
        </div>
      </div>
    </div>
  );
};
