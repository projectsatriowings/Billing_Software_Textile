import React, { useState, useEffect, useRef } from 'react';
import { searchInvoicesForReturn, fetchInvoiceReturnInfo, createReturnCreditNote } from '../../api.ts';
import { RETURN_REASONS, RETURN_CONDITIONS, REFUND_METHODS } from '../../../../shared/returns.ts';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

export interface ReturnSelectedLine {
  origInvoiceId: string;
  origInvoiceNumber: string;
  origLineId: string;
  itemId?: string;
  name: string;
  unit?: string;
  billedQtyMilli: number;
  returnableQtyMilli: number;
  returnQtyMilli: number;
  priceMinor: number;
  taxRateBp: number;
  inclusive: boolean;
  condition: 'resellable' | 'damaged' | 'defective';
  reason: string;
  remarks?: string;
  estimatedCreditMinor: number;
}

interface PosReturnExchangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectForExchange: (returnLines: ReturnSelectedLine[], invoiceNumber: string) => void;
  onReturnCompleted: (cnId: string, cnNumber: string) => void;
}

export const PosReturnExchangeModal: React.FC<PosReturnExchangeModalProps> = ({
  isOpen,
  onClose,
  onSelectForExchange,
  onReturnCompleted,
}) => {
  // Search & Lookup State
  const [lookupMode, setLookupMode] = useState<'barcode' | 'phone' | 'invoice'>('barcode');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [returnInfo, setReturnInfo] = useState<any | null>(null);

  // Camera Barcode Scanner State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  // Per-line return selection state
  // lineId -> { returnQtyUnits: number, condition: string, reason: string, remarks: string, selected: boolean }
  const [lineStates, setLineStates] = useState<Record<string, {
    selected: boolean;
    returnQtyUnits: number;
    condition: 'resellable' | 'damaged' | 'defective';
    reason: string;
    remarks: string;
  }>>({});

  // Direct return refund state
  const [actionTab, setActionTab] = useState<'exchange' | 'refund'>('exchange');
  const [refundMethod, setRefundMethod] = useState<'cash' | 'upi' | 'bank' | 'store_credit'>('cash');
  const [refundRef, setRefundRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Auto-focus barcode input when modal opens or mode changes
  useEffect(() => {
    if (isOpen && !selectedInvoice) {
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, lookupMode, selectedInvoice]);

  // Clean up camera scanner on unmount or close
  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, []);

  const playScanBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1750, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch {}
  };

  const startCameraScanner = async () => {
    setCameraError(null);
    setIsCameraActive(true);
    setTimeout(async () => {
      try {
        const qr = new Html5Qrcode('pos-return-camera-view', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
          ],
          verbose: false,
        });
        html5QrCodeRef.current = qr;
        await qr.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 280, height: 180 },
          },
          (decodedText) => {
            playScanBeep();
            stopCameraScanner();
            setSearchQuery(decodedText);
            executeSearch(decodedText);
          },
          () => {}
        );
      } catch (err: any) {
        setCameraError(err?.message || 'Unable to access camera scanner.');
        setIsCameraActive(false);
      }
    }, 150);
  };

  const stopCameraScanner = () => {
    if (html5QrCodeRef.current) {
      try {
        html5QrCodeRef.current.stop().then(() => {
          html5QrCodeRef.current?.clear();
          html5QrCodeRef.current = null;
        }).catch(() => {
          html5QrCodeRef.current = null;
        });
      } catch {
        html5QrCodeRef.current = null;
      }
    }
    setIsCameraActive(false);
  };

  const executeSearch = async (queryText?: string) => {
    const q = (queryText !== undefined ? queryText : searchQuery).trim();
    if (!q) return;
    setSearching(true);
    setErrorMsg('');
    try {
      const res = await searchInvoicesForReturn(q);
      const invoices = res.invoices || [];
      setSearchResults(invoices);
      if (invoices.length === 0) {
        setErrorMsg(`No posted bills found matching "${q}". Please verify barcode or mobile number.`);
      } else if (invoices.length === 1) {
        // Auto-select exact single match for high-speed POS scanning!
        playScanBeep();
        handleSelectInvoice(invoices[0]);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to search bills.');
    } finally {
      setSearching(false);
    }
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    executeSearch();
  };

  const handleSelectInvoice = async (inv: any) => {
    setSelectedInvoice(inv);
    setLoadingInvoice(true);
    setErrorMsg('');
    try {
      const res = await fetchInvoiceReturnInfo(inv.id);
      setReturnInfo(res);
      // Initialize line states
      const initStates: Record<string, any> = {};
      for (const l of res.lines || []) {
        const retUnits = l.returnableQtyMilli > 0 ? l.returnableQtyMilli / 1000 : 0;
        initStates[l.id] = {
          selected: retUnits > 0,
          returnQtyUnits: retUnits > 0 ? 1 : 0,
          condition: 'resellable',
          reason: 'Customer changed mind',
          remarks: '',
        };
      }
      setLineStates(initStates);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load invoice items.');
    } finally {
      setLoadingInvoice(false);
    }
  };

  const toggleLineSelect = (lineId: string, maxQtyUnits: number) => {
    setLineStates((prev) => {
      const cur = prev[lineId] || {
        selected: false,
        returnQtyUnits: maxQtyUnits > 0 ? 1 : 0,
        condition: 'resellable',
        reason: 'Customer changed mind',
        remarks: '',
      };
      return {
        ...prev,
        [lineId]: {
          ...cur,
          selected: !cur.selected,
          returnQtyUnits: cur.returnQtyUnits > 0 ? cur.returnQtyUnits : (maxQtyUnits > 0 ? 1 : 0),
        },
      };
    });
  };

  const updateLine = (lineId: string, updates: Partial<{
    returnQtyUnits: number;
    condition: 'resellable' | 'damaged' | 'defective';
    reason: string;
    remarks: string;
    selected: boolean;
  }>) => {
    setLineStates((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], ...updates },
    }));
  };

  // Compute selected items & estimated credit
  const selectedLinesList: ReturnSelectedLine[] = [];
  let totalEstimatedCreditMinor = 0;

  if (returnInfo && returnInfo.lines) {
    for (const l of returnInfo.lines) {
      const st = lineStates[l.id];
      if (st && st.selected && st.returnQtyUnits > 0) {
        const retQtyMilli = Math.round(st.returnQtyUnits * 1000);
        const billedMilli = Number(l.billedQtyMilli || 0);
        const origTotal = Number(l.origTotalMinor || 0);
        const estCredit = billedMilli > 0 ? Math.round((origTotal * retQtyMilli) / billedMilli) : 0;
        totalEstimatedCreditMinor += estCredit;

        selectedLinesList.push({
          origInvoiceId: selectedInvoice.id,
          origInvoiceNumber: selectedInvoice.number,
          origLineId: l.id,
          itemId: l.itemId,
          name: l.name,
          unit: l.unit,
          billedQtyMilli: billedMilli,
          returnableQtyMilli: Number(l.returnableQtyMilli || 0),
          returnQtyMilli: retQtyMilli,
          priceMinor: Number(l.priceMinor || 0),
          taxRateBp: Number(l.taxRateBp || 0),
          inclusive: Boolean(l.inclusive),
          condition: st.condition,
          reason: st.reason,
          remarks: st.remarks,
          estimatedCreditMinor: estCredit,
        });
      }
    }
  }

  const handleConfirmDirectReturn = async () => {
    if (selectedLinesList.length === 0) {
      setErrorMsg('Please select at least one item to return.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');
    try {
      const payloadLines = selectedLinesList.map((sl) => ({
        origLineId: sl.origLineId,
        returnQtyMilli: sl.returnQtyMilli,
        condition: sl.condition,
        restock: sl.condition === 'resellable',
        reason: sl.reason,
        remarks: sl.remarks,
      }));

      const res = await createReturnCreditNote(selectedInvoice.id, {
        lines: payloadLines,
        settlementType: refundMethod === 'store_credit' ? 'advance' : 'refund',
        refundMode: refundMethod === 'store_credit' ? undefined : refundMethod,
        refundReference: refundRef || undefined,
        note: `POS Return from ${selectedInvoice.number}`,
      });

      onReturnCompleted(res.creditNoteId, res.creditNoteNumber || res.number);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to process return.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmExchange = () => {
    if (selectedLinesList.length === 0) {
      setErrorMsg('Please select at least one item to exchange.');
      return;
    }
    onSelectForExchange(selectedLinesList, selectedInvoice.number);
    onClose();
  };

  const formatRupees = (paise: number) => {
    const rupees = (paise || 0) / 100;
    return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
      onClick={() => {
        stopCameraScanner();
        onClose();
      }}
    >
      <div
        className="modal-content bento-modal"
        style={{
          width: '95%',
          maxWidth: selectedInvoice ? '960px' : '640px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8)',
          overflow: 'hidden',
          transition: 'max-width 0.25s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================= BENTO MODAL HEADER ================= */}
        <div
          style={{
            padding: '1.2rem 1.5rem',
            background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%)',
                color: '#4f46e5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(99, 102, 241, 0.15)',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                  POS Return & Exchange Terminal
                </h3>
                <span
                  style={{
                    background: '#dcfce7',
                    color: '#15803d',
                    border: '1px solid #bbf7d0',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '0.7rem',
                    fontWeight: 750,
                    letterSpacing: '0.3px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }}></span>
                  Scanner Ready
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                Scan original bill barcode or lookup by customer mobile number to issue exchange or refund
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCameraScanner();
              onClose();
            }}
            style={{
              background: '#f1f5f9',
              border: 'none',
              color: '#64748b',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            title="Close (Esc)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* ================= BENTO MODAL BODY ================= */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
          {errorMsg && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                marginBottom: '1rem',
                fontSize: '0.84rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Lookup Selector: When no bill is currently chosen */}
          {!selectedInvoice && (
            <div>
              {/* Lookup Mode Switcher Tabs */}
              <div
                style={{
                  display: 'flex',
                  background: '#f1f5f9',
                  padding: '4px',
                  borderRadius: '12px',
                  marginBottom: '1.25rem',
                  gap: '4px',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    stopCameraScanner();
                    setLookupMode('barcode');
                    setSearchQuery('');
                  }}
                  style={{
                    flex: 1,
                    padding: '0.6rem 0.8rem',
                    borderRadius: '9px',
                    border: 'none',
                    background: lookupMode === 'barcode' ? '#ffffff' : 'transparent',
                    color: lookupMode === 'barcode' ? '#4f46e5' : '#64748b',
                    fontWeight: lookupMode === 'barcode' ? 800 : 650,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    boxShadow: lookupMode === 'barcode' ? '0 2px 5px rgba(0,0,0,0.06)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 5v14M21 5v14M7 5v14M17 5v14M11 5v14M14 5v14" />
                  </svg>
                  <span>Scan Bill Barcode</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopCameraScanner();
                    setLookupMode('phone');
                    setSearchQuery('');
                  }}
                  style={{
                    flex: 1,
                    padding: '0.6rem 0.8rem',
                    borderRadius: '9px',
                    border: 'none',
                    background: lookupMode === 'phone' ? '#ffffff' : 'transparent',
                    color: lookupMode === 'phone' ? '#4f46e5' : '#64748b',
                    fontWeight: lookupMode === 'phone' ? 800 : 650,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    boxShadow: lookupMode === 'phone' ? '0 2px 5px rgba(0,0,0,0.06)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                    <line x1="12" y1="18" x2="12.01" y2="18"></line>
                  </svg>
                  <span>Customer Mobile</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopCameraScanner();
                    setLookupMode('invoice');
                    setSearchQuery('');
                  }}
                  style={{
                    flex: 1,
                    padding: '0.6rem 0.8rem',
                    borderRadius: '9px',
                    border: 'none',
                    background: lookupMode === 'invoice' ? '#ffffff' : 'transparent',
                    color: lookupMode === 'invoice' ? '#4f46e5' : '#64748b',
                    fontWeight: lookupMode === 'invoice' ? 800 : 650,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    boxShadow: lookupMode === 'invoice' ? '0 2px 5px rgba(0,0,0,0.06)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                  <span>Bill Number</span>
                </button>
              </div>

              {/* Mode 1: DEDICATED BARCODE SCANNING VIEWFINDER ZONE */}
              {lookupMode === 'barcode' && (
                <div
                  style={{
                    border: '2px dashed #c7d2fe',
                    borderRadius: '16px',
                    background: 'linear-gradient(180deg, #f8faff 0%, #ffffff 100%)',
                    padding: '1.5rem',
                    marginBottom: '1.25rem',
                    textAlign: 'center',
                    position: 'relative',
                  }}
                >
                  {/* Visual Barcode Target Graphics */}
                  <div style={{ marginBottom: '1rem', position: 'relative', display: 'inline-block' }}>
                    <div
                      style={{
                        width: '120px',
                        height: '70px',
                        margin: '0 auto',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        background: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        boxShadow: '0 4px 10px rgba(99, 102, 241, 0.08)',
                      }}
                    >
                      {/* Barcode Lines Graphic */}
                      <svg width="84" height="42" viewBox="0 0 100 50" fill="#0f172a">
                        <rect x="5" y="0" width="3" height="50" />
                        <rect x="12" y="0" width="6" height="50" />
                        <rect x="22" y="0" width="2" height="50" />
                        <rect x="28" y="0" width="8" height="50" />
                        <rect x="40" y="0" width="4" height="50" />
                        <rect x="48" y="0" width="2" height="50" />
                        <rect x="54" y="0" width="7" height="50" />
                        <rect x="65" y="0" width="3" height="50" />
                        <rect x="72" y="0" width="9" height="50" />
                        <rect x="85" y="0" width="3" height="50" />
                        <rect x="92" y="0" width="4" height="50" />
                      </svg>
                      {/* Animated Red Laser Beam */}
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: '50%',
                          height: '2px',
                          background: 'linear-gradient(90deg, transparent, #ef4444, #dc2626, transparent)',
                          boxShadow: '0 0 8px #ef4444',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ fontWeight: 800, fontSize: '0.98rem', color: '#1e293b', marginBottom: '4px' }}>
                    Scan Bill Receipt Barcode
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', maxWidth: '420px', margin: '0 auto 1.25rem auto' }}>
                    Point your barcode scanner gun at the barcode printed at the top/bottom of the customer's bill receipt.
                  </div>

                  {/* High-Visibility Scanner Input */}
                  <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.6rem', maxWidth: '480px', margin: '0 auto' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        ref={barcodeInputRef}
                        type="text"
                        autoFocus
                        className="input"
                        placeholder="Scan barcode or type barcode number..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '0.75rem 1rem 0.75rem 2.6rem',
                          fontSize: '0.94rem',
                          borderRadius: '10px',
                          border: '2px solid #6366f1',
                          fontWeight: 700,
                          letterSpacing: '0.5px',
                          background: '#ffffff',
                          boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.12)',
                        }}
                      />
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="2.3"
                        style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }}
                      >
                        <path d="M3 5v14M21 5v14M7 5v14M17 5v14M11 5v14M14 5v14" />
                      </svg>
                    </div>
                    <button
                      type="submit"
                      disabled={searching || !searchQuery.trim()}
                      style={{
                        padding: '0.75rem 1.2rem',
                        fontWeight: 750,
                        borderRadius: '10px',
                        background: '#4f46e5',
                        color: '#ffffff',
                        border: 'none',
                        cursor: searching || !searchQuery.trim() ? 'not-allowed' : 'pointer',
                        fontSize: '0.88rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {searching ? 'Finding...' : 'Identify Bill'}
                    </button>
                  </form>

                  {/* Optional Camera Scanner Toggle */}
                  <div style={{ marginTop: '1rem' }}>
                    {!isCameraActive ? (
                      <button
                        type="button"
                        onClick={startCameraScanner}
                        style={{
                          background: 'none',
                          border: '1px solid #cbd5e1',
                          color: '#475569',
                          borderRadius: '8px',
                          padding: '0.4rem 0.85rem',
                          fontSize: '0.78rem',
                          fontWeight: 650,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                          <circle cx="12" cy="13" r="4"></circle>
                        </svg>
                        <span>Or Click to Use Device Camera Scanner</span>
                      </button>
                    ) : (
                      <div style={{ marginTop: '0.85rem' }}>
                        <div
                          id="pos-return-camera-view"
                          style={{
                            maxWidth: '360px',
                            margin: '0 auto',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            border: '2px solid #4f46e5',
                          }}
                        />
                        <button
                          type="button"
                          onClick={stopCameraScanner}
                          style={{
                            marginTop: '0.5rem',
                            background: '#fee2e2',
                            color: '#b91c1c',
                            border: '1px solid #fca5a5',
                            borderRadius: '6px',
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Stop Camera
                        </button>
                      </div>
                    )}
                    {cameraError && (
                      <div style={{ color: '#dc2626', fontSize: '0.74rem', marginTop: '4px' }}>
                        {cameraError}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Mode 2: CUSTOMER MOBILE NUMBER LOOKUP ZONE */}
              {lookupMode === 'phone' && (
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    background: '#f8fafc',
                    padding: '1.5rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>
                    Customer 10-Digit Mobile Number
                  </label>
                  <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.6rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        ref={barcodeInputRef}
                        type="tel"
                        autoFocus
                        className="input"
                        placeholder="e.g. 9876543210"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '0.75rem 1rem 0.75rem 3.4rem',
                          fontSize: '0.94rem',
                          borderRadius: '10px',
                          border: '1.5px solid #cbd5e1',
                          fontWeight: 700,
                          letterSpacing: '0.5px',
                        }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          left: '0.75rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: '0.82rem',
                          fontWeight: 800,
                          color: '#64748b',
                        }}
                      >
                        +91
                      </span>
                    </div>
                    <button
                      type="submit"
                      disabled={searching || !searchQuery.trim()}
                      style={{
                        padding: '0.75rem 1.25rem',
                        fontWeight: 750,
                        borderRadius: '10px',
                        background: '#4f46e5',
                        color: '#ffffff',
                        border: 'none',
                        cursor: searching || !searchQuery.trim() ? 'not-allowed' : 'pointer',
                        fontSize: '0.88rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {searching ? 'Finding...' : 'Find Customer Bills'}
                    </button>
                  </form>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '6px' }}>
                    Retrieves all past invoices billed to this customer phone number.
                  </div>
                </div>
              )}

              {/* Mode 3: MANUAL BILL NUMBER LOOKUP ZONE */}
              {lookupMode === 'invoice' && (
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    background: '#f8fafc',
                    padding: '1.5rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>
                    Invoice / Bill Number
                  </label>
                  <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.6rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        ref={barcodeInputRef}
                        type="text"
                        autoFocus
                        className="input"
                        placeholder="e.g. WH-1005 or INV-1001"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '0.75rem 1rem 0.75rem 2.4rem',
                          fontSize: '0.94rem',
                          borderRadius: '10px',
                          border: '1.5px solid #cbd5e1',
                          fontWeight: 700,
                        }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          left: '0.85rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: '0.9rem',
                          fontWeight: 800,
                          color: '#64748b',
                        }}
                      >
                        #
                      </span>
                    </div>
                    <button
                      type="submit"
                      disabled={searching || !searchQuery.trim()}
                      style={{
                        padding: '0.75rem 1.25rem',
                        fontWeight: 750,
                        borderRadius: '10px',
                        background: '#4f46e5',
                        color: '#ffffff',
                        border: 'none',
                        cursor: searching || !searchQuery.trim() ? 'not-allowed' : 'pointer',
                        fontSize: '0.88rem',
                      }}
                    >
                      {searching ? 'Finding...' : 'Search Bill'}
                    </button>
                  </form>
                </div>
              )}

              {/* Multiple Matching Invoices Selection List */}
              {searchResults.length > 1 && !selectedInvoice && (
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.6rem' }}>
                    Matching Invoices in Database ({searchResults.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '240px', overflowY: 'auto' }}>
                    {searchResults.map((inv) => (
                      <div
                        key={inv.id}
                        onClick={() => handleSelectInvoice(inv)}
                        style={{
                          padding: '0.85rem 1.1rem',
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          background: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#6366f1';
                          e.currentTarget.style.background = '#f5f3ff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#e2e8f0';
                          e.currentTarget.style.background = '#ffffff';
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.94rem' }}>#{inv.number}</span>
                            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                              {inv.bdate || (inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-IN') : 'Recent')}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
                            Customer: <strong>{inv.customer_name || 'Walk-in'}</strong>
                            {inv.customer_phone && (
                              <span style={{ marginLeft: '6px', color: '#16a34a', fontWeight: 600 }}>
                                (+91 {inv.customer_phone})
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.96rem' }} className="mono">
                              {formatRupees(inv.total_minor || inv.totalMinor || 0)}
                            </div>
                            <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#dcfce7', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                              Posted
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '0.35rem 0.8rem', fontSize: '0.78rem', fontWeight: 700 }}
                          >
                            Select ➔
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loading invoice items spinner */}
          {loadingInvoice && (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>⏳</div>
              <div style={{ fontWeight: 700, color: '#1e293b' }}>Loading bill items from database...</div>
              <div style={{ fontSize: '0.78rem' }}>Verifying previously returned units & remaining quantities</div>
            </div>
          )}

          {/* ================= IDENTIFIED BILL & RETURN ITEMS SELECTION ================= */}
          {selectedInvoice && returnInfo && !loadingInvoice && (
            <div>
              {/* Bento Identified Bill Summary Card */}
              <div
                style={{
                  background: 'linear-gradient(180deg, #f8faff 0%, #f1f5f9 100%)',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '14px',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  marginBottom: '1.25rem',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                      Bill #{selectedInvoice.number}
                    </span>
                    <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '1px 7px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 750 }}>
                      Verified in Database
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px' }}>
                    Customer: <strong>{selectedInvoice.customer_name || 'Walk-in Customer'}</strong>
                    {selectedInvoice.customer_phone && (
                      <span style={{ marginLeft: '6px', color: '#15803d', fontWeight: 700 }}>
                        (Mobile: +91 {selectedInvoice.customer_phone})
                      </span>
                    )}
                    <span style={{ marginLeft: '8px', color: '#94a3b8' }}>•</span>
                    <span style={{ marginLeft: '8px' }}>
                      Date: {selectedInvoice.bdate || (selectedInvoice.created_at ? new Date(selectedInvoice.created_at).toLocaleDateString('en-IN') : 'Recent')}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Original Bill Total</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }} className="mono">
                      {formatRupees(selectedInvoice.total_minor || selectedInvoice.totalMinor || 0)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedInvoice(null);
                      setReturnInfo(null);
                      setSearchResults([]);
                      setSearchQuery('');
                    }}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#475569',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="23 4 23 10 17 10"></polyline>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    <span>Scan Different Bill</span>
                  </button>
                </div>
              </div>

              {/* Items Return Table */}
              <div style={{ fontSize: '0.84rem', fontWeight: 750, color: '#334155', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Select Products to Return / Exchange:</span>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                  Check item to return and choose restock condition
                </span>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '0.65rem 0.75rem', width: '38px', textAlign: 'center' }}>Select</th>
                      <th style={{ padding: '0.65rem 0.75rem' }}>Product</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>Sold / Ret.</th>
                      <th style={{ padding: '0.65rem 0.75rem', width: '95px' }}>Return Qty</th>
                      <th style={{ padding: '0.65rem 0.75rem' }}>Condition (Restock)</th>
                      <th style={{ padding: '0.65rem 0.75rem' }}>Reason</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnInfo.lines.map((l: any) => {
                      const st = lineStates[l.id] || { selected: false, returnQtyUnits: 0, condition: 'resellable', reason: 'Customer changed mind', remarks: '' };
                      const maxUnits = Number(l.returnableQtyMilli || 0) / 1000;
                      const isReturnable = maxUnits > 0;

                      return (
                        <tr
                          key={l.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: st.selected ? '#fef2f2' : '#ffffff',
                            opacity: isReturnable ? 1 : 0.6,
                            transition: 'background 0.15s ease',
                          }}
                        >
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={st.selected}
                              disabled={!isReturnable}
                              onChange={() => toggleLineSelect(l.id, maxUnits)}
                              style={{ width: '16px', height: '16px', cursor: isReturnable ? 'pointer' : 'not-allowed' }}
                            />
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem' }}>
                            <div style={{ fontWeight: 750, color: st.selected ? '#991b1b' : '#1e293b' }}>{l.name}</div>
                            <div style={{ fontSize: '0.74rem', color: '#64748b' }} className="mono">
                              Rate: {formatRupees(l.priceMinor)} {l.inclusive ? '(Tax Incl.)' : ''}
                            </div>
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                            <div><strong className="mono">{l.billedQtyMilli / 1000}</strong> {l.unit || 'pcs'}</div>
                            <div style={{ fontSize: '0.72rem', color: l.alreadyReturnedQtyMilli > 0 ? '#dc2626' : '#94a3b8' }}>
                              {l.alreadyReturnedQtyMilli > 0 ? `Prev Ret: ${l.alreadyReturnedQtyMilli / 1000}` : 'No prior returns'}
                            </div>
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem' }}>
                            {isReturnable ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                  type="number"
                                  min={0.1}
                                  max={maxUnits}
                                  step="any"
                                  value={st.returnQtyUnits}
                                  disabled={!st.selected}
                                  onChange={(e) => updateLine(l.id, { returnQtyUnits: Math.min(maxUnits, Math.max(0, parseFloat(e.target.value) || 0)) })}
                                  style={{
                                    width: '60px',
                                    padding: '3px 6px',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    fontWeight: 750,
                                    fontSize: '0.84rem',
                                    textAlign: 'center',
                                  }}
                                />
                                <button
                                  type="button"
                                  title="Return Max Available"
                                  disabled={!st.selected}
                                  onClick={() => updateLine(l.id, { returnQtyUnits: maxUnits })}
                                  style={{
                                    background: '#f1f5f9',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '4px',
                                    padding: '2px 5px',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Max
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontStyle: 'italic' }}>Fully returned</span>
                            )}
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem' }}>
                            <select
                              value={st.condition}
                              disabled={!st.selected}
                              onChange={(e) => updateLine(l.id, { condition: e.target.value as any })}
                              style={{
                                padding: '4px 7px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                color: st.condition === 'resellable' ? '#15803d' : st.condition === 'damaged' ? '#b45309' : '#b91c1c',
                                background: '#ffffff',
                              }}
                            >
                              <option value="resellable">🟢 Resellable (Restock to Shelf)</option>
                              <option value="damaged">🟡 Damaged (Hold for Inspection)</option>
                              <option value="defective">🔴 Defective (Defective Bin)</option>
                            </select>
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <select
                                value={st.reason}
                                disabled={!st.selected}
                                onChange={(e) => updateLine(l.id, { reason: e.target.value })}
                                style={{
                                  padding: '3px 6px',
                                  borderRadius: '6px',
                                  border: '1px solid #cbd5e1',
                                  fontSize: '0.75rem',
                                  background: '#ffffff',
                                }}
                              >
                                {RETURN_REASONS.map((r) => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                placeholder="Optional remarks..."
                                value={st.remarks}
                                disabled={!st.selected}
                                onChange={(e) => updateLine(l.id, { remarks: e.target.value })}
                                style={{
                                  padding: '2px 5px',
                                  borderRadius: '6px',
                                  border: '1px solid #e2e8f0',
                                  fontSize: '0.72rem',
                                }}
                              />
                            </div>
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 800, color: '#dc2626' }} className="mono">
                            {st.selected ? `-${formatRupees(Math.round((Number(l.origTotalMinor || 0) * (st.returnQtyUnits * 1000)) / Number(l.billedQtyMilli || 1)))}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ================= ACTION TABS & SETTLEMENT SECTION ================= */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '14px',
                  padding: '1.25rem',
                }}
              >
                {/* Live Return Credit Summary Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.84rem', color: '#64748b' }}>Selected Return Items:</span>
                    <strong style={{ fontSize: '0.98rem', color: '#0f172a' }}>{selectedLinesList.length} product(s)</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '0.84rem', color: '#64748b', fontWeight: 600 }}>Total Exchange Credit:</span>
                    <strong style={{ fontSize: '1.3rem', color: '#dc2626' }} className="mono">
                      {formatRupees(totalEstimatedCreditMinor)}
                    </strong>
                  </div>
                </div>

                {/* Settle Mode Tabs */}
                <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setActionTab('exchange')}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      borderRadius: '10px',
                      border: actionTab === 'exchange' ? '2px solid #6366f1' : '1px solid #cbd5e1',
                      background: actionTab === 'exchange' ? '#eef2ff' : '#ffffff',
                      color: actionTab === 'exchange' ? '#4338ca' : '#475569',
                      fontWeight: 750,
                      fontSize: '0.86rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                      <polyline points="23 4 23 10 17 10"></polyline>
                      <polyline points="1 20 1 14 7 14"></polyline>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                    </svg>
                    <span>1. Product Exchange (Load into POS Cart)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActionTab('refund')}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      borderRadius: '10px',
                      border: actionTab === 'refund' ? '2px solid #059669' : '1px solid #cbd5e1',
                      background: actionTab === 'refund' ? '#dcfce7' : '#ffffff',
                      color: actionTab === 'refund' ? '#14532d' : '#475569',
                      fontWeight: 750,
                      fontSize: '0.86rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                      <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                      <line x1="2" y1="10" x2="22" y2="10"></line>
                    </svg>
                    <span>2. Direct Return & Cash/UPI Refund</span>
                  </button>
                </div>

                {/* Tab 1: Exchange Action */}
                {actionTab === 'exchange' && (
                  <div>
                    <p style={{ margin: '0 0 1rem 0', fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
                      The return credit of <strong>{formatRupees(totalEstimatedCreditMinor)}</strong> will be loaded directly into your active POS billing cart as negative line items. You can scan replacement items, and the system automatically calculates the net payable difference.
                    </p>
                    <button
                      type="button"
                      disabled={selectedLinesList.length === 0}
                      onClick={handleConfirmExchange}
                      style={{
                        width: '100%',
                        padding: '0.85rem',
                        borderRadius: '10px',
                        background: selectedLinesList.length === 0 ? '#94a3b8' : 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.94rem',
                        border: 'none',
                        cursor: selectedLinesList.length === 0 ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                      }}
                    >
                      <span>Apply Return Credit ({formatRupees(totalEstimatedCreditMinor)}) to POS Cart for Exchange</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                      </svg>
                    </button>
                  </div>
                )}

                {/* Tab 2: Direct Refund Action */}
                {actionTab === 'refund' && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                          Refund / Disbursement Method
                        </label>
                        <select
                          value={refundMethod}
                          onChange={(e) => setRefundMethod(e.target.value as any)}
                          style={{
                            width: '100%',
                            padding: '0.6rem 0.8rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.84rem',
                            fontWeight: 700,
                            background: '#ffffff',
                          }}
                        >
                          <option value="cash">Cash Refund (Taken from Drawer)</option>
                          <option value="upi">UPI Refund / Online Transfer</option>
                          <option value="bank">Bank Account Transfer</option>
                          <option value="store_credit">Store Credit / Customer Advance</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                          Refund Reference / UTR (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. UPI-998822 / Cash Voucher..."
                          value={refundRef}
                          onChange={(e) => setRefundRef(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.6rem 0.8rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.84rem',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={selectedLinesList.length === 0 || submitting}
                      onClick={handleConfirmDirectReturn}
                      style={{
                        width: '100%',
                        padding: '0.85rem',
                        borderRadius: '10px',
                        background: selectedLinesList.length === 0 || submitting ? '#94a3b8' : '#059669',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.94rem',
                        border: 'none',
                        cursor: selectedLinesList.length === 0 || submitting ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
                      }}
                    >
                      {submitting ? 'Processing Return & Refund...' : `Confirm Return & Refund ${formatRupees(totalEstimatedCreditMinor)} ✓`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
