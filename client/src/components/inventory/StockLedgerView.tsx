import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { StockMove, StockMoveKind, Item } from '../../api.ts';
import { fetchStockLedger } from '../../api.ts';
import { LockIcon, FileTextIcon, XIcon, UserIcon, AlertTriangleIcon } from './InventoryIcons.tsx';
import { TableSkeleton, type TableSkeletonColumn } from '../common/TableSkeleton.tsx';
import { Skeleton } from '../common/Skeleton.tsx';
import { useDelayedLoading } from '../../hooks/useDelayedLoading.ts';

interface StockLedgerViewProps {
  initialItemId?: string;
  items: Item[];
  onOpenInvoice?: (invoiceId: string) => void;
  onOpenPurchase?: (purchaseId: string) => void;
}

export const StockLedgerView: React.FC<StockLedgerViewProps> = ({
  initialItemId,
  items,
}) => {
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedItemId, setSelectedItemId] = useState<string>(initialItemId || '');
  const [kindFilter, setKindFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const pageSize = 25;

  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounce search query by 300ms to preserve input focus
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Delayed loading hook: 300ms delay, 400ms minDuration, 8000ms slow threshold
  const { showSkeleton: showDelayed, isSlow, cancelSlow } = useDelayedLoading(
    loading && !hasLoadedOnce,
    300,
    400,
    8000
  );

  const showSkeleton = (loading && !hasLoadedOnce) || showDelayed;

  const isRefreshing = loading && hasLoadedOnce;

  const loadLedger = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetchStockLedger(
        {
          itemId: selectedItemId || undefined,
          kind: kindFilter !== 'ALL' ? kindFilter : undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
          q: debouncedSearch.trim() || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        },
        controller.signal
      );
      setMoves(res.moves || []);
      setTotal(res.total || 0);
      setHasLoadedOnce(true);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('Failed to load stock ledger:', err);
      setError(err?.message || 'Failed to load stock movement ledger.');
    } finally {
      setLoading(false);
    }
  }, [selectedItemId, kindFilter, fromDate, toDate, debouncedSearch, page]);

  useEffect(() => {
    loadLedger();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadLedger]);

  const handleCancelSlow = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setLoading(false);
    cancelSlow();
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const formatKindBadge = (kind: StockMoveKind) => {
    switch (kind) {
      case 'sale':
        return <span className="ledger-badge sale">Sale (POS)</span>;
      case 'purchase':
        return <span className="ledger-badge purchase">Purchase Inward</span>;
      case 'return':
        return <span className="ledger-badge return">Sales Return</span>;
      case 'adjust':
        return <span className="ledger-badge adjust">Stock Adjustment</span>;
      case 'opening':
        return <span className="ledger-badge opening">Opening Stock</span>;
      case 'transfer':
        return <span className="ledger-badge transfer">Transfer</span>;
      default:
        return <span className="ledger-badge default">{kind}</span>;
    }
  };

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return (
        d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      );
    } catch {
      return iso;
    }
  };

  // Define 10 skeleton columns matching exact real ledger columns
  const ledgerSkeletonColumns: TableSkeletonColumn[] = [
    {
      header: 'Date & Time',
      renderSkeleton: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Skeleton width={90} height={12} radius={3} />
          <Skeleton width={60} height={10} radius={3} />
        </div>
      ),
    },
    {
      header: 'Product & Identifiers',
      renderSkeleton: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <Skeleton width={160} height={14} radius={4} />
          <Skeleton width={110} height={11} radius={4} />
        </div>
      ),
    },
    {
      header: 'Type',
      renderSkeleton: () => <Skeleton width={80} height={24} radius={9999} />,
    },
    {
      header: 'Reference Doc',
      renderSkeleton: () => <Skeleton width={100} height={12} radius={4} />,
    },
    {
      header: 'In (+)',
      align: 'right',
      renderSkeleton: () => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Skeleton width={50} height={12} radius={4} />
        </div>
      ),
    },
    {
      header: 'Out (-)',
      align: 'right',
      renderSkeleton: () => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Skeleton width={50} height={12} radius={4} />
        </div>
      ),
    },
    {
      header: 'Prev Balance',
      align: 'right',
      renderSkeleton: () => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Skeleton width={60} height={12} radius={4} />
        </div>
      ),
    },
    {
      header: 'New Balance',
      align: 'right',
      renderSkeleton: () => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Skeleton width={60} height={12} radius={4} />
        </div>
      ),
    },
    {
      header: 'Operator',
      width: '150px',
      renderSkeleton: () => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Skeleton width={24} height={24} circle />
          <Skeleton width={80} height={12} radius={4} />
        </div>
      ),
    },
    {
      header: 'Reason / Notes',
      width: '150px',
      renderSkeleton: () => <Skeleton width={120} height={12} radius={4} />,
    },
  ];

  return (
    <div className="stock-ledger-container">
      {/* Filters Bar */}
      <div className="ledger-filters-card">
        <div className="ledger-filter-row">
          {/* Search box */}
          <div className="filter-field search" style={{ flex: '1 1 240px' }}>
            <label className="filter-label">Search Ledger</label>
            <div className="search-input-wrap">
              <input
                type="text"
                className="filter-input"
                placeholder="Search by product, SKU, barcode, document #..."
                value={searchQuery}
                disabled={showSkeleton}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => {
                    setSearchQuery('');
                    setPage(1);
                  }}
                  title="Clear search"
                  disabled={showSkeleton}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <XIcon size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Product Dropdown */}
          <div className="filter-field" style={{ flex: '1 1 200px' }}>
            <label className="filter-label">Filter by Product</label>
            <select
              className="filter-select"
              value={selectedItemId}
              disabled={showSkeleton}
              onChange={(e) => {
                setSelectedItemId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">-- All Products --</option>
              {items
                .filter((i) => i.active !== false)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} {i.sku ? `(${i.sku})` : ''}
                  </option>
                ))}
            </select>
          </div>

          {/* Movement Kind */}
          <div className="filter-field" style={{ flex: '0 1 180px' }}>
            <label className="filter-label">Movement Type</label>
            <select
              className="filter-select"
              value={kindFilter}
              disabled={showSkeleton}
              onChange={(e) => {
                setKindFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All Movements</option>
              <option value="sale">Sales (Outflow)</option>
              <option value="purchase">Purchases (Inflow)</option>
              <option value="return">Sales Returns (Restock)</option>
              <option value="adjust">Stock Adjustments</option>
              <option value="opening">Opening Stock</option>
              <option value="transfer">Transfers</option>
            </select>
          </div>

          {/* Date Range: From */}
          <div className="filter-field" style={{ flex: '0 1 140px' }}>
            <label className="filter-label">From Date</label>
            <input
              type="date"
              className="filter-input"
              value={fromDate}
              disabled={showSkeleton}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Date Range: To */}
          <div className="filter-field" style={{ flex: '0 1 140px' }}>
            <label className="filter-label">To Date</label>
            <input
              type="date"
              className="filter-input"
              value={toDate}
              disabled={showSkeleton}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Reset Filters */}
          {(selectedItemId || kindFilter !== 'ALL' || fromDate || toDate || searchQuery) && (
            <div className="filter-field" style={{ alignSelf: 'flex-end' }}>
              <button
                type="button"
                className="btn-reset-filters"
                disabled={showSkeleton}
                onClick={() => {
                  setSelectedItemId('');
                  setKindFilter('ALL');
                  setFromDate('');
                  setToDate('');
                  setSearchQuery('');
                  setPage(1);
                }}
              >
                Reset
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Audit Banner */}
      <div className="ledger-audit-banner">
        <span className="banner-icon" style={{ display: 'flex', alignItems: 'center' }}>
          <LockIcon size={16} style={{ color: 'var(--primary)' }} />
        </span>
        <span>
          <strong>Immutable Stock Ledger:</strong> Historical stock movements cannot be directly edited or deleted.
          Corrections are preserved as linked adjustment movements with audit trails.
        </span>
      </div>

      {/* Refresh Indeterminate Progress Bar */}
      {isRefreshing && (
        <div className="refresh-progress-bar-wrap">
          <div className="progress-line" />
        </div>
      )}

      {/* Main Table / Skeletons / States */}
      <div className="ledger-table-wrap">
        {showSkeleton ? (
          <TableSkeleton
            columns={ledgerSkeletonColumns}
            rowCount={10}
            rowHeight={56}
            isSlow={isSlow}
            onCancel={handleCancelSlow}
            loadingText="Loading chronological stock ledger..."
          />
        ) : error ? (
          <div className="inline-error-card-state">
            <div className="error-icon-box">
              <AlertTriangleIcon size={24} />
            </div>
            <h4>Couldn't load stock ledger</h4>
            <p>{error}</p>
            <button type="button" className="error-retry-btn" onClick={loadLedger}>
              Retry Loading
            </button>
          </div>
        ) : !loading && moves.length === 0 ? (
          <div className="table-empty-state">
            <FileTextIcon size={44} style={{ color: 'var(--text-dim)', marginBottom: '0.75rem' }} />
            <h3>No Stock Movements Found</h3>
            <p>No transactions match your current filters. Try resetting the filters above.</p>
          </div>
        ) : (
          <table className={`inventory-data-table ledger-table ${isRefreshing ? 'table-refreshing-dim' : 'skeleton-fade-in'}`}>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Product & Identifiers</th>
                <th>Type</th>
                <th>Reference Doc</th>
                <th style={{ textAlign: 'right' }}>In (+)</th>
                <th style={{ textAlign: 'right' }}>Out (-)</th>
                <th style={{ textAlign: 'right' }}>Prev Balance</th>
                <th style={{ textAlign: 'right' }}>New Balance</th>
                <th style={{ minWidth: '135px', width: '150px', textAlign: 'left', whiteSpace: 'nowrap' }}>Operator</th>
                <th style={{ minWidth: '150px', textAlign: 'left' }}>Reason / Notes</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => {
                const prevUnits = (m.previousBalanceMilli || 0) / 1000;
                const newUnits = (m.resultingBalanceMilli || 0) / 1000;
                const inUnits = (m.qtyInMilli || 0) / 1000;
                const outUnits = (m.qtyOutMilli || 0) / 1000;
                const unit = m.unit || 'pcs';

                return (
                  <tr key={m.id} className="ledger-row">
                    <td className="mono" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      {formatDateTime(m.createdAt)}
                    </td>
                    <td>
                      <div className="item-cell-title">{m.itemName}</div>
                      <div className="item-cell-sub">
                        {m.sku ? `SKU: ${m.sku}` : ''}
                        {m.sku && m.barcode ? ' • ' : ''}
                        {m.barcode ? `Barcode: ${m.barcode}` : ''}
                        {m.batchNo ? ` • Batch: ${m.batchNo}` : ''}
                      </div>
                    </td>
                    <td>{formatKindBadge(m.kind)}</td>
                    <td>
                      {m.refNumber ? (
                        <span className="doc-ref-chip">
                          {m.refNumber}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>--</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {inUnits > 0 ? (
                        <span className="qty-in-pill">
                          +{inUnits.toFixed(1)} {unit}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>-</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {outUnits > 0 ? (
                        <span className="qty-out-pill">
                          -{outUnits.toFixed(1)} {unit}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>-</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)' }} className="mono">
                      {prevUnits.toFixed(1)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }} className="mono">
                      <span className={newUnits <= 0 ? 'text-red' : 'text-purple'}>
                        {newUnits.toFixed(1)} {unit}
                      </span>
                    </td>
                    <td style={{ minWidth: '135px', width: '150px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <span className="operator-chip" title={`Operator: ${m.userName || 'System'}`}>
                        <UserIcon size={12} style={{ opacity: 0.65, flexShrink: 0 }} />
                        <span>{m.userName || 'System'}</span>
                      </span>
                    </td>
                    <td style={{ minWidth: '150px', maxWidth: '240px', verticalAlign: 'middle' }}>
                      <div className="notes-wrap" title={m.notes || m.reason || ''} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.reason && <span className="reason-tag-inline">{m.reason}</span>}
                        {m.notes && <span className="notes-text">{m.notes}</span>}
                        {!m.reason && !m.notes && <span style={{ color: 'var(--text-dim)' }}>--</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Bar */}
      {total > pageSize && !showSkeleton && !error && (
        <div className="pagination-bar">
          <div className="pagination-info">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} movements
          </div>
          <div className="pagination-buttons">
            <button
              type="button"
              className="page-btn"
              disabled={page <= 1 || isRefreshing}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="page-current">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="page-btn"
              disabled={page >= totalPages || isRefreshing}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
