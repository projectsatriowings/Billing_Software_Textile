import React, { useState, useEffect } from 'react';
import { api, type Payment, type SupplierPaymentRecord } from '../../api.ts';
import { fmtMoney } from '../../../../shared/money.ts';
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  RefreshCwIcon,
  ReceiptIcon,
  TruckIcon,
  CheckCircle2Icon,
  SearchIcon,
  WalletIcon,
  CalendarIcon,
  PhoneIcon,
  CreditCardIcon,
} from '../inventory/InventoryIcons.tsx';
import { BentoHeaderCard, StatCard } from '../common/BentoUI.tsx';

interface PaymentsViewProps {
  onOpenCustomerLedger?: (customerId: string) => void;
  onOpenSupplierLedger?: (supplierId: string) => void;
}

export function PaymentsView({ onOpenCustomerLedger, onOpenSupplierLedger }: PaymentsViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'customer' | 'supplier'>('customer');
  const [customerPayments, setCustomerPayments] = useState<Payment[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState('ALL');
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
      const [custRes, suppRes] = await Promise.all([
        api<{ payments: Payment[] }>('/api/payments?limit=100').catch(() => ({ payments: [] })),
        api<{ payments: SupplierPaymentRecord[] }>('/api/suppliers/payments/history?limit=100').catch(() => ({ payments: [] })),
      ]);
      setCustomerPayments(custRes.payments || []);
      setSupplierPayments(suppRes.payments || []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredCustomerPayments = customerPayments.filter((p) => {
    if (modeFilter !== 'ALL' && p.mode !== modeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = (p.customerName || '').toLowerCase().includes(q);
      const matchRec = (p.receiptNumber || '').toLowerCase().includes(q);
      const matchRef = (p.referenceNo || '').toLowerCase().includes(q);
      const matchNote = (p.note || '').toLowerCase().includes(q);
      if (!matchName && !matchRec && !matchRef && !matchNote) return false;
    }
    return true;
  });

  const filteredSupplierPayments = supplierPayments.filter((p) => {
    if (modeFilter !== 'ALL' && p.method !== modeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchNum = (p.paymentNumber || '').toLowerCase().includes(q);
      const matchRef = (p.reference || '').toLowerCase().includes(q);
      const matchSup = (p.supplierName || '').toLowerCase().includes(q);
      if (!matchNum && !matchRef && !matchSup) return false;
    }
    return true;
  });

  const totalCustomerReceived = customerPayments.reduce((sum, p) => sum + p.amountMinor, 0);
  const totalSupplierDisbursed = supplierPayments.reduce((sum, p) => sum + p.amountMinor, 0);
  const netCashFlow = totalCustomerReceived - totalSupplierDisbursed;

  return (
    <div className="cat-bento-module-wrapper finance-module-wrapper">
      {/* 1. Bento Header Card with Live Status & Refresh Action */}
      <BentoHeaderCard
        icon={<WalletIcon size={22} />}
        badgeText="Live Treasury"
        badgeTooltip="Real-time synchronized inward collections & outward supplier payouts"
        subtitle="Manage customer collection receipts, vendor disbursements, and track net cash flow positions."
        actions={
          <button
            type="button"
            className="cat-btn-outline"
            onClick={loadData}
            disabled={loading}
            title="Refresh treasury ledger"
          >
            <RefreshCwIcon size={14} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        }
      />

      {/* 2. Bento 3D Elevation KPI Cards Grid */}
      <div className="cat-bento-kpi-grid finance-kpi-grid" aria-label="Treasury Financial Overview">
        <StatCard
          icon={<ArrowDownLeftIcon size={18} />}
          iconVariant="green"
          label="CUSTOMER INWARD"
          statusPill={{ text: "Inward Flow", variant: "green" }}
          count={fmtMoney(totalCustomerReceived)}
          countColor="#15803D"
          hint={`${customerPayments.length} dues & advances collected`}
          isSelected={activeSubTab === 'customer'}
          onClick={() => setActiveSubTab('customer')}
          title="Click to view Customer Receipts"
          cardVariant="bento-cat-kpi-main"
        />

        <StatCard
          icon={<ArrowUpRightIcon size={18} />}
          iconVariant="red"
          label="SUPPLIER OUTWARD"
          statusPill={{ text: "Outward Payout", variant: "red" }}
          count={fmtMoney(totalSupplierDisbursed)}
          countColor="#BE123C"
          hint={`${supplierPayments.length} purchase bills settled`}
          isSelected={activeSubTab === 'supplier'}
          onClick={() => setActiveSubTab('supplier')}
          title="Click to view Supplier Payments"
          cardVariant="bento-cat-kpi-active"
        />

        <StatCard
          icon={<WalletIcon size={18} />}
          iconVariant="indigo"
          label="NET CASH FLOW"
          statusPill={{
            text: netCashFlow >= 0 ? 'Surplus' : 'Deficit',
            variant: netCashFlow >= 0 ? 'purple' : 'amber',
          }}
          count={fmtMoney(netCashFlow)}
          countColor={netCashFlow >= 0 ? '#4338CA' : '#D97706'}
          hint="Inward collections minus payouts"
          title="Net treasury cash flow"
          cardVariant="bento-cat-kpi-total"
        />
      </div>

      {/* 3. Bento Toolbar: Sub-tabs, Search, Payment Mode & View Toggle */}
      <div className="finance-controls-bar bento-card-3d">
        {/* Left: 3D Segmented Switcher */}
        <div className="finance-segmented-nav">
          <button
            type="button"
            className={`finance-segment-btn ${activeSubTab === 'customer' ? 'active inward' : ''}`}
            onClick={() => setActiveSubTab('customer')}
          >
            <ArrowDownLeftIcon size={14} />
            <span>Customer Receipts</span>
            <span className="finance-count-badge inward">{customerPayments.length}</span>
          </button>
          <button
            type="button"
            className={`finance-segment-btn ${activeSubTab === 'supplier' ? 'active outward' : ''}`}
            onClick={() => setActiveSubTab('supplier')}
          >
            <ArrowUpRightIcon size={14} />
            <span>Supplier Payments</span>
            <span className="finance-count-badge outward">{supplierPayments.length}</span>
          </button>
        </div>

        {/* Right: Search, Mode Filter & Mobile Switcher */}
        <div className="finance-toolbar-right">
          <div className="finance-search-box">
            <SearchIcon size={14} className="finance-search-icon" />
            <input
              type="text"
              className="finance-search-input"
              placeholder={activeSubTab === 'customer' ? 'Search customer, receipt #...' : 'Search voucher, ref #, supplier...'}
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

          <div className="finance-mode-select-wrap">
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              className="finance-mode-select"
            >
              <option value="ALL">All Modes</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI / QR</option>
              <option value="card">Card</option>
              <option value="bank">Bank / NEFT</option>
            </select>
          </div>

          {/* View Toggle (Cards vs Table on Mobile) */}
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

      {/* 4. Ledger Content: Mobile Cards or Full Table View */}
      <div className="finance-ledger-container bento-card-3d">
        {loading ? (
          <div className="finance-loading-state">
            <div className="finance-spinner" />
            <span>Loading treasury transactions...</span>
          </div>
        ) : activeSubTab === 'customer' ? (
          <>
            {/* 4A. Customer Receipts - Mobile Touch Cards */}
            <div className={`finance-mobile-cards-wrap ${viewMode === 'cards' ? 'active' : ''}`}>
              {filteredCustomerPayments.map((p) => {
                const modeClass = p.mode === 'cash' ? 'cash-mode' : p.mode === 'upi' ? 'upi-mode' : 'bank-mode';
                return (
                  <div key={p.id} className="finance-m-card inward-card">
                    <div className="finance-m-header">
                      <div className="finance-m-id-row">
                        <span className="finance-m-chip mono bold">{p.receiptNumber}</span>
                        <button
                          type="button"
                          className="finance-m-copy-btn"
                          onClick={() => handleCopy(p.receiptNumber, p.id)}
                          title="Copy Receipt #"
                        >
                          {copiedId === p.id ? 'Copied!' : '📋'}
                        </button>
                      </div>
                      <span className={`finance-m-mode-badge ${modeClass}`}>
                        {p.mode.toUpperCase()}
                      </span>
                    </div>

                    <div className="finance-m-party-box">
                      <div className="finance-m-party-name">
                        {p.customerName || 'Counter Customer'}
                      </div>
                      <div className="finance-m-date-row">
                        <CalendarIcon size={12} />
                        <span>{p.paymentDate}</span>
                        {p.referenceNo && (
                          <span className="finance-m-ref mono">Ref: {p.referenceNo}</span>
                        )}
                      </div>
                      {p.note && (
                        <div className="finance-m-note">Note: {p.note}</div>
                      )}
                    </div>

                    <div className="finance-m-amount-row">
                      <div className="finance-m-amount-col">
                        <span className="finance-m-amount-label">Amount Received</span>
                        <span className="finance-m-amount-val green mono bold">
                          {fmtMoney(p.amountMinor)}
                        </span>
                      </div>
                      {p.customerId && onOpenCustomerLedger && (
                        <button
                          type="button"
                          className="cat-btn-outline finance-m-action-btn"
                          onClick={() => onOpenCustomerLedger(p.customerId)}
                        >
                          <span>View Customer</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredCustomerPayments.length === 0 && (
                <div className="finance-empty-state">
                  <div className="finance-empty-icon inward">
                    <ReceiptIcon size={28} />
                  </div>
                  <div className="finance-empty-title">No customer receipts found</div>
                  <div className="finance-empty-desc">
                    Customer payment receipts matching your search or mode filter will appear here.
                  </div>
                </div>
              )}
            </div>

            {/* 4B. Customer Receipts - Full Table View */}
            <div className={`finance-table-container ${viewMode === 'cards' ? 'hide-on-mobile' : ''}`}>
              <div className="finance-table-scroll-hint">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 8 22 12 18 16" />
                  <polyline points="6 8 2 12 6 16" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                </svg>
                <span>Swipe horizontally to view all receipt columns ↔</span>
              </div>

              <div className="finance-table-scroller">
                <table className="data-table finance-data-table">
                  <thead>
                    <tr>
                      <th className="col-sticky-finance">Receipt #</th>
                      <th>Date</th>
                      <th>Customer Name</th>
                      <th>Payment Mode</th>
                      <th>Reference #</th>
                      <th style={{ textAlign: 'right' }}>Amount Received</th>
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomerPayments.map((p) => (
                      <tr key={p.id}>
                        <td className="col-sticky-finance mono bold" style={{ color: '#0f172a' }}>
                          {p.receiptNumber}
                        </td>
                        <td style={{ color: '#64748b' }}>{p.paymentDate}</td>
                        <td style={{ fontWeight: 700, color: '#1e293b' }}>
                          {p.customerName || 'Counter Customer'}
                        </td>
                        <td>
                          <span className={`finance-table-mode-badge ${p.mode === 'cash' ? 'cash-mode' : p.mode === 'upi' ? 'upi-mode' : 'bank-mode'}`}>
                            {p.mode.toUpperCase()}
                          </span>
                        </td>
                        <td className="mono" style={{ color: '#64748b', fontSize: '0.8rem' }}>
                          {p.referenceNo || '—'}
                        </td>
                        <td className="mono bold" style={{ textAlign: 'right', color: '#16a34a', fontSize: '0.9rem' }}>
                          {fmtMoney(p.amountMinor)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {p.customerId && onOpenCustomerLedger && (
                            <button
                              type="button"
                              onClick={() => onOpenCustomerLedger(p.customerId)}
                              className="cat-btn-outline"
                              style={{ padding: '0.28rem 0.65rem', fontSize: '0.74rem' }}
                            >
                              View Customer
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredCustomerPayments.length === 0 && (
                      <tr>
                        <td colSpan={7} className="finance-table-empty-td">
                          No customer receipts found matching the filter criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 4C. Supplier Payments - Mobile Touch Cards */}
            <div className={`finance-mobile-cards-wrap ${viewMode === 'cards' ? 'active' : ''}`}>
              {filteredSupplierPayments.map((p) => {
                const methodClass = p.method === 'cash' ? 'cash-mode' : 'bank-mode';
                return (
                  <div key={p.id} className="finance-m-card outward-card">
                    <div className="finance-m-header">
                      <div className="finance-m-id-row">
                        <span className="finance-m-chip mono bold">{p.paymentNumber}</span>
                        <button
                          type="button"
                          className="finance-m-copy-btn"
                          onClick={() => handleCopy(p.paymentNumber, p.id)}
                          title="Copy Voucher #"
                        >
                          {copiedId === p.id ? 'Copied!' : '📋'}
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                        <span className={`finance-m-mode-badge ${methodClass}`}>
                          {p.method.toUpperCase()}
                        </span>
                        <span className="finance-m-status-badge settled">
                          <CheckCircle2Icon size={11} /> Settled
                        </span>
                      </div>
                    </div>

                    <div className="finance-m-party-box">
                      <div className="finance-m-party-name">
                        {p.supplierName || 'Distributor / Vendor'}
                      </div>
                      <div className="finance-m-date-row">
                        <CalendarIcon size={12} />
                        <span>{p.date}</span>
                        {p.reference && (
                          <span className="finance-m-ref mono">Ref: {p.reference}</span>
                        )}
                      </div>
                    </div>

                    <div className="finance-m-amount-row">
                      <div className="finance-m-amount-col">
                        <span className="finance-m-amount-label">Amount Disbursed</span>
                        <span className="finance-m-amount-val red mono bold">
                          {fmtMoney(p.amountMinor)}
                        </span>
                      </div>
                      {p.supplierId && onOpenSupplierLedger && (
                        <button
                          type="button"
                          className="cat-btn-outline finance-m-action-btn"
                          onClick={() => onOpenSupplierLedger(p.supplierId!)}
                        >
                          <span>View Ledger</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredSupplierPayments.length === 0 && (
                <div className="finance-empty-state">
                  <div className="finance-empty-icon outward">
                    <TruckIcon size={28} />
                  </div>
                  <div className="finance-empty-title">No supplier payments found</div>
                  <div className="finance-empty-desc">
                    Supplier disbursements recorded against purchase orders will appear here.
                  </div>
                </div>
              )}
            </div>

            {/* 4D. Supplier Payments - Full Table View */}
            <div className={`finance-table-container ${viewMode === 'cards' ? 'hide-on-mobile' : ''}`}>
              <div className="finance-table-scroll-hint">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 8 22 12 18 16" />
                  <polyline points="6 8 2 12 6 16" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                </svg>
                <span>Swipe horizontally to view all disbursement columns ↔</span>
              </div>

              <div className="finance-table-scroller">
                <table className="data-table finance-data-table">
                  <thead>
                    <tr>
                      <th className="col-sticky-finance">Voucher #</th>
                      <th>Date</th>
                      <th>Supplier / Vendor</th>
                      <th>Payment Method</th>
                      <th>Reference #</th>
                      <th style={{ textAlign: 'right' }}>Amount Paid</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSupplierPayments.map((p) => (
                      <tr key={p.id}>
                        <td className="col-sticky-finance mono bold" style={{ color: '#0f172a' }}>
                          {p.paymentNumber}
                        </td>
                        <td style={{ color: '#64748b' }}>{p.date}</td>
                        <td style={{ fontWeight: 700, color: '#1e293b' }}>
                          {p.supplierName || 'Distributor'}
                        </td>
                        <td>
                          <span className={`finance-table-mode-badge ${p.method === 'cash' ? 'cash-mode' : 'bank-mode'}`}>
                            {p.method.toUpperCase()}
                          </span>
                        </td>
                        <td className="mono" style={{ color: '#64748b', fontSize: '0.8rem' }}>
                          {p.reference || '—'}
                        </td>
                        <td className="mono bold" style={{ textAlign: 'right', color: '#e11d48', fontSize: '0.9rem' }}>
                          {fmtMoney(p.amountMinor)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="finance-m-status-badge settled">
                            <CheckCircle2Icon size={12} /> Settled
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {p.supplierId && onOpenSupplierLedger && (
                            <button
                              type="button"
                              onClick={() => onOpenSupplierLedger(p.supplierId!)}
                              className="cat-btn-outline"
                              style={{ padding: '0.28rem 0.65rem', fontSize: '0.74rem' }}
                            >
                              View Ledger
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredSupplierPayments.length === 0 && (
                      <tr>
                        <td colSpan={8} className="finance-table-empty-td">
                          No supplier disbursements found matching the filter criteria.
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
