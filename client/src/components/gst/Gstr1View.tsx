import React, { useState, useEffect, useMemo } from 'react';
import { fetchGstSalesRegister, downloadFile } from '../../api.ts';
import {
  TrendingUp,
  Building2,
  ShoppingBag,
  Scale,
  Search,
  FileSpreadsheet,
  Download,
  Calendar,
  AlertTriangle,
  Receipt,
  FileText,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { SpinnerIcon } from './GstIcons.tsx';
import './Gstr1View.css';

interface Gstr1ViewProps {
  onNavigate?: (tab: string, meta?: any) => void;
}

export const Gstr1View: React.FC<Gstr1ViewProps> = ({ onNavigate }) => {
  const [period, setPeriod] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [salesData, setSalesData] = useState<any>(null);
  const [b2bSearch, setB2bSearch] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchGstSalesRegister(period);
        setSalesData(data);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch GSTR-1 data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [period]);

  const b2bInvoices = useMemo(
    () => (salesData?.invoices || []).filter((inv: any) => Boolean(inv.customerGstin)),
    [salesData]
  );
  const b2cInvoices = useMemo(
    () => (salesData?.invoices || []).filter((inv: any) => !inv.customerGstin),
    [salesData]
  );

  // Filtered B2B based on live search
  const filteredB2bInvoices = useMemo(() => {
    if (!b2bSearch.trim()) return b2bInvoices;
    const q = b2bSearch.toLowerCase().trim();
    return b2bInvoices.filter(
      (inv: any) =>
        (inv.invoiceNumber || '').toLowerCase().includes(q) ||
        (inv.customerName || '').toLowerCase().includes(q) ||
        (inv.customerGstin || '').toLowerCase().includes(q)
    );
  }, [b2bInvoices, b2bSearch]);

  // B2B Aggregates
  const b2bTaxable = b2bInvoices.reduce((acc: number, inv: any) => acc + (inv.taxableMinor || 0), 0);
  const b2bCgst = b2bInvoices.reduce((acc: number, inv: any) => acc + (inv.cgstMinor || 0), 0);
  const b2bSgst = b2bInvoices.reduce((acc: number, inv: any) => acc + (inv.sgstMinor || 0), 0);
  const b2bIgst = b2bInvoices.reduce((acc: number, inv: any) => acc + (inv.igstMinor || 0), 0);
  const b2bTotal = b2bInvoices.reduce((acc: number, inv: any) => acc + (inv.totalMinor || 0), 0);

  // B2C Aggregates
  const b2cTaxable = b2cInvoices.reduce((acc: number, inv: any) => acc + (inv.taxableMinor || 0), 0);
  const b2cCgst = b2cInvoices.reduce((acc: number, inv: any) => acc + (inv.cgstMinor || 0), 0);
  const b2cSgst = b2cInvoices.reduce((acc: number, inv: any) => acc + (inv.sgstMinor || 0), 0);
  const b2cIgst = b2cInvoices.reduce((acc: number, inv: any) => acc + (inv.igstMinor || 0), 0);
  const b2cTotal = b2cInvoices.reduce((acc: number, inv: any) => acc + (inv.totalMinor || 0), 0);

  // Grand Totals
  const grandTaxable = b2bTaxable + b2cTaxable;
  const grandCgst = b2bCgst + b2cCgst;
  const grandSgst = b2bSgst + b2cSgst;
  const grandIgst = b2bIgst + b2cIgst;
  const grandTax = grandCgst + grandSgst + grandIgst;
  const totalBillsCount = b2bInvoices.length + b2cInvoices.length;

  const formatRupees = (minor: number) => {
    return '₹' + (minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="gstr1-bento-container">
      {/* ── 1. TOP CONTROL BAR ── */}
      <div className="gstr1-control-bar">
        <div className="gstr1-control-left">
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('gst-sales-register')}
              className="gstr1-action-btn-outline"
              title="Open invoice-by-invoice detailed outward register"
            >
              <FileSpreadsheet size={16} />
              <span>Itemized Sales Register</span>
            </button>
          )}

          <div className="gstr1-status-pill">
            <span className="gstr1-pulse-dot" />
            <span>GSTR-1 Outward Filing</span>
          </div>
        </div>

        <div className="gstr1-control-right">
          <div className="gstr1-period-picker-wrap">
            <Calendar size={15} className="text-slate-500" />
            <span className="gstr1-period-label">Return Period:</span>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="gstr1-month-input"
            />
          </div>

          <button
            type="button"
            onClick={async () => {
              try {
                setExporting(true);
                await downloadFile(
                  `/api/gst/sales-register/export?period=${encodeURIComponent(period)}`,
                  `GSTR1_Sales_Register_${period}.csv`
                );
              } catch (err: any) {
                alert(`Export failed: ${err.message}`);
              } finally {
                setExporting(false);
              }
            }}
            disabled={exporting}
            className="gstr1-export-btn"
          >
            {exporting ? <SpinnerIcon size={16} /> : <Download size={16} />}
            <span>{exporting ? 'Generating CSV...' : 'Download GSTR-1 CSV'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="gstr1-bento-card gstr1-empty-state">
          <div className="gstr1-empty-icon-box">
            <SpinnerIcon size={24} />
          </div>
          <div className="text-sm font-bold text-slate-800">Loading GSTR-1 Return Worksheets...</div>
          <div className="text-xs text-slate-500 mt-1">Aggregating Table 4 (B2B) and Table 7 (B2C) sales for {period}</div>
        </div>
      ) : error ? (
        <div className="gstr1-bento-card p-6 flex items-center gap-3 border-rose-200 bg-rose-50/60 text-rose-800">
          <AlertTriangle size={24} className="text-rose-600 flex-shrink-0" />
          <div>
            <div className="text-sm font-bold">Failed to load GSTR-1 worksheets</div>
            <div className="text-xs text-rose-600 mt-0.5">{error}</div>
          </div>
        </div>
      ) : (
        <>
          {/* ── 2. EXECUTIVE BENTO KPI OVERVIEW (4 TILES) ── */}
          <div className="gstr1-kpi-bento-grid">
            {/* Bento Tile 1: Total Taxable Turnover */}
            <div className="gstr1-kpi-tile tile-turnover">
              <div>
                <div className="gstr1-kpi-top">
                  <div className="gstr1-kpi-icon-box icon-box-emerald">
                    <TrendingUp size={22} />
                  </div>
                  <span className="gstr1-kpi-badge font-mono">Table 4 + 7</span>
                </div>
                <div className="gstr1-kpi-label">Total Taxable Turnover</div>
                <div className="gstr1-kpi-val text-emerald-800 font-mono">
                  {formatRupees(grandTaxable)}
                </div>
              </div>
              <div className="gstr1-kpi-footer">
                <span>{totalBillsCount} total invoices / bills</span>
                <span className="font-semibold text-emerald-700">Gross: {formatRupees(grandTaxable + grandTax)}</span>
              </div>
            </div>

            {/* Bento Tile 2: Table 4 B2B Commercial Invoices */}
            <div className="gstr1-kpi-tile tile-b2b">
              <div>
                <div className="gstr1-kpi-top">
                  <div className="gstr1-kpi-icon-box icon-box-indigo">
                    <Building2 size={22} />
                  </div>
                  <span className="gstr1-kpi-badge font-mono">Table 4</span>
                </div>
                <div className="gstr1-kpi-label">B2B Registered Invoices</div>
                <div className="gstr1-kpi-val text-indigo-700 font-mono">
                  {formatRupees(b2bTaxable)}
                </div>
              </div>
              <div className="gstr1-kpi-footer">
                <span>{b2bInvoices.length} Registered Buyers (GSTIN)</span>
                <span className="font-semibold text-indigo-600">Tax: {formatRupees(b2bCgst + b2bSgst + b2bIgst)}</span>
              </div>
            </div>

            {/* Bento Tile 3: Table 7 B2C Retail Sales */}
            <div className="gstr1-kpi-tile tile-b2c">
              <div>
                <div className="gstr1-kpi-top">
                  <div className="gstr1-kpi-icon-box icon-box-sky">
                    <ShoppingBag size={22} />
                  </div>
                  <span className="gstr1-kpi-badge font-mono">Table 7</span>
                </div>
                <div className="gstr1-kpi-label">B2C Retail Consumer Sales</div>
                <div className="gstr1-kpi-val text-sky-800 font-mono">
                  {formatRupees(b2cTaxable)}
                </div>
              </div>
              <div className="gstr1-kpi-footer">
                <span>{b2cInvoices.length} Counter Sales</span>
                <span className="font-semibold text-sky-700">Tax: {formatRupees(b2cCgst + b2cSgst + b2cIgst)}</span>
              </div>
            </div>

            {/* Bento Tile 4: Total Tax Liability */}
            <div className="gstr1-kpi-tile tile-tax">
              <div>
                <div className="gstr1-kpi-top">
                  <div className="gstr1-kpi-icon-box icon-box-purple">
                    <Scale size={22} />
                  </div>
                  <span className="gstr1-kpi-badge font-mono">Total Tax</span>
                </div>
                <div className="gstr1-kpi-label">Total GST Output Liability</div>
                <div className="gstr1-kpi-val text-purple-700 font-mono">
                  {formatRupees(grandTax)}
                </div>
              </div>
              <div className="gstr1-tax-chips">
                <span className="gstr1-tax-chip">CGST: {formatRupees(grandCgst)}</span>
                <span className="gstr1-tax-chip">SGST: {formatRupees(grandSgst)}</span>
                {grandIgst > 0 && <span className="gstr1-tax-chip">IGST: {formatRupees(grandIgst)}</span>}
              </div>
            </div>
          </div>

          {/* ── 3. TABLE 4: B2B INVOICES BENTO CARD ── */}
          <div className="gstr1-bento-card">
            <div className="gstr1-bento-header">
              <div className="gstr1-bento-header-left">
                <div className="gstr1-section-icon-box icon-box-indigo">
                  <Building2 size={20} />
                </div>
                <div>
                  <h2 className="gstr1-bento-title">Table 4: B2B Invoices (Supplies to Registered Persons)</h2>
                  <p className="gstr1-bento-subtitle">Invoices containing valid recipient GSTIN for GSTR-1 e-filing</p>
                </div>
              </div>

              <div className="gstr1-bento-header-right">
                <div className="gstr1-search-input-wrap">
                  <Search size={14} className="gstr1-search-icon" />
                  <input
                    type="text"
                    value={b2bSearch}
                    onChange={(e) => setB2bSearch(e.target.value)}
                    placeholder="Search invoice, customer, GSTIN..."
                    className="gstr1-search-input"
                  />
                </div>

                <div className="gstr1-count-chip">
                  <span>{b2bInvoices.length} Invoices</span>
                  <span>·</span>
                  <span className="font-mono">Taxable: {formatRupees(b2bTaxable)}</span>
                </div>
              </div>
            </div>

            {b2bInvoices.length === 0 ? (
              <div className="gstr1-empty-state">
                <div className="gstr1-empty-icon-box">
                  <FileText size={24} />
                </div>
                <div className="text-sm font-semibold text-slate-700">No B2B Invoices in this Period</div>
                <div className="text-xs text-slate-400 mt-1">Invoices issued to registered business customers with GSTIN will appear here.</div>
              </div>
            ) : filteredB2bInvoices.length === 0 ? (
              <div className="gstr1-empty-state">
                <div className="gstr1-empty-icon-box">
                  <Search size={24} />
                </div>
                <div className="text-sm font-semibold text-slate-700">No Invoices Match "{b2bSearch}"</div>
                <button
                  type="button"
                  onClick={() => setB2bSearch('')}
                  className="mt-2 text-xs font-bold text-teal-700 hover:underline"
                >
                  Clear search filter
                </button>
              </div>
            ) : (
              <div className="gstr1-table-scroll">
                <table className="gstr1-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Date</th>
                      <th>Customer Name</th>
                      <th>Recipient GSTIN</th>
                      <th style={{ textAlign: 'right' }}>Taxable Value</th>
                      <th style={{ textAlign: 'right' }}>CGST</th>
                      <th style={{ textAlign: 'right' }}>SGST</th>
                      <th style={{ textAlign: 'right' }}>IGST</th>
                      <th style={{ textAlign: 'right', fontWeight: 800 }}>Invoice Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredB2bInvoices.map((inv: any) => (
                      <tr key={inv.id || inv.invoiceNumber}>
                        <td>
                          <span className="gstr1-inv-pill">{inv.invoiceNumber}</span>
                        </td>
                        <td className="font-mono text-slate-500">{inv.invoiceDate}</td>
                        <td className="font-semibold text-slate-800">{inv.customerName || '—'}</td>
                        <td>
                          <span className="gstr1-gstin-code">{inv.customerGstin}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                          {formatRupees(inv.taxableMinor || 0)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#4f46e5' }}>
                          {formatRupees(inv.cgstMinor || 0)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#4f46e5' }}>
                          {formatRupees(inv.sgstMinor || 0)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                          {formatRupees(inv.igstMinor || 0)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#0f172a' }}>
                          {formatRupees(inv.totalMinor || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}>
                        Total B2B ({filteredB2bInvoices.length} invoices)
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {formatRupees(
                          filteredB2bInvoices.reduce((acc: number, i: any) => acc + (i.taxableMinor || 0), 0)
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#4f46e5' }}>
                        {formatRupees(
                          filteredB2bInvoices.reduce((acc: number, i: any) => acc + (i.cgstMinor || 0), 0)
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#4f46e5' }}>
                        {formatRupees(
                          filteredB2bInvoices.reduce((acc: number, i: any) => acc + (i.sgstMinor || 0), 0)
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {formatRupees(
                          filteredB2bInvoices.reduce((acc: number, i: any) => acc + (i.igstMinor || 0), 0)
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800 }}>
                        {formatRupees(
                          filteredB2bInvoices.reduce((acc: number, i: any) => acc + (i.totalMinor || 0), 0)
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ── 4. TABLE 7: B2C (OTHERS) BENTO CARD & 4-TILE BENTO GRID ── */}
          <div className="gstr1-bento-card">
            <div className="gstr1-bento-header">
              <div className="gstr1-bento-header-left">
                <div className="gstr1-section-icon-box icon-box-sky">
                  <Receipt size={20} />
                </div>
                <div>
                  <h2 className="gstr1-bento-title">Table 7: B2C (Others) — Supplies to Unregistered Consumers</h2>
                  <p className="gstr1-bento-subtitle">Consolidated retail counter transactions without customer GSTIN</p>
                </div>
              </div>

              <div className="gstr1-bento-header-right">
                <span className="gstr1-count-chip">
                  <Sparkles size={13} />
                  <span>Consolidated Counter Sales</span>
                </span>
              </div>
            </div>

            {/* 4-Tile Bento Grid with 3D depth and hover effects */}
            <div className="gstr1-b2c-bento-grid">
              {/* Tile 1: Bills Count */}
              <div className="gstr1-b2c-card card-amber">
                <div>
                  <div className="gstr1-b2c-card-header">
                    <div className="gstr1-b2c-icon-badge badge-amber">
                      <Receipt size={20} />
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-full">
                      Counter Bills
                    </span>
                  </div>
                  <div className="gstr1-b2c-label">B2C Bills Count</div>
                  <div className="gstr1-b2c-val text-amber-900 font-mono">
                    {b2cInvoices.length}
                  </div>
                </div>
                <div className="gstr1-b2c-desc">
                  Consolidated retail transactions across all POS registers
                </div>
              </div>

              {/* Tile 2: Taxable Value */}
              <div className="gstr1-b2c-card card-teal">
                <div>
                  <div className="gstr1-b2c-card-header">
                    <div className="gstr1-b2c-icon-badge badge-teal">
                      <TrendingUp size={20} />
                    </div>
                    <span className="text-xs font-mono font-bold text-teal-700 bg-teal-100/70 px-2 py-0.5 rounded-full">
                      Net Taxable
                    </span>
                  </div>
                  <div className="gstr1-b2c-label">Taxable Value</div>
                  <div className="gstr1-b2c-val text-teal-900 font-mono">
                    {formatRupees(b2cTaxable)}
                  </div>
                </div>
                <div className="gstr1-b2c-desc">
                  Net taxable turnover from retail counter billing
                </div>
              </div>

              {/* Tile 3: Central Tax (CGST) */}
              <div className="gstr1-b2c-card card-indigo">
                <div>
                  <div className="gstr1-b2c-card-header">
                    <div className="gstr1-b2c-icon-badge badge-indigo">
                      <Scale size={20} />
                    </div>
                    <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-full">
                      Central (50%)
                    </span>
                  </div>
                  <div className="gstr1-b2c-label">Central Tax (CGST)</div>
                  <div className="gstr1-b2c-val text-indigo-700 font-mono">
                    {formatRupees(b2cCgst)}
                  </div>
                </div>
                <div className="gstr1-b2c-desc">
                  Intra-state central tax component collected on consumer sales
                </div>
              </div>

              {/* Tile 4: State/UT Tax (SGST) */}
              <div className="gstr1-b2c-card card-purple">
                <div>
                  <div className="gstr1-b2c-card-header">
                    <div className="gstr1-b2c-icon-badge badge-purple">
                      <Scale size={20} />
                    </div>
                    <span className="text-xs font-mono font-bold text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded-full">
                      State / UT (50%)
                    </span>
                  </div>
                  <div className="gstr1-b2c-label">State / UT Tax (SGST)</div>
                  <div className="gstr1-b2c-val text-purple-700 font-mono">
                    {formatRupees(b2cSgst)}
                  </div>
                </div>
                <div className="gstr1-b2c-desc">
                  Intra-state state tax component collected on consumer sales
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
