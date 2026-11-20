import React from 'react';
import { Skeleton } from './Skeleton.tsx';
import './Skeleton.css';

export interface ChartSkeletonProps {
  type: 'bar' | 'donut' | 'line';
  height?: number | string;
  titleWidth?: number | string;
  barsCount?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const ChartSkeleton: React.FC<ChartSkeletonProps> = ({
  type,
  height = 240,
  titleWidth = 160,
  barsCount = 7,
  className = '',
  style = {},
}) => {
  // Preset bar heights for organic look
  const barHeights = [45, 75, 55, 90, 65, 80, 50, 70];

  return (
    <div
      className={`chart-skeleton-card ${className}`.trim()}
      style={{ minHeight: height, ...style }}
      aria-busy="true"
    >
      <div className="chart-skeleton-header">
        <Skeleton width={titleWidth} height={16} radius={4} />
        <Skeleton width={60} height={14} radius={4} />
      </div>

      {type === 'donut' ? (
        <div className="chart-skeleton-area-donut">
          <div className="chart-skeleton-donut-ring" />
        </div>
      ) : (
        <div className="chart-skeleton-area-bars">
          {Array.from({ length: barsCount }).map((_, idx) => {
            const hPct = barHeights[idx % barHeights.length];
            return (
              <div
                key={idx}
                className="chart-skeleton-bar-col"
                style={{ height: `${hPct}%` }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  }}
                  className="ui-skeleton"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
