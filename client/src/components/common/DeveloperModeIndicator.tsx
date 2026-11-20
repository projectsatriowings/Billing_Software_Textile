// client/src/components/common/DeveloperModeIndicator.tsx
import React, { useState } from 'react';
import { KeyRound, Lock, Unlock, Loader2 } from 'lucide-react';
import { lockDeveloperMode } from '../../api.ts';
import './DeveloperModeIndicator.css';

interface DeveloperModeIndicatorProps {
  isDeveloperMode: boolean;
  onLock: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const DeveloperModeIndicator: React.FC<DeveloperModeIndicatorProps> = ({
  isDeveloperMode,
  onLock,
  showToast,
}) => {
  const [locking, setLocking] = useState(false);

  if (!isDeveloperMode) return null;

  const handleLock = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (locking) return;
    setLocking(true);
    try {
      await lockDeveloperMode();
      onLock();
      if (showToast) {
        showToast('Developer Mode locked. Returned to normal client interface.', 'info');
      }
    } catch {
      onLock();
    } finally {
      setLocking(false);
    }
  };

  return (
    <div
      className="dev-indicator-badge"
      title="Developer Mode is active: System Module Management is unlocked. Click Lock to return to standard client mode."
    >
      <span className="dev-indicator-pulse-dot" />
      <KeyRound size={13} className="dev-indicator-icon" strokeWidth={2.4} />
      <span className="dev-indicator-text">DEV MODE</span>
      <button
        type="button"
        className="dev-indicator-lock-btn"
        onClick={handleLock}
        disabled={locking}
        title="Lock Developer Mode immediately"
      >
        {locking ? <Loader2 size={11} className="spin-icon" /> : <Lock size={11} />}
        <span>Lock</span>
      </button>
    </div>
  );
};
