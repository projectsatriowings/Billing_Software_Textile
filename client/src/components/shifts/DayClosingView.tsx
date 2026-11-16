import React, { useState, useEffect } from 'react';
import {
  fetchDayClosingPreview,
  submitDayClosing,
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
} from '../inventory/InventoryIcons.tsx';
import './dayClosing.css';

interface DayClosingViewProps {
  user: User;
  shop: Shop | null;
  selectedBranch?: string;
  branches?: any[];
}

export const DayClosingView: React.FC<DayClosingViewProps> = ({
  user,
  shop,
  selectedBranch,
  branches,
}) => {
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [preview, setPreview] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Closing form state
  const [actualCashStr, setActualCashStr] = useState<string>('');
  const [closingRemarks, setClosingRemarks] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );

  const activeBranchId = selectedBranch || (branches && branches[0]?.id) || 'MAIN';

  const loadPreview = async () => {
    try {
      setLoadingPreview(true);
      setError(null);
      const res = await fetchDayClosingPreview({
        branchId: activeBranchId,
        date: selectedDate,
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

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await fetchDayClosingHistory({ branchId: activeBranchId, limit: 30 });
      setHistory(res.records || res.history || []);
    } catch (err) {
      console.error('Failed to load history', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadPreview();
    loadHistory();
  }, [activeBranchId, selectedDate]);

  const fmt = (minor: number = 0) =>
    `₹${((minor || 0) / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const isClosed = Boolean(preview?.isClosed || preview?.alreadyClosed);
  const closedRecord = preview?.closedRecord || null;

  const sales = preview?.salesSummary || preview?.sales || {
    grossSalesMinor: 0,
    returnsTotalMinor: 0,
    salesReturnsMinor: 0,
    netSalesMinor: 0,
    invoicesCount: 0,
    invoiceCount: 0,
    returnsCount: 0,
  };

  const returns = preview?.returnSummary || preview?.returns || {
    totalReturnsCount: 0,
    returnCount: 0,
    totalReturnValueMinor: 0,
    cashRefundsPaidMinor: 0,
    cashRefundsMinor: 0,
    upiRefundsPaidMinor: 0,
    upiRefundsMinor: 0,
    exchangeCreditAdjustedMinor: 0,
    exchangeCreditsMinor: 0,
    storeCreditsIssuedMinor: 0,
    storeCreditsMinor: 0,
  };

  const exchanges = preview?.exchangeSummary || preview?.exchanges || {
    exchangesCount: 0,
    exchangeCount: 0,
    exchangeAdjustedMinor: 0,
    oldProductsReturnedMinor: 0,
    newProductsSoldMinor: 0,
    additionalAmountCollectedMinor: 0,
    remainingCustomerCreditMinor: 0,
  };

  const payments = preview?.paymentSummary || preview?.payments || {
    cashCollectionsMinor: 0,
    cashMinor: 0,
    upiCollectionsMinor: 0,
    upiMinor: 0,
    cardCollectionsMinor: 0,
    cardMinor: 0,
    storeCreditMinor: 0,
  };

  const cashRec = preview?.cashReconciliation || preview?.cashDrawer || {
    openingCashMinor: 0,
    cashSalesReceivedMinor: 0,
    cashRefundsPaidMinor: 0,
    cashExpensesMinor: 0,
    cashInMinor: 0,
    cashOutMinor: 0,
    expectedClosingCashMinor: 0,
  };

  const profit = preview?.profitSummary || preview?.profit || {
    netSalesMinor: 0,
    netCogsMinor: 0,
    grossProfitMinor: 0,
    operatingExpensesMinor: 0,
    netProfitMinor: 0,
  };

  const marginPct =
    profit.netSalesMinor > 0
      ? (profit.grossProfitMinor / profit.netSalesMinor) * 100
      : 0;

  const actualCashMinor = Math.round((parseFloat(actualCashStr) || 0) * 100);
  const expectedCashMinor = cashRec.expectedClosingCashMinor || 0;
  const cashDifferenceMinor = actualCashMinor - expectedCashMinor;

  const handleSubmitClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview) return;

    if (isClosed) {
      alert('This business date is already closed for this branch.');
      return;
    }

    if (isNaN(parseFloat(actualCashStr))) {
      alert('Please enter a valid actual closing cash amount.');
      return;
    }

    const confirmMsg =
      `Are you sure you want to close the day for ${preview.bdate || selectedDate}?\n` +
      `Expected Cash: ${fmt(expectedCashMinor)}\n` +
      `Actual Cash: ${fmt(actualCashMinor)}\n` +
      `Variance: ${cashDifferenceMinor >= 0 ? '+' : ''}${fmt(cashDifferenceMinor)}\n\n` +
      `Once submitted, all transactions for this day will be locked against ordinary edits.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await submitDayClosing({
        branchId: activeBranchId,
        date: preview.bdate || selectedDate,
        actualCashMinor: actualCashMinor,
        remarks: closingRemarks.trim(),
      });
      setSuccessMsg(`Day closing completed successfully! Reference ID: ${res.dayClosing?.id || res.dayClosing?.bdate || 'OK'}`);
      await loadPreview();
      await loadHistory();
    } catch (err: any) {
      setError(err.message || 'Failed to submit day closing');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = (closingId: string) => {
    window.open(`/api/day-closing/${closingId}/print`, '_blank', 'width=900,height=800');
  };

  return (
    <div className="day-closing-wrapper">
      {/* Top Banner & Header */}
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
          <div className="day-closing-date-picker">
            <ClockIcon size={16} />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="day-closing-date-input"
            />
          </div>

          <button
            onClick={() => { loadPreview(); loadHistory(); }}
            disabled={loadingPreview}
            className="day-closing-refresh-btn"
            title="Refresh Day Data"
          >
            <RefreshCwIcon size={14} className={loadingPreview ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

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

      {/* Already closed notice banner */}
      {isClosed && (
        <div className="day-closing-sealed-banner">
          <div className="day-closing-sealed-left">
            <div className="day-closing-sealed-icon">
              <LockIcon size={20} />
            </div>
            <div>
              <div className="day-closing-sealed-title">
                This business day ({preview?.bdate || selectedDate}) is sealed and day-closing is completed!
              </div>
              <div className="day-closing-sealed-desc">
                Closed at {closedRecord?.closed_at ? new Date(closedRecord.closed_at).toLocaleTimeString('en-IN') : 'EOD'} by {closedRecord?.closed_by_name || 'Cashier'}. Transactions cannot be modified.
              </div>
            </div>
          </div>

          {closedRecord?.id && (
            <button
              onClick={() => handlePrint(closedRecord.id)}
              className="day-closing-print-btn"
            >
              <FileTextIcon size={16} />
              Print Closing Report
            </button>
          )}
        </div>
      )}

      {loadingPreview ? (
        <div style={{ padding: '3rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          <RefreshCwIcon size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#6366f1' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>Computing daily sales, returns, payments & reconciliation...</p>
        </div>
      ) : preview ? (
        <div className="day-closing-bento-grid">
          
          {/* LEFT 8 COLUMNS: Financial Breakdown & Payments */}
          <div className="bento-col-8">
            
            {/* Section A: Daily Sales & Financial Performance */}
            <div className="day-closing-card">
              <div className="day-closing-card-header">
                <div className="day-closing-card-title-group">
                  <TrendingUpIcon size={18} style={{ color: '#4f46e5' }} />
                  <span>Section A: Daily Sales & Revenue Performance</span>
                </div>
                <span className="day-closing-card-badge indigo">
                  {sales.invoicesCount || sales.invoiceCount || 0} Invoices Issued
                </span>
              </div>

              <div className="sales-kpi-grid">
                <div className="sales-kpi-tile gross">
                  <span className="sales-kpi-label">Gross Sales</span>
                  <div className="sales-kpi-val">{fmt(sales.grossSalesMinor)}</div>
                  <span className="sales-kpi-sub">{sales.invoicesCount || sales.invoiceCount || 0} bills generated</span>
                </div>

                <div className="sales-kpi-tile returns">
                  <span className="sales-kpi-label" style={{ color: '#e11d48' }}>Sales Returns</span>
                  <div className="sales-kpi-val rose">-{fmt(sales.returnsTotalMinor || sales.salesReturnsMinor)}</div>
                  <span className="sales-kpi-sub">{sales.returnsCount || returns.totalReturnsCount || 0} credit notes</span>
                </div>

                <div className="sales-kpi-tile net">
                  <span className="sales-kpi-label" style={{ color: '#059669' }}>Net Sales</span>
                  <div className="sales-kpi-val emerald">{fmt(sales.netSalesMinor)}</div>
                  <span className="sales-kpi-sub">Gross minus Returns</span>
                </div>

                <div className="sales-kpi-tile profit">
                  <span className="sales-kpi-label" style={{ color: '#7e22ce' }}>Gross Profit</span>
                  <div className="sales-kpi-val purple">{fmt(profit.grossProfitMinor)}</div>
                  <span className="sales-kpi-sub">{marginPct.toFixed(1)}% Gross Margin</span>
                </div>
              </div>

              {/* Profit & COGS Detail Strip */}
              <div className="sales-profit-strip">
                <div>
                  <span style={{ color: '#64748b' }}>Net COGS (Item Cost): </span>
                  <strong style={{ color: '#0f172a' }}>{fmt(profit.netCogsMinor)}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Profit Margin: </span>
                  <strong style={{ color: '#16a34a' }}>{marginPct.toFixed(1)}%</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Accounting Basis: </span>
                  <span style={{ background: '#e2e8f0', padding: '2px 8px', borderRadius: '6px', fontSize: '0.725rem', fontWeight: 700 }}>Accrual</span>
                </div>
              </div>
            </div>

            {/* Section D: Tender & Payment Collections */}
            <div className="day-closing-card">
              <div className="day-closing-card-header">
                <div className="day-closing-card-title-group">
                  <WalletIcon size={18} style={{ color: '#10b981' }} />
                  <span>Section D: Tender & Payment Collections</span>
                </div>
                <span className="day-closing-card-badge emerald">
                  Settlement Channels
                </span>
              </div>

              <div className="tender-kpi-grid">
                <div className="tender-kpi-card cash">
                  <div className="tender-header">
                    <BanknoteIcon size={15} />
                    <span>Cash</span>
                  </div>
                  <div className="tender-amount">{fmt(payments.cashCollectionsMinor || payments.cashMinor)}</div>
                </div>

                <div className="tender-kpi-card upi">
                  <div className="tender-header">
                    <RefreshCwIcon size={14} />
                    <span>UPI / QR</span>
                  </div>
                  <div className="tender-amount">{fmt(payments.upiCollectionsMinor || payments.upiMinor)}</div>
                </div>

                <div className="tender-kpi-card card">
                  <div className="tender-header">
                    <CreditCardIcon size={14} />
                    <span>Card / POS</span>
                  </div>
                  <div className="tender-amount">{fmt(payments.cardCollectionsMinor || payments.cardMinor)}</div>
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

          </div>

          {/* RIGHT 4 COLUMNS: Cash Drawer Reconciliation & Seal */}
          <div className="bento-col-4">
            <div className="day-closing-card" style={{ height: '100%', justifyContent: 'flex-start' }}>
              <div className="day-closing-card-header">
                <div className="day-closing-card-title-group">
                  <BanknoteIcon size={18} style={{ color: '#10b981' }} />
                  <span>Section E: Cash Drawer Reconciliation</span>
                </div>
              </div>

              {/* Step-by-step breakdown */}
              <div className="cash-rec-container">
                <div className="cash-rec-row">
                  <span className="cash-rec-label">Opening Float (Shift Base)</span>
                  <span className="cash-rec-val">{fmt(cashRec.openingCashMinor)}</span>
                </div>
                <div className="cash-rec-row">
                  <span className="cash-rec-label" style={{ color: '#15803d' }}>
                    <ArrowDownLeftIcon size={14} /> (+) Cash Sales Received
                  </span>
                  <span className="cash-rec-val plus">+{fmt(cashRec.cashSalesReceivedMinor)}</span>
                </div>
                <div className="cash-rec-row">
                  <span className="cash-rec-label" style={{ color: '#b91c1c' }}>
                    <ArrowUpRightIcon size={14} /> (-) Cash Refunds Paid
                  </span>
                  <span className="cash-rec-val minus">-{fmt(cashRec.cashRefundsPaidMinor)}</span>
                </div>
                <div className="cash-rec-row">
                  <span className="cash-rec-label" style={{ color: '#15803d' }}>
                    (+) Cash In / Deposits
                  </span>
                  <span className="cash-rec-val plus">+{fmt(cashRec.cashInMinor)}</span>
                </div>
                <div className="cash-rec-row">
                  <span className="cash-rec-label" style={{ color: '#b91c1c' }}>
                    (-) Cash Out / Withdrawals
                  </span>
                  <span className="cash-rec-val minus">-{fmt(cashRec.cashOutMinor)}</span>
                </div>
                <div className="cash-rec-row">
                  <span className="cash-rec-label" style={{ color: '#b91c1c' }}>
                    (-) Cash Expenses
                  </span>
                  <span className="cash-rec-val minus">-{fmt(cashRec.cashExpensesMinor)}</span>
                </div>

                {/* Expected Cash Box */}
                <div className="cash-rec-expected-box">
                  <span className="cash-rec-expected-label">Expected Closing Cash:</span>
                  <span className="cash-rec-expected-val">{fmt(cashRec.expectedClosingCashMinor)}</span>
                </div>

                {/* Form to submit closing */}
                {!isClosed ? (
                  <form onSubmit={handleSubmitClosing} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.25rem' }}>
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

                    {/* Cash Shortage / Excess indicator */}
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
                      <label className="cash-rec-input-label" style={{ color: '#64748b' }}>
                        Closing Remarks / Discrepancy Note
                      </label>
                      <textarea
                        rows={2}
                        value={closingRemarks}
                        onChange={(e) => setClosingRemarks(e.target.value)}
                        placeholder="e.g. Verified by head cashier, exact match"
                        className="cash-rec-remarks-input"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="cash-rec-submit-btn"
                    >
                      <LockIcon size={16} />
                      {submitting ? 'Submitting & Sealing Day...' : 'Submit & Seal Day Closing'}
                    </button>
                    <p style={{ margin: 0, fontSize: '0.725rem', color: '#94a3b8', textAlign: 'center' }}>
                      This locks all transactions on {preview.bdate || selectedDate} against edits.
                    </p>
                  </form>
                ) : (
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
                    {closedRecord?.id && (
                      <button
                        onClick={() => handlePrint(closedRecord.id)}
                        className="day-closing-print-btn"
                        style={{ width: '100%', justifyContent: 'center', marginTop: '6px' }}
                      >
                        <FileTextIcon size={15} />
                        Print Sealed Day Closing Report
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ROW 2: Sections B & C (50% / 50% balanced cards) */}
          <div className="bento-col-6">
            <div className="day-closing-card" style={{ height: '100%' }}>
              <div className="day-closing-card-header">
                <div className="day-closing-card-title-group">
                  <RotateCcwIcon size={18} style={{ color: '#f43f5e' }} />
                  <span>Section B: Return & Refund Summary</span>
                </div>
                <span className="day-closing-card-badge rose">
                  {returns.totalReturnsCount || returns.returnCount || 0} Returns
                </span>
              </div>

              <div>
                <div className="detail-list-row">
                  <span className="detail-list-label">Total Return Value:</span>
                  <span className="detail-list-val rose">{fmt(returns.totalReturnValueMinor)}</span>
                </div>
                <div className="detail-list-row">
                  <span className="detail-list-label">Cash Refunds Paid Out:</span>
                  <span className="detail-list-val">{fmt(returns.cashRefundsPaidMinor || returns.cashRefundsMinor)}</span>
                </div>
                <div className="detail-list-row">
                  <span className="detail-list-label">UPI Refunds Processed:</span>
                  <span className="detail-list-val">{fmt(returns.upiRefundsPaidMinor || returns.upiRefundsMinor)}</span>
                </div>
                <div className="detail-list-row">
                  <span className="detail-list-label">Exchange Adjustments:</span>
                  <span className="detail-list-val indigo">{fmt(returns.exchangeCreditAdjustedMinor || returns.exchangeCreditsMinor)}</span>
                </div>
                <div className="detail-list-row">
                  <span className="detail-list-label">Store Credit Issued:</span>
                  <span className="detail-list-val purple">{fmt(returns.storeCreditsIssuedMinor || returns.storeCreditsMinor)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bento-col-6">
            <div className="day-closing-card" style={{ height: '100%' }}>
              <div className="day-closing-card-header">
                <div className="day-closing-card-title-group">
                  <ScaleIcon size={18} style={{ color: '#6366f1' }} />
                  <span>Section C: Exchange Transactions</span>
                </div>
                <span className="day-closing-card-badge indigo">
                  {exchanges.exchangesCount || exchanges.exchangeCount || 0} Exchanges
                </span>
              </div>

              <div>
                <div className="detail-list-row">
                  <span className="detail-list-label">Exchange Adjusted Credit:</span>
                  <span className="detail-list-val indigo">{fmt(returns.exchangeCreditAdjustedMinor || exchanges.exchangeAdjustedMinor)}</span>
                </div>
                <div className="detail-list-row">
                  <span className="detail-list-label">New Purchase Billed:</span>
                  <span className="detail-list-val">{fmt(exchanges.newProductsSoldMinor)}</span>
                </div>
                <div className="detail-list-row">
                  <span className="detail-list-label">Remaining Customer Dues / Credit:</span>
                  <span className="detail-list-val">{fmt(exchanges.remainingCustomerCreditMinor || 0)}</span>
                </div>
                <div className="detail-notice-box">
                  💡 Exchanges seamlessly offset customer return credit against new garments sold without inflating gross cash collections.
                </div>
              </div>
            </div>
          </div>

          {/* ROW 3: History Table (Full 12 columns) */}
          <div className="bento-col-12">
            <div className="day-closing-card">
              <div className="day-closing-card-header">
                <div className="day-closing-card-title-group">
                  <ClockIcon size={18} style={{ color: '#64748b' }} />
                  <span>Previous Day Closings History</span>
                </div>
                <span className="day-closing-card-badge">
                  {history.length} records logged
                </span>
              </div>

              {loadingHistory ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  Loading history records...
                </div>
              ) : history.length === 0 ? (
                <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  No sealed day closings found for this branch.
                </div>
              ) : (
                <div className="history-table-container">
                  <table className="day-closing-history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Gross Sales</th>
                        <th>Returns</th>
                        <th>Net Sales</th>
                        <th>Expected Cash</th>
                        <th>Actual Cash</th>
                        <th>Variance</th>
                        <th>Gross Profit</th>
                        <th>Closed By</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => {
                        const variance = h.variance_minor ?? h.cash_difference_minor ?? 0;
                        return (
                          <tr key={h.id}>
                            <td style={{ fontWeight: 800, color: '#0f172a' }}>{h.bdate || h.closing_date}</td>
                            <td>{fmt(h.gross_sales_minor)}</td>
                            <td style={{ color: '#e11d48' }}>-{fmt(h.returns_total_minor || h.sales_returns_minor)}</td>
                            <td style={{ fontWeight: 700, color: '#15803d' }}>{fmt(h.net_sales_minor)}</td>
                            <td>{fmt(h.expected_cash_minor || h.expected_closing_cash_minor)}</td>
                            <td style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(h.actual_cash_minor || h.actual_closing_cash_minor)}</td>
                            <td>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                fontSize: '0.725rem',
                                fontWeight: 800,
                                background: variance === 0 ? '#ecfdf5' : variance > 0 ? '#eff6ff' : '#fef2f2',
                                color: variance === 0 ? '#047857' : variance > 0 ? '#1d4ed8' : '#b91c1c'
                              }}>
                                {variance >= 0 ? '+' : ''}{fmt(variance)}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700, color: '#4f46e5' }}>{fmt(h.gross_profit_minor)}</td>
                            <td style={{ color: '#64748b' }}>{h.closed_by_name || h.cashier_name || 'Cashier'}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                onClick={() => handlePrint(h.id)}
                                className="history-action-btn"
                              >
                                Print Report
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>
      ) : null}
    </div>
  );
};
