// client/src/components/common/DeveloperModeModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { KeyRound, Eye, EyeOff, ShieldAlert, Lock, X, Loader2 } from 'lucide-react';
import { unlockDeveloperMode } from '../../api.ts';
import './DeveloperModeModal.css';

interface DeveloperModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const DeveloperModeModal: React.FC<DeveloperModeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  showToast,
}) => {
  const [passcode, setPasscode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus input when modal opens & reset state
  useEffect(() => {
    if (isOpen) {
      setPasscode('');
      setError(null);
      setShowPassword(false);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setError('Please enter the developer passcode.');
      inputRef.current?.focus();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await unlockDeveloperMode(passcode.trim());
      if (res && res.success) {
        if (showToast) {
          showToast('Developer Mode unlocked! Payment gateways & module settings enabled.', 'success');
        }
        setPasscode('');
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setError('Incorrect passcode. Access denied.');
      }
    } catch (err: any) {
      const msg = err?.message || 'Incorrect passcode. Access denied.';
      setError(msg);
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="dev-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div className="dev-modal-card" role="dialog" aria-modal="true" aria-labelledby="dev-modal-title">
        <button
          type="button"
          className="dev-modal-close-btn"
          onClick={onClose}
          disabled={loading}
          title="Close dialog (Esc)"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="dev-modal-header">
          <div className="dev-modal-icon-badge">
            <KeyRound size={28} strokeWidth={2.2} />
          </div>
          <h2 id="dev-modal-title" className="dev-modal-title">
            Developer Mode
            <span className="dev-modal-title-pill">Admin</span>
          </h2>
          <p className="dev-modal-subtitle">
            Advanced System Configuration, Payment Gateways & Module Management
          </p>
        </div>

        {/* Passcode Form */}
        <form className="dev-modal-form" onSubmit={handleSubmit}>
          <div className="dev-input-group">
            <label className="dev-input-label" htmlFor="dev-passcode-input">
              <span>Developer Access Passcode</span>
            </label>

            <div className="dev-passcode-box">
              <Lock size={16} className="dev-passcode-icon" />
              <input
                id="dev-passcode-input"
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                className="dev-passcode-input"
                placeholder="Enter developer passcode..."
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (error) setError(null);
                }}
                disabled={loading}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="dev-toggle-eye-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                title={showPassword ? 'Hide passcode' : 'Show passcode'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Error Message Alert */}
          {error && (
            <div className="dev-modal-error" role="alert">
              <ShieldAlert size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="dev-modal-actions">
            <button
              type="submit"
              className="dev-btn-unlock"
              disabled={loading || !passcode.trim()}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="spin-icon" />
                  Verifying Credentials...
                </>
              ) : (
                <>
                  <KeyRound size={16} strokeWidth={2.2} />
                  Unlock Developer Access
                </>
              )}
            </button>

            <button
              type="button"
              className="dev-btn-cancel"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>

        {/* Security Note */}
        <div className="dev-modal-footer-note">
          <Lock size={12} />
          <span>Session auto-locks after 15 minutes of inactivity</span>
        </div>
      </div>
    </div>
  );
};
