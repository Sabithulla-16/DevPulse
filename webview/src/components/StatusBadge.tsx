import React from 'react';
import type { CollectorState } from '../types';

interface StatusBadgeProps {
  state: CollectorState;
  implemented: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ state, implemented }) => {
  if (!implemented) {
    return (
      <span className="badge badge-planned">
        <span className="badge-dot" />
        Planned
      </span>
    );
  }

  switch (state) {
    case 'running':
      return (
        <span className="badge badge-running">
          <span className="badge-dot" />
          Active
        </span>
      );
    case 'paused':
      return (
        <span className="badge badge-paused">
          <span className="badge-dot" />
          Paused
        </span>
      );
    case 'error':
      return (
        <span className="badge badge-error">
          <span className="badge-dot" />
          Error
        </span>
      );
    default:
      return (
        <span className="badge badge-idle">
          <span className="badge-dot" />
          Idle
        </span>
      );
  }
};

