import React, { useEffect, useRef } from 'react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'error';
  showCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning',
  showCancel = true,
  onConfirm,
  onCancel,
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  // Close on Escape, focus primary action
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => confirmBtnRef.current?.focus(), 50);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';
  const isError = variant === 'error';
  const isSuperAdmin = typeof document !== 'undefined' && document.body.classList.contains('theme-super-admin');

  const iconBg = (isDanger || isError) ? '#fee2e2' : isWarning ? '#fef3c7' : isSuperAdmin ? '#F3EDF3' : '#e0e7ff';
  const iconBorder = (isDanger || isError) ? '#fca5a5' : isWarning ? '#fcd34d' : isSuperAdmin ? '#D8CBD8' : '#c7d2fe';
  const iconColor = (isDanger || isError) ? '#dc2626' : isWarning ? '#d97706' : isSuperAdmin ? '#49364A' : '#4f46e5';

  const confirmBg = (isDanger || isError) ? '#dc2626' : isWarning ? '#d97706' : isSuperAdmin ? '#49364A' : '#4f46e5';
  const confirmHoverBg = (isDanger || isError) ? '#b91c1c' : isWarning ? '#b45309' : isSuperAdmin ? '#604B61' : '#4338ca';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bento-confirm-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10005,
        padding: '1rem',
        animation: 'fadeInModal 0.15s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8)',
          width: '100%',
          maxWidth: '440px',
          padding: '1.75rem',
          textAlign: 'center',
          position: 'relative',
          boxSizing: 'border-box',
          animation: 'scaleInModal 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Visual Icon Badge */}
        <div
          style={{
            width: '54px',
            height: '54px',
            borderRadius: '16px',
            background: iconBg,
            border: `1.5px solid ${iconBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem auto',
            boxShadow: `0 4px 12px ${iconBg}`,
          }}
        >
          {(isDanger || isError) ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ) : isWarning ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          )}
        </div>

        {/* Modal Header */}
        <h3
          id="bento-confirm-title"
          style={{
            margin: '0 0 0.5rem 0',
            fontSize: '1.2rem',
            fontWeight: 800,
            color: '#0f172a',
            letterSpacing: '-0.015em',
          }}
        >
          {title}
        </h3>

        {/* Modal Description */}
        <div
          style={{
            fontSize: '0.88rem',
            color: '#64748b',
            lineHeight: 1.5,
            marginBottom: '1.5rem',
            padding: '0 0.5rem',
          }}
        >
          {message}
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'center',
          }}
        >
          {showCancel && Boolean(cancelText) && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1,
                padding: '0.7rem 1.15rem',
                borderRadius: '12px',
                border: '1.5px solid #cbd5e1',
                background: '#f8fafc',
                color: '#334155',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#e2e8f0')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#f8fafc')}
            >
              {cancelText}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            style={{
              flex: showCancel && Boolean(cancelText) ? 1 : 'none',
              minWidth: showCancel && Boolean(cancelText) ? undefined : '130px',
              padding: '0.7rem 1.6rem',
              borderRadius: '12px',
              border: 'none',
              background: confirmBg,
              color: '#ffffff',
              fontSize: '0.88rem',
              fontWeight: 750,
              cursor: 'pointer',
              boxShadow: `0 4px 12px ${isDanger || isError ? 'rgba(220, 38, 38, 0.25)' : 'rgba(79, 70, 229, 0.25)'}`,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = confirmHoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.background = confirmBg)}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
