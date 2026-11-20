import React from 'react';
import { Skeleton } from './Skeleton.tsx';
import './Skeleton.css';

export interface CardSkeletonProps {
  variant?: 'stat' | 'kpi' | 'replenish' | 'risk_alert' | 'custom';
  count?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const CardSkeleton: React.FC<CardSkeletonProps> = ({
  variant = 'stat',
  count = 4,
  className = '',
  style = {},
  children,
}) => {
  if (variant === 'stat') {
    // 3-4 summary stat cards (Tab 3: label bar 12px, number bar 28px, subtext bar 10px)
    return (
      <div className={`stat-cards-skeleton-grid ${className}`.trim()} style={style} aria-busy="true">
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="stat-card-skeleton-item">
            <Skeleton width="45%" height={12} radius={4} />
            <Skeleton width="60%" height={28} radius={6} />
            <Skeleton width="75%" height={10} radius={4} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'kpi') {
    // KPI row: 4 cards, each with a label bar, a large 32px value bar, and a 60x16 trend-pill skeleton (Tab 5)
    return (
      <div className={`stat-cards-skeleton-grid ${className}`.trim()} style={style} aria-busy="true">
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="stat-card-skeleton-item" style={{ gap: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Skeleton width="50%" height={13} radius={4} />
              <Skeleton width={60} height={18} radius={9999} />
            </div>
            <Skeleton width="65%" height={32} radius={6} />
            <Skeleton width="80%" height={11} radius={4} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'replenish') {
    // 4 suggestion cards (Tab 4):
    // Header: 40x40 image square + product name bar (180px) + SKU bar (120px)
    // Middle: 3 small stat blocks (Current stock / Reorder level / Suggested qty), each 10px label + 18px value
    // Supplier line: 140px bar
    // Footer: 2 button-shaped skeletons (110x36 and 90x36) for "Create PO" / "Dismiss"
    return (
      <div className={`replenish-cards-skeleton-grid ${className}`.trim()} style={style} aria-busy="true">
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="replenish-card-skeleton-item">
            <div className="replenish-card-skeleton-header">
              <Skeleton width={40} height={40} radius={8} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <Skeleton width="75%" height={14} radius={4} style={{ maxWidth: 180 }} />
                <Skeleton width="50%" height={11} radius={4} style={{ maxWidth: 120 }} />
              </div>
            </div>

            <div className="replenish-card-skeleton-stats">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Skeleton width="60%" height={10} radius={3} />
                <Skeleton width="80%" height={18} radius={4} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Skeleton width="60%" height={10} radius={3} />
                <Skeleton width="80%" height={18} radius={4} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Skeleton width="60%" height={10} radius={3} />
                <Skeleton width="80%" height={18} radius={4} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Skeleton width={14} height={14} circle />
              <Skeleton width={140} height={12} radius={4} />
            </div>

            <div className="replenish-card-skeleton-footer">
              <Skeleton width={90} height={36} radius={8} />
              <Skeleton width={110} height={36} radius={8} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'risk_alert') {
    // Risk alerts list: 3 rows, each a 20px circle icon + 2 stacked bars + 70x24 severity pill
    return (
      <div className={`risk-alerts-skeleton-list ${className}`.trim()} style={style} aria-busy="true">
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="risk-alert-skeleton-row">
            <Skeleton width={20} height={20} circle />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
              <Skeleton width="50%" height={13} radius={4} />
              <Skeleton width="70%" height={11} radius={4} />
            </div>
            <Skeleton width={70} height={24} radius={9999} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`stat-card-skeleton-item ${className}`.trim()} style={style} aria-busy="true">
      {children}
    </div>
  );
};
