import React from 'react';

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  badge?: string;
  variant?: 'default' | 'accent' | 'warning' | 'info';
  onClick?: () => void;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  detail,
  icon,
  badge,
  variant = 'default',
  onClick,
  className = ''
}) => {
  return (
    <article
      className={`metric-card variant-${variant} ${onClick ? 'is-clickable' : ''} ${className}`}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        <div className="metric-icon-wrap">{icon}</div>
      </div>
      <div className="metric-body">
        <span className="metric-value">{value}</span>
        {badge && <span className="metric-badge">{badge}</span>}
      </div>
      <div className="metric-detail" title={detail}>{detail}</div>
    </article>
  );
};
