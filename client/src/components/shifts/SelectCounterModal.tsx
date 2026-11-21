import { createPortal } from 'react-dom';
import React, { useState, useEffect, useMemo } from 'react';
import {
  StoreIcon,
  UserIcon,
  MapPinIcon,
  CheckCircle2Icon,
  InfoIcon,
  ZapIcon,
  ArrowRightIcon,
  SparklesIcon,
  LayersIcon,
  LockIcon,
} from '../inventory/InventoryIcons.tsx';
import type { BranchCounterDetail } from '../../../../shared/types.ts';
import { fetchOccupiedCounters, type OccupiedCounterInfo } from '../../api.ts';

export interface SelectCounterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCounter: (counterCode: string, counterName?: string, counterId?: string) => void;
  currentCounter?: string;
  currentCounterId?: string;
  branchName: string;
  branchCode: string;
  branchId?: string;
  cashierName: string;
  availableCounters?: string[];
  counterDetails?: BranchCounterDetail[];
  canClose?: boolean;
  occupiedCounters?: OccupiedCounterInfo[];
  isLocked?: boolean;
}

interface ResolvedCounterOption {
  id: string;
  code: string;
  name: string;
  tag: string;
  desc: string;
  isExpress?: boolean;
}

export const SelectCounterModal: React.FC<SelectCounterModalProps> = ({
  isOpen,
  onClose,
  onSelectCounter,
  currentCounter = '',
  currentCounterId = '',
  branchName,
  branchCode,
  branchId,
  cashierName,
  availableCounters,
  counterDetails,
  canClose = true,
  occupiedCounters,
  isLocked = false,
}) => {
  const [occupiedList, setOccupiedList] = useState<OccupiedCounterInfo[]>(occupiedCounters || []);
  const [loadingOccupied, setLoadingOccupied] = useState(false);

  // Poll / refresh occupied counters when modal is visible (fast 2.5s polling + window focus)
  const loadOccupied = async () => {
    try {
      setLoadingOccupied(true);
      const res = await fetchOccupiedCounters(branchId);
      if (res?.ok && Array.isArray(res.occupiedCounters)) {
        setOccupiedList(res.occupiedCounters);
      }
    } catch {
      // Fallback gracefully
    } finally {
      setLoadingOccupied(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    const runLoad = async () => {
      try {
        setLoadingOccupied(true);
        const res = await fetchOccupiedCounters(branchId);
        if (active && res?.ok && Array.isArray(res.occupiedCounters)) {
          setOccupiedList(res.occupiedCounters);
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (active) setLoadingOccupied(false);
      }
    };

    runLoad();
    const interval = setInterval(runLoad, 2500);

    const onFocus = () => {
      if (active) runLoad();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [isOpen, branchId]);
  // Helper to format clean display name from code or name
  const resolveCounterNameAndTag = (code: string, rawName?: string, index: number = 0): { name: string; tag: string; desc: string; isExpress: boolean } => {
    const isExpress = (code || '').toUpperCase().includes('EXP') || (rawName || '').toLowerCase().includes('express');

    let name = rawName?.trim();
    if (!name || name === code) {
      const mNum = code.match(/(\d+)/);
      if (mNum) {
        const num = parseInt(mNum[1], 10);
        name = isExpress ? 'Express Counter' : `Counter ${num}`;
      } else {
        name = isExpress ? 'Express Counter' : `Counter ${index + 1}`;
      }
    }

    let tag = 'Standard';
    let desc = `Checkout Register (${code})`;

    if (index === 0 || code.toUpperCase().endsWith('-C01') || name.toLowerCase() === 'counter 1') {
      tag = 'Primary';
      desc = 'Main Billing Terminal • Register Lane 1';
    } else if (isExpress) {
      tag = 'Fast Track';
      desc = 'Quick Pay & Basket Only Express Lane';
    } else if (code.toUpperCase().endsWith('-C02') || name.toLowerCase() === 'counter 2') {
      tag = 'Lane 2';
      desc = 'Secondary POS Terminal • Register Lane 2';
    } else if (code.toUpperCase().endsWith('-C03') || name.toLowerCase() === 'counter 3') {
      tag = 'Lane 3';
      desc = 'Standard POS Terminal • Register Lane 3';
    }

    return { name, tag, desc, isExpress };
  };

  // Build list of active counters created for this particular branch
  const branchCountersList: ResolvedCounterOption[] = React.useMemo(() => {
    // Cashiers must only see and select cashier counters (exclude Admin Counter and Store Manager counters)
    const isExcludedForCashier = (code: string, name?: string) => {
      const c = (code || '').toUpperCase();
      const n = (name || '').toLowerCase();
      return (
        c === 'ADMIN-POS' ||
        c.endsWith('-MGR') ||
        c.includes('MGR') ||
        n.includes('admin counter') ||
        n.includes('manager counter')
      );
    };

    if (counterDetails && counterDetails.length > 0) {
      const activeDetails = counterDetails.filter(c => c.status !== 'DISABLED' && !isExcludedForCashier(c.code, c.name));
      return activeDetails.map((c, idx) => {
        const { name, tag, desc, isExpress } = resolveCounterNameAndTag(c.code, c.name, idx);
        return {
          id: c.id || c.code,
          code: c.code,
          name,
          tag,
          desc,
          isExpress,
        };
      });
    }

    if (availableCounters && availableCounters.length > 0) {
      const filtered = availableCounters.filter(codeStr => !isExcludedForCashier(codeStr));
      return filtered.map((codeStr, idx) => {
        const { name, tag, desc, isExpress } = resolveCounterNameAndTag(codeStr, undefined, idx);
        return {
          id: codeStr,
          code: codeStr,
          name,
          tag,
          desc,
          isExpress,
        };
      });
    }

    // Default fallback only if branch has not registered counters yet
    const prefix = (branchCode || 'MAIN').toUpperCase();
    return [
      { id: `${prefix}-C01`, code: `${prefix}-C01`, name: 'Counter 1', tag: 'Primary', desc: 'Main Billing Terminal • Register Lane 1' },
    ];
  }, [counterDetails, availableCounters, branchCode]);

  const [selectedCode, setSelectedCode] = useState<string>(() => {
    if (currentCounterId) {
      const match = branchCountersList.find(c => c.id === currentCounterId);
      if (match) return match.code;
    }
    if (currentCounter) {
      const match = branchCountersList.find(c => c.code.toUpperCase() === currentCounter.toUpperCase() || c.name.toLowerCase() === currentCounter.toLowerCase());
      if (match) return match.code;
      return currentCounter;
    }
    return branchCountersList[0]?.code || 'MAIN-C01';
  });

  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customCounterText, setCustomCounterText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Check if a given counter option is currently occupied by another cashier
  const getOccupantForCounter = (c: ResolvedCounterOption): OccupiedCounterInfo | null => {
    return occupiedList.find((occ) => {
      // Current cashier is not blocked by their own station
      if (occ.isCurrentUser) return false;

      // Match by counter ID
      if (occ.counterId && c.id && occ.counterId === c.id) return true;

      // Match by code (case-insensitive)
      if (occ.counter && c.code && occ.counter.trim().toUpperCase() === c.code.trim().toUpperCase()) return true;

      // Match by name
      if (occ.counterName && c.name && occ.counterName.trim().toLowerCase() === c.name.trim().toLowerCase()) return true;

      // Match normalized code or name
      const norm = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (occ.counter && c.code && norm(occ.counter) === norm(c.code)) return true;
      if (occ.counter && c.name && norm(occ.counter) === norm(c.name)) return true;
      if (occ.counterName && c.code && norm(occ.counterName) === norm(c.code)) return true;
      if (occ.counterName && c.name && norm(occ.counterName) === norm(c.name)) return true;

      return false;
    }) || null;
  };

  const isCurrentUserStation = (c: ResolvedCounterOption): boolean => {
    return occupiedList.some((occ) => {
      if (!occ.isCurrentUser) return false;
      if (occ.counterId && c.id && occ.counterId === c.id) return true;
      if (occ.counter && c.code && occ.counter.trim().toUpperCase() === c.code.trim().toUpperCase()) return true;
      const norm = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      return Boolean(occ.counter && c.code && norm(occ.counter) === norm(c.code));
    });
  };

  const availableCount = branchCountersList.filter(c => !getOccupantForCounter(c)).length;
  const occupiedCount = branchCountersList.length - availableCount;

  // Auto-switch away from an occupied counter if current selection is occupied by another cashier
  useEffect(() => {
    if (!branchCountersList.length) return;
    const curObj = branchCountersList.find(c => c.code === selectedCode);
    const occupant = curObj ? getOccupantForCounter(curObj) : null;
    if (occupant) {
      const firstAvailable = branchCountersList.find(c => !getOccupantForCounter(c));
      if (firstAvailable) {
        setSelectedCode(firstAvailable.code);
      }
    }
  }, [branchCountersList, occupiedList]);

  if (!isOpen) return null;

  const currentSelectedObj = branchCountersList.find(c => c.code === selectedCode);
  const selectedOccupant = !isCustomMode && currentSelectedObj ? getOccupantForCounter(currentSelectedObj) : null;

  const displaySelectedLabel = isCustomMode
    ? (customCounterText.trim() || 'Custom Counter')
    : currentSelectedObj
      ? `${currentSelectedObj.name} (${currentSelectedObj.code})`
      : selectedCode;

  const handleSelect = (counterCode: string) => {
    if (isLocked) {
      setError(`Billing counter is locked to "${currentSelectedObj?.name || currentCounter}" for this active session. Station cannot be changed while in active use.`);
      return;
    }
    const target = branchCountersList.find(c => c.code === counterCode);
    const occ = target ? getOccupantForCounter(target) : null;
    if (occ) {
      const occName = (occ.userName || '').trim() || 'another cashier';
      setError(`Billing counter "${target?.name || counterCode}" is currently in use by ${occName}. Please choose an available counter.`);
      loadOccupied();
      return;
    }
    setSelectedCode(counterCode);
    setIsCustomMode(false);
    setError(null);
  };

  const handleConfirm = () => {
    if (isLocked) {
      setError(`Station is locked to "${currentSelectedObj?.name || currentCounter}". Counter cannot be changed during an active billing session.`);
      return;
    }
    let finalCode = selectedCode;
    let finalName = currentSelectedObj?.name || selectedCode;
    let finalId = currentSelectedObj?.id;

    if (isCustomMode) {
      const trimmed = customCounterText.trim();
      if (!trimmed) {
        setError('Please enter a valid counter identifier or choose one from the branch counters list.');
        return;
      }
      finalCode = trimmed;
      finalName = trimmed;
    }

    if (!finalCode) {
      setError('Please select an active checkout counter for this branch before continuing.');
      return;
    }

    if (branchCountersList.length > 0) {
      const match = branchCountersList.find(c =>
        (finalId && c.id === finalId) ||
        c.code.toUpperCase() === finalCode.toUpperCase() ||
        c.name.toLowerCase() === finalName.toLowerCase()
      );
      if (!match) {
        setError('Please select an active counter belonging to this branch.');
        return;
      }
      const occ = getOccupantForCounter(match);
      if (occ) {
        const occName = (occ.userName || '').trim() || 'another cashier';
        setError(`Billing counter "${match.name}" (${match.code}) is currently in use by ${occName}. Please choose another available counter.`);
        loadOccupied();
        return;
      }
      finalCode = match.code;
      finalName = match.name;
      finalId = match.id;
    }

    onSelectCounter(finalCode, finalName, finalId);
    onClose();
  };

  return createPortal(
    <div
      className="modal-overlay theme-cashier"
      onClick={() => {
        if (canClose) onClose();
      }}
      style={{
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="shift-bento-dialog wide-1040"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '920px',
          width: '92vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface, #FAF7F2)',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 25px 60px -15px rgba(15, 45, 46, 0.28), 0 10px 24px -5px rgba(15, 45, 46, 0.08)',
          border: '1.5px solid var(--border, #D0C7B8)',
        }}
      >
        {/* Top Accent Gradient Bar */}
        <div className="modal-top-accent green-accent" style={{ height: '4px', background: 'linear-gradient(90deg, var(--sidebar, #0F2D2E) 0%, var(--primary, #0F766E) 50%, var(--ring, #14B8A6) 100%)' }}></div>

        {/* 1. Bento Header */}
        <div className="shift-bento-header" style={{ padding: '1.1rem 1.6rem', borderBottom: '1px solid var(--border, #D0C7B8)', background: 'var(--surface, #FAF7F2)' }}>
          <div className="shift-bento-header-left" style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            <div
              className="shift-bento-icon-badge green"
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '13px',
                background: 'var(--primary-soft, #E6F4F3)',
                color: 'var(--primary, #0F766E)',
                border: '1.2px solid rgba(20, 184, 166, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(15, 118, 110, 0.15)',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div className="shift-bento-title-wrap">
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--sidebar, #0F2D2E)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>{isLocked ? 'Billing Counter Station' : 'Select Billing Counter'}</span>
                <span
                  className="shift-ref-pill"
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '20px',
                    background: isLocked ? '#ecfdf5' : 'var(--primary-soft, #E6F4F3)',
                    color: isLocked ? '#047857' : 'var(--primary, #0F766E)',
                    border: isLocked ? '1px solid #a7f3d0' : '1px solid rgba(20, 184, 166, 0.35)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {isLocked && <LockIcon size={11} />}
                  <span>{isLocked ? 'Station Locked' : 'Branch Station'}</span>
                </span>
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted, #475569)' }}>
                {isLocked
                  ? 'This terminal is locked to this checkout counter for your active session. To change stations, close your shift or log out.'
                  : 'Choose the checkout station created in this branch for accurate counter sales tracking and shift data analysis.'}
              </p>
            </div>
          </div>

          <div className="shift-bento-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.25rem 0.65rem',
                borderRadius: '20px',
                background: 'var(--surface, #FAF7F2)',
                border: '1px solid var(--border, #D0C7B8)',
                fontSize: '0.74rem',
                fontWeight: 700,
                color: 'var(--text-muted, #475569)',
              }}
              title={`Branch: ${branchName} (${branchCode})`}
            >
              <MapPinIcon size={12} style={{ color: 'var(--primary, #0F766E)' }} />
              <span>{branchName || 'Main Store'}</span>
            </div>

            {canClose && (
              <button
                type="button"
                className="modal-close-btn"
                onClick={onClose}
                aria-label="Close"
                title="Close"
                style={{
                  background: 'var(--surface, #FAF7F2)',
                  border: '1px solid var(--border, #D0C7B8)',
                  borderRadius: '10px',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--text-muted, #475569)',
                  transition: 'all 0.15s ease',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* 2. Bento Body */}
        <div className="shift-bento-body" style={{ padding: '1.3rem 1.6rem', background: 'var(--bg, #E8E1D5)', flex: 1, overflowY: 'auto' }}>
          {/* Top 3-Tile Context Ribbon */}
          <div className="shift-bento-ribbon cols-3" style={{ marginBottom: '1.2rem' }}>
            <div className="shift-bento-ribbon-tile">
              <div className="ribbon-tile-label">
                <span>Active Branch</span>
                <StoreIcon size={13} style={{ color: 'var(--primary, #0F766E)' }} />
              </div>
              <div className="ribbon-tile-val" style={{ fontSize: '1.05rem', color: 'var(--sidebar, #0F2D2E)' }}>
                {branchName || 'Main Branch'}
              </div>
              <div className="ribbon-tile-sub">Location Code: {branchCode}</div>
            </div>

            <div className="shift-bento-ribbon-tile">
              <div className="ribbon-tile-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span>Station Availability</span>
                  <LayersIcon size={13} style={{ color: 'var(--primary, #0F766E)' }} />
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    loadOccupied();
                  }}
                  title="Refresh station occupancy live"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: loadingOccupied ? 'var(--primary, #0F766E)' : 'var(--text-muted, #475569)',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: loadingOccupied ? '#f59e0b' : '#10b981', display: 'inline-block' }} />
                  <span>{loadingOccupied ? 'Syncing...' : 'Live Sync'}</span>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ animation: loadingOccupied ? 'spin 1s linear infinite' : 'none' }}
                  >
                    <path d="M21 2v6h-6"></path>
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                    <path d="M3 22v-6h6"></path>
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
                  </svg>
                </button>
              </div>
              <div
                className="ribbon-tile-val"
                style={{
                  fontSize: '1.05rem',
                  color: availableCount > 0 ? 'var(--primary, #0F766E)' : '#b91c1c',
                }}
              >
                {availableCount} Available / {branchCountersList.length} Total
              </div>
              <div className="ribbon-tile-sub">
                {occupiedCount > 0
                  ? `${occupiedCount} ${occupiedCount === 1 ? 'station' : 'stations'} occupied by cashiers`
                  : `All stations free in ${branchCode}`}
              </div>
            </div>

            <div className="shift-bento-ribbon-tile highlight">
              <div className="ribbon-tile-label">
                <span>Selected Destination</span>
                <SparklesIcon size={13} style={{ color: 'var(--primary, #0F766E)' }} />
              </div>
              <div className="ribbon-tile-val" style={{ fontSize: '1.05rem', color: 'var(--primary, #0F766E)' }}>
                {displaySelectedLabel}
              </div>
              <div className="ribbon-tile-sub">Sales Analytics & Shift Target</div>
            </div>
          </div>

          {/* Error Notice */}
          {error && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                padding: '0.65rem 0.9rem',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1rem',
              }}
            >
              <InfoIcon size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Station Locked Notice Banner */}
          {isLocked && (
            <div
              style={{
                background: '#ecfdf5',
                border: '1.5px solid #a7f3d0',
                color: '#065f46',
                padding: '0.85rem 1.15rem',
                borderRadius: '12px',
                fontSize: '0.84rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '1.15rem',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.08)',
              }}
            >
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '9px',
                  background: '#d1fae5',
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <LockIcon size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: '#064e3b', fontSize: '0.88rem' }}>
                  Billing Counter Station Locked
                </div>
                <div style={{ fontSize: '0.78rem', color: '#047857', marginTop: '2px', lineHeight: 1.4 }}>
                  This terminal is locked to <strong>{currentSelectedObj?.name || currentCounter}</strong> ({currentSelectedObj?.code || currentCounter}) for your active session.
                  Once selected, counters cannot be changed while in active use to maintain drawer floats and sales audit integrity. Close shift or log out to reassign.
                </div>
              </div>
            </div>
          )}

          {/* Section Heading */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--sidebar, #0F2D2E)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Checkout Stations Created in {branchCode}
            </span>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted, #475569)' }}>
              {isLocked ? 'Counter locked for active session' : 'Click an available station to assign'}
            </span>
          </div>

          {/* Bento Cards Grid for Available Counters created in this branch */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.85rem',
              marginBottom: '1.2rem',
            }}
          >
            {branchCountersList.map((c) => {
              const occupant = getOccupantForCounter(c);
              const isOccupied = Boolean(occupant);
              const isMyStation = isCurrentUserStation(c);
              const isCardActive = !isCustomMode && selectedCode === c.code;
              const isLockedCard = isLocked && !isCardActive;

              return (
                <div
                  key={c.code}
                  className={`select-counter-card ${isCardActive && !isOccupied ? 'select-counter-card-active' : ''} ${isOccupied || isLockedCard ? 'select-counter-card-occupied' : ''}`}
                  onClick={() => {
                    if (isLocked) {
                      if (!isCardActive) {
                        setError(`Billing counter is locked to "${currentSelectedObj?.name || currentCounter}". Station cannot be changed while in active use.`);
                      }
                      return;
                    }
                    if (isOccupied) {
                      setError(`Billing station "${c.name}" (${c.code}) is currently occupied by ${occupant!.userName}. Please choose an available counter.`);
                    } else {
                      handleSelect(c.code);
                    }
                  }}
                  title={
                    isLocked
                      ? (isCardActive ? `Current Station: ${c.name} (Locked)` : `Locked: Cannot switch to ${c.name} while in active use`)
                      : (isOccupied ? `Occupied by ${occupant!.userName}` : `Select ${c.name}`)
                  }
                  style={{
                    background: isOccupied || isLockedCard
                      ? 'var(--surface-muted, #F3EDE3)'
                      : isCardActive
                        ? 'linear-gradient(135deg, var(--primary-soft, #E6F4F3) 0%, var(--surface, #FAF7F2) 100%)'
                        : 'var(--surface, #FAF7F2)',
                    border: isOccupied || isLockedCard
                      ? '1.5px dashed #D0C7B8'
                      : isCardActive
                        ? '2px solid var(--primary, #0F766E)'
                        : '1.5px solid var(--border, #D0C7B8)',
                    borderRadius: '14px',
                    padding: '1.05rem',
                    cursor: isLockedCard || isOccupied ? 'not-allowed' : 'pointer',
                    opacity: isLockedCard ? 0.5 : (isOccupied ? 0.65 : 1),
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.65rem',
                    boxShadow: isCardActive && !isOccupied
                      ? '0 8px 20px -3px rgba(15, 118, 110, 0.25), 0 2px 6px rgba(15, 118, 110, 0.1)'
                      : '0 2px 5px rgba(15, 45, 46, 0.04)',
                    transform: isCardActive && !isOccupied ? 'translateY(-2px)' : 'none',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
                    <div
                      className="counter-card-icon"
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        background: isOccupied || isLockedCard
                          ? (isOccupied ? '#fee2e2' : '#f1f5f9')
                          : isCardActive
                            ? 'var(--primary, #0F766E)'
                            : 'var(--primary-soft, #E6F4F3)',
                        color: isOccupied || isLockedCard
                          ? (isOccupied ? '#b91c1c' : '#64748b')
                          : isCardActive
                            ? '#ffffff'
                            : 'var(--primary, #0F766E)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isOccupied || isLockedCard ? (
                        <LockIcon size={18} />
                      ) : c.isExpress ? (
                        <ZapIcon size={18} />
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                          <line x1="8" y1="21" x2="16" y2="21" />
                          <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {isOccupied ? (
                        <span
                          className="counter-card-tag"
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background: '#fee2e2',
                            color: '#b91c1c',
                            border: '1px solid #fecaca',
                            letterSpacing: '0.03em',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                          Occupied • {(occupant?.userName || '').trim() || 'In Use'}
                        </span>
                      ) : isLockedCard ? (
                        <span
                          className="counter-card-tag"
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background: '#f1f5f9',
                            color: '#64748b',
                            border: '1px solid #cbd5e1',
                            letterSpacing: '0.03em',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <LockIcon size={10} />
                          Locked
                        </span>
                      ) : isMyStation ? (
                        <span
                          className="counter-card-tag"
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background: '#dcfce7',
                            color: '#15803d',
                            border: '1px solid #bbf7d0',
                            letterSpacing: '0.03em',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                          Your Station
                        </span>
                      ) : (
                        <span
                          className="counter-card-tag"
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            padding: '2px 7px',
                            borderRadius: '12px',
                            background: isCardActive ? 'var(--primary, #0F766E)' : c.isExpress ? '#fef3c7' : 'rgba(15, 118, 110, 0.12)',
                            color: isCardActive ? '#ffffff' : c.isExpress ? '#92400e' : 'var(--primary, #0F766E)',
                            letterSpacing: '0.03em',
                          }}
                        >
                          {c.tag} • Ready
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '0.2rem' }}>
                      <span style={{ fontSize: '1.05rem', fontWeight: 800, color: isOccupied || isLockedCard ? 'var(--text-muted, #64748b)' : 'var(--sidebar, #0F2D2E)' }}>
                        {c.name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          color: isOccupied || isLockedCard
                            ? '#94a3b8'
                            : isCardActive
                              ? 'var(--primary, #0F766E)'
                              : 'var(--text-muted, #475569)',
                          background: isOccupied || isLockedCard
                            ? 'rgba(0, 0, 0, 0.05)'
                            : isCardActive
                              ? 'var(--primary-soft, #E6F4F3)'
                              : 'rgba(0, 0, 0, 0.04)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          border: isCardActive && !isOccupied ? '1px solid rgba(20, 184, 166, 0.35)' : '1px solid transparent',
                        }}
                      >
                        {c.code}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: isOccupied || isLockedCard ? '#94a3b8' : 'var(--text-muted, #475569)', lineHeight: 1.35 }}>
                      {isOccupied
                        ? `Currently active under ${(occupant?.userName || '').trim() || 'another cashier'}`
                        : isLockedCard
                          ? 'Counter locked for this terminal. Reassignment disabled.'
                          : c.desc}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '0.55rem',
                      borderTop: isCardActive && !isOccupied
                        ? '1px solid rgba(15, 118, 110, 0.25)'
                        : '1px solid var(--border, #D0C7B8)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.73rem',
                        fontWeight: 700,
                        color: isOccupied
                          ? '#b91c1c'
                          : isLockedCard
                            ? '#94a3b8'
                            : isCardActive
                              ? 'var(--primary, #0F766E)'
                              : 'var(--text-muted, #475569)',
                      }}
                    >
                      {isOccupied
                        ? `In use (${(occupant?.userName || '').trim() || 'Active Cashier'})`
                        : isLockedCard
                          ? 'Station Locked'
                          : isCardActive
                            ? 'Active Station (Locked)'
                            : 'Click to select'}
                    </span>
                    <div
                      className="counter-card-radio"
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: isOccupied
                          ? '1.5px solid #fca5a5'
                          : isLockedCard
                            ? '1.5px solid #cbd5e1'
                            : isCardActive
                              ? '2px solid var(--primary, #0F766E)'
                              : '1.5px solid var(--border, #D0C7B8)',
                        background: isOccupied
                          ? '#fee2e2'
                          : isLockedCard
                            ? '#f1f5f9'
                            : isCardActive
                              ? 'var(--primary, #0F766E)'
                              : 'var(--surface, #FAF7F2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isOccupied ? '#b91c1c' : isLockedCard ? '#64748b' : '#ffffff',
                      }}
                    >
                      {isOccupied || isLockedCard ? (
                        <LockIcon size={12} />
                      ) : (
                        isCardActive && <CheckCircle2Icon size={14} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Custom Counter Option Bento Box */}
          <div
            style={{
              background: 'var(--surface, #FAF7F2)',
              border: isCustomMode ? '2px solid var(--primary, #0F766E)' : '1.5px solid var(--border, #D0C7B8)',
              borderRadius: '14px',
              padding: '1rem 1.2rem',
              boxShadow: '0 1px 3px rgba(15, 45, 46, 0.04)',
              marginBottom: '1rem',
              transition: 'all 0.18s ease',
            }}
          >
            <div
              onClick={() => {
                if (isLocked) {
                  setError(`Billing station is locked to "${currentSelectedObj?.name || currentCounter}". Station cannot be changed while in active use.`);
                  return;
                }
                setIsCustomMode(!isCustomMode);
                if (!isCustomMode && !customCounterText) {
                  setCustomCounterText(`${branchCode || 'MAIN'}-C05`);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.6 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    background: isCustomMode ? 'var(--primary-soft, #E6F4F3)' : 'rgba(0, 0, 0, 0.04)',
                    color: isCustomMode ? 'var(--primary, #0F766E)' : 'var(--text-muted, #475569)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SparklesIcon size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--sidebar, #0F2D2E)' }}>
                    Other / Dedicated Terminal Code
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted, #475569)' }}>
                    {isLocked ? 'Manual station specification disabled while session is locked' : 'Manually specify a custom counter identifier or register lane'}
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: isCustomMode ? 'var(--primary, #0F766E)' : 'var(--text-muted, #475569)',
                  background: isCustomMode ? 'var(--primary-soft, #E6F4F3)' : 'rgba(0, 0, 0, 0.05)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                }}
              >
                {isLocked ? 'Locked' : (isCustomMode ? 'Active' : 'Custom +')}
              </div>
            </div>

            {isCustomMode && !isLocked && (
              <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border, #D0C7B8)' }}>
                <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={customCounterText}
                    onChange={(e) => {
                      setCustomCounterText(e.target.value);
                      setError(null);
                    }}
                    placeholder={`e.g., ${branchCode || 'MAIN'}-C05, Kiosk 1, Drive-Through...`}
                    style={{
                      flex: 1,
                      padding: '0.65rem 0.9rem',
                      borderRadius: '10px',
                      border: '1.5px solid var(--primary, #0F766E)',
                      background: 'var(--surface, #FAF7F2)',
                      color: 'var(--text, #0F172A)',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      outline: 'none',
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customCounterText.trim()) {
                        setSelectedCode(customCounterText.trim());
                      }
                    }}
                    style={{
                      padding: '0.65rem 1rem',
                      borderRadius: '10px',
                      background: 'var(--primary, #0F766E)',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Audit & Data Collection Notice */}
          <div
            style={{
              background: 'var(--primary-soft, #E6F4F3)',
              border: '1px solid rgba(20, 184, 166, 0.35)',
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              color: 'var(--sidebar, #0F2D2E)',
              fontSize: '0.78rem',
              lineHeight: 1.4,
            }}
          >
            <InfoIcon size={16} style={{ flexShrink: 0, color: 'var(--primary, #0F766E)' }} />
            <span>
              <strong>Counter Analytics Notice:</strong> All bills, sales performance graphs, and drawer collections will be aggregated under this selected branch counter (<code>{displaySelectedLabel}</code>).
            </span>
          </div>
        </div>

        {/* 3. Bento Footer */}
        <div
          className="shift-bento-footer"
          style={{
            padding: '1rem 1.6rem',
            borderTop: '1px solid var(--border, #D0C7B8)',
            background: 'var(--surface, #FAF7F2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', color: 'var(--text-muted, #475569)' }}>
            <span>Active Counter:</span>
            <span
              className="shift-ref-pill"
              style={{
                fontWeight: 800,
                color: 'var(--primary, #0F766E)',
                background: 'var(--primary-soft, #E6F4F3)',
                padding: '3px 10px',
                borderRadius: '8px',
                border: '1px solid rgba(20, 184, 166, 0.35)',
                fontSize: '0.88rem',
              }}
            >
              {displaySelectedLabel}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {canClose && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                style={{
                  padding: '0.65rem 1.15rem',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.86rem',
                  background: 'var(--surface, #FAF7F2)',
                  border: '1px solid var(--border, #D0C7B8)',
                  color: 'var(--text-muted, #475569)',
                  cursor: 'pointer',
                }}
              >
                {isLocked ? 'Close' : 'Cancel'}
              </button>
            )}

            {!isLocked ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirm}
                disabled={Boolean(selectedOccupant)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.65rem 1.4rem',
                  borderRadius: '10px',
                  background: selectedOccupant ? '#94a3b8' : 'var(--primary, #0F766E)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  cursor: selectedOccupant ? 'not-allowed' : 'pointer',
                  opacity: selectedOccupant ? 0.6 : 1,
                  boxShadow: selectedOccupant ? 'none' : '0 4px 14px rgba(15, 118, 110, 0.35)',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{selectedOccupant ? 'Station Occupied' : 'Confirm & Start Billing'}</span>
                <ArrowRightIcon size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.65rem 1.4rem',
                  borderRadius: '10px',
                  background: 'var(--primary, #0F766E)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(15, 118, 110, 0.35)',
                  transition: 'all 0.15s ease',
                }}
              >
                <LockIcon size={14} />
                <span>Station Locked • Keep Current Counter</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
