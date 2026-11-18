import { createPortal } from 'react-dom';
import React, { useEffect } from 'react';
import {
  LockIcon,
  StoreIcon,
  ClockIcon,
  CheckCircle2Icon,
  ArrowRightIcon,
  AlertTriangleIcon,
  WalletIcon,
} from '../inventory/InventoryIcons.tsx';

export interface LogoutShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCloseAndLogout: () => void;
  onReconcileFirst: () => void;
  shiftNumber?: string | null;
  counterName?: string;
  branchName?: string;
}

export const LogoutShiftModal: React.FC<LogoutShiftModalProps> = ({
  isOpen,
  onClose,
  onConfirmCloseAndLogout,
  onReconcileFirst,
  shiftNumber,
  counterName = 'Counter 1',
  branchName = 'Main Branch',
}) => {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="modal-overlay theme-cashier"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeInModal 0.18s ease-out',
      }}
    >
      <div
        className="shift-bento-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '560px',
          width: '92vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface, #FAF7F2)',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 25px 60px -15px rgba(15, 45, 46, 0.3), 0 10px 24px -5px rgba(15, 45, 46, 0.1)',
          border: '1.5px solid var(--border, #D0C7B8)',
          animation: 'scaleInModal 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Top Accent Gradient Bar */}
        <div
          style={{
            height: '4px',
            background: 'linear-gradient(90deg, var(--sidebar, #0F2D2E) 0%, var(--primary, #0F766E) 50%, var(--ring, #14B8A6) 100%)',
          }}
        />

        {/* 1. Header */}
        <div
          style={{
            padding: '1.2rem 1.6rem',
            borderBottom: '1px solid var(--border, #D0C7B8)',
            background: 'var(--surface, #FAF7F2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'rgba(217, 119, 6, 0.12)',
                color: '#d97706',
                border: '1.2px solid rgba(217, 119, 6, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(217, 119, 6, 0.15)',
                flexShrink: 0,
              }}
            >
              <AlertTriangleIcon size={22} />
            </div>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.18rem',
                  fontWeight: 800,
                  color: 'var(--sidebar, #0F2D2E)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  letterSpacing: '-0.01em',
                }}
              >
                <span>Active Register Shift Open</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '20px',
                    background: '#fef3c7',
                    color: '#b45309',
                    border: '1px solid #fde68a',
                  }}
                >
                  Shift #{shiftNumber || 'ACTIVE'}
                </span>
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted, #475569)' }}>
                You have a live register drawer currently active on this station.
              </p>
            </div>
          </div>

          <button
            type="button"
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
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 2. Body */}
        <div style={{ padding: '1.4rem 1.6rem', background: 'var(--bg, #E8E1D5)', flex: 1, overflowY: 'auto' }}>
          {/* Context Ribbon (Station & Shift Info) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem',
              marginBottom: '1.15rem',
            }}
          >
            <div
              style={{
                background: 'var(--surface, #FAF7F2)',
                border: '1px solid var(--border, #D0C7B8)',
                borderRadius: '12px',
                padding: '0.85rem 1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted, #475569)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Assigned Station
                </span>
                <StoreIcon size={13} style={{ color: 'var(--primary, #0F766E)' }} />
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--sidebar, #0F2D2E)' }}>
                {counterName}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted, #475569)' }}>
                Branch: {branchName}
              </div>
            </div>

            <div
              style={{
                background: 'var(--surface, #FAF7F2)',
                border: '1px solid var(--border, #D0C7B8)',
                borderRadius: '12px',
                padding: '0.85rem 1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted, #475569)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Drawer Status
                </span>
                <WalletIcon size={13} style={{ color: '#d97706' }} />
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#b45309', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                Shift #{shiftNumber || 'ACTIVE'}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted, #475569)' }}>
                Station currently occupied
              </div>
            </div>
          </div>

          {/* Explanation Alert Bento Box */}
          <div
            style={{
              background: 'var(--surface, #FAF7F2)',
              border: '1.5px solid var(--border, #D0C7B8)',
              borderRadius: '14px',
              padding: '1.1rem 1.25rem',
              marginBottom: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'var(--primary-soft, #E6F4F3)',
                  color: 'var(--primary, #0F766E)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <LockIcon size={16} />
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--sidebar, #0F2D2E)', marginBottom: '0.35rem' }}>
                  Release counter for the next cashier?
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #475569)', lineHeight: 1.45 }}>
                  While your shift is active, <strong>{counterName}</strong> is locked under your name. To allow your colleague or friend to select and use this counter immediately, your shift should be closed.
                </div>
              </div>
            </div>
          </div>

          {/* Action Choice Notice */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}
          >
            <div
              onClick={onConfirmCloseAndLogout}
              style={{
                background: 'var(--surface, #FAF7F2)',
                border: '1.5px solid rgba(20, 184, 166, 0.45)',
                borderRadius: '12px',
                padding: '0.9rem 1.1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                transition: 'all 0.15s ease',
                boxShadow: '0 2px 6px rgba(15, 118, 110, 0.08)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary, #0F766E)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(20, 184, 166, 0.45)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'var(--primary-soft, #E6F4F3)',
                    color: 'var(--primary, #0F766E)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CheckCircle2Icon size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--sidebar, #0F2D2E)' }}>
                    Close Shift & Logout (Recommended)
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #475569)' }}>
                    Safely closes register drawer, frees {counterName}, and logs out.
                  </div>
                </div>
              </div>
              <ArrowRightIcon size={16} style={{ color: 'var(--primary, #0F766E)', flexShrink: 0 }} />
            </div>

            <div
              onClick={onReconcileFirst}
              style={{
                background: 'var(--surface, #FAF7F2)',
                border: '1.5px solid var(--border, #D0C7B8)',
                borderRadius: '12px',
                padding: '0.9rem 1.1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary, #0F766E)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border, #D0C7B8)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.05)',
                    color: 'var(--text-muted, #475569)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ClockIcon size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--sidebar, #0F2D2E)' }}>
                    Reconcile Drawer First
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #475569)' }}>
                    Count cash, check drawer variance, and print shift closing report.
                  </div>
                </div>
              </div>
              <ArrowRightIcon size={16} style={{ color: 'var(--text-muted, #475569)', flexShrink: 0 }} />
            </div>
          </div>
        </div>

        {/* 3. Footer */}
        <div
          style={{
            padding: '1rem 1.6rem',
            borderTop: '1px solid var(--border, #D0C7B8)',
            background: 'var(--surface, #FAF7F2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          <button
            type="button"
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
              transition: 'all 0.15s ease',
            }}
          >
            Cancel
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button
              type="button"
              onClick={onReconcileFirst}
              style={{
                padding: '0.65rem 1rem',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.86rem',
                background: 'var(--primary-soft, #E6F4F3)',
                border: '1px solid rgba(20, 184, 166, 0.35)',
                color: 'var(--primary, #0F766E)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Reconcile Drawer
            </button>

            <button
              type="button"
              onClick={onConfirmCloseAndLogout}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.65rem 1.25rem',
                borderRadius: '10px',
                background: 'var(--primary, #0F766E)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 800,
                fontSize: '0.86rem',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(15, 118, 110, 0.35)',
                transition: 'all 0.15s ease',
              }}
            >
              <span>Close Shift & Logout</span>
              <ArrowRightIcon size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
