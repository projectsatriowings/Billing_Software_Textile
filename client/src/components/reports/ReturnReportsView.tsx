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
} from '../inventory/InventoryIcons.tsx';

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
    { key: 'daily_sales', label: '1. Daily Sales', icon: TrendingUpIcon },
    { key: 'returns', label: '2. Sales Returns', icon: RotateCcwIcon },
    { key: 'exchanges', label: '3. Exchanges', icon: ScaleIcon },
    { key: 'refunds', label: '4. Refunds', icon: RupeeIcon },
    { key: 'gross_profit', label: '5. Daily Gross Profit', icon: TrendingUpIcon },
    { key: 'stock_condition', label: '6. Stock Return by Condition', icon: StoreIcon },
    { key: 'store_credits', label: '7. Customer Store Credits', icon: StoreIcon },
    { key: 'cashier_perf', label: '8. Cashier Performance', icon: UserIcon },
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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Filter Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-purple-50 text-purple-600">
              <FileTextIcon className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Returns, Exchanges & Profit Reports
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Audit historical returns, inventory conditions, exchanges, and actual gross profits
              </p>
            </div>
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {(['today', 'yesterday', 'this_week', 'this_month', 'custom'] as const).map(
            (p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition ${
                  period === p
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {p.replace('_', ' ')}
              </button>
            )
          )}

          {period === 'custom' && (
            <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-transparent font-medium text-slate-700 outline-none text-xs"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-transparent font-medium text-slate-700 outline-none text-xs"
              />
            </div>
          )}

          <button
            onClick={loadReport}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            title="Refresh"
          >
            <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-700 text-sm">
          <AlertTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
          <div className="flex-1">
            <strong>Error:</strong> {error}
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs font-semibold">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                activeTab === tab.key
                  ? 'bg-purple-50 text-purple-700 border border-purple-200 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
          <RefreshCwIcon className="w-8 h-8 mx-auto mb-3 animate-spin text-purple-500" />
          <p className="text-sm font-medium">Generating report for selected period...</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* TAB 1: Daily Sales Report */}
          {activeTab === 'daily_sales' && (
            <div className="p-5">
              {/* Summary KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[11px] font-bold uppercase text-slate-500">Gross Sales</div>
                  <div className="text-base font-extrabold text-slate-900 mt-1">
                    {fmt(reportSummary?.totalGrossSalesMinor ?? reportRows.reduce((a, r) => a + Number(r.grossSalesMinor ?? r.gross_sales_minor ?? 0), 0))}
                  </div>
                </div>
                <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl">
                  <div className="text-[11px] font-bold uppercase text-rose-600">Total Returns</div>
                  <div className="text-base font-extrabold text-rose-700 mt-1">
                    -{fmt(reportSummary?.totalReturnsMinor ?? reportRows.reduce((a, r) => a + Number(r.returnsMinor ?? r.returns_minor ?? r.sales_returns_minor ?? 0), 0))}
                  </div>
                </div>
                <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <div className="text-[11px] font-bold uppercase text-emerald-700">Net Sales</div>
                  <div className="text-base font-extrabold text-emerald-800 mt-1">
                    {fmt(reportSummary?.totalNetSalesMinor ?? reportRows.reduce((a, r) => a + Number(r.netSalesMinor ?? r.net_sales_minor ?? 0), 0))}
                  </div>
                </div>
                <div className="p-3.5 bg-purple-50 border border-purple-100 rounded-xl">
                  <div className="text-[11px] font-bold uppercase text-purple-700">Invoices / Returns</div>
                  <div className="text-base font-extrabold text-purple-900 mt-1">
                    {reportSummary?.totalSalesCount ?? reportRows.reduce((a, r) => a + Number(r.salesCount ?? r.sales_count ?? r.invoices_count ?? 0), 0)} bills / {reportSummary?.totalReturnsCount ?? reportRows.reduce((a, r) => a + Number(r.returnsCount ?? r.returns_count ?? 0), 0)} ret
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-bold text-slate-900">
                  Daily Sales &amp; Returns Breakdown
                </div>
                <button
                  onClick={() => exportCsv('daily_sales_report', reportRows)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
                >
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Gross Sales</th>
                      <th className="py-2.5 px-3">Sales Returns</th>
                      <th className="py-2.5 px-3">Net Sales</th>
                      <th className="py-2.5 px-3">Invoices</th>
                      <th className="py-2.5 px-3">Returns</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportRows.map((row: any, idx: number) => {
                      const gross = Number(row.grossSalesMinor ?? row.gross_sales_minor ?? 0);
                      const ret = Number(row.returnsMinor ?? row.returns_minor ?? row.sales_returns_minor ?? 0);
                      const net = Number(row.netSalesMinor ?? row.net_sales_minor ?? (gross - ret));
                      const invoices = Number(row.salesCount ?? row.sales_count ?? row.invoices_count ?? row.invoice_count ?? 0);
                      const returns = Number(row.returnsCount ?? row.returns_count ?? row.return_count ?? 0);
                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-slate-800">{row.bdate || row.date}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">{fmt(gross)}</td>
                          <td className="py-2.5 px-3 text-rose-600 font-medium">-{fmt(ret)}</td>
                          <td className="py-2.5 px-3 font-bold text-emerald-700">{fmt(net)}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-700">{invoices} {invoices === 1 ? 'bill' : 'bills'}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-600">{returns}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {reportRows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 font-extrabold bg-slate-50 text-slate-900">
                        <td className="py-3 px-3 uppercase tracking-wider text-slate-700">Consolidated Total</td>
                        <td className="py-3 px-3 text-slate-900">
                          {fmt(reportRows.reduce((a, r) => a + Number(r.grossSalesMinor ?? r.gross_sales_minor ?? 0), 0))}
                        </td>
                        <td className="py-3 px-3 text-rose-600">
                          -{fmt(reportRows.reduce((a, r) => a + Number(r.returnsMinor ?? r.returns_minor ?? r.sales_returns_minor ?? 0), 0))}
                        </td>
                        <td className="py-3 px-3 text-emerald-700">
                          {fmt(reportRows.reduce((a, r) => a + Number(r.netSalesMinor ?? r.net_sales_minor ?? 0), 0))}
                        </td>
                        <td className="py-3 px-3 text-slate-900 font-bold">
                          {reportRows.reduce((a, r) => a + Number(r.salesCount ?? r.sales_count ?? r.invoices_count ?? 0), 0)} bills
                        </td>
                        <td className="py-3 px-3 text-slate-700 font-bold">
                          {reportRows.reduce((a, r) => a + Number(r.returnsCount ?? r.returns_count ?? 0), 0)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: Sales Return Report */}
          {activeTab === 'returns' && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-bold text-slate-900">Detailed Sales Returns</div>
                  <div className="text-xs text-slate-500">
                    Shows original invoice, orig sale date, return date, reason, condition & cashier
                  </div>
                </div>
                <button
                  onClick={() => exportCsv('sales_return_report', reportRows)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
                >
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                      <th className="py-2.5 px-3">Return ID / CN</th>
                      <th className="py-2.5 px-3">Orig Invoice #</th>
                      <th className="py-2.5 px-3">Orig Date</th>
                      <th className="py-2.5 px-3">Return Date</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3">Qty</th>
                      <th className="py-2.5 px-3">Amount</th>
                      <th className="py-2.5 px-3">Reason</th>
                      <th className="py-2.5 px-3">Condition</th>
                      <th className="py-2.5 px-3">Cashier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
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
                      const cond = row.item_condition || row.itemCondition || 'resellable';
                      const cashier = row.cashier_name || row.cashierName || row.processed_by || row.processedBy || 'Cashier';
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">{cnNum}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">{origInv}</td>
                          <td className="py-2.5 px-3 text-slate-500">{origDate}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">{retDate}</td>
                          <td className="py-2.5 px-3">{cust}</td>
                          <td className="py-2.5 px-3 max-w-[150px] truncate" title={prod}>{prod}</td>
                          <td className="py-2.5 px-3">{qty}</td>
                          <td className="py-2.5 px-3 font-bold text-rose-600">{fmt(amt)}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px]">
                              {reason}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              cond === 'resellable'
                                ? 'bg-emerald-50 text-emerald-700'
                                : cond === 'damaged'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}>
                              {cond}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">{cashier}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: Exchange Report */}
          {activeTab === 'exchanges' && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-bold text-slate-900">Exchange Transactions</div>
                  <div className="text-xs text-slate-500">
                    Linked returns and new garment purchases
                  </div>
                </div>
                <button
                  onClick={() => exportCsv('exchanges_report', reportRows)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
                >
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                      <th className="py-2.5 px-3">Exchange ID</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">New Invoice #</th>
                      <th className="py-2.5 px-3">New Purchase</th>
                      <th className="py-2.5 px-3">Return Adjusted</th>
                      <th className="py-2.5 px-3">Customer Paid</th>
                      <th className="py-2.5 px-3">Excess Refund</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportRows.map((row: any, idx: number) => {
                      const exId = row.exchange_id || row.exchangeId;
                      const newInv = row.new_invoice_number || row.newInvoiceNumber || row.number;
                      const newPurch = Number(row.new_purchase_minor ?? row.newPurchaseMinor ?? row.total_minor ?? row.totalMinor ?? 0);
                      const adjusted = Number(row.exchange_adjusted_minor ?? row.exchangeAdjustedMinor ?? 0);
                      const paid = Number(row.customer_paid_minor ?? row.customerPaidMinor ?? row.paid_minor ?? row.paidMinor ?? 0);
                      const refund = Number(row.excess_refund_minor ?? row.excessRefundMinor ?? 0);
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">{exId?.slice(0, 12)}...</td>
                          <td className="py-2.5 px-3">{row.bdate || row.date}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-800">{newInv}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{fmt(newPurch)}</td>
                          <td className="py-2.5 px-3 font-bold text-indigo-600">{fmt(adjusted)}</td>
                          <td className="py-2.5 px-3 text-emerald-700">{fmt(paid)}</td>
                          <td className="py-2.5 px-3 text-rose-600">{fmt(refund)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: Refund Report */}
          {activeTab === 'refunds' && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-bold text-slate-900">Refund Disbursements</div>
                <button
                  onClick={() => exportCsv('refunds_report', reportRows)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
                >
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                      <th className="py-2.5 px-3">Refund ID</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Method</th>
                      <th className="py-2.5 px-3">Amount</th>
                      <th className="py-2.5 px-3">Reference #</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Processed By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportRows.map((row: any, idx: number) => {
                      const refId = row.id || row.refund_id || row.refundId;
                      const bdate = row.bdate || row.refund_date || row.refundDate;
                      const method = row.method || row.refund_method || row.refundMethod || 'cash';
                      const amt = Number(row.amount_minor ?? row.amountMinor ?? row.refund_amount_minor ?? row.refundAmountMinor ?? 0);
                      const ref = row.reference || row.reference_no || row.referenceNo || row.refund_ref || '—';
                      const cust = row.customer_name || row.customerName || 'Walk-in';
                      const cashier = row.cashier_name || row.cashierName || row.processed_by || row.processedBy || 'Cashier';
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono">{refId?.slice(0, 8)}...</td>
                          <td className="py-2.5 px-3">{bdate}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold uppercase text-[10px]">
                              {method}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-rose-600">{fmt(amt)}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">{ref}</td>
                          <td className="py-2.5 px-3">{cust}</td>
                          <td className="py-2.5 px-3 text-slate-500">{cashier}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: Gross Profit Report */}
          {activeTab === 'gross_profit' && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-bold text-slate-900">Daily Gross Profit &amp; COGS Report</div>
                  <div className="text-xs text-slate-500">
                    Net Sales minus Net Cost of Goods Sold (using purchase cost snapshots)
                  </div>
                </div>
                <button
                  onClick={() => exportCsv('gross_profit_report', reportRows)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
                >
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Net Sales</th>
                      <th className="py-2.5 px-3">Net COGS (Cost)</th>
                      <th className="py-2.5 px-3">Gross Profit</th>
                      <th className="py-2.5 px-3">Gross Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportRows.map((row: any, idx: number) => {
                      const netSales = Number(row.net_sales_minor ?? row.netSalesMinor ?? 0);
                      const cogs = Number(row.net_cogs_minor ?? row.netCogsMinor ?? 0);
                      const profit = Number(row.gross_profit_minor ?? row.grossProfitMinor ?? (netSales - cogs));
                      const margin = netSales > 0 ? ((profit / netSales) * 100).toFixed(1) : '0.0';
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-bold text-slate-800">{row.bdate || row.date}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{fmt(netSales)}</td>
                          <td className="py-2.5 px-3 text-rose-600">{fmt(cogs)}</td>
                          <td className="py-2.5 px-3 font-bold text-emerald-700">{fmt(profit)}</td>
                          <td className="py-2.5 px-3 font-bold text-indigo-600">{margin}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {reportRows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 font-extrabold bg-slate-50 text-slate-900">
                        <td className="py-3 px-3 uppercase tracking-wider text-slate-700">Consolidated Total</td>
                        <td className="py-3 px-3 text-slate-900">
                          {fmt(reportRows.reduce((a, r) => a + Number(r.netSalesMinor ?? r.net_sales_minor ?? 0), 0))}
                        </td>
                        <td className="py-3 px-3 text-rose-600">
                          {fmt(reportRows.reduce((a, r) => a + Number(r.netCogsMinor ?? r.net_cogs_minor ?? 0), 0))}
                        </td>
                        <td className="py-3 px-3 text-emerald-700">
                          {fmt(reportRows.reduce((a, r) => a + Number(r.grossProfitMinor ?? r.gross_profit_minor ?? 0), 0))}
                        </td>
                        <td className="py-3 px-3 text-indigo-600 font-bold">
                          {(() => {
                            const totNet = reportRows.reduce((a, r) => a + Number(r.netSalesMinor ?? r.net_sales_minor ?? 0), 0);
                            const totProf = reportRows.reduce((a, r) => a + Number(r.grossProfitMinor ?? r.gross_profit_minor ?? 0), 0);
                            return totNet > 0 ? ((totProf / totNet) * 100).toFixed(1) : '0.0';
                          })()}%
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: Stock Return by Condition */}
          {activeTab === 'stock_condition' && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-bold text-slate-900">Returned Stock Inventory Routing</div>
                  <div className="text-xs text-slate-500">
                    Audit inventory destinations: Resellable (MAIN), Damaged (DAMAGED), Defective (DEFECTIVE)
                  </div>
                </div>
                <button
                  onClick={() => exportCsv('stock_condition_report', reportRows)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
                >
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                      <th className="py-2.5 px-3">Condition</th>
                      <th className="py-2.5 px-3">Inventory Destination</th>
                      <th className="py-2.5 px-3">Total Qty Returned</th>
                      <th className="py-2.5 px-3">Total Cost Value</th>
                      <th className="py-2.5 px-3">Sellable Stock Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportRows.map((row: any, idx: number) => {
                      const cond = row.item_condition || row.itemCondition || row.condition || 'resellable';
                      const loc = row.location || (cond === 'resellable' ? 'MAIN STORE' : cond === 'damaged' ? 'DAMAGED WAREHOUSE' : 'DEFECTIVE BIN');
                      const qty = Number(row.total_qty ?? row.totalQty ?? (Number(row.return_qty_milli ?? row.returnQtyMilli ?? row.qty_milli ?? 0) / 1000));
                      const cost = Number(row.total_cost_minor ?? row.totalCostMinor ?? row.total_cost_value_minor ?? row.totalCostValueMinor ?? 0);
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-3 px-3 font-bold uppercase">{cond}</td>
                          <td className="py-3 px-3 font-mono font-semibold text-indigo-600">{loc}</td>
                          <td className="py-3 px-3 font-bold text-slate-800">{qty} units</td>
                          <td className="py-3 px-3 font-bold text-slate-900">{fmt(cost)}</td>
                          <td className="py-3 px-3">
                            {cond === 'resellable' ? (
                              <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold">
                                + Added back to sellable POS stock
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded-full bg-rose-50 text-rose-700 font-semibold">
                                Quarantined (Never added to POS stock)
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: Customer Store Credit */}
          {activeTab === 'store_credits' && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-bold text-slate-900">Customer Store Credit Ledger</div>
                  <div className="text-xs text-slate-500">Track outstanding store liability</div>
                </div>
                <button
                  onClick={() => exportCsv('store_credit_report', reportRows)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
                >
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Mobile</th>
                      <th className="py-2.5 px-3">Original Issued</th>
                      <th className="py-2.5 px-3">Used</th>
                      <th className="py-2.5 px-3">Remaining Balance</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportRows.map((row: any, idx: number) => {
                      const cust = row.customer_name || row.customerName || 'Walk-in';
                      const phone = row.customer_phone || row.customerPhone || row.phone || '—';
                      const issued = Number(row.amount_minor ?? row.amountMinor ?? row.issued_amount_minor ?? row.issuedAmountMinor ?? 0);
                      const bal = Number(row.balance_minor ?? row.balanceMinor ?? row.remaining_balance_minor ?? row.remainingBalanceMinor ?? 0);
                      const used = Number(row.used_minor ?? row.usedMinor ?? (issued - bal));
                      const status = row.status || 'active';
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-800">{cust}</td>
                          <td className="py-2.5 px-3 font-mono">{phone}</td>
                          <td className="py-2.5 px-3">{fmt(issued)}</td>
                          <td className="py-2.5 px-3 text-slate-500">{fmt(used)}</td>
                          <td className="py-2.5 px-3 font-bold text-purple-700">{fmt(bal)}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 8: Cashier Performance */}
          {activeTab === 'cashier_perf' && (
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-bold text-slate-900">Cashier Sales &amp; Returns Audit</div>
                <button
                  onClick={() => exportCsv('cashier_performance_report', reportRows)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"
                >
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-semibold">
                      <th className="py-2.5 px-3">Cashier</th>
                      <th className="py-2.5 px-3">Bills Billed</th>
                      <th className="py-2.5 px-3">Gross Sales</th>
                      <th className="py-2.5 px-3">Returns Processed</th>
                      <th className="py-2.5 px-3">Return Value</th>
                      <th className="py-2.5 px-3">Net Handled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportRows.map((row: any, idx: number) => {
                      const cashier = row.cashier_name || row.cashierName || 'Cashier';
                      const invCount = Number(row.sales_count ?? row.salesCount ?? row.invoices_count ?? row.invoicesCount ?? row.invoice_count ?? 0);
                      const gross = Number(row.gross_sales_minor ?? row.grossSalesMinor ?? 0);
                      const retCount = Number(row.returns_count ?? row.returnsCount ?? row.return_count ?? 0);
                      const retAmt = Number(row.returns_minor ?? row.returnsMinor ?? row.returns_total_minor ?? row.return_amount_minor ?? 0);
                      const net = Number(row.net_sales_minor ?? row.netSalesMinor ?? row.net_minor ?? (gross - retAmt));
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-800">{cashier}</td>
                          <td className="py-2.5 px-3 font-medium">{invCount} {invCount === 1 ? 'bill' : 'bills'}</td>
                          <td className="py-2.5 px-3 font-semibold">{fmt(gross)}</td>
                          <td className="py-2.5 px-3 text-rose-600 font-medium">{retCount}</td>
                          <td className="py-2.5 px-3 text-rose-600 font-medium">-{fmt(retAmt)}</td>
                          <td className="py-2.5 px-3 font-bold text-emerald-700">{fmt(net)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
