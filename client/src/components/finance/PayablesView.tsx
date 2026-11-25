import React, { useState, useEffect } from 'react';
import { fetchFinancePayables } from '../../api.ts';
import { fmtMoney } from '../../../../shared/money.ts';
import {
  CreditCardIcon,
  TruckIcon,
  CheckCircle2Icon,
  RefreshCwIcon,
  SearchIcon,
  CalendarIcon,
  PhoneIcon,
  AlertTriangleIcon,
} from '../inventory/InventoryIcons.tsx';
import { BentoHeaderCard, StatCard } from '../common/BentoUI.tsx';

interface PayablesViewProps {
  onPaySupplier?: (supplierId: string) => void;
}

export function PayablesView({ onPaySupplier }: PayablesViewProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchFinancePayables();
      setData(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const suppliers = (data?.suppliers || []).filter((s: any) => {
    const name = s.supplierName || '';
    const gstin = s.supplierGstin || '';
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return name.toLowerCase().includes(q) || gstin.toLowerCase().includes(q);
  });

  const totalPayableMinor = data?.totalPayableMinor || 0;
  const suppliersWithDuesCount = data?.suppliersCount ?? suppliers.length;

  return (
    <div className="cat-bento-module-wrapper finance-module-wrapper">
      {/* 1. Bento Header Card with Live Status & Refresh Action */}
      <BentoHeaderCard
        icon={<CreditCardIcon size={22} />}
        badgeText="Live Payables"
        badgeTooltip="Real-time synchronized supplier dues & inward purchase invoices"
        subtitle="Manage outstanding supplier invoices, aging distributor credit balances, and settlement schedules."
        actions={
          <button
            type="button"
            className="cat-btn-outline"
            onClick={loadData}
            disabled={loading}
            title="Refresh payables ledger"
          >
            <RefreshCwIcon size={14} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Refreshing...' : 'Refresh Payables'}</span>
          </button>
        }
      />

      {/* 2. Bento 3D Elevation KPI Cards Grid */}
      <div className="cat-bento-kpi-grid finance-kpi-grid" aria-label="Payables Financial Overview">
        <StatCard
          icon={<CreditCardIcon size={18} />}
          iconVariant="amber"
          label="TOTAL PAYABLES DUE"
          statusPill={{ text: "Unsettled", variant: "amber" }}
          count={data ? fmtMoney(totalPayableMinor) : '—'}
          countColor="#C2410C"
          hint="Unsettled stock purchase bills & vendor dues"
          title="Total outstanding supplier balance"
          cardVariant="bento-cat-kpi-active"
        />

        <StatCard
          icon={<TruckIcon size={18} />}
          iconVariant="slate"
          label="VENDORS WITH DUES"
          statusPill={{ text: "Active Creditors", variant: "slate" }}
          count={suppliersWithDuesCount}
          countColor="#1E293B"
          hint="Distributors with pending credit balances"
          title="Vendors awaiting payment"
          cardVariant="bento-cat-kpi-sub"
        />

        <StatCard
          icon={<CheckCircle2Icon size={18} />}
          iconVariant="green"
          label="SETTLEMENT STRATEGY"
          statusPill={{ text: "FIFO Engine", variant: "green" }}
          count="FIFO Matching"
          useSansFont={true}
          countColor="#15803D"
          hint="Automatically settles oldest purchase invoices first"
          title="Payment allocation system"
          cardVariant="bento-cat-kpi-main"
        />
      </div>

      {/* 3. Bento Toolbar: Search & Mobile View Switcher */}
      <div className="finance-controls-bar bento-card-3d">
        <div className="finance-search-box" style={{ maxWidth: '420px', flex: 1 }}>
          <SearchIcon size={14} className="finance-search-icon" />
          <input
            type="text"
            className="finance-search-input"
            placeholder="Search vendor by name or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="finance-search-clear"
              onClick={() => setSearch('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="finance-toolbar-right">
          {/* Mobile View Mode Switcher (Cards vs Table) */}
          <div className="finance-view-toggle">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`finance-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
              title="Card View (Mobile Optimized)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`finance-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              title="Table View (Full Columns)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3h18v18H3z" />
                <path d="M3 9h18" />
                <path d="M3 15h18" />
                <path d="M9 3v18" />
              </svg>
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Payables Ledger: Mobile Touch Cards or Full Table View */}
      <div className="finance-ledger-container bento-card-3d">
        {loading ? (
          <div className="finance-loading-state">
            <div className="finance-spinner" />
            <span>Loading accounts payable ledger...</span>
          </div>
        ) : suppliers.length === 0 ? (
          <div className="finance-empty-state">
            <div className="finance-empty-icon inward" style={{ background: '#ecfdf5', color: '#10b981', borderColor: '#a7f3d0' }}>
              <CheckCircle2Icon size={32} />
            </div>
            <div className="finance-empty-title">All supplier bills are fully settled!</div>
            <div className="finance-empty-desc">
              No outstanding supplier balances or pending purchase payments found in the ledger.
            </div>
          </div>
        ) : (
          <>
            {/* 4A. Mobile Touch Cards View (Default on mobile <= 768px) */}
            <div className={`finance-mobile-cards-wrap ${viewMode === 'cards' ? 'active' : ''}`}>
              {suppliers.map((s: any) => (
                <div key={s.supplierId} className="finance-m-card outward-card">
                  <div className="finance-m-header">
                    <div className="finance-m-party-name" style={{ fontSize: '0.94rem' }}>
                      {s.supplierName || 'Unknown Vendor'}
                    </div>
                    <span className="finance-m-status-badge pending">
                      {s.openPurchasesCount} {s.openPurchasesCount === 1 ? 'Bill Open' : 'Bills Open'}
                    </span>
                  </div>

                  <div className="finance-m-party-box">
                    <div className="finance-m-vendor-sub">
                      {s.supplierGstin ? (
                        <div
                          className="finance-m-gstin-badge mono"
                          onClick={() => handleCopy(s.supplierGstin, s.supplierId + '-gstin')}
                          title="Click to copy GSTIN"
                        >
                          <span>GSTIN: {s.supplierGstin}</span>
                          <span className="copy-label">{copiedId === s.supplierId + '-gstin' ? 'Copied!' : '📋'}</span>
                        </div>
                      ) : (
                        <span className="finance-m-unregistered">Unregistered Supplier</span>
                      )}

                      {s.supplierPhone && (
                        <a href={`tel:${s.supplierPhone}`} className="finance-m-phone mono" title="Tap to call">
                          <PhoneIcon size={12} />
                          <span>{s.supplierPhone}</span>
                        </a>
                      )}
                    </div>

                    <div className="finance-m-date-row" style={{ marginTop: '0.35rem' }}>
                      <CalendarIcon size={12} />
                      <span>Oldest Bill: <strong>{s.oldestBillDate || '—'}</strong></span>
                    </div>
                  </div>

                  <div className="finance-m-amount-row">
                    <div className="finance-m-amount-col">
                      <span className="finance-m-amount-label">Outstanding Payable</span>
                      <span className="finance-m-amount-val red mono bold" style={{ fontSize: '1.05rem' }}>
                        {fmtMoney(s.totalPayableMinor)}
                      </span>
                    </div>

                    {onPaySupplier && (
                      <button
                        type="button"
                        className="cat-btn-primary finance-m-action-btn"
                        style={{ padding: '0.45rem 1rem', fontSize: '0.78rem' }}
                        onClick={() => onPaySupplier(s.supplierId)}
                      >
                        <CreditCardIcon size={14} />
                        <span>Settle Bills</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 4B. Full Table View with Horizontal Scroller */}
            <div className={`finance-table-container ${viewMode === 'cards' ? 'hide-on-mobile' : ''}`}>
              <div className="finance-table-scroll-hint">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 8 22 12 18 16" />
                  <polyline points="6 8 2 12 6 16" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                </svg>
                <span>Swipe horizontally to view all supplier payable columns ↔</span>
              </div>

              <div className="finance-table-scroller">
                <table className="data-table finance-data-table">
                  <thead>
                    <tr>
                      <th className="col-sticky-finance">Supplier Name</th>
                      <th>GSTIN</th>
                      <th style={{ textAlign: 'center' }}>Open Purchases</th>
                      <th>Oldest Bill Date</th>
                      <th style={{ textAlign: 'right' }}>Outstanding Payable</th>
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s: any) => (
                      <tr key={s.supplierId}>
                        <td className="col-sticky-finance" style={{ fontWeight: 700, color: '#0f172a' }}>
                          {s.supplierName || 'Unknown Vendor'}
                        </td>
                        <td className="mono" style={{ color: '#475569' }}>
                          {s.supplierGstin || <span style={{ color: '#94a3b8', fontStyle: 'italic', fontFamily: 'inherit' }}>Unregistered</span>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="finance-table-count-chip">
                            {s.openPurchasesCount}
                          </span>
                        </td>
                        <td style={{ color: '#64748b' }}>
                          {s.oldestBillDate || '—'}
                        </td>
                        <td className="mono bold" style={{ textAlign: 'right', color: '#e11d48', fontSize: '0.9rem' }}>
                          {fmtMoney(s.totalPayableMinor)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {onPaySupplier && (
                            <button
                              type="button"
                              onClick={() => onPaySupplier(s.supplierId)}
                              className="cat-btn-primary"
                              style={{ padding: '0.35rem 0.85rem', fontSize: '0.78rem' }}
                            >
                              Settle Bills
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {suppliers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="finance-table-empty-td">
                          No supplier payables matching search filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
