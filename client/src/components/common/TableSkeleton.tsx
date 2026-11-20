import React from 'react';
import { Skeleton } from './Skeleton.tsx';
import './Skeleton.css';

export interface TableSkeletonColumn {
  header: React.ReactNode;
  width?: string | number;
  minWidth?: string | number;
  maxWidth?: string | number;
  align?: 'left' | 'center' | 'right';
  className?: string;
  headerStyle?: React.CSSProperties;
  cellStyle?: React.CSSProperties;
  renderSkeleton?: (rowIndex: number) => React.ReactNode;
}

export interface TableSkeletonProps {
  columns: TableSkeletonColumn[];
  rowCount?: number;
  rowHeight?: number | string;
  tableClassName?: string;
  wrapClassName?: string;
  isSlow?: boolean;
  onCancel?: () => void;
  loadingText?: string;
  fadeBottom?: boolean;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  columns,
  rowCount = 8,
  rowHeight,
  tableClassName = 'inventory-data-table',
  wrapClassName = 'ledger-table-wrap',
  isSlow = false,
  onCancel,
  loadingText = 'Loading data...',
  fadeBottom = false,
}) => {
  // Deterministic varying bar width between 60% and 98%
  const getVaryingWidth = (rowIndex: number, colIndex: number): string => {
    const seed = (rowIndex * 7 + colIndex * 13) % 39;
    return `${60 + seed}%`;
  };

  return (
    <div className={wrapClassName} role="region" aria-busy="true" aria-label={loadingText}>
      {/* Visually hidden accessibility message */}
      <div className="sr-only" aria-live="polite" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', border: 0 }}>
        {loadingText}
      </div>

      {/* Slow load indicator if taking longer than 8 seconds */}
      {isSlow && (
        <div className="slow-load-strip">
          <div className="slow-load-strip-content">
            <span className="slow-load-spinner" />
            <span>This is taking longer than usual...</span>
          </div>
          {onCancel && (
            <button type="button" className="slow-load-cancel-btn" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      )}

      <table className={`${tableClassName} ${isSlow || fadeBottom ? 'slow-load-fade-mask' : ''}`.trim()}>
        <thead>
          <tr>
            {columns.map((col, cIdx) => (
              <th
                key={cIdx}
                style={{
                  width: col.width,
                  minWidth: col.minWidth,
                  maxWidth: col.maxWidth,
                  textAlign: col.align || 'left',
                  ...col.headerStyle,
                }}
                className={col.className}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, rIdx) => {
            // Apply 50% opacity to the last row when loading more
            const isLastRow = rIdx === rowCount - 1 && rowCount <= 3;
            return (
              <tr
                key={rIdx}
                style={{
                  height: rowHeight ? (typeof rowHeight === 'number' ? `${rowHeight}px` : rowHeight) : undefined,
                  opacity: isLastRow ? 0.5 : 1,
                }}
              >
                {columns.map((col, cIdx) => {
                  const alignment = col.align || 'left';
                  return (
                    <td
                      key={cIdx}
                      style={{
                        width: col.width,
                        minWidth: col.minWidth,
                        maxWidth: col.maxWidth,
                        textAlign: alignment,
                        verticalAlign: 'middle',
                        ...col.cellStyle,
                      }}
                      className={col.className}
                    >
                      {col.renderSkeleton ? (
                        col.renderSkeleton(rIdx)
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent:
                              alignment === 'right'
                                ? 'flex-end'
                                : alignment === 'center'
                                ? 'center'
                                : 'flex-start',
                            width: '100%',
                          }}
                        >
                          <Skeleton
                            width={getVaryingWidth(rIdx, cIdx)}
                            height={12}
                            radius={4}
                          />
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
