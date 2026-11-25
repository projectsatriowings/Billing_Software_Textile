import React, { useState, useEffect } from 'react';
import {
  fetchReturnReports,
  type User,
  type Shop,
} from '../../api.ts';
import {
  TrendingUpIcon,
  RotateCcwIcon,
  ScaleIcon,
  RupeeIcon,
  FileTextIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
  StoreIcon,
  UserIcon,
  DownloadIcon,
  BarChart3Icon,
  CheckCircle2Icon,
  ReceiptIcon,
  PackageIcon,
} from '../inventory/InventoryIcons.tsx';
import './returnReports.css';

interface ReturnReportsViewProps {
  user: User;
  shop: Shop | null;
  selectedBranch?: string;
  branches?: any[];
}

type TabType =
  | 'daily_sales'
  | 'returns'
  | 'exchanges'
  | 'refunds'
  | 'gross_profit'
  | 'stock_condition'
  | 'store_credits'
  | 'cashier_perf';

export const ReturnReportsView: React.FC<ReturnReportsViewProps> = ({
  user,
  shop,
  selectedBranch,
  branches,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('daily_sales');
  const [period, setPeriod] = useState<string>('this_month');
  const [customStart, setCustomStart] = useState<string>(
    new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  );
  const [customEnd, setCustomEnd] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);
  const [reportRows, setReportRows] = useState<any[]>([]);
  const [reportSummary, setReportSummary] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeBranchId = (selectedBranch && selectedBranch.toLowerCase() !== 'all') ? selectedBranch : '';

  const getBackendReportType = (tab: TabType): string => {
    switch (tab) {
      case 'returns': return 'sales_returns';
      case 'stock_condition': return 'stock_returns';
      case 'cashier_perf': return 'cashier_performance';
      default: return tab;
    }
  };

  const loadReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchReturnReports({
        reportType: getBackendReportType(activeTab),
        filter: period,
        startDate: period === 'custom' ? customStart : undefined,
        endDate: period === 'custom' ? customEnd : undefined,
        branchId: activeBranchId,
      });
      setReportRows(res.rows || []);
      setReportSummary(res.summary || null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch return reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [activeBranchId, activeTab, period, customStart, customEnd]);

  const fmt = (minor: number = 0) =>
    `₹${((minor || 0) / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const tabs: { key: TabType; label: string; icon: any }[] = [
    { key: 'daily_sales', label: 'Daily Sales', icon: TrendingUpIcon },
    { key: 'returns', label: 'Sales Returns', icon: RotateCcwIcon },
    { key: 'exchanges', label: 'Exchanges', icon: ScaleIcon },
    { key: 'refunds', label: 'Refunds', icon: RupeeIcon },
    { key: 'gross_profit', label: 'Daily Gross Profit', icon: BarChart3Icon },
    { key: 'stock_condition', label: 'Stock Return by Condition', icon: PackageIcon },
    { key: 'store_credits', label: 'Customer Store Credits', icon: StoreIcon },
    { key: 'cashier_perf', label: 'Cashier Performance', icon: UserIcon },
  ];

  const exportCsv = (filename: string, rows: any[]) => {
    if (!rows || rows.length === 0) {
      alert('No data to export.');
      return;
    }
    const headers = Object.keys(rows[0]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [
        headers.join(','),
        ...rows.map((row) =>
          headers
            .map((h) => {
              const val = row[h];
              return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
            })
            .join(',')
        ),
      ].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="returns-reports-wrapper">
      {/* ── Top Header & Filter Controls ── */}
      <div className="returns-header-card">
        <div className="returns-header-left">
          <div className="returns-header-icon">
            <FileTextIcon size={22} />
          </div>
          <div>
            <h1 className="returns-header-title">
              Returns, Exchanges &amp; Profit Reports
            </h1>
            <p className="returns-header-subtitle">
              Audit historical returns, inventory conditions, exchanges, and actual gross profits
            </p>
          </div>
        </div>

        {/* Date Filter Segmented Controls */}
        <div className="returns-header-controls">
          <div className="returns-filter-pills-wrap">
            <div className="returns-filter-pills">
              {(['today', 'yesterday', 'this_week', 'this_month', 'custom'] as const).map(
                (p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`returns-filter-btn ${period === p ? 'active' : ''}`}
                  >
                    {p.replace('_', ' ')}
                  </button>
                )
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={loadReport}
            disabled={loading}
            className="returns-refresh-btn"
            title="Refresh Report Data"
          >
            <RefreshCwIcon size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {period === 'custom' && (
          <div className="returns-custom-dates-row">
            <div className="returns-custom-dates">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
              <span>to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-700 text-sm">
          <AlertTriangleIcon size={18} className="flex-shrink-0 mt-0.5 text-red-500" />
          <div style={{ flex: 1 }}>
            <strong>Error:</strong> {error}
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── 8-Report Sub-Navigation Tabs ── */}
      <div className="returns-nav-container">
        {/* Mobile Quick Dropdown Selector */}
        <div className="returns-mobile-select-wrap">
          <label htmlFor="returns-mobile-tab-select" className="returns-mobile-select-label">
            Active Report:
          </label>
          <select
            id="returns-mobile-tab-select"
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as TabType)}
            className="returns-mobile-select"
          >
            {tabs.map((tab, idx) => (
              <option key={tab.key} value={tab.key}>
                {idx + 1}. {tab.label}
              </option>
            ))}
          </select>
        </div>

        {/* Scrollable Pill Carousel with Swipe Hint */}
        <div className="returns-tabs-nav-scroller">
          <div className="returns-tabs-nav">
            {tabs.map((tab, idx) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`returns-tab-pill ${isActive ? 'active' : ''}`}
                >
                  <span className="tab-badge-num">{idx + 1}</span>
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Report Content Area ── */}
      {loading ? (
        <div className="returns-loading-state">
          <RefreshCwIcon size={32} className="animate-spin text-indigo-600" style={{ margin: '0 auto 12px auto' }} />
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Generating Report...</div>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            Fetching and calculating transaction records for the selected period.
          </p>
        </div>
      ) : (
        <div className="returns-content-card">
          {/* ══════════════════════════════════════════════════════════════
              TAB 1: DAILY SALES & RETURNS
          ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'daily_sales' && (
            <div>
              {/* Summary KPI Cards */}
              <div className="returns-kpi-grid">
                <div className="returns-kpi-card blue">
                  <div className="returns-kpi-top">
                    <span className="returns-kpi-label">Gross Sales</span>
                    <div className="returns-kpi-icon">
                      <TrendingUpIcon size={18} />
                    </div>
                  </div>
                  <div className="returns-kpi-val">
                    {fmt(reportSummary?.totalGrossSalesMinor ?? reportRows.reduce((a, r) => a + Number(r.grossSalesMinor ?? r.gross_sales_minor ?? 0), 0))}
                  </div>
                  <div className="returns-kpi-sub">Total billed sales volume</div>
                </div>

                <div className="returns-kpi-card rose">
                  <div className="returns-kpi-top">
                    <span className="returns-kpi-label">Total Returns</span>
                    <div className="returns-kpi-icon">
                      <RotateCcwIcon size={18} />
                    </div>
                  </div>
                  <div className="returns-kpi-val">
                    {(() => {
                      const totalRet = Number(reportSummary?.totalReturnsMinor ?? reportRows.reduce((a, r) => a + Number(r.returnsMinor ?? r.returns_minor ?? r.sales_returns_minor ?? 0), 0));
                      return totalRet > 0 ? `-${fmt(totalRet)}` : fmt(0);
                    })()}
                  </div>
                  <div className="returns-kpi-sub">Returns, refunds &amp; credit notes</div>
                </div>

                <div className="returns-kpi-card emerald">
                  <div className="returns-kpi-top">
                    <span className="returns-kpi-label">Net Sales</span>
                    <div className="returns-kpi-icon">
                      <RupeeIcon size={18} />
                    </div>
                  </div>
                  <div className="returns-kpi-val">
                    {fmt(reportSummary?.totalNetSalesMinor ?? reportRows.reduce((a, r) => a + Number(r.netSalesMinor ?? r.net_sales_minor ?? 0), 0))}
                  </div>
                  <div className="returns-kpi-sub">Gross Sales minus Sales Returns</div>
                </div>

                <div className="returns-kpi-card purple">
                  <div className="returns-kpi-top">
                    <span className="returns-kpi-label">Invoices / Returns</span>
                    <div className="returns-kpi-icon">
                      <ReceiptIcon size={18} />
                    </div>
                  </div>
                  <div className="returns-kpi-val" style={{ fontSize: '1.35rem' }}>
                    {reportSummary?.totalSalesCount ?? reportRows.reduce((a, r) => a + Number(r.salesCount ?? r.sales_count ?? r.invoices_count ?? 0), 0)} bills <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 600 }}>/ {reportSummary?.totalReturnsCount ?? reportRows.reduce((a, r) => a + Number(r.returnsCount ?? r.returns_count ?? 0), 0)} ret</span>
                  </div>
                  <div className="returns-kpi-sub">Total audited transaction count</div>
                </div>
              </div>

              {/* Toolbar */}
              <div className="returns-table-toolbar">
                <div className="returns-table-title-group">
                  <span className="returns-table-title">Daily Sales &amp; Returns Breakdown</span>
                  <span className="returns-table-badge">{reportRows.length} Days Audited</span>
                </div>
                <button
                  type="button"
                  onClick={() => exportCsv('daily_sales_report', reportRows)}
                  className="btn-export-csv"
                >
                  <DownloadIcon size={14} />
                  <span>Export CSV</span>
                </button>
              </div>

              {/* Table */}
              {reportRows.length === 0 ? (
                <div className="returns-empty-state">
                  <div className="returns-empty-icon">
                    <ReceiptIcon size={24} />
                  </div>
                  <div className="returns-empty-title">No Sales Records Found</div>
                  <p className="returns-empty-desc">There are no sales or returns recorded for the selected period.</p>
                </div>
              ) : (
                <>
                  <div className="returns-table-scroll-hint">Swipe horizontally to view full report columns ↔</div>
                  <div className="returns-table-wrapper">
                    <table className="returns-data-table">
                      <thead>
                        <tr>
                          <th className="col-sticky-report">Date</th>
                          <th className="num-col">Gross Sales</th>
                          <th className="num-col">Sales Returns</th>
                          <th className="num-col">Net Sales</th>
                          <th style={{ textAlign: 'center' }}>Invoices</th>
                          <th style={{ textAlign: 'center' }}>Returns</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportRows.map((row: any, idx: number) => {
                          const gross = Number(row.grossSalesMinor ?? row.gross_sales_minor ?? 0);
                          const ret = Number(row.returnsMinor ?? row.returns_minor ?? row.sales_returns_minor ?? 0);
                          const net = Number(row.netSalesMinor ?? row.net_sales_minor ?? (gross - ret));
                          const invoices = Number(row.salesCount ?? row.sales_count ?? row.invoices_count ?? row.invoice_count ?? 0);
                          const returns = Number(row.returnsCount ?? row.returns_count ?? row.return_count ?? 0);
                          return (
                            <tr key={idx}>
                              <td className="col-sticky-report" style={{ fontWeight: 700, color: '#0f172a' }}>{row.bdate || row.date}</td>
                              <td className="num-col" style={{ color: '#0f172a', fontWeight: 600 }}>{fmt(gross)}</td>
                              <td className="num-col">
                                {ret > 0 ? (
                                  <span style={{ color: '#e11d48', fontWeight: 700 }}>-{fmt(ret)}</span>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>{fmt(0)}</span>
                                )}
                              </td>
                              <td className="num-col" style={{ color: '#059669', fontWeight: 800 }}>{fmt(net)}</td>
                              <td style={{ textAlign: 'center' }}>
                                <span className="badge-pill bill-count">{invoices} {invoices === 1 ? 'bill' : 'bills'}</span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {returns > 0 ? (
                                  <span className="badge-pill defective">{returns} ret</span>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontSize: '12px' }}>0</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="col-sticky-report" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Consolidated Total</td>
                          <td className="num-col" style={{ color: '#0f172a' }}>
                            {fmt(reportRows.reduce((a, r) => a + Number(r.grossSalesMinor ?? r.gross_sales_minor ?? 0), 0))}
                          </td>
                          <td className="num-col">
                            {(() => {
                              const totRet = reportRows.reduce((a, r) => a + Number(r.returnsMinor ?? r.returns_minor ?? r.sales_returns_minor ?? 0), 0);
                              return totRet > 0 ? (
                                <span style={{ color: '#e11d48', fontWeight: 800 }}>-{fmt(totRet)}</span>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>{fmt(0)}</span>
                              );
                            })()}
                          </td>
                          <td className="num-col" style={{ color: '#059669', fontWeight: 800 }}>
                            {fmt(reportRows.reduce((a, r) => a + Number(r.netSalesMinor ?? r.net_sales_minor ?? 0), 0))}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="badge-pill bill-count" style={{ fontSize: '13px' }}>
                              {reportRows.reduce((a, r) => a + Number(r.salesCount ?? r.sales_count ?? r.invoices_count ?? 0), 0)} bills
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="badge-pill defective" style={{ fontSize: '13px' }}>
                              {reportRows.reduce((a, r) => a + Number(r.returnsCount ?? r.returns_count ?? 0), 0)} ret
                            </span>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 2: SALES RETURNS (DETAILED ITEMS)
          ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'returns' && (
            <div>
              <div className="returns-table-toolbar">
                <div className="returns-table-title-group">
                  <span className="returns-table-title">Detailed Sales Returns &amp; Credit Notes</span>
                  <span className="returns-table-badge">{reportRows.length} Return Entries</span>
                </div>
                <button
                  type="button"
                  onClick={() => exportCsv('sales_return_report', reportRows)}
                  className="btn-export-csv"
                >
                  <DownloadIcon size={14} />
                  <span>Export CSV</span>
                </button>
              </div>

              {reportRows.length === 0 ? (
                <div className="returns-empty-state">
                  <div className="returns-empty-icon">
                    <RotateCcwIcon size={24} />
                  </div>
                  <div className="returns-empty-title">No Sales Returns Found</div>
                  <p className="returns-empty-desc">No customer returns or credit notes were issued in this period.</p>
                </div>
              ) : (
                <>
                  <div className="returns-table-scroll-hint">Swipe horizontally to view full report columns ↔</div>
                  <div className="returns-table-wrapper">
                    <table className="returns-data-table">
                      <thead>
                        <tr>
                          <th className="col-sticky-report">Return / CN #</th>
                          <th>Orig Invoice #</th>
                          <th>Sale Date</th>
                          <th>Return Date</th>
                          <th>Customer</th>
                          <th>Product</th>
                          <th className="num-col">Qty</th>
                          <th className="num-col">Amount</th>
                          <th>Reason</th>
                          <th>Condition</th>
                          <th>Cashier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportRows.map((row: any, idx: number) => {
                          const cnNum = row.credit_note_number || row.creditNoteNumber || row.return_number || row.returnNumber || '—';
                          const origInv = row.orig_invoice_number || row.origInvoiceNumber || row.original_invoice_number || '—';
                          const origDate = row.orig_sale_date || row.origSaleDate || row.original_sale_date || '—';
                          const retDate = row.return_date || row.returnDate || row.bdate || '—';
                          const cust = row.customer_name || row.customerName || 'Walk-in';
                          const prod = row.product_name || row.productName || row.item_name || row.itemName || '—';
                          const qty = row.return_qty ?? row.returnQty ?? ((Number(row.return_qty_milli ?? row.returnQtyMilli ?? row.qty_milli ?? 0)) / 1000);
                          const amt = Number(row.return_amount_minor ?? row.returnAmountMinor ?? row.total_minor ?? row.totalMinor ?? 0);
                          const reason = row.return_reason || row.returnReason || row.reason || '-';
                          const cond = String(row.item_condition || row.itemCondition || 'resellable').toLowerCase();
                          const cashier = row.cashier_name || row.cashierName || row.processed_by || row.processedBy || 'Cashier';
                          return (
                            <tr key={idx}>
                              <td className="col-sticky-report" style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, color: '#4f46e5' }}>{cnNum}</td>
                              <td style={{ fontFamily: 'JetBrains Mono', color: '#475569' }}>{origInv}</td>
                              <td style={{ color: '#64748b' }}>{origDate}</td>
                              <td style={{ fontWeight: 600, color: '#0f172a' }}>{retDate}</td>
                              <td>{cust}</td>
                              <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={prod}>{prod}</td>
                              <td className="num-col">{qty}</td>
                              <td className="num-col" style={{ color: '#e11d48', fontWeight: 700 }}>{fmt(amt)}</td>
                              <td>
                                <span style={{ padding: '2px 8px', borderRadius: '6px', background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: 600 }}>
                                  {reason}
                                </span>
                              </td>
                              <td>
                                <span className={`badge-pill ${cond === 'resellable' ? 'resellable' : cond === 'damaged' ? 'damaged' : 'defective'}`}>
                                  {cond}
                                </span>
                              </td>
                              <td style={{ color: '#64748b' }}>{cashier}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 3: EXCHANGES
          ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'exchanges' && (
            <div>
              <div className="returns-table-toolbar">
                <div className="returns-table-title-group">
                  <span className="returns-table-title">Product Exchange Transactions</span>
                  <span className="returns-table-badge">{reportRows.length} Exchanges</span>
                </div>
                <button
                  type="button"
                  onClick={() => exportCsv('exchanges_report', reportRows)}
                  className="btn-export-csv"
                >
                  <DownloadIcon size={14} />
                  <span>Export CSV</span>
                </button>
              </div>

              {reportRows.length === 0 ? (
                <div className="returns-empty-state">
                  <div className="returns-empty-icon">
                    <ScaleIcon size={24} />
                  </div>
                  <div className="returns-empty-title">No Exchange Records Found</div>
                  <p className="returns-empty-desc">No return-and-purchase exchange transactions were processed in this period.</p>
                </div>
              ) : (
                <>
                  <div className="returns-table-scroll-hint">Swipe horizontally to view full report columns ↔</div>
                  <div className="returns-table-wrapper">
                    <table className="returns-data-table">
                      <thead>
                        <tr>
                          <th className="col-sticky-report">Exchange ID</th>
                          <th>Date</th>
                          <th>New Invoice #</th>
                          <th className="num-col">New Purchase</th>
                          <th className="num-col">Return Adjusted</th>
                          <th className="num-col">Customer Paid</th>
                          <th className="num-col">Excess Refund</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportRows.map((row: any, idx: number) => {
                          const exId = row.exchange_id || row.exchangeId;
                          const newInv = row.new_invoice_number || row.newInvoiceNumber || row.number;
                          const newPurch = Number(row.new_purchase_minor ?? row.newPurchaseMinor ?? row.total_minor ?? row.totalMinor ?? 0);
                          const adjusted = Number(row.exchange_adjusted_minor ?? row.exchangeAdjustedMinor ?? 0);
                          const paid = Number(row.customer_paid_minor ?? row.customerPaidMinor ?? row.paid_minor ?? row.paidMinor ?? 0);
                          const refund = Number(row.excess_refund_minor ?? row.excessRefundMinor ?? 0);
                          return (
                            <tr key={idx}>
                              <td className="col-sticky-report" style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#4f46e5' }}>{exId ? `${exId.slice(0, 10)}...` : '—'}</td>
                              <td style={{ color: '#0f172a', fontWeight: 600 }}>{row.bdate || row.date}</td>
                              <td style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#0f172a' }}>{newInv}</td>
                              <td className="num-col" style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(newPurch)}</td>
                              <td className="num-col" style={{ fontWeight: 700, color: '#4f46e5' }}>{fmt(adjusted)}</td>
                              <td className="num-col" style={{ fontWeight: 700, color: '#059669' }}>{fmt(paid)}</td>
                              <td className="num-col" style={{ fontWeight: 700, color: refund > 0 ? '#e11d48' : '#94a3b8' }}>
                                {refund > 0 ? `-${fmt(refund)}` : fmt(0)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 4: REFUNDS
          ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'refunds' && (
            <div>
              <div className="returns-table-toolbar">
                <div className="returns-table-title-group">
                  <span className="returns-table-title">Refund Disbursements</span>
                  <span className="returns-table-badge">{reportRows.length} Refunds</span>
                </div>
                <button
                  type="button"
                  onClick={() => exportCsv('refunds_report', reportRows)}
                  className="btn-export-csv"
                >
                  <DownloadIcon size={14} />
                  <span>Export CSV</span>
                </button>
              </div>

              {reportRows.length === 0 ? (
                <div className="returns-empty-state">
                  <div className="returns-empty-icon">
                    <RupeeIcon size={24} />
                  </div>
                  <div className="returns-empty-title">No Refunds Issued</div>
                  <p className="returns-empty-desc">No cash or digital refunds were disbursed for the selected period.</p>
                </div>
              ) : (
                <>
                  <div className="returns-table-scroll-hint">Swipe horizontally to view full report columns ↔</div>
                  <div className="returns-table-wrapper">
                    <table className="returns-data-table">
                      <thead>
                        <tr>
                          <th className="col-sticky-report">Refund ID</th>
                          <th>Date</th>
                          <th>Method</th>
                          <th className="num-col">Amount</th>
                          <th>Reference #</th>
                          <th>Customer</th>
                          <th>Processed By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportRows.map((row: any, idx: number) => {
                          const refId = row.id || row.refund_id || row.refundId;
                          const bdate = row.bdate || row.refund_date || row.refundDate;
                          const method = row.method || row.refund_method || row.refundMethod || 'cash';
                          const amt = Number(row.amount_minor ?? row.amountMinor ?? row.refund_amount_minor ?? row.refundAmountMinor ?? 0);
                          const ref = row.reference || row.reference_no || row.referenceNo || row.refund_ref || '—';
                          const cust = row.customer_name || row.customerName || 'Walk-in';
                          const cashier = row.cashier_name || row.cashierName || row.processed_by || row.processedBy || 'Cashier';
                          return (
                            <tr key={idx}>
                              <td className="col-sticky-report" style={{ fontFamily: 'JetBrains Mono', color: '#4f46e5', fontWeight: 700 }}>{refId ? `${refId.slice(0, 10)}...` : '—'}</td>
                              <td style={{ fontWeight: 600, color: '#0f172a' }}>{bdate}</td>
                              <td>
                                <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#f1f5f9', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', color: '#334155' }}>
                                  {method}
                                </span>
                              </td>
                              <td className="num-col" style={{ color: '#e11d48', fontWeight: 700 }}>{fmt(amt)}</td>
                              <td style={{ fontFamily: 'JetBrains Mono', color: '#64748b' }}>{ref}</td>
                              <td>{cust}</td>
                              <td style={{ color: '#64748b' }}>{cashier}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 5: DAILY GROSS PROFIT & COGS
          ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'gross_profit' && (
            <div>
              {/* Gross Profit KPI Cards */}
              <div className="returns-kpi-grid">
                <div className="returns-kpi-card blue">
                  <div className="returns-kpi-top">
                    <span className="returns-kpi-label">Total Net Sales</span>
                    <div className="returns-kpi-icon">
                      <TrendingUpIcon size={18} />
                    </div>
                  </div>
                  <div className="returns-kpi-val">
                    {fmt(reportRows.reduce((a, r) => a + Number(r.netSalesMinor ?? r.net_sales_minor ?? 0), 0))}
                  </div>
                  <div className="returns-kpi-sub">Total revenue realized</div>
                </div>

                <div className="returns-kpi-card rose">
                  <div className="returns-kpi-top">
                    <span className="returns-kpi-label">Total Net COGS (Cost)</span>
                    <div className="returns-kpi-icon">
                      <RupeeIcon size={18} />
                    </div>
                  </div>
                  <div className="returns-kpi-val">
                    {fmt(reportRows.reduce((a, r) => a + Number(r.netCogsMinor ?? r.net_cogs_minor ?? 0), 0))}
                  </div>
                  <div className="returns-kpi-sub">Cost of goods sold</div>
                </div>

                <div className="returns-kpi-card emerald">
                  <div className="returns-kpi-top">
                    <span className="returns-kpi-label">Total Gross Profit</span>
                    <div className="returns-kpi-icon">
                      <BarChart3Icon size={18} />
                    </div>
                  </div>
                  <div className="returns-kpi-val">
                    {fmt(reportRows.reduce((a, r) => a + Number(r.grossProfitMinor ?? r.gross_profit_minor ?? 0), 0))}
                  </div>
                  <div className="returns-kpi-sub">Net Sales minus Net COGS</div>
                </div>

                <div className="returns-kpi-card purple">
                  <div className="returns-kpi-top">
                    <span className="returns-kpi-label">Overall Gross Margin</span>
                    <div className="returns-kpi-icon">
                      <ScaleIcon size={18} />
                    </div>
                  </div>
                  <div className="returns-kpi-val">
                    {(() => {
                      const totNet = reportRows.reduce((a, r) => a + Number(r.netSalesMinor ?? r.net_sales_minor ?? 0), 0);
                      const totProf = reportRows.reduce((a, r) => a + Number(r.grossProfitMinor ?? r.gross_profit_minor ?? 0), 0);
                      return totNet > 0 ? `${((totProf / totNet) * 100).toFixed(1)}%` : '0.0%';
                    })()}
                  </div>
                  <div className="returns-kpi-sub">Profit margin percentage</div>
                </div>
              </div>

              <div className="returns-table-toolbar">
                <div className="returns-table-title-group">
                  <span className="returns-table-title">Daily Gross Profit &amp; COGS Audit</span>
                  <span className="returns-table-badge">{reportRows.length} Days Audited</span>
                </div>
                <button
                  type="button"
                  onClick={() => exportCsv('gross_profit_report', reportRows)}
                  className="btn-export-csv"
                >
                  <DownloadIcon size={14} />
                  <span>Export CSV</span>
                </button>
              </div>

              {reportRows.length === 0 ? (
                <div className="returns-empty-state">
                  <div className="returns-empty-icon">
                    <BarChart3Icon size={24} />
                  </div>
                  <div className="returns-empty-title">No Profit Data Found</div>
                  <p className="returns-empty-desc">No sales or purchase cost records found for this period.</p>
                </div>
              ) : (
                <>
                  <div className="returns-table-scroll-hint">Swipe horizontally to view full report columns ↔</div>
                  <div className="returns-table-wrapper">
                    <table className="returns-data-table">
                      <thead>
                        <tr>
                          <th className="col-sticky-report">Date</th>
                          <th className="num-col">Net Sales</th>
                          <th className="num-col">Net COGS (Cost)</th>
                          <th className="num-col">Gross Profit</th>
                          <th className="num-col">Gross Margin %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportRows.map((row: any, idx: number) => {
                          const netSales = Number(row.net_sales_minor ?? row.netSalesMinor ?? 0);
                          const cogs = Number(row.net_cogs_minor ?? row.netCogsMinor ?? 0);
                          const profit = Number(row.gross_profit_minor ?? row.grossProfitMinor ?? (netSales - cogs));
                          const margin = netSales > 0 ? ((profit / netSales) * 100).toFixed(1) : '0.0';
                          return (
                            <tr key={idx}>
                              <td className="col-sticky-report" style={{ fontWeight: 700, color: '#0f172a' }}>{row.bdate || row.date}</td>
                              <td className="num-col" style={{ color: '#0f172a', fontWeight: 600 }}>{fmt(netSales)}</td>
                              <td className="num-col" style={{ color: '#e11d48', fontWeight: 600 }}>{fmt(cogs)}</td>
                              <td className="num-col" style={{ color: '#059669', fontWeight: 800 }}>{fmt(profit)}</td>
                              <td className="num-col" style={{ color: '#7c3aed', fontWeight: 800 }}>{margin}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="col-sticky-report" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Consolidated Total</td>
                          <td className="num-col" style={{ color: '#0f172a' }}>
                            {fmt(reportRows.reduce((a, r) => a + Number(r.netSalesMinor ?? r.net_sales_minor ?? 0), 0))}
                          </td>
                          <td className="num-col" style={{ color: '#e11d48' }}>
                            {fmt(reportRows.reduce((a, r) => a + Number(r.netCogsMinor ?? r.net_cogs_minor ?? 0), 0))}
                          </td>
                          <td className="num-col" style={{ color: '#059669', fontWeight: 800 }}>
                            {fmt(reportRows.reduce((a, r) => a + Number(r.grossProfitMinor ?? r.gross_profit_minor ?? 0), 0))}
                          </td>
                          <td className="num-col" style={{ color: '#7c3aed', fontWeight: 800 }}>
                            {(() => {
                              const totNet = reportRows.reduce((a, r) => a + Number(r.netSalesMinor ?? r.net_sales_minor ?? 0), 0);
                              const totProf = reportRows.reduce((a, r) => a + Number(r.grossProfitMinor ?? r.gross_profit_minor ?? 0), 0);
                              return totNet > 0 ? `${((totProf / totNet) * 100).toFixed(1)}%` : '0.0%';
                            })()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 6: STOCK RETURN BY CONDITION
          ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'stock_condition' && (
            <div>
              <div className="returns-table-toolbar">
                <div className="returns-table-title-group">
                  <span className="returns-table-title">Returned Stock Inventory Routing</span>
                  <span className="returns-table-badge">{reportRows.length} Condition Categories</span>
                </div>
                <button
                  type="button"
                  onClick={() => exportCsv('stock_condition_report', reportRows)}
                  className="btn-export-csv"
                >
                  <DownloadIcon size={14} />
                  <span>Export CSV</span>
                </button>
              </div>

              {reportRows.length === 0 ? (
                <div className="returns-empty-state">
                  <div className="returns-empty-icon">
                    <PackageIcon size={24} />
                  </div>
                  <div className="returns-empty-title">No Stock Returns Recorded</div>
                  <p className="returns-empty-desc">No stock was returned or partitioned by condition in this period.</p>
                </div>
              ) : (
                <>
                  <div className="returns-table-scroll-hint">Swipe horizontally to view full report columns ↔</div>
                  <div className="returns-table-wrapper">
                    <table className="returns-data-table">
                      <thead>
                        <tr>
                          <th className="col-sticky-report">Item Condition</th>
                          <th>Inventory Destination Location</th>
                          <th className="num-col">Total Qty Returned</th>
                          <th className="num-col">Total Cost Value</th>
                          <th>POS Stock Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportRows.map((row: any, idx: number) => {
                          const cond = String(row.item_condition || row.itemCondition || row.condition || 'resellable').toLowerCase();
                          const loc = row.location || (cond === 'resellable' ? 'MAIN STORE (Sellable POS Shelf)' : cond === 'damaged' ? 'DAMAGED WAREHOUSE' : 'DEFECTIVE BIN');
                          const qty = Number(row.total_qty ?? row.totalQty ?? (Number(row.return_qty_milli ?? row.returnQtyMilli ?? row.qty_milli ?? 0) / 1000));
                          const cost = Number(row.total_cost_minor ?? row.totalCostMinor ?? row.total_cost_value_minor ?? row.totalCostValueMinor ?? 0);
                          return (
                            <tr key={idx}>
                              <td className="col-sticky-report">
                                <span className={`badge-pill ${cond === 'resellable' ? 'resellable' : cond === 'damaged' ? 'damaged' : 'defective'}`}>
                                  {cond.toUpperCase()}
                                </span>
                              </td>
                              <td style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#4f46e5' }}>{loc}</td>
                              <td className="num-col" style={{ fontWeight: 700, color: '#0f172a' }}>{qty} units</td>
                              <td className="num-col" style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(cost)}</td>
                              <td>
                                {cond === 'resellable' ? (
                                  <span className="badge-pill resellable">
                                    ✓ Added back to sellable POS stock
                                  </span>
                                ) : (
                                  <span className="badge-pill defective">
                                    ✕ Quarantined (Never added to POS stock)
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 7: CUSTOMER STORE CREDITS
          ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'store_credits' && (
            <div>
              <div className="returns-table-toolbar">
                <div className="returns-table-title-group">
                  <span className="returns-table-title">Customer Store Credit Ledger</span>
                  <span className="returns-table-badge">{reportRows.length} Credit Accounts</span>
                </div>
                <button
                  type="button"
                  onClick={() => exportCsv('store_credit_report', reportRows)}
                  className="btn-export-csv"
                >
                  <DownloadIcon size={14} />
                  <span>Export CSV</span>
                </button>
              </div>

              {reportRows.length === 0 ? (
                <div className="returns-empty-state">
                  <div className="returns-empty-icon">
                    <StoreIcon size={24} />
                  </div>
                  <div className="returns-empty-title">No Store Credits Found</div>
                  <p className="returns-empty-desc">No customer store credit accounts have been issued.</p>
                </div>
              ) : (
                <>
                  <div className="returns-table-scroll-hint">Swipe horizontally to view full report columns ↔</div>
                  <div className="returns-table-wrapper">
                    <table className="returns-data-table">
                      <thead>
                        <tr>
                          <th className="col-sticky-report">Customer</th>
                          <th>Mobile</th>
                          <th className="num-col">Original Issued</th>
                          <th className="num-col">Used / Redeemed</th>
                          <th className="num-col">Remaining Balance</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportRows.map((row: any, idx: number) => {
                          const cust = row.customer_name || row.customerName || 'Walk-in';
                          const phone = row.customer_phone || row.customerPhone || row.phone || '—';
                          const issued = Number(row.amount_minor ?? row.amountMinor ?? row.issued_amount_minor ?? row.issuedAmountMinor ?? 0);
                          const bal = Number(row.balance_minor ?? row.balanceMinor ?? row.remaining_balance_minor ?? row.remainingBalanceMinor ?? 0);
                          const used = Number(row.used_minor ?? row.usedMinor ?? (issued - bal));
                          const status = row.status || 'active';
                          return (
                            <tr key={idx}>
                              <td className="col-sticky-report" style={{ fontWeight: 700, color: '#0f172a' }}>{cust}</td>
                              <td style={{ fontFamily: 'JetBrains Mono', color: '#64748b' }}>{phone}</td>
                              <td className="num-col">{fmt(issued)}</td>
                              <td className="num-col" style={{ color: '#64748b' }}>{fmt(used)}</td>
                              <td className="num-col" style={{ color: '#7c3aed', fontWeight: 800 }}>{fmt(bal)}</td>
                              <td>
                                <span className={`badge-pill ${status === 'active' ? 'active' : 'used'}`}>
                                  {status.toUpperCase()}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TAB 8: CASHIER PERFORMANCE AUDIT
          ══════════════════════════════════════════════════════════════ */}
          {activeTab === 'cashier_perf' && (
            <div>
              <div className="returns-table-toolbar">
                <div className="returns-table-title-group">
                  <span className="returns-table-title">Cashier Sales &amp; Returns Audit</span>
                  <span className="returns-table-badge">{reportRows.length} Cashiers Active</span>
                </div>
                <button
                  type="button"
                  onClick={() => exportCsv('cashier_performance_report', reportRows)}
                  className="btn-export-csv"
                >
                  <DownloadIcon size={14} />
                  <span>Export CSV</span>
                </button>
              </div>

              {reportRows.length === 0 ? (
                <div className="returns-empty-state">
                  <div className="returns-empty-icon">
                    <UserIcon size={24} />
                  </div>
                  <div className="returns-empty-title">No Cashier Activity Recorded</div>
                  <p className="returns-empty-desc">No cashier transactions were audited for the selected period.</p>
                </div>
              ) : (
                <>
                  <div className="returns-table-scroll-hint">Swipe horizontally to view full report columns ↔</div>
                  <div className="returns-table-wrapper">
                    <table className="returns-data-table">
                      <thead>
                        <tr>
                          <th className="col-sticky-report">Cashier</th>
                          <th style={{ textAlign: 'center' }}>Bills Billed</th>
                          <th className="num-col">Gross Sales</th>
                          <th style={{ textAlign: 'center' }}>Returns Processed</th>
                          <th className="num-col">Return Value</th>
                          <th className="num-col">Net Handled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportRows.map((row: any, idx: number) => {
                          const cashier = row.cashier_name || row.cashierName || 'Cashier';
                          const invCount = Number(row.sales_count ?? row.salesCount ?? row.invoices_count ?? row.invoicesCount ?? row.invoice_count ?? 0);
                          const gross = Number(row.gross_sales_minor ?? row.grossSalesMinor ?? 0);
                          const retCount = Number(row.returns_count ?? row.returnsCount ?? row.return_count ?? 0);
                          const retAmt = Number(row.returns_minor ?? row.returnsMinor ?? row.returns_total_minor ?? row.return_amount_minor ?? 0);
                          const net = Number(row.net_sales_minor ?? row.netSalesMinor ?? row.net_minor ?? (gross - retAmt));
                          return (
                            <tr key={idx}>
                              <td className="col-sticky-report" style={{ fontWeight: 700, color: '#0f172a' }}>{cashier}</td>
                              <td style={{ textAlign: 'center' }}>
                                <span className="badge-pill bill-count">{invCount} {invCount === 1 ? 'bill' : 'bills'}</span>
                              </td>
                              <td className="num-col" style={{ color: '#0f172a', fontWeight: 600 }}>{fmt(gross)}</td>
                              <td style={{ textAlign: 'center' }}>
                                {retCount > 0 ? (
                                  <span className="badge-pill defective">{retCount}</span>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>0</span>
                                )}
                              </td>
                              <td className="num-col">
                                {retAmt > 0 ? (
                                  <span style={{ color: '#e11d48', fontWeight: 700 }}>-{fmt(retAmt)}</span>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>{fmt(0)}</span>
                                )}
                              </td>
                              <td className="num-col" style={{ color: '#059669', fontWeight: 800 }}>{fmt(net)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="col-sticky-report" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Consolidated Total</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge-pill bill-count" style={{ fontSize: '13px' }}>
                            {reportRows.reduce((a, r) => a + Number(r.sales_count ?? r.salesCount ?? r.invoices_count ?? 0), 0)} bills
                          </span>
                        </td>
                        <td className="num-col" style={{ color: '#0f172a' }}>
                          {fmt(reportRows.reduce((a, r) => a + Number(r.gross_sales_minor ?? r.grossSalesMinor ?? 0), 0))}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge-pill defective" style={{ fontSize: '13px' }}>
                            {reportRows.reduce((a, r) => a + Number(r.returns_count ?? r.returnsCount ?? 0), 0)}
                          </span>
                        </td>
                        <td className="num-col">
                          {(() => {
                            const totRet = reportRows.reduce((a, r) => a + Number(r.returns_minor ?? r.returnsMinor ?? 0), 0);
                            return totRet > 0 ? (
                              <span style={{ color: '#e11d48', fontWeight: 800 }}>-{fmt(totRet)}</span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>{fmt(0)}</span>
                            );
                          })()}
                        </td>
                        <td className="num-col" style={{ color: '#059669', fontWeight: 800 }}>
                          {fmt(reportRows.reduce((a, r) => a + Number(r.net_sales_minor ?? r.netSalesMinor ?? 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  );
};
