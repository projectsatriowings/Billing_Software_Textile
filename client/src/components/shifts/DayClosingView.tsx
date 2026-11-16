import React, { useState, useEffect } from 'react';
import {
  fetchDayClosingPreview,
  submitDayClosing,
  approveDayClosing,
  reopenDayClosing,
  fetchDayClosingComparison,
  fetchDayClosingAnalytics,
  fetchProductProfitability,
  fetchDayClosingHistory,
  type User,
  type Shop,
} from '../../api.ts';
import {
  RupeeIcon,
  BanknoteIcon,
  CreditCardIcon,
  RefreshCwIcon,
  TrendingUpIcon,
  WalletIcon,
  ScaleIcon,
  ClockIcon,
  RotateCcwIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  FileTextIcon,
  LockIcon,
  StoreIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BarChart3Icon,
  PackageIcon,
  TagIcon,
  ReceiptIcon,
  Building2Icon,
  FilterIcon,
  SearchIcon,
  CheckCircleIcon,
  PrinterIcon,
} from '../inventory/InventoryIcons.tsx';
import './dayClosing.css';

interface DayClosingViewProps {
  user: User;
  shop: Shop | null;
  selectedBranch?: string;
  branches?: any[];
}

type TabType = 'closing' | 'comparison' | 'analytics' | 'profitability' | 'history';
type ProfitFilterType = 'top_selling' | 'highest_revenue' | 'highest_profit' | 'lowest_profit' | 'loss_making' | 'most_returned';

export const DayClosingView: React.FC<DayClosingViewProps> = ({
  user,
  shop,
  selectedBranch,
  branches,
}) => {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabType>('closing');

  // Branch & Filter states
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    selectedBranch || (branches && branches[0]?.id) || 'MAIN'
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');

  // Tab 1: Day Closing Live Preview & Reconciliation state
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [preview, setPreview] = useState<any | null>(null);
  const [actualCashStr, setActualCashStr] = useState<string>('');
  const [closingRemarks, setClosingRemarks] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Tab 2: Comparison state
  const [comparisonData, setComparisonData] = useState<any | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);

  // Tab 3: Custom Date Range Analytics state
  const [analyticsPreset, setAnalyticsPreset] = useState<string>('this_month');
  const [analyticsStartDate, setAnalyticsStartDate] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [analyticsEndDate, setAnalyticsEndDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [comparisonMode, setComparisonMode] = useState<'previous_period' | 'same_period_last_year' | 'none'>('previous_period');
  const [analyticsData, setAnalyticsData] = useState<any | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Tab 4: Product Profitability state
  const [profitFilter, setProfitFilter] = useState<ProfitFilterType>('top_selling');
  const [profitSearch, setProfitSearch] = useState<string>('');
  const [profitData, setProfitData] = useState<any | null>(null);
  const [loadingProfit, setLoadingProfit] = useState(false);

  // Tab 5: History state
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Reopen Modal state
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenTargetId, setReopenTargetId] = useState<string>('');
  const [reopenReason, setReopenReason] = useState<string>('');
  const [reopening, setReopening] = useState(false);

  // Messages
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const activeBranchId = selectedBranchId || selectedBranch || 'MAIN';
  const userRole = String(user.role || '').toUpperCase();
  const isManagerOrOwner = ['OWNER', 'SUPER_ADMIN', 'STORE_MANAGER', 'MANAGER'].includes(userRole);
  const isOwner = ['OWNER', 'SUPER_ADMIN'].includes(userRole);

  const fmt = (minor: number = 0) =>
    `₹${((minor || 0) / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // --------------------------------------------------------------------------
  // Data Fetchers
  // --------------------------------------------------------------------------
  const loadPreview = async () => {
    try {
      setLoadingPreview(true);
      setError(null);
      const res = await fetchDayClosingPreview({
        branchId: activeBranchId,
        date: selectedDate,
        shiftId: selectedShiftId || undefined,
      });
      setPreview(res);
      const expected = res.cashReconciliation?.expectedClosingCashMinor ?? res.cashDrawer?.expectedClosingCashMinor;
      if (expected !== undefined && !actualCashStr) {
        setActualCashStr((expected / 100).toFixed(2));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch day closing preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  const loadComparison = async () => {
    try {
      setLoadingComparison(true);
      const res = await fetchDayClosingComparison({
        branchId: activeBranchId,
        date: selectedDate,
      });
      setComparisonData(res);
    } catch (err: any) {
      console.error('Failed to load comparison', err);
    } finally {
      setLoadingComparison(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      setLoadingAnalytics(true);
      const res = await fetchDayClosingAnalytics({
        branchId: activeBranchId,
        startDate: analyticsStartDate,
        endDate: analyticsEndDate,
        comparisonMode,
      });
      setAnalyticsData(res);
    } catch (err: any) {
      console.error('Failed to load analytics', err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const loadProductProfitability = async () => {
    try {
      setLoadingProfit(true);
      const res = await fetchProductProfitability({
        branchId: activeBranchId,
        startDate: analyticsStartDate,
        endDate: analyticsEndDate,
        filter: profitFilter,
        limit: 100,
      });
      setProfitData(res);
    } catch (err: any) {
      console.error('Failed to load product profitability', err);
    } finally {
      setLoadingProfit(false);
    }
  };

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await fetchDayClosingHistory({ branchId: activeBranchId, limit: 50 });
      setHistory(res.records || res.history || []);
    } catch (err: any) {
      console.error('Failed to load history', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Trigger loads on relevant dependencies
  useEffect(() => {
    if (activeTab === 'closing') loadPreview();
    else if (activeTab === 'comparison') loadComparison();
    else if (activeTab === 'analytics') loadAnalytics();
    else if (activeTab === 'profitability') loadProductProfitability();
    else if (activeTab === 'history') loadHistory();
  }, [activeTab, activeBranchId, selectedDate, selectedShiftId]);

  useEffect(() => {
    if (activeTab === 'analytics') loadAnalytics();
  }, [analyticsStartDate, analyticsEndDate, comparisonMode]);

  useEffect(() => {
    if (activeTab === 'profitability') loadProductProfitability();
  }, [profitFilter, analyticsStartDate, analyticsEndDate]);

  // --------------------------------------------------------------------------
  // Preset Date Handlers for Custom Date Range Analytics
  // --------------------------------------------------------------------------
  const handleApplyPreset = (preset: string) => {
    setAnalyticsPreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    let start = todayStr;
    let end = todayStr;

    if (preset === 'today') {
      start = todayStr;
      end = todayStr;
    } else if (preset === 'yesterday') {
      const y = new Date(now.getTime() - 86400000);
      start = y.toISOString().slice(0, 10);
      end = start;
    } else if (preset === 'last_7_days') {
      const s = new Date(now.getTime() - 6 * 86400000);
      start = s.toISOString().slice(0, 10);
      end = todayStr;
    } else if (preset === 'last_30_days') {
      const s = new Date(now.getTime() - 29 * 86400000);
      start = s.toISOString().slice(0, 10);
      end = todayStr;
    } else if (preset === 'this_week') {
      const day = now.getDay() || 7;
      const s = new Date(now);
      s.setDate(now.getDate() - day + 1);
      start = s.toISOString().slice(0, 10);
      end = todayStr;
    } else if (preset === 'last_week') {
      const day = now.getDay() || 7;
      const e = new Date(now);
      e.setDate(now.getDate() - day);
      const s = new Date(e);
      s.setDate(e.getDate() - 6);
      start = s.toISOString().slice(0, 10);
      end = e.toISOString().slice(0, 10);
    } else if (preset === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      end = todayStr;
    } else if (preset === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
      end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
    } else if (preset === 'this_quarter') {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10);
      end = todayStr;
    } else if (preset === 'last_quarter') {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), (q - 1) * 3, 1).toISOString().slice(0, 10);
      end = new Date(now.getFullYear(), q * 3, 0).toISOString().slice(0, 10);
    } else if (preset === 'financial_year') {
      const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      start = `${fyStartYear}-04-01`;
      end = todayStr;
    }

    setAnalyticsStartDate(start);
    setAnalyticsEndDate(end);
  };

  // --------------------------------------------------------------------------
  // Closing Actions (Submit, Approve, Reopen, Print)
  // --------------------------------------------------------------------------
  const handleSubmitClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview) return;

    if (preview.status === 'approved' || preview.status === 'closed') {
      alert('This business date is already approved and sealed.');
      return;
    }

    if (isNaN(parseFloat(actualCashStr))) {
      alert('Please enter a valid actual closing cash amount.');
      return;
    }

    const actualCashMinor = Math.round((parseFloat(actualCashStr) || 0) * 100);
    const expectedCashMinor = preview.cashReconciliation?.expectedClosingCashMinor || 0;
    const diffMinor = actualCashMinor - expectedCashMinor;

    const confirmMsg =
      `Submit Day Closing for ${preview.bdate || selectedDate}?\n\n` +
      `Expected Cash: ${fmt(expectedCashMinor)}\n` +
      `Counted Cash:  ${fmt(actualCashMinor)}\n` +
      `Difference:    ${diffMinor >= 0 ? '+' : ''}${fmt(diffMinor)}\n\n` +
      `This will mark the register as SUBMITTED for management approval.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await submitDayClosing({
        branchId: activeBranchId,
        date: preview.bdate || selectedDate,
        shiftId: selectedShiftId || undefined,
        actualCashMinor,
        remarks: closingRemarks.trim(),
      });
      setSuccessMsg(`Day closing submitted successfully! Reference: ${res.dayClosing?.id || 'OK'}`);
      await loadPreview();
    } catch (err: any) {
      setError(err.message || 'Failed to submit day closing');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveClosing = async (closingId: string) => {
    if (!window.confirm('Approve and permanently lock this day closing? All transactions on this date will be sealed.')) return;
    try {
      setActionLoading(true);
      setError(null);
      await approveDayClosing(closingId);
      setSuccessMsg('Day closing approved and locked successfully!');
      await loadPreview();
      await loadHistory();
    } catch (err: any) {
      setError(err.message || 'Failed to approve day closing');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenReopenModal = (closingId: string) => {
    setReopenTargetId(closingId);
    setReopenReason('');
    setIsReopenModalOpen(true);
  };

  const handleConfirmReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenTargetId) return;
    if (reopenReason.trim().length < 5) {
      alert('Please provide a meaningful reason (at least 5 characters) for reopening.');
      return;
    }

    try {
      setReopening(true);
      setError(null);
      await reopenDayClosing(reopenTargetId, reopenReason.trim());
      setSuccessMsg('Business day has been reopened. Invoices unlocked for correction.');
      setIsReopenModalOpen(false);
      await loadPreview();
      await loadHistory();
    } catch (err: any) {
      setError(err.message || 'Failed to reopen day closing');
    } finally {
      setReopening(false);
    }
  };

  const handlePrint = (closingId: string) => {
    window.open(`/api/day-closing/${closingId}/print`, '_blank', 'width=950,height=800');
  };

  // Computed values for preview
  const sales = preview?.salesSummary || {
    grossSalesMinor: 0,
    totalDiscountsMinor: 0,
    returnsTotalMinor: 0,
    netSalesMinor: 0,
    gstCollectedMinor: 0,
    invoicesCount: 0,
    cancelledInvoicesCount: 0,
    averageBillValueMinor: 0,
    totalProductsSold: 0,
    totalQuantitiesSold: 0,
    totalCustomersBilled: 0,
    newCustomersCount: 0,
    customerCreditBalanceMinor: 0,
  };

  const returns = preview?.returnSummary || {
    totalReturnsCount: 0,
    totalReturnValueMinor: 0,
    cashRefundsPaidMinor: 0,
    upiRefundsPaidMinor: 0,
    totalRefundsPaidMinor: 0,
    exchangeCreditAdjustedMinor: 0,
    storeCreditsIssuedMinor: 0,
  };

  const exchanges = preview?.exchangeSummary || {
    exchangesCount: 0,
    exchangeAdjustedMinor: 0,
    newProductsSoldMinor: 0,
    remainingCustomerCreditMinor: 0,
  };

  const payments = preview?.paymentSummary || {
    cashCollectionsMinor: 0,
    upiCollectionsMinor: 0,
    cardCollectionsMinor: 0,
    storeCreditMinor: 0,
  };

  const profit = preview?.profitSummary || {
    netSalesMinor: 0,
    netCogsMinor: 0,
    grossProfitMinor: 0,
    operatingExpensesMinor: 0,
    netProfitMinor: 0,
  };

  const cashRec = preview?.cashReconciliation || {
    openingCashMinor: 0,
    cashSalesReceivedMinor: 0,
    cashRefundsPaidMinor: 0,
    cashInMinor: 0,
    cashOutMinor: 0,
    cashExpensesMinor: 0,
    expectedClosingCashMinor: 0,
  };

  const marginPct = sales.netSalesMinor > 0
    ? (profit.grossProfitMinor / sales.netSalesMinor) * 100
    : 0;

  const operatingMarginPct = sales.netSalesMinor > 0
    ? (profit.netProfitMinor / sales.netSalesMinor) * 100
    : 0;

  const actualCashMinor = Math.round((parseFloat(actualCashStr) || 0) * 100);
  const expectedCashMinor = cashRec.expectedClosingCashMinor || 0;
  const cashDifferenceMinor = actualCashMinor - expectedCashMinor;

  const closingStatus = preview?.status || (preview?.isClosed ? 'closed' : 'open');
  const closedRecord = preview?.closedRecord || null;

  return (
    <div className="day-closing-wrapper">
      {/* --------------------------------------------------------------------
          1. Header Card
          -------------------------------------------------------------------- */}
      <div className="day-closing-header-card">
        <div className="day-closing-header-left">
          <div className="day-closing-header-icon">
            <LockIcon size={24} />
          </div>
          <div>
            <h1 className="day-closing-title">Day Closing & Business Performance Analytics</h1>
            <p className="day-closing-subtitle">
              Audit daily sales, actual profitability, losses, payment collections, cash differences, and branch performance
            </p>
          </div>
        </div>

        <div className="day-closing-header-right">
          {closedRecord?.id && (
            <button
              onClick={() => handlePrint(closedRecord.id)}
              className="btn-print"
              title="Print Official Closing Statement"
            >
              <PrinterIcon size={15} />
              Print Closing Report
            </button>
          )}

          <button
            onClick={() => {
              if (activeTab === 'closing') loadPreview();
              else if (activeTab === 'comparison') loadComparison();
              else if (activeTab === 'analytics') loadAnalytics();
              else if (activeTab === 'profitability') loadProductProfitability();
              else if (activeTab === 'history') loadHistory();
            }}
            disabled={loadingPreview || loadingComparison || loadingAnalytics || loadingProfit}
            className="day-closing-refresh-btn"
          >
            <RefreshCwIcon size={14} className={(loadingPreview || loadingComparison) ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------------------
          2. Tab Navigation Bar
          -------------------------------------------------------------------- */}
      <div className="day-closing-tabs-bar">
        <button
          onClick={() => setActiveTab('closing')}
          className={`day-closing-tab-btn ${activeTab === 'closing' ? 'active' : ''}`}
        >
          <LockIcon size={15} />
          Register Closing & Reconciliation
        </button>

        <button
          onClick={() => setActiveTab('comparison')}
          className={`day-closing-tab-btn ${activeTab === 'comparison' ? 'active' : ''}`}
        >
          <ScaleIcon size={15} />
          Today vs Previous Day Comparison
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`day-closing-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
        >
          <BarChart3Icon size={15} />
          Custom Date Range Analytics
        </button>

        <button
          onClick={() => setActiveTab('profitability')}
          className={`day-closing-tab-btn ${activeTab === 'profitability' ? 'active' : ''}`}
        >
          <PackageIcon size={15} />
          Product-Wise Profitability
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`day-closing-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
        >
          <ClockIcon size={15} />
          Closing History & Audit Logs
        </button>
      </div>

      {/* --------------------------------------------------------------------
          3. Global Filter Controls Bar
          -------------------------------------------------------------------- */}
      <div className="day-closing-filter-bar">
        <div className="day-closing-filter-group">
          {branches && branches.length > 0 && (
            <div className="day-closing-filter-item">
              <Building2Icon size={15} style={{ color: '#4f46e5' }} />
              <select
                value={activeBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="day-closing-select"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code || b.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeTab === 'closing' || activeTab === 'comparison' ? (
            <div className="day-closing-filter-item">
              <ClockIcon size={15} style={{ color: '#059669' }} />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="day-closing-input"
              />
            </div>
          ) : null}

          {activeTab === 'closing' && preview?.availableShifts && preview.availableShifts.length > 0 && (
            <div className="day-closing-filter-item">
              <FilterIcon size={14} style={{ color: '#6366f1' }} />
              <select
                value={selectedShiftId}
                onChange={(e) => setSelectedShiftId(e.target.value)}
                className="day-closing-select"
              >
                <option value="">All Shifts (Consolidated Full Day)</option>
                {preview.availableShifts.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    Shift {s.shift_number || s.id.slice(0, 6)} ({s.cashier_name || 'Cashier'})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
          Tenant: <strong style={{ color: '#0f172a' }}>{shop?.name || 'Main Organization'}</strong>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="day-closing-alert error">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangleIcon size={18} />
            <span><strong>Error:</strong> {error}</span>
          </div>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', color: '#b91c1c' }}>✕</button>
        </div>
      )}

      {successMsg && (
        <div className="day-closing-alert success">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2Icon size={18} />
            <span><strong>Success:</strong> {successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', color: '#047857' }}>✕</button>
        </div>
      )}

      {/* ====================================================================
          TAB 1: REGISTER CLOSING & CASH RECONCILIATION
          ==================================================================== */}
      {activeTab === 'closing' && (
        <>
          {/* Lifecycle Status Ribbon */}
          <div className={`day-closing-status-banner ${closingStatus}`}>
            <div className="status-banner-left">
              <div className={`status-banner-icon ${closingStatus}`}>
                {closingStatus === 'open' ? (
                  <CheckCircleIcon size={20} />
                ) : closingStatus === 'submitted' ? (
                  <ClockIcon size={20} />
                ) : closingStatus === 'reopened' ? (
                  <AlertTriangleIcon size={20} />
                ) : (
                  <LockIcon size={20} />
                )}
              </div>
              <div>
                <div className="status-banner-title">
                  {closingStatus === 'open' && `Register Open — Active Trading on ${selectedDate}`}
                  {closingStatus === 'submitted' && `Day Closing Submitted — Awaiting Management Approval`}
                  {closingStatus === 'approved' && `Day Closing Approved & Sealed (${selectedDate})`}
                  {closingStatus === 'closed' && `Day Closing Sealed (${selectedDate})`}
                  {closingStatus === 'reopened' && `Day Closing Reopened for Corrections`}
                </div>
                <div className="status-banner-desc">
                  {closingStatus === 'open' && 'Cashier can balance drawer floats and submit end-of-day reconciliation.'}
                  {closingStatus === 'submitted' && `Submitted by ${closedRecord?.closed_by_name || 'Cashier'}. Store Manager or Owner approval required to lock.`}
                  {closingStatus === 'approved' && `Approved by ${closedRecord?.approved_by_name || 'Manager'}. Transactions are sealed against ordinary edits.`}
                  {closingStatus === 'reopened' && `Reopened by ${closedRecord?.reopened_by_name || 'Owner'}. Reason: "${closedRecord?.reopen_reason || 'N/A'}"`}
                </div>
              </div>
            </div>

            <div className="status-banner-actions">
              {closingStatus === 'submitted' && isManagerOrOwner && closedRecord?.id && (
                <button
                  onClick={() => handleApproveClosing(closedRecord.id)}
                  disabled={actionLoading}
                  className="btn-approve"
                >
                  <CheckCircle2Icon size={15} />
                  Approve & Lock Day Closing
                </button>
              )}

              {(closingStatus === 'approved' || closingStatus === 'closed') && isOwner && closedRecord?.id && (
                <button
                  onClick={() => handleOpenReopenModal(closedRecord.id)}
                  className="btn-reopen"
                >
                  <RotateCcwIcon size={15} />
                  Reopen Business Day
                </button>
              )}

              {closedRecord?.id && (
                <button
                  onClick={() => handlePrint(closedRecord.id)}
                  className="btn-print"
                >
                  <PrinterIcon size={15} />
                  Print Statement
                </button>
              )}
            </div>
          </div>

          {/* 14 Financial KPI Summary Cards */}
          <div className="kpi-14-section">
            <div className="kpi-14-header">
              <span>Financial Performance Summary</span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Accrual Accounting Basis</span>
            </div>

            <div className="kpi-14-grid">
              {/* 1. Gross Sales */}
              <div className="kpi-card blue">
                <div className="kpi-card-top">
                  <span className="kpi-card-label">1. Gross Sales</span>
                  <div className="kpi-card-icon"><TrendingUpIcon size={14} /></div>
                </div>
                <div className="kpi-card-value">{fmt(sales.grossSalesMinor)}</div>
                <span className="kpi-card-sub">Pre-discount, excl. GST</span>
              </div>

              {/* 2. Total Discounts */}
              <div className="kpi-card amber">
                <div className="kpi-card-top">
                  <span className="kpi-card-label">2. Total Discounts</span>
                  <div className="kpi-card-icon"><TagIcon size={14} /></div>
                </div>
                <div className="kpi-card-value">{fmt(sales.totalDiscountsMinor)}</div>
                <span className="kpi-card-sub">Promos & bill discounts</span>
              </div>

              {/* 3. Sales Returns */}
              <div className="kpi-card rose">
                <div className="kpi-card-top">
                  <span className="kpi-card-label">3. Sales Returns</span>
                  <div className="kpi-card-icon"><RotateCcwIcon size={14} /></div>
                </div>
                <div className="kpi-card-value" style={{ color: '#e11d48' }}>-{fmt(sales.returnsTotalMinor)}</div>
                <span className="kpi-card-sub">{returns.totalReturnsCount || 0} credit notes issued</span>
              </div>

              {/* 4. Net Sales */}
              <div className="kpi-card green highlight">
                <div className="kpi-card-top">
                  <span className="kpi-card-label">4. Net Sales</span>
                  <div className="kpi-card-icon"><RupeeIcon size={14} /></div>
                </div>
                <div className="kpi-card-value">{fmt(sales.netSalesMinor)}</div>
                <span className="kpi-card-sub">Gross - Discounts - Returns</span>
              </div>

              {/* 5. GST Collected */}
              <div className="kpi-card indigo">
                <div className="kpi-card-top">
                  <span className="kpi-card-label">5. GST Collected</span>
                  <div className="kpi-card-icon"><ReceiptIcon size={14} /></div>
                </div>
                <div className="kpi-card-value">{fmt(sales.gstCollectedMinor)}</div>
                <span className="kpi-card-sub">CGST + SGST + IGST</span>
              </div>

              {/* 6. COGS */}
              <div className="kpi-card slate">
                <div className="kpi-card-top">
                  <span className="kpi-card-label">6. Net COGS</span>
                  <div className="kpi-card-icon"><PackageIcon size={14} /></div>
                </div>
                <div className="kpi-card-value">{fmt(profit.netCogsMinor)}</div>
                <span className="kpi-card-sub">Historical stock cost</span>
              </div>

              {/* 7. Gross Profit */}
              <div className="kpi-card purple">
                <div className="kpi-card-top">
                  <span className="kpi-card-label">7. Gross Profit</span>
                  <div className="kpi-card-icon"><TrendingUpIcon size={14} /></div>
                </div>
                <div className="kpi-card-value" style={{ color: '#7e22ce' }}>{fmt(profit.grossProfitMinor)}</div>
                <span className="kpi-card-sub">{marginPct.toFixed(1)}% Gross Margin</span>
              </div>

              {/* 8. Operating Expenses */}
              <div className="kpi-card amber">
                <div className="kpi-card-top">
                  <span className="kpi-card-label">8. Operating Expenses</span>
                  <div className="kpi-card-icon"><ArrowUpRightIcon size={14} /></div>
                </div>
                <div className="kpi-card-value">{fmt(profit.operatingExpensesMinor)}</div>
                <span className="kpi-card-sub">Branch petty & overheads</span>
              </div>

              {/* 9. Operating Profit */}
              <div className="kpi-card green">
                <div className="kpi-card-top">
                  <span className="kpi-card-label">9. Operating Profit</span>
                  <div className="kpi-card-icon"><RupeeIcon size={14} /></div>
                </div>
                <div className="kpi-card-value" style={{ color: profit.netProfitMinor >= 0 ? '#15803d' : '#b91c1c' }}>
                  {fmt(profit.netProfitMinor)}
                </div>
                <span className="kpi-card-sub">{operatingMarginPct.toFixed(1)}% Net Margin</span>
              </div>

              {/* 10. Total Invoices */}
              <div className="kpi-card blue">
                <div className="kpi-card-top">
                  <span className="kpi-card-label">10. Total Invoices</span>
                  <div className="kpi-card-icon"><FileTextIcon size={14} /></div>
                </div>
                <div className="kpi-card-value">{sales.invoicesCount || 0}</div>
                <span className="kpi-card-sub">Billed customers</span>
              </div>

              {/* 11. Average Bill Value */}
              <div className="kpi-card indigo">
                <div className="kpi-card-top">
                  <span className="kpi-card-label">11. Avg Bill Value</span>
                  <div className="kpi-card-icon"><BarChart3Icon size={14} /></div>
                </div>
                <div className="kpi-card-value">{fmt(sales.averageBillValueMinor)}</div>
                <span className="kpi-card-sub">Revenue per invoice</span>
              </div>

              {/* 12. Cancelled Invoices */}
              <div className="kpi-card rose">
                <div className="kpi-card-top">
                  <span className="kpi-card-label">12. Cancelled Invoices</span>
                  <div className="kpi-card-icon"><AlertTriangleIcon size={14} /></div>
                </div>
                <div className="kpi-card-value">{sales.cancelledInvoicesCount || 0}</div>
                <span className="kpi-card-sub">Voided before settlement</span>
              </div>

              {/* 13. Refunds Paid Out */}
              <div className="kpi-card rose">
                <div className="kpi-card-top">
                  <span className="kpi-card-label">13. Refunds Paid</span>
                  <div className="kpi-card-icon"><RotateCcwIcon size={14} /></div>
                </div>
                <div className="kpi-card-value">{fmt(returns.totalRefundsPaidMinor)}</div>
                <span className="kpi-card-sub">Cash + UPI customer refunds</span>
              </div>

              {/* 14. Customer Outstanding Payments */}
              <div className="kpi-card purple">
                <div className="kpi-card-top">
                  <span className="kpi-card-label">14. Credit Dues</span>
                  <div className="kpi-card-icon"><StoreIcon size={14} /></div>
                </div>
                <div className="kpi-card-value">{fmt(sales.customerCreditBalanceMinor)}</div>
                <span className="kpi-card-sub">Unsettled customer receivables</span>
              </div>
            </div>
          </div>

          {/* Operational Statistics Strip */}
          <div className="ops-stats-strip">
            <div className="ops-stat-item">
              <PackageIcon size={16} style={{ color: '#6366f1' }} />
              <span>Products Sold: <strong>{sales.totalProductsSold || 0} SKUs</strong></span>
            </div>
            <div className="ops-stat-item">
              <TagIcon size={16} style={{ color: '#059669' }} />
              <span>Units Sold: <strong>{sales.totalQuantitiesSold || 0} units</strong></span>
            </div>
            <div className="ops-stat-item">
              <BarChart3Icon size={16} style={{ color: '#d97706' }} />
              <span>Customers Billed: <strong>{sales.totalCustomersBilled || 0}</strong></span>
            </div>
            <div className="ops-stat-item">
              <CheckCircleIcon size={16} style={{ color: '#2563eb' }} />
              <span>New Customers: <strong>{sales.newCustomersCount || 0}</strong></span>
            </div>
          </div>

          {/* Bento Grid: Tender Collections & Cash Drawer Reconciliation */}
          <div className="day-closing-bento-grid">
            {/* LEFT 7 COLUMNS: Tender Collections & Returns */}
            <div className="bento-col-7">
              {/* Section D: Tender Collections */}
              <div className="day-closing-card">
                <div className="day-closing-card-header">
                  <div className="day-closing-card-title-group">
                    <WalletIcon size={18} style={{ color: '#10b981' }} />
                    <span>Section D: Tender & Settlement Collections</span>
                  </div>
                  <span className="day-closing-card-badge emerald">
                    Payment Channels
                  </span>
                </div>

                <div className="tender-kpi-grid">
                  <div className="tender-kpi-card cash">
                    <div className="tender-header">
                      <BanknoteIcon size={15} />
                      <span>Physical Cash</span>
                    </div>
                    <div className="tender-amount">{fmt(payments.cashCollectionsMinor)}</div>
                  </div>

                  <div className="tender-kpi-card upi">
                    <div className="tender-header">
                      <RefreshCwIcon size={14} />
                      <span>UPI / QR</span>
                    </div>
                    <div className="tender-amount">{fmt(payments.upiCollectionsMinor)}</div>
                  </div>

                  <div className="tender-kpi-card card">
                    <div className="tender-header">
                      <CreditCardIcon size={14} />
                      <span>Card / POS</span>
                    </div>
                    <div className="tender-amount">{fmt(payments.cardCollectionsMinor)}</div>
                  </div>

                  <div className="tender-kpi-card credit">
                    <div className="tender-header">
                      <StoreIcon size={14} />
                      <span>Store Credit</span>
                    </div>
                    <div className="tender-amount">{fmt(payments.storeCreditMinor)}</div>
                  </div>
                </div>
              </div>

              {/* Sections B & C: Returns, Refunds & Exchanges */}
              <div className="day-closing-card">
                <div className="day-closing-card-header">
                  <div className="day-closing-card-title-group">
                    <RotateCcwIcon size={18} style={{ color: '#f43f5e' }} />
                    <span>Sections B & C: Returns, Refunds & Exchanges</span>
                  </div>
                  <span className="day-closing-card-badge rose">
                    {returns.totalReturnsCount || 0} Return Events
                  </span>
                </div>

                <div>
                  <div className="detail-list-row">
                    <span className="detail-list-label">Total Returned Merchandise Value:</span>
                    <span className="detail-list-val rose">{fmt(returns.totalReturnValueMinor)}</span>
                  </div>
                  <div className="detail-list-row">
                    <span className="detail-list-label">Cash Refunds Disbursed:</span>
                    <span className="detail-list-val">{fmt(returns.cashRefundsPaidMinor)}</span>
                  </div>
                  <div className="detail-list-row">
                    <span className="detail-list-label">UPI Refunds Processed:</span>
                    <span className="detail-list-val">{fmt(returns.upiRefundsPaidMinor)}</span>
                  </div>
                  <div className="detail-list-row">
                    <span className="detail-list-label">Exchange Credits Applied to New Sales:</span>
                    <span className="detail-list-val indigo">{fmt(returns.exchangeCreditAdjustedMinor)}</span>
                  </div>
                  <div className="detail-list-row">
                    <span className="detail-list-label">Store Credit Notes Issued:</span>
                    <span className="detail-list-val purple">{fmt(returns.storeCreditsIssuedMinor)}</span>
                  </div>
                  <div className="detail-list-row">
                    <span className="detail-list-label">New Merchandise Sold in Exchanges:</span>
                    <span className="detail-list-val">{fmt(exchanges.newProductsSoldMinor)}</span>
                  </div>
                </div>

                <div className="detail-notice-box">
                  💡 <strong>Accounting Integrity:</strong> Exchanges seamlessly offset customer return credit against new merchandise sold without inflating gross cash collections. Resellable returns restore inventory cost, while damaged goods are quarantined separately.
                </div>
              </div>
            </div>

            {/* RIGHT 5 COLUMNS: Dedicated Cash Drawer Reconciliation */}
            <div className="bento-col-5">
              <div className="day-closing-card">
                <div className="day-closing-card-header">
                  <div className="day-closing-card-title-group">
                    <BanknoteIcon size={18} style={{ color: '#10b981' }} />
                    <span>Section E: Cash Drawer Reconciliation</span>
                  </div>
                  <span className="day-closing-card-badge">
                    Physical Audit
                  </span>
                </div>

                <div className="cash-rec-container">
                  <div className="cash-rec-row">
                    <span className="cash-rec-label">Opening Cash Float</span>
                    <span className="cash-rec-val">{fmt(cashRec.openingCashMinor)}</span>
                  </div>

                  <div className="cash-rec-row">
                    <span className="cash-rec-label" style={{ color: '#15803d' }}>
                      <ArrowDownLeftIcon size={14} /> (+) Cash Sales Received
                    </span>
                    <span className="cash-rec-val plus">+{fmt(cashRec.cashSalesReceivedMinor)}</span>
                  </div>

                  <div className="cash-rec-row">
                    <span className="cash-rec-label" style={{ color: '#15803d' }}>
                      (+) Cash In / Drawer Deposits
                    </span>
                    <span className="cash-rec-val plus">+{fmt(cashRec.cashInMinor)}</span>
                  </div>

                  <div className="cash-rec-row">
                    <span className="cash-rec-label" style={{ color: '#b91c1c' }}>
                      <ArrowUpRightIcon size={14} /> (-) Cash Refunds Paid Out
                    </span>
                    <span className="cash-rec-val minus">-{fmt(cashRec.cashRefundsPaidMinor)}</span>
                  </div>

                  <div className="cash-rec-row">
                    <span className="cash-rec-label" style={{ color: '#b91c1c' }}>
                      (-) Cash Expenses Paid
                    </span>
                    <span className="cash-rec-val minus">-{fmt(cashRec.cashExpensesMinor)}</span>
                  </div>

                  <div className="cash-rec-row">
                    <span className="cash-rec-label" style={{ color: '#b91c1c' }}>
                      (-) Cash Out / Withdrawals
                    </span>
                    <span className="cash-rec-val minus">-{fmt(cashRec.cashOutMinor)}</span>
                  </div>

                  {/* Expected Closing Cash Banner */}
                  <div className="cash-rec-expected-box">
                    <span className="cash-rec-expected-label">Expected Closing Cash:</span>
                    <span className="cash-rec-expected-val">{fmt(cashRec.expectedClosingCashMinor)}</span>
                  </div>

                  {/* Submission Form (Active if open or reopened) */}
                  {closingStatus === 'open' || closingStatus === 'reopened' ? (
                    <form onSubmit={handleSubmitClosing} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      <div className="cash-rec-input-group">
                        <label className="cash-rec-input-label">
                          Actual Physical Cash Counted (₹) *
                        </label>
                        <div className="cash-rec-input-wrapper">
                          <span className="cash-rec-input-prefix">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={actualCashStr}
                            onChange={(e) => setActualCashStr(e.target.value)}
                            placeholder="0.00"
                            className="cash-rec-input"
                          />
                        </div>
                      </div>

                      {/* Variance Pill */}
                      <div className={`cash-rec-diff-pill ${
                        cashDifferenceMinor === 0
                          ? 'balanced'
                          : cashDifferenceMinor > 0
                          ? 'surplus'
                          : 'deficit'
                      }`}>
                        <span>
                          {cashDifferenceMinor === 0
                            ? 'Drawer Balanced (Exact Match)'
                            : cashDifferenceMinor > 0
                            ? 'Cash Excess / Surplus'
                            : 'Cash Shortage / Deficit'}
                        </span>
                        <span>
                          {cashDifferenceMinor >= 0 ? '+' : ''}{fmt(cashDifferenceMinor)}
                        </span>
                      </div>

                      <div className="cash-rec-input-group">
                        <label className="cash-rec-input-label">
                          Closing Remarks / Discrepancy Reason
                        </label>
                        <textarea
                          rows={2}
                          value={closingRemarks}
                          onChange={(e) => setClosingRemarks(e.target.value)}
                          placeholder="e.g. Counted by head cashier, minor coin variation"
                          className="cash-rec-remarks-input"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submitting}
                        className="cash-rec-submit-btn"
                      >
                        <LockIcon size={16} />
                        {submitting ? 'Submitting Closing...' : 'Submit Day Closing'}
                      </button>
                    </form>
                  ) : (
                    /* Closed or Submitted View */
                    <div style={{ marginTop: '0.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                        <span style={{ color: '#64748b' }}>Actual Closing Cash:</span>
                        <strong style={{ color: '#0f172a' }}>{fmt(closedRecord?.actual_cash_minor)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                        <span style={{ color: '#64748b' }}>Cash Discrepancy:</span>
                        <strong style={{ color: (closedRecord?.variance_minor || 0) < 0 ? '#b91c1c' : '#15803d' }}>
                          {(closedRecord?.variance_minor || 0) >= 0 ? '+' : ''}
                          {fmt(closedRecord?.variance_minor || 0)}
                        </strong>
                      </div>
                      {closedRecord?.remarks && (
                        <div style={{ fontSize: '0.75rem', color: '#475569', fontStyle: 'italic', paddingTop: '4px' }}>
                          "{closedRecord.remarks}"
                        </div>
                      )}

                      {closingStatus === 'submitted' && isManagerOrOwner && (
                        <button
                          onClick={() => handleApproveClosing(closedRecord.id)}
                          disabled={actionLoading}
                          className="btn-approve"
                          style={{ marginTop: '0.5rem', width: '100%', justifyContent: 'center' }}
                        >
                          <CheckCircle2Icon size={15} />
                          Approve & Seal Day Closing
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ====================================================================
          TAB 2: TODAY VS PREVIOUS DAY COMPARISON
          ==================================================================== */}
      {activeTab === 'comparison' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {loadingComparison ? (
            <div style={{ padding: '3rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <RefreshCwIcon size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#6366f1' }} />
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>Calculating daily comparisons and trend analytics...</p>
            </div>
          ) : comparisonData ? (
            <>
              {/* Comparison Top KPI Cards */}
              <div className="comparison-kpi-grid">
                {/* Gross Sales */}
                <div className="comparison-kpi-card">
                  <span className="kpi-card-label">Gross Sales Comparison</span>
                  <div className="comparison-val-row">
                    <span className="kpi-card-value">{fmt(comparisonData.metrics?.grossSales?.current)}</span>
                    <span className={`growth-badge ${
                      (comparisonData.metrics?.grossSales?.growthPct || 0) > 0 ? 'positive' :
                      (comparisonData.metrics?.grossSales?.growthPct || 0) < 0 ? 'negative' : 'neutral'
                    }`}>
                      {(comparisonData.metrics?.grossSales?.growthPct || 0) >= 0 ? '↑ +' : '↓ '}
                      {(comparisonData.metrics?.grossSales?.growthPct || 0).toFixed(1)}%
                    </span>
                  </div>
                  <span className="kpi-card-sub">Prev Day ({comparisonData.previousDate}): {fmt(comparisonData.metrics?.grossSales?.previous)}</span>
                </div>

                {/* Net Sales */}
                <div className="comparison-kpi-card">
                  <span className="kpi-card-label">Net Sales Comparison</span>
                  <div className="comparison-val-row">
                    <span className="kpi-card-value">{fmt(comparisonData.metrics?.netSales?.current)}</span>
                    <span className={`growth-badge ${
                      (comparisonData.metrics?.netSales?.growthPct || 0) > 0 ? 'positive' :
                      (comparisonData.metrics?.netSales?.growthPct || 0) < 0 ? 'negative' : 'neutral'
                    }`}>
                      {(comparisonData.metrics?.netSales?.growthPct || 0) >= 0 ? '↑ +' : '↓ '}
                      {(comparisonData.metrics?.netSales?.growthPct || 0).toFixed(1)}%
                    </span>
                  </div>
                  <span className="kpi-card-sub">Prev Day ({comparisonData.previousDate}): {fmt(comparisonData.metrics?.netSales?.previous)}</span>
                </div>

                {/* Gross Profit */}
                <div className="comparison-kpi-card">
                  <span className="kpi-card-label">Gross Profit Comparison</span>
                  <div className="comparison-val-row">
                    <span className="kpi-card-value" style={{ color: '#7e22ce' }}>{fmt(comparisonData.metrics?.grossProfit?.current)}</span>
                    <span className={`growth-badge ${
                      (comparisonData.metrics?.grossProfit?.growthPct || 0) > 0 ? 'positive' :
                      (comparisonData.metrics?.grossProfit?.growthPct || 0) < 0 ? 'negative' : 'neutral'
                    }`}>
                      {(comparisonData.metrics?.grossProfit?.growthPct || 0) >= 0 ? '↑ +' : '↓ '}
                      {(comparisonData.metrics?.grossProfit?.growthPct || 0).toFixed(1)}%
                    </span>
                  </div>
                  <span className="kpi-card-sub">Prev Day ({comparisonData.previousDate}): {fmt(comparisonData.metrics?.grossProfit?.previous)}</span>
                </div>

                {/* Total Invoices */}
                <div className="comparison-kpi-card">
                  <span className="kpi-card-label">Invoices Count Comparison</span>
                  <div className="comparison-val-row">
                    <span className="kpi-card-value">{comparisonData.metrics?.invoicesCount?.current || 0}</span>
                    <span className={`growth-badge ${
                      (comparisonData.metrics?.invoicesCount?.growthPct || 0) > 0 ? 'positive' :
                      (comparisonData.metrics?.invoicesCount?.growthPct || 0) < 0 ? 'negative' : 'neutral'
                    }`}>
                      {(comparisonData.metrics?.invoicesCount?.growthPct || 0) >= 0 ? '↑ +' : '↓ '}
                      {(comparisonData.metrics?.invoicesCount?.growthPct || 0).toFixed(1)}%
                    </span>
                  </div>
                  <span className="kpi-card-sub">Prev Day: {comparisonData.metrics?.invoicesCount?.previous || 0} bills</span>
                </div>
              </div>

              {/* Comprehensive Comparison Table */}
              <div className="day-closing-card">
                <div className="day-closing-card-header">
                  <div className="day-closing-card-title-group">
                    <ScaleIcon size={18} style={{ color: '#4f46e5' }} />
                    <span>Detailed Variance & Growth Comparison ({comparisonData.bdate} vs {comparisonData.previousDate})</span>
                  </div>
                </div>

                <div className="data-table-container">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Current Period ({comparisonData.bdate})</th>
                        <th>Previous Business Day ({comparisonData.previousDate})</th>
                        <th>Difference</th>
                        <th>Growth %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(comparisonData.metrics || {}).map(([key, m]: [string, any]) => {
                        const isCount = key.toLowerCase().includes('count');
                        const isGrowthPos = (m.growthPct || 0) > 0;
                        const isGrowthNeg = (m.growthPct || 0) < 0;

                        // Readable labels
                        const labelMap: Record<string, string> = {
                          grossSales: 'Gross Sales (excl. GST)',
                          totalDiscounts: 'Total Discounts Given',
                          salesReturns: 'Sales Returns (Credit Notes)',
                          netSales: 'Net Sales Revenue',
                          cogs: 'Cost of Goods Sold (COGS)',
                          grossProfit: 'Gross Profit',
                          expenses: 'Operating Expenses',
                          netProfit: 'Net Operating Profit',
                          invoicesCount: 'Total Invoices Issued',
                          averageBillValue: 'Average Bill Value',
                          refundsPaid: 'Refunds Paid Out',
                        };

                        return (
                          <tr key={key}>
                            <td style={{ fontWeight: 700, color: '#0f172a' }}>{labelMap[key] || key}</td>
                            <td style={{ fontWeight: 800 }}>{isCount ? m.current : fmt(m.current)}</td>
                            <td style={{ color: '#64748b' }}>{isCount ? m.previous : fmt(m.previous)}</td>
                            <td style={{ fontWeight: 700, color: m.diff >= 0 ? '#15803d' : '#b91c1c' }}>
                              {m.diff >= 0 ? '+' : ''}{isCount ? m.diff : fmt(m.diff)}
                            </td>
                            <td>
                              <span className={`growth-badge ${isGrowthPos ? 'positive' : isGrowthNeg ? 'negative' : 'neutral'}`}>
                                {isGrowthPos ? '↑ +' : isGrowthNeg ? '↓ ' : ''}
                                {(m.growthPct || 0).toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 7-Day Trend Bar Visualization */}
              {comparisonData.last7DaysTrend && comparisonData.last7DaysTrend.length > 0 && (
                <div className="day-closing-card">
                  <div className="day-closing-card-header">
                    <div className="day-closing-card-title-group">
                      <BarChart3Icon size={18} style={{ color: '#4f46e5' }} />
                      <span>7-Day Net Sales & Revenue Trend</span>
                    </div>
                  </div>

                  <div className="trend-bars-container">
                    {(() => {
                      const maxNet = Math.max(
                        ...comparisonData.last7DaysTrend.map((d: any) => d.netSalesMinor || 0),
                        1
                      );
                      return comparisonData.last7DaysTrend.map((item: any) => {
                        const hPct = Math.max(8, ((item.netSalesMinor || 0) / maxNet) * 100);
                        return (
                          <div key={item.date} className="trend-bar-column">
                            <span className="trend-bar-val">{fmt(item.netSalesMinor)}</span>
                            <div className="trend-bar" style={{ height: `${hPct}%` }} title={`${item.date}: Net Sales ${fmt(item.netSalesMinor)}, Profit ${fmt(item.grossProfitMinor)}`} />
                            <span className="trend-bar-label">{item.date.slice(5)}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ====================================================================
          TAB 3: CUSTOM DATE RANGE ANALYTICS
          ==================================================================== */}
      {activeTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Preset buttons & Range selectors */}
          <div className="day-closing-card">
            <div className="day-closing-card-header">
              <div className="day-closing-card-title-group">
                <BarChart3Icon size={18} style={{ color: '#4f46e5' }} />
                <span>Custom Date Range Analytics Engine</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Comparison Mode:</span>
                <select
                  value={comparisonMode}
                  onChange={(e: any) => setComparisonMode(e.target.value)}
                  className="day-closing-select"
                >
                  <option value="previous_period">Previous Period (Equivalent Days)</option>
                  <option value="same_period_last_year">Same Period Last Year</option>
                  <option value="none">No Comparison</option>
                </select>
              </div>
            </div>

            {/* 12 Presets */}
            <div className="preset-pills-container">
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'last_7_days', label: 'Last 7 Days' },
                { id: 'last_30_days', label: 'Last 30 Days' },
                { id: 'this_week', label: 'This Week' },
                { id: 'last_week', label: 'Last Week' },
                { id: 'this_month', label: 'This Month' },
                { id: 'last_month', label: 'Last Month' },
                { id: 'this_quarter', label: 'This Quarter' },
                { id: 'last_quarter', label: 'Last Quarter' },
                { id: 'financial_year', label: 'Financial Year (FY)' },
                { id: 'custom', label: 'Custom Range' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleApplyPreset(p.id)}
                  className={`preset-pill ${analyticsPreset === p.id ? 'active' : ''}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Start and End date picker row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <div className="day-closing-filter-item">
                <span>From Date:</span>
                <input
                  type="date"
                  value={analyticsStartDate}
                  onChange={(e) => {
                    setAnalyticsStartDate(e.target.value);
                    setAnalyticsPreset('custom');
                  }}
                  className="day-closing-input"
                />
              </div>

              <div className="day-closing-filter-item">
                <span>To Date:</span>
                <input
                  type="date"
                  value={analyticsEndDate}
                  onChange={(e) => {
                    setAnalyticsEndDate(e.target.value);
                    setAnalyticsPreset('custom');
                  }}
                  className="day-closing-input"
                />
              </div>

              <button
                onClick={loadAnalytics}
                disabled={loadingAnalytics}
                className="day-closing-refresh-btn"
              >
                Apply Range Filter
              </button>
            </div>
          </div>

          {/* Analytics Results */}
          {loadingAnalytics ? (
            <div style={{ padding: '3rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <RefreshCwIcon size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#6366f1' }} />
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>Aggregating date range performance...</p>
            </div>
          ) : analyticsData ? (
            <>
              {/* Aggregated KPI Cards */}
              <div className="comparison-kpi-grid">
                <div className="comparison-kpi-card">
                  <span className="kpi-card-label">Period Gross Sales</span>
                  <span className="kpi-card-value">{fmt(analyticsData.current?.grossSalesMinor)}</span>
                  <span className="kpi-card-sub">
                    {comparisonMode !== 'none' && analyticsData.comparison?.grossSalesMinor !== undefined && (
                      <>Comp: {fmt(analyticsData.comparison.grossSalesMinor)}</>
                    )}
                  </span>
                </div>

                <div className="comparison-kpi-card">
                  <span className="kpi-card-label">Period Net Sales</span>
                  <span className="kpi-card-value">{fmt(analyticsData.current?.netSalesMinor)}</span>
                  <span className="kpi-card-sub">
                    Returns: -{fmt(analyticsData.current?.returnsMinor)}
                  </span>
                </div>

                <div className="comparison-kpi-card">
                  <span className="kpi-card-label">Period Gross Profit</span>
                  <span className="kpi-card-value" style={{ color: '#7e22ce' }}>{fmt(analyticsData.current?.grossProfitMinor)}</span>
                  <span className="kpi-card-sub">
                    COGS: {fmt(analyticsData.current?.cogsMinor)}
                  </span>
                </div>

                <div className="comparison-kpi-card">
                  <span className="kpi-card-label">Operating Profit</span>
                  <span className="kpi-card-value" style={{ color: (analyticsData.current?.operatingProfitMinor || 0) >= 0 ? '#15803d' : '#b91c1c' }}>
                    {fmt(analyticsData.current?.operatingProfitMinor)}
                  </span>
                  <span className="kpi-card-sub">
                    Expenses: {fmt(analyticsData.current?.expensesMinor)}
                  </span>
                </div>
              </div>

              {/* Daily Breakdown Time Series Table */}
              {analyticsData.dailySeries && analyticsData.dailySeries.length > 0 && (
                <div className="day-closing-card">
                  <div className="day-closing-card-header">
                    <div className="day-closing-card-title-group">
                      <ClockIcon size={18} style={{ color: '#4f46e5' }} />
                      <span>Daily Performance Breakdown ({analyticsData.period?.startDate} to {analyticsData.period?.endDate})</span>
                    </div>
                    <span className="day-closing-card-badge">
                      {analyticsData.dailySeries.length} Days in Period
                    </span>
                  </div>

                  <div className="data-table-container">
                    <table className="analytics-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Invoices</th>
                          <th>Gross Sales</th>
                          <th>Returns</th>
                          <th>Net Sales</th>
                          <th>Gross Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.dailySeries.map((d: any) => (
                          <tr key={d.date}>
                            <td style={{ fontWeight: 800, color: '#0f172a' }}>{d.date}</td>
                            <td>{d.invoicesCount || 0}</td>
                            <td>{fmt(d.grossSalesMinor)}</td>
                            <td style={{ color: '#e11d48' }}>-{fmt(d.returnsMinor)}</td>
                            <td style={{ fontWeight: 700, color: '#15803d' }}>{fmt(d.netSalesMinor)}</td>
                            <td style={{ fontWeight: 700, color: '#7e22ce' }}>{fmt(d.grossProfitMinor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ====================================================================
          TAB 4: PRODUCT-WISE PROFITABILITY BREAKDOWN
          ==================================================================== */}
      {activeTab === 'profitability' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="day-closing-card">
            <div className="day-closing-card-header">
              <div className="day-closing-card-title-group">
                <PackageIcon size={18} style={{ color: '#4f46e5' }} />
                <span>Product-Wise Profitability & Performance Breakdown</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <SearchIcon size={14} style={{ position: 'absolute', left: '10px', color: '#94a3b8' }} />
                  <input
                    type="text"
                    value={profitSearch}
                    onChange={(e) => setProfitSearch(e.target.value)}
                    placeholder="Search product or barcode..."
                    style={{
                      padding: '0.45rem 0.75rem 0.45rem 2rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.8rem',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="profit-filter-pills">
              {[
                { id: 'top_selling', label: '🔥 Top Selling (Units)' },
                { id: 'highest_revenue', label: '💰 Highest Revenue' },
                { id: 'highest_profit', label: '📈 Highest Profit' },
                { id: 'lowest_profit', label: '📉 Lowest Profit' },
                { id: 'loss_making', label: '⚠️ Loss-Making Products' },
                { id: 'most_returned', label: '🔄 Most Returned' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setProfitFilter(f.id as ProfitFilterType)}
                  className={`profit-filter-btn ${profitFilter === f.id ? 'active' : ''}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Product Profitability Table */}
          {loadingProfit ? (
            <div style={{ padding: '3rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <RefreshCwIcon size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#6366f1' }} />
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>Analyzing product margins, COGS and return rates...</p>
            </div>
          ) : profitData ? (
            <div className="day-closing-card">
              <div className="day-closing-card-header">
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#334155' }}>
                  {profitData.totalProductsCount || (profitData.products || []).length} Products Analyzed
                </span>
                <span className="day-closing-card-badge">
                  Filtered by: {profitFilter.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>

              <div className="data-table-container">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Product Name</th>
                      <th>Category</th>
                      <th>Qty Sold</th>
                      <th>Qty Ret</th>
                      <th>Net Qty</th>
                      <th>Gross Sales</th>
                      <th>Returns</th>
                      <th>Net Revenue</th>
                      <th>Cost (COGS)</th>
                      <th>Gross Profit</th>
                      <th>Margin %</th>
                      <th>Return Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(profitData.products || [])
                      .filter((p: any) =>
                        !profitSearch ||
                        p.name.toLowerCase().includes(profitSearch.toLowerCase()) ||
                        (p.barcode && p.barcode.toLowerCase().includes(profitSearch.toLowerCase()))
                      )
                      .map((p: any) => {
                        const isLoss = (p.gross_profit_minor || 0) < 0;
                        const margin = p.gross_margin_pct || 0;
                        return (
                          <tr key={p.id} className={isLoss ? 'loss-row' : ''}>
                            <td>
                              <div style={{ fontWeight: 800, color: '#0f172a' }}>{p.name}</div>
                              {p.barcode && (
                                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>SKU: {p.barcode}</div>
                              )}
                            </td>
                            <td>{p.category_name || 'General'}</td>
                            <td>{p.qty_sold || 0}</td>
                            <td style={{ color: '#e11d48' }}>{p.qty_returned || 0}</td>
                            <td style={{ fontWeight: 700 }}>{p.net_qty || 0}</td>
                            <td>{fmt(p.gross_sales_minor)}</td>
                            <td style={{ color: '#e11d48' }}>-{fmt(p.returns_minor)}</td>
                            <td style={{ fontWeight: 700, color: '#15803d' }}>{fmt(p.net_sales_minor)}</td>
                            <td style={{ color: '#64748b' }}>{fmt(p.cogs_minor)}</td>
                            <td style={{ fontWeight: 800, color: isLoss ? '#b91c1c' : '#7e22ce' }}>
                              {fmt(p.gross_profit_minor)}
                            </td>
                            <td>
                              <span className={`margin-pill ${
                                isLoss ? 'negative' : margin >= 30 ? 'healthy' : margin >= 15 ? 'moderate' : 'slim'
                              }`}>
                                {margin.toFixed(1)}%
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: (p.return_rate_pct || 0) > 10 ? '#e11d48' : '#64748b' }}>
                                {(p.return_rate_pct || 0).toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ====================================================================
          TAB 5: CLOSING HISTORY & AUDIT LOGS
          ==================================================================== */}
      {activeTab === 'history' && (
        <div className="day-closing-card">
          <div className="day-closing-card-header">
            <div className="day-closing-card-title-group">
              <ClockIcon size={18} style={{ color: '#4f46e5' }} />
              <span>Previous Day Closings & Sealed Audit Trail</span>
            </div>
            <span className="day-closing-card-badge">
              {history.length} Records Logged
            </span>
          </div>

          {loadingHistory ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
              Loading history records...
            </div>
          ) : history.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
              No day closing records found for this branch.
            </div>
          ) : (
            <div className="data-table-container">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Gross Sales</th>
                    <th>Returns</th>
                    <th>Net Sales</th>
                    <th>Expected Cash</th>
                    <th>Actual Cash</th>
                    <th>Variance</th>
                    <th>Gross Profit</th>
                    <th>Submitted By</th>
                    <th>Approved By</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const variance = h.variance_minor ?? 0;
                    const status = h.status || 'closed';
                    return (
                      <tr key={h.id}>
                        <td style={{ fontWeight: 800, color: '#0f172a' }}>{h.bdate}</td>
                        <td>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            fontSize: '0.725rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            background: status === 'approved' || status === 'closed' ? '#eef2ff' : status === 'submitted' ? '#fffbeb' : '#fff1f2',
                            color: status === 'approved' || status === 'closed' ? '#4338ca' : status === 'submitted' ? '#92400e' : '#be123c',
                          }}>
                            {status}
                          </span>
                        </td>
                        <td>{fmt(h.gross_sales_minor)}</td>
                        <td style={{ color: '#e11d48' }}>-{fmt(h.returns_total_minor || h.sales_returns_minor)}</td>
                        <td style={{ fontWeight: 700, color: '#15803d' }}>{fmt(h.net_sales_minor)}</td>
                        <td>{fmt(h.expected_cash_minor)}</td>
                        <td style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(h.actual_cash_minor)}</td>
                        <td>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            fontSize: '0.725rem',
                            fontWeight: 800,
                            background: variance === 0 ? '#ecfdf5' : variance > 0 ? '#eff6ff' : '#fef2f2',
                            color: variance === 0 ? '#047857' : variance > 0 ? '#1d4ed8' : '#b91c1c',
                          }}>
                            {variance >= 0 ? '+' : ''}{fmt(variance)}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: '#4f46e5' }}>{fmt(h.gross_profit_minor)}</td>
                        <td style={{ color: '#64748b' }}>{h.closed_by_name || 'Cashier'}</td>
                        <td style={{ color: '#64748b' }}>{h.approved_by_name || '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                            <button
                              onClick={() => handlePrint(h.id)}
                              className="day-closing-refresh-btn"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                            >
                              Print
                            </button>

                            {(status === 'approved' || status === 'closed') && isOwner && (
                              <button
                                onClick={() => handleOpenReopenModal(h.id)}
                                className="day-closing-refresh-btn"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#ea580c' }}
                              >
                                Reopen
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------
          REOPEN DAY CLOSING MODAL DIALOG
          -------------------------------------------------------------------- */}
      {isReopenModalOpen && (
        <div className="day-closing-modal-backdrop" onClick={() => setIsReopenModalOpen(false)}>
          <div className="day-closing-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="day-closing-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangleIcon size={20} style={{ color: '#ea580c' }} />
                <span className="day-closing-modal-title">Reopen Business Day</span>
              </div>
              <button
                onClick={() => setIsReopenModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmReopen} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.825rem', color: '#475569', lineHeight: 1.5 }}>
                Reopening a closed day unlocks invoices and shifts for adjustments. This audit event will be permanently recorded with your user ID and timestamp.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                  Mandatory Reopening Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="e.g. Backdated return entry required, cashier invoice adjustment"
                  className="cash-rec-remarks-input"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsReopenModalOpen(false)}
                  className="day-closing-refresh-btn"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={reopening || reopenReason.trim().length < 5}
                  className="btn-reopen"
                >
                  {reopening ? 'Reopening...' : 'Confirm & Reopen Day'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
