import React, { useState, useEffect } from 'react';
import {
  fetchDayClosingPreview,
  submitDayClosing,
  approveDayClosing,
  reopenDayClosing,
  fetchDayClosingComparison,
  fetchDayClosingAnalytics,
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
  AlertOctagonIcon,
  FileTextIcon,
  FileSpreadsheetIcon,
  DownloadIcon,
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
  CheckCircleIcon,
  PrinterIcon,
  InfoIcon,
} from '../inventory/InventoryIcons.tsx';
import './dayClosing.css';

interface DayClosingViewProps {
  user: User;
  shop: Shop | null;
  selectedBranch?: string;
  branches?: any[];
}

type TabType = 'closing' | 'comparison' | 'analytics' | 'history';

export const DayClosingView: React.FC<DayClosingViewProps> = ({
  user,
  shop,
  selectedBranch,
  branches,
}) => {
  // Navigation: 4 clean, dedicated tabs
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
  const [analyticsStartDate, setAnalyticsStartDate] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [analyticsEndDate, setAnalyticsEndDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [analyticsPreset, setAnalyticsPreset] = useState<string>('this_month');
  const [analyticsData, setAnalyticsData] = useState<any | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Tab 4: History state
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

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
      const expected = res.cashReconciliation?.expectedClosingCashMinor ?? 0;
      if (res.status === 'open' || res.status === 'reopened') {
        if (!actualCashStr) {
          setActualCashStr(((expected || 0) / 100).toFixed(2));
        }
      } else if (res.closedRecord?.actual_cash_minor != null) {
        setActualCashStr((res.closedRecord.actual_cash_minor / 100).toFixed(2));
        setClosingRemarks(res.closedRecord.remarks || '');
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
      setError(null);
      const res = await fetchDayClosingComparison({
        branchId: activeBranchId,
        date: selectedDate,
      });
      setComparisonData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch sales comparison');
    } finally {
      setLoadingComparison(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      setLoadingAnalytics(true);
      setError(null);
      const res = await fetchDayClosingAnalytics({
        branchId: activeBranchId,
        startDate: analyticsStartDate,
        endDate: analyticsEndDate,
      });
      setAnalyticsData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch date range analytics');
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      setError(null);
      const res = await fetchDayClosingHistory({
        branchId: activeBranchId,
        limit: 50,
      });
      setHistory(res?.history || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch closing history');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'closing') {
      loadPreview();
    } else if (activeTab === 'comparison') {
      loadComparison();
    } else if (activeTab === 'analytics') {
      loadAnalytics();
    } else if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeBranchId, selectedDate, selectedShiftId, activeTab]);

  const handleApplyPreset = (preset: string) => {
    setAnalyticsPreset(preset);
    const d = new Date();
    const todayStr = d.toISOString().slice(0, 10);

    if (preset === 'today') {
      setAnalyticsStartDate(todayStr);
      setAnalyticsEndDate(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date(d.getTime() - 86400000).toISOString().slice(0, 10);
      setAnalyticsStartDate(y);
      setAnalyticsEndDate(y);
    } else if (preset === 'last_7_days') {
      const s = new Date(d.getTime() - 6 * 86400000).toISOString().slice(0, 10);
      setAnalyticsStartDate(s);
      setAnalyticsEndDate(todayStr);
    } else if (preset === 'last_30_days') {
      const s = new Date(d.getTime() - 29 * 86400000).toISOString().slice(0, 10);
      setAnalyticsStartDate(s);
      setAnalyticsEndDate(todayStr);
    } else if (preset === 'this_month') {
      const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
      setAnalyticsStartDate(start);
      setAnalyticsEndDate(todayStr);
    } else if (preset === 'last_month') {
      const start = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
      const end = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
      setAnalyticsStartDate(start);
      setAnalyticsEndDate(end);
    }
  };

  // --------------------------------------------------------------------------
  // Action Handlers
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

    // Discrepancy explanation mandatory if there is cash variance
    if (Math.abs(diffMinor) > 0 && closingRemarks.trim().length < 3) {
      alert(`Cash difference of ${diffMinor >= 0 ? '+' : ''}${fmt(diffMinor)} detected.\n\nPlease provide a brief discrepancy reason in the remarks field before submitting.`);
      return;
    }

    const confirmMsg =
      `Submit Day Closing for ${preview.bdate || selectedDate}?\n\n` +
      `Expected Cash: ${fmt(expectedCashMinor)}\n` +
      `Counted Cash:  ${fmt(actualCashMinor)}\n` +
      `Difference:    ${diffMinor >= 0 ? '+' : ''}${fmt(diffMinor)}\n\n` +
      `This will seal today's register and record cash drawer floats.`;

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

  const handleExportCsv = (closingId?: string) => {
    if (closingId) {
      window.open(`/api/day-closing/${closingId}/export.csv`, '_blank');
    } else {
      window.open(`/api/day-closing/history/export.csv?branchId=${encodeURIComponent(activeBranchId)}`, '_blank');
    }
  };

  // Computed values from preview
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
            <h1 className="day-closing-title">Day Closing & Register Reconciliation</h1>
            <p className="day-closing-subtitle">
              Audit daily sales, returns, cash drawer floats, and seal register transactions
            </p>
          </div>
        </div>

        <div className="day-closing-header-right">
          {closedRecord?.id && (
            <>
              <button
                onClick={() => handlePrint(closedRecord.id)}
                className="btn-print"
                title="Print Official Closing Statement"
              >
                <PrinterIcon size={15} />
                Print Statement
              </button>

              <button
                onClick={() => handleExportCsv(closedRecord.id)}
                className="btn-export"
                title="Download closing details in Excel CSV format"
              >
                <FileSpreadsheetIcon size={15} />
                Export CSV
              </button>
            </>
          )}

          <button
            onClick={() => {
              if (activeTab === 'closing') loadPreview();
              else if (activeTab === 'comparison') loadComparison();
              else if (activeTab === 'analytics') loadAnalytics();
              else if (activeTab === 'history') loadHistory();
            }}
            disabled={loadingPreview || loadingComparison || loadingAnalytics || loadingHistory}
            className="day-closing-refresh-btn"
          >
            <RefreshCwIcon size={14} className={(loadingPreview || loadingComparison || loadingAnalytics || loadingHistory) ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------------------
          2. Tab Navigation Bar (4 Clean, Dedicated Tabs)
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
          {/* Closing Reminder Alert Banner */}
          {preview?.closingReminder?.hasUnclosedPrevDay && (
            <div className="day-closing-alert warning">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangleIcon size={18} style={{ color: '#d97706', flexShrink: 0 }} />
                <span>
                  <strong>Closing Reminder:</strong> Previous business day ({preview.closingReminder.prevDayDate}) register has not been approved and sealed yet. Please review and seal previous day to maintain continuous audit records.
                </span>
              </div>
              <button
                onClick={() => setSelectedDate(preview.closingReminder.prevDayDate)}
                className="day-closing-refresh-btn"
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
              >
                Inspect {preview.closingReminder.prevDayDate}
              </button>
            </div>
          )}

          {/* Duplicate Transaction Warning Banner */}
          {preview?.duplicateAlerts && preview.duplicateAlerts.length > 0 && (
            <div className="day-closing-alert warning">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertOctagonIcon size={18} style={{ color: '#d97706', flexShrink: 0 }} />
                <span>
                  <strong>Duplicate Billing Alert:</strong> Detected {preview.duplicateAlerts.length} potential duplicate invoice pair(s) with identical customer phone and amount within 3 minutes ({preview.duplicateAlerts.map((d: any) => `${d.invoice1} & ${d.invoice2} for ${fmt(d.amountMinor)}`).join(', ')}). Please verify before sealing register.
                </span>
              </div>
            </div>
          )}

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

          {/* Clean 6-Card Financial KPI Grid */}
          <div className="financial-kpi-grid">
            {/* 1. Gross Sales */}
            <div className="fin-kpi-card blue">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Gross Sales</span>
                <div className="fin-kpi-icon"><TrendingUpIcon size={14} /></div>
              </div>
              <div className="fin-kpi-val">{fmt(sales.grossSalesMinor)}</div>
              <span className="fin-kpi-sub">Pre-discount, excl. GST</span>
            </div>

            {/* 2. Sales Returns */}
            <div className="fin-kpi-card rose">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Sales Returns</span>
                <div className="fin-kpi-icon"><RotateCcwIcon size={14} /></div>
              </div>
              <div className="fin-kpi-val" style={{ color: '#e11d48' }}>-{fmt(sales.returnsTotalMinor)}</div>
              <span className="fin-kpi-sub">{returns.totalReturnsCount || 0} credit notes issued</span>
            </div>

            {/* 3. Net Sales (Highlight) */}
            <div className="fin-kpi-card green highlight">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Net Sales</span>
                <div className="fin-kpi-icon"><RupeeIcon size={14} /></div>
              </div>
              <div className="fin-kpi-val">{fmt(sales.netSalesMinor)}</div>
              <span className="fin-kpi-sub">Gross - Discounts - Returns</span>
            </div>

            {/* 4. Gross Profit */}
            <div className="fin-kpi-card purple">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Gross Profit</span>
                <div className="fin-kpi-icon"><TrendingUpIcon size={14} /></div>
              </div>
              <div className="fin-kpi-val" style={{ color: '#7e22ce' }}>{fmt(profit.grossProfitMinor)}</div>
              <span className="fin-kpi-sub">{marginPct.toFixed(1)}% Gross Margin</span>
            </div>

            {/* 5. Operating Expenses */}
            <div className="fin-kpi-card amber">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Operating Expenses</span>
                <div className="fin-kpi-icon"><ArrowUpRightIcon size={14} /></div>
              </div>
              <div className="fin-kpi-val">{fmt(profit.operatingExpensesMinor)}</div>
              <span className="fin-kpi-sub">Branch petty & overheads</span>
            </div>

            {/* 6. Operating Profit */}
            <div className="fin-kpi-card green">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Operating Profit</span>
                <div className="fin-kpi-icon"><RupeeIcon size={14} /></div>
              </div>
              <div className="fin-kpi-val" style={{ color: profit.netProfitMinor >= 0 ? '#15803d' : '#b91c1c' }}>
                {fmt(profit.netProfitMinor)}
              </div>
              <span className="fin-kpi-sub">{operatingMarginPct.toFixed(1)}% Net Margin</span>
            </div>
          </div>

          {/* Quick KPI Strip */}
          <div className="quick-kpi-strip">
            <div>Total Invoices: <strong>{sales.invoicesCount || 0} bills</strong></div>
            <div>Avg Bill Value: <strong>{fmt(sales.averageBillValueMinor)}</strong></div>
            <div>GST Collected: <strong>{fmt(sales.gstCollectedMinor)}</strong></div>
            <div>Discounts Given: <strong>{fmt(sales.totalDiscountsMinor)}</strong></div>
            <div>Cancelled Invoices: <strong>{sales.cancelledInvoicesCount || 0}</strong></div>
            <div>Outstanding Credit: <strong style={{ color: '#7e22ce' }}>{fmt(sales.customerCreditBalanceMinor)}</strong></div>
          </div>

          {/* Bento Grid: Tender Collections (60%) & Cash Drawer Reconciliation (40%) */}
          <div className="day-closing-bento-grid">
            {/* LEFT 7 COLUMNS: Tender Collections & Returns */}
            <div className="bento-col-7">
              {/* Tender Collections */}
              <div className="day-closing-card">
                <div className="day-closing-card-header">
                  <div className="day-closing-card-title-group">
                    <WalletIcon size={18} style={{ color: '#10b981' }} />
                    <span>Tender & Settlement Collections</span>
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

              {/* Returns, Refunds & Exchanges */}
              <div className="day-closing-card">
                <div className="day-closing-card-header">
                  <div className="day-closing-card-title-group">
                    <RotateCcwIcon size={18} style={{ color: '#f43f5e' }} />
                    <span>Returns, Refunds & Exchanges</span>
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

                <div className="detail-notice-box" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <InfoIcon size={16} style={{ color: '#4f46e5', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Accounting Integrity:</strong> Exchanges seamlessly offset customer return credit against new merchandise sold without inflating gross cash collections. Resellable returns restore inventory cost, while damaged goods are quarantined separately.
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT 5 COLUMNS: Dedicated Cash Drawer Reconciliation */}
            <div className="bento-col-5">
              <div className="day-closing-card">
                <div className="day-closing-card-header">
                  <div className="day-closing-card-title-group">
                    <BanknoteIcon size={18} style={{ color: '#10b981' }} />
                    <span>Cash Drawer Reconciliation</span>
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

                  {/* Cash Variance Warning Alert */}
                  {Math.abs(cashDifferenceMinor) > 5000 && (closingStatus === 'open' || closingStatus === 'reopened') && (
                    <div style={{
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '10px',
                      padding: '0.65rem 0.85rem',
                      fontSize: '0.775rem',
                      color: '#92400e',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontWeight: 600
                    }}>
                      <AlertTriangleIcon size={16} style={{ color: '#d97706', flexShrink: 0 }} />
                      <span>Notice: High cash variance detected ({cashDifferenceMinor >= 0 ? '+' : ''}{fmt(cashDifferenceMinor)}). Discrepancy reason is mandatory in remarks before submission.</span>
                    </div>
                  )}

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
                          Closing Remarks / Discrepancy Reason {Math.abs(cashDifferenceMinor) > 0 ? '*' : ''}
                        </label>
                        <textarea
                          rows={2}
                          value={closingRemarks}
                          onChange={(e) => setClosingRemarks(e.target.value)}
                          placeholder="e.g. Counted by head cashier, minor coin variation"
                          className="cash-rec-remarks-input"
                          required={Math.abs(cashDifferenceMinor) > 0}
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
                                {isGrowthPos ? '+ ' : isGrowthNeg ? '- ' : ''}
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
            </>
          ) : null}
        </div>
      )}

      {/* ====================================================================
          TAB 3: CUSTOM DATE RANGE ANALYTICS
          ==================================================================== */}
      {activeTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Date Range Selector Card */}
          <div className="day-closing-card">
            <div className="day-closing-card-header">
              <div className="day-closing-card-title-group">
                <BarChart3Icon size={18} style={{ color: '#4f46e5' }} />
                <span>Custom Date Range Business Analysis</span>
              </div>

              <div className="preset-pills-bar">
                {[
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: 'last_7_days', label: 'Last 7 Days' },
                  { id: 'this_month', label: 'This Month' },
                  { id: 'last_month', label: 'Last Month' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleApplyPreset(p.id)}
                    className={`preset-pill-btn ${analyticsPreset === p.id ? 'active' : ''}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="day-closing-filter-item">
                <span>Start Date:</span>
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
                <span>End Date:</span>
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
                className="btn-approve"
                style={{ background: '#4f46e5' }}
              >
                <RefreshCwIcon size={14} className={loadingAnalytics ? 'animate-spin' : ''} />
                Calculate Range
              </button>
            </div>
          </div>

          {loadingAnalytics ? (
            <div style={{ padding: '3rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <RefreshCwIcon size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#6366f1' }} />
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>Aggregating multi-day financial records...</p>
            </div>
          ) : analyticsData?.current ? (
            <>
              {/* Range Financial Summary Grid */}
              <div className="financial-kpi-grid">
                <div className="fin-kpi-card blue">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Gross Sales</span>
                    <div className="fin-kpi-icon"><TrendingUpIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val">{fmt(analyticsData.current.grossSalesMinor)}</div>
                  <span className="fin-kpi-sub">Total billed before tax</span>
                </div>

                <div className="fin-kpi-card rose">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Returns</span>
                    <div className="fin-kpi-icon"><RotateCcwIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val" style={{ color: '#e11d48' }}>-{fmt(analyticsData.current.returnsMinor)}</div>
                  <span className="fin-kpi-sub">Total returned goods</span>
                </div>

                <div className="fin-kpi-card green highlight">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Net Sales</span>
                    <div className="fin-kpi-icon"><RupeeIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val">{fmt(analyticsData.current.netSalesMinor)}</div>
                  <span className="fin-kpi-sub">Net revenue realized</span>
                </div>

                <div className="fin-kpi-card purple">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Gross Profit</span>
                    <div className="fin-kpi-icon"><TrendingUpIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val" style={{ color: '#7e22ce' }}>{fmt(analyticsData.current.grossProfitMinor)}</div>
                  <span className="fin-kpi-sub">{((analyticsData.current.grossMarginPct || 0)).toFixed(1)}% Gross Margin</span>
                </div>

                <div className="fin-kpi-card amber">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Expenses</span>
                    <div className="fin-kpi-icon"><ArrowUpRightIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val">{fmt(analyticsData.current.expensesMinor)}</div>
                  <span className="fin-kpi-sub">Operating costs</span>
                </div>

                <div className="fin-kpi-card green">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Operating Profit</span>
                    <div className="fin-kpi-icon"><RupeeIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val" style={{ color: (analyticsData.current.netProfitMinor || 0) >= 0 ? '#15803d' : '#b91c1c' }}>
                    {fmt(analyticsData.current.netProfitMinor)}
                  </div>
                  <span className="fin-kpi-sub">{((analyticsData.current.netMarginPct || 0)).toFixed(1)}% Net Margin</span>
                </div>
              </div>

              {/* Range Daily Series Breakdown */}
              {analyticsData.dailySeries && analyticsData.dailySeries.length > 0 && (
                <div className="day-closing-card">
                  <div className="day-closing-card-header">
                    <div className="day-closing-card-title-group">
                      <FileTextIcon size={18} style={{ color: '#4f46e5' }} />
                      <span>Daily Breakdown in Range ({analyticsStartDate} to {analyticsEndDate})</span>
                    </div>
                    <span className="day-closing-card-badge">
                      {analyticsData.dailySeries.length} Days Recorded
                    </span>
                  </div>

                  <div className="data-table-container">
                    <table className="analytics-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Invoices Count</th>
                          <th>Gross Sales</th>
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
                            <td style={{ fontWeight: 700, color: '#15803d' }}>{fmt(d.netSalesMinor)}</td>
                            <td style={{ fontWeight: 800, color: '#4f46e5' }}>{fmt(d.grossProfitMinor)}</td>
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
          TAB 4: CLOSING HISTORY & AUDIT LOGS
          ==================================================================== */}
      {activeTab === 'history' && (
        <div className="day-closing-card">
          <div className="day-closing-card-header">
            <div className="day-closing-card-title-group">
              <ClockIcon size={18} style={{ color: '#4f46e5' }} />
              <span>Previous Day Closings & Sealed Audit Trail</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                onClick={() => handleExportCsv()}
                className="day-closing-refresh-btn"
                title="Download all past day closings in CSV format"
              >
                <DownloadIcon size={14} />
                Export All CSV
              </button>
              <span className="day-closing-card-badge">
                {history.length} Records Logged
              </span>
            </div>
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
                    const isExpanded = expandedHistoryId === h.id;

                    return (
                      <React.Fragment key={h.id}>
                        <tr
                          style={{ cursor: 'pointer' }}
                          onClick={() => setExpandedHistoryId(isExpanded ? null : h.id)}
                        >
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePrint(h.id);
                                }}
                                className="day-closing-refresh-btn"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                title="Print Statement"
                              >
                                Print
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportCsv(h.id);
                                }}
                                className="day-closing-refresh-btn"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                title="Download CSV"
                              >
                                CSV
                              </button>

                              {(status === 'approved' || status === 'closed') && isOwner && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenReopenModal(h.id);
                                  }}
                                  className="day-closing-refresh-btn"
                                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#ea580c' }}
                                >
                                  Reopen
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Audit Log Details Row */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={12} style={{ background: '#f8fafc', padding: '1rem 1.25rem' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', fontSize: '0.8rem' }}>
                                <div>
                                  <div style={{ color: '#64748b', fontWeight: 600 }}>Submitted By</div>
                                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{h.closed_by_name || 'Cashier'}</div>
                                  <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                                    {h.closed_at ? new Date(h.closed_at).toLocaleString('en-IN') : '—'}
                                  </div>
                                </div>

                                <div>
                                  <div style={{ color: '#64748b', fontWeight: 600 }}>Approved By</div>
                                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{h.approved_by_name || 'Pending Approval'}</div>
                                  <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                                    {h.approved_at ? new Date(h.approved_at).toLocaleString('en-IN') : '—'}
                                  </div>
                                </div>

                                <div>
                                  <div style={{ color: '#64748b', fontWeight: 600 }}>Reopened By</div>
                                  <div style={{ fontWeight: 800, color: h.reopened_by_name ? '#b91c1c' : '#0f172a' }}>
                                    {h.reopened_by_name || 'Not Reopened'}
                                  </div>
                                  {h.reopen_reason && (
                                    <div style={{ color: '#991b1b', fontSize: '0.75rem', fontStyle: 'italic' }}>
                                      "{h.reopen_reason}"
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <div style={{ color: '#64748b', fontWeight: 600 }}>Closing Remarks / Note</div>
                                  <div style={{ fontWeight: 600, color: '#334155' }}>
                                    {h.remarks || 'No remarks recorded.'}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
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
