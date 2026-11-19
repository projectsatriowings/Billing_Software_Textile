import React, { useState } from 'react';
import { api, setToken, type User, type Shop } from '../api';
import './auth/modernLogin.css';

// Crisp inline SVG Icons to eliminate all unicode emojis
const CrownIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" />
    <path d="M3 20h18" strokeWidth="2.4" />
  </svg>
);

const StoreIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const CashierIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="4" width="20" height="16" rx="3" />
    <line x1="2" y1="10" x2="22" y2="10" />
    <line x1="6" y1="15" x2="10" y2="15" />
    <line x1="14" y1="15" x2="18" y2="15" />
  </svg>
);

const LightningBoltIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

const MailIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const UserIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const LockIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ShieldLockIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const ArrowRightIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const RoleIcon: React.FC<{ role: string; size?: number; className?: string }> = ({ role, size = 16, className = '' }) => {
  if (role === 'super-admin' || role === 'super_admin') return <CrownIcon size={size} className={className} />;
  if (role === 'store-manager' || role === 'store_manager') return <StoreIcon size={size} className={className} />;
  return <CashierIcon size={size} className={className} />;
};

interface LoginPageProps {
  initialRole?: 'super_admin' | 'store_manager' | 'cashier';
  onSuccess: (data: { token: string; user: User; shop: Shop }) => void;
  onNavigateRegister: () => void;
  onBackToHome: () => void;
  onRequirePasswordChange?: (params: {
    changeToken: string;
    tempPassword?: string;
    identifier?: string;
  }) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  initialRole,
  onSuccess,
  onNavigateRegister,
  onBackToHome,
  onRequirePasswordChange,
}) => {
  const detectInitialRole = (): 'super_admin' | 'store_manager' | 'cashier' | 'cashier2' => {
    if (initialRole) return initialRole as any;
    try {
      const hash = (typeof window !== 'undefined' ? window.location.hash : '').toLowerCase();
      const search = (typeof window !== 'undefined' ? window.location.search : '').toLowerCase();
      if (hash.includes('cashier2') || search.includes('cashier2')) return 'cashier2';
      if (hash.includes('cashier') || search.includes('cashier')) return 'cashier';
      if (hash.includes('manager') || search.includes('manager')) return 'store_manager';
    } catch { }
    return 'super_admin';
  };

  const [selectedRole, setSelectedRole] = useState<'super_admin' | 'store_manager' | 'cashier' | 'cashier2'>(detectInitialRole);
  const [email, setEmail] = useState(() => {
    const role = detectInitialRole();
    if (role === 'cashier') return 'cashier@billing.local';
    if (role === 'cashier2') return 'lakshmi@billing.local';
    if (role === 'store_manager') return 'manager@billing.local';
    return 'demo@billing.local';
  });
  const [password, setPassword] = useState('Password123!');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRoleTabChange = (role: 'super_admin' | 'store_manager' | 'cashier' | 'cashier2') => {
    setSelectedRole(role);
    setError('');
    if (role === 'super_admin') {
      setEmail('demo@billing.local');
      setPassword('Password123!');
    } else if (role === 'store_manager') {
      setEmail('manager@billing.local');
      setPassword('Password123!');
    } else if (role === 'cashier2') {
      setEmail('lakshmi@billing.local');
      setPassword('Password123!');
    } else {
      setEmail('cashier@billing.local');
      setPassword('Password123!');
    }
  };

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotStatus, setForgotStatus] = useState<{ message: string; isError?: boolean } | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please provide both your email and password.');
      return;
    }

    setIsLoading(true);
    try {
      const data = await api<{
        token?: string;
        user?: User;
        shop?: Shop;
        requirePasswordChange?: boolean;
        changeToken?: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), identifier: email.trim(), password }),
      });

      if (data.requirePasswordChange && data.changeToken) {
        if (onRequirePasswordChange) {
          onRequirePasswordChange({
            changeToken: data.changeToken,
            tempPassword: password,
            identifier: email.trim(),
          });
        }
        return;
      }

      if (data.token && data.user && data.shop) {
        setToken(data.token);
        onSuccess(data as { token: string; user: User; shop: Shop });
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid email or password. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      setForgotStatus({ message: 'Please enter your username or registered email address.', isError: true });
      return;
    }

    setIsSendingReset(true);
    setForgotStatus(null);
    try {
      await api<{ ok: boolean; message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ identifier: forgotIdentifier.trim() }),
      });
      setForgotStatus({
        message: "If an account with this identifier exists, a password reset link has been dispatched to your email.",
        isError: false,
      });
    } catch (err: any) {
      setForgotStatus({
        message: err?.message || 'Unable to process password reset request at this time.',
        isError: true,
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  const isCashier = selectedRole === 'cashier' || selectedRole === 'cashier2';
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const roleMeta: Record<string, {
    key: string;
    image: string | null;
    title: string;
    subtitle: string;
    heroTitle: string;
    heroSubtitle: string;
    inputLabel: string;
    placeholder: string;
    btnText: string;
    badge: string;
    securityTag: string;
  }> = {
    super_admin: {
      key: 'super-admin',
      image: null,
      title: 'Super Admin Portal',
      subtitle: 'Enterprise headquarters: consolidated sales, multi-branch network & governance.',
      heroTitle: 'Consolidated Enterprise Control.',
      heroSubtitle: 'Manage headquarters sales, branch inventory and company governance all in one real-time workspace.',
      inputLabel: 'Super Admin Email',
      placeholder: 'demo@billing.local',
      btnText: 'Log In as Super Admin',
      badge: 'HQ Super Admin',
      securityTag: 'HQ Executive Clearance',
    },
    store_manager: {
      key: 'store-manager',
      image: '/images/manager.png',
      title: 'Store Manager Portal',
      subtitle: 'Branch operations: register closing approvals, cash float audits & staff supervision.',
      heroTitle: 'Keep In Touch With Your Store.',
      heroSubtitle: 'Monitor live cashier counters, balance register floats, and approve daily shift audits seamlessly.',
      inputLabel: 'Store Manager Username or Email',
      placeholder: 'manager@billing.local',
      btnText: 'Log In as Store Manager',
      badge: 'Store Manager',
      securityTag: 'Branch Operations Clearance',
    },
    cashier: {
      key: 'cashier',
      image: '/images/cashier.png',
      title: 'Cashier Billing Counter',
      subtitle: 'High-speed retail checkout, cash drawer shift balancing & rapid barcode billing.',
      heroTitle: 'High-Speed Cashier POS.',
      heroSubtitle: 'Instant barcode scanning, customer-facing display sync & offline transaction buffering.',
      inputLabel: 'Cashier Employee ID or Email',
      placeholder: 'cashier@billing.local',
      btnText: selectedRole === 'cashier2' ? 'Log In as Cashier 2 (Lakshmi)' : 'Log In as Cashier',
      badge: 'Cashier Station',
      securityTag: 'POS Register Terminal',
    },
  };

  const currentMeta = isCashier
    ? roleMeta.cashier
    : selectedRole === 'store_manager'
    ? roleMeta.store_manager
    : roleMeta.super_admin;

  return (
    <div className="modern-login-page">
      <div className={`modern-login-card role-${currentMeta.key}`}>
        {/* ------------------------------------------------------------------
            LEFT HALF: USER'S GENERATED IMAGE DISPLAY / BRANDING
            ------------------------------------------------------------------ */}
        {(() => {
          const hasImage = Boolean(currentMeta.image && !failedImages[currentMeta.image]);
          return (
            <div className={`modern-login-left ${hasImage ? 'has-image' : 'text-only-layout'}`}>
              {hasImage && currentMeta.image ? (
                <img
                  key={currentMeta.image}
                  src={currentMeta.image}
                  alt={`${currentMeta.title} Illustration`}
                  className="user-login-image"
                  onError={() => {
                    setFailedImages((prev) => ({ ...prev, [currentMeta.image!]: true }));
                  }}
                />
              ) : (
                <div className="modern-login-top-wordings">
                  <div className="modern-left-badge">
                    <RoleIcon role={currentMeta.key} size={15} />
                    <span>{currentMeta.badge}</span>
                  </div>
                  <h1 className="modern-left-heading">{currentMeta.heroTitle}</h1>
                  <p className="modern-left-subtitle">{currentMeta.heroSubtitle}</p>
                  <div className="modern-left-feature-chips">
                    <span className="modern-left-chip">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Multi-Branch Consolidation
                    </span>
                    <span className="modern-left-chip">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Audit &amp; Reconciliation Controls
                    </span>
                    <span className="modern-left-chip">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Real-Time Headquarter Sync
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ------------------------------------------------------------------
            RIGHT HALF: CLEAN MODERN LOGIN FORM (Matching Image 2 Reference)
            ------------------------------------------------------------------ */}
        <div className="modern-login-right">
          <div className="modern-login-form-inner">
            {/* Top Navigation Row */}
            <div className="modern-login-top-row">
              <div className="modern-brand-logo" onClick={onBackToHome}>
                <div className="modern-brand-icon">
                  <LightningBoltIcon size={17} />
                </div>
                <div className="modern-brand-text-block">
                  <span className="modern-brand-title">Adaptive Billing</span>
                  <span className="modern-brand-badge">ENTERPRISE</span>
                </div>
              </div>

              <button
                type="button"
                className="modern-btn-back"
                onClick={onBackToHome}
                title="Return to home page"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                <span>Back to Home</span>
              </button>
            </div>

            {/* Elevated Form Card */}
            <div className="modern-form-card">
              {/* 3 Role Selection Segmented Tabs with Icons */}
              <div className="modern-role-tabs-strip">
                <button
                  type="button"
                  className={`modern-role-tab tab-super-admin ${selectedRole === 'super_admin' ? 'active' : ''}`}
                  onClick={() => handleRoleTabChange('super_admin')}
                >
                  <CrownIcon size={15} className="role-tab-icon" />
                  <span>Super Admin</span>
                </button>

                <button
                  type="button"
                  className={`modern-role-tab tab-store-manager ${selectedRole === 'store_manager' ? 'active' : ''}`}
                  onClick={() => handleRoleTabChange('store_manager')}
                >
                  <StoreIcon size={15} className="role-tab-icon" />
                  <span>Store Manager</span>
                </button>

                <button
                  type="button"
                  className={`modern-role-tab tab-cashier ${isCashier ? 'active' : ''}`}
                  onClick={() => handleRoleTabChange('cashier')}
                >
                  <CashierIcon size={15} className="role-tab-icon" />
                  <span>Cashier Counter</span>
                </button>
              </div>

              {/* Form Title & Clearance Pill */}
              <div className="modern-form-heading-block">
                <div className="modern-security-badge">
                  <span className="security-pulse-dot" />
                  <span>{currentMeta.securityTag}</span>
                </div>
                <h2 className="modern-form-title">{currentMeta.title}</h2>
                <p className="modern-form-subtitle">{currentMeta.subtitle}</p>
              </div>

            {error && (
              <div className="modern-error-banner" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Main Login Form */}
            <form onSubmit={handleSubmit} className="modern-auth-form">
              <div className="modern-input-group">
                <label className="modern-label" htmlFor="modern-login-email">
                  <span className="modern-label-title">{currentMeta.inputLabel}</span>
                  <span className="req-pill">Required</span>
                </label>
                <div className="modern-input-wrapper">
                  <div className="modern-input-icon-slot">
                    {selectedRole === 'super_admin' ? (
                      <MailIcon size={17} />
                    ) : (
                      <UserIcon size={17} />
                    )}
                  </div>
                  <input
                    id="modern-login-email"
                    type={selectedRole === 'super_admin' ? 'email' : 'text'}
                    className="modern-input"
                    required
                    autoFocus
                    placeholder={currentMeta.placeholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete={isCashier ? 'username' : 'email'}
                  />
                </div>
              </div>

              <div className="modern-input-group">
                <label className="modern-label" htmlFor="modern-login-password">
                  <span className="modern-label-title">Password</span>
                  <span className="req-pill">Required</span>
                </label>
                <div className="modern-input-wrapper">
                  <div className="modern-input-icon-slot">
                    <LockIcon size={17} />
                  </div>
                  <input
                    id="modern-login-password"
                    type={showPassword ? 'text' : 'password'}
                    className="modern-input"
                    required
                    placeholder="Enter your security password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="modern-pwd-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="modern-options-row">
                <label className="modern-checkbox-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Remember my session</span>
                </label>

                <button
                  type="button"
                  className="modern-forgot-link"
                  onClick={() => {
                    setForgotIdentifier(email);
                    setForgotStatus(null);
                    setShowForgotModal(true);
                  }}
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                className="modern-btn-submit"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="btn-loading-flex">
                    <svg className="spin-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                    <span>Authenticating...</span>
                  </span>
                ) : (
                  <>
                    <span>{currentMeta.btnText}</span>
                    <ArrowRightIcon size={17} className="btn-arrow-icon" />
                  </>
                )}
              </button>
            </form>
          </div>

            {/* 1-Click Role Demonstrations Cards */}
            <div className="modern-demos-box">
              <div className="modern-demos-header-row">
                <span className="modern-demos-header-label">1-Click Role Demonstrations</span>
                <span className="modern-demos-badge">Instant Fill</span>
              </div>
              <div className="modern-demos-grid">
                <button
                  type="button"
                  className={`modern-demo-card ${selectedRole === 'super_admin' ? 'active' : ''}`}
                  onClick={() => handleRoleTabChange('super_admin')}
                  title="Super Admin (demo@billing.local)"
                >
                  <div className="modern-demo-card-icon role-admin">
                    <CrownIcon size={14} />
                  </div>
                  <div className="modern-demo-card-body">
                    <span className="modern-demo-role-name">Super Admin</span>
                    <span className="modern-demo-email">demo@billing.local</span>
                  </div>
                  {selectedRole === 'super_admin' && <span className="active-pill">Active</span>}
                </button>

                <button
                  type="button"
                  className={`modern-demo-card ${selectedRole === 'store_manager' ? 'active' : ''}`}
                  onClick={() => handleRoleTabChange('store_manager')}
                  title="Store Manager (manager@billing.local)"
                >
                  <div className="modern-demo-card-icon role-manager">
                    <StoreIcon size={14} />
                  </div>
                  <div className="modern-demo-card-body">
                    <span className="modern-demo-role-name">Store Manager</span>
                    <span className="modern-demo-email">manager@billing.local</span>
                  </div>
                  {selectedRole === 'store_manager' && <span className="active-pill">Active</span>}
                </button>

                <button
                  type="button"
                  className={`modern-demo-card ${selectedRole === 'cashier' ? 'active' : ''}`}
                  onClick={() => handleRoleTabChange('cashier')}
                  title="Cashier 1 (cashier@billing.local)"
                >
                  <div className="modern-demo-card-icon role-cashier">
                    <CashierIcon size={14} />
                  </div>
                  <div className="modern-demo-card-body">
                    <span className="modern-demo-role-name">Cashier Counter</span>
                    <span className="modern-demo-email">cashier@billing.local</span>
                  </div>
                  {selectedRole === 'cashier' && <span className="active-pill">Active</span>}
                </button>

                <button
                  type="button"
                  className={`modern-demo-card ${selectedRole === 'cashier2' ? 'active' : ''}`}
                  onClick={() => handleRoleTabChange('cashier2')}
                  title="Cashier 2 (lakshmi@billing.local)"
                >
                  <div className="modern-demo-card-icon role-cashier">
                    <CashierIcon size={14} />
                  </div>
                  <div className="modern-demo-card-body">
                    <span className="modern-demo-role-name">Cashier 2</span>
                    <span className="modern-demo-email">lakshmi@billing.local</span>
                  </div>
                  {selectedRole === 'cashier2' && <span className="active-pill">Active</span>}
                </button>
              </div>
            </div>

            {/* Footer Navigation & Security */}
            <div className="modern-footer-row">
              <span className="modern-footer-text">Don't have an account? </span>
              <button
                type="button"
                className="modern-register-link"
                onClick={onNavigateRegister}
              >
                Register Your Business
              </button>
            </div>

            <div className="modern-compliance-row">
              <ShieldLockIcon size={13} />
              <span>256-bit SSL Encrypted • Enterprise Multi-Branch Synchronization</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modern Forgot Password Modal */}
      {showForgotModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1.5rem',
          }}
          onClick={() => setShowForgotModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '460px',
              background: '#FFFFFF',
              borderRadius: '20px',
              padding: '2rem',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#0F172A' }}>
                Reset Your Password
              </h3>
              <button
                type="button"
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#94A3B8' }}
                onClick={() => setShowForgotModal(false)}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', lineHeight: '1.5' }}>
              Enter your username or registered email address. We'll send you a secure link to reset your credentials.
            </p>

            {forgotStatus && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: forgotStatus.isError ? '#FEE2E2' : '#DCFCE7',
                  color: forgotStatus.isError ? '#B91C1C' : '#15803D',
                  border: `1px solid ${forgotStatus.isError ? '#FCA5A5' : '#86EFAC'}`,
                }}
              >
                <span>{forgotStatus.isError ? '⚠️' : '✅'}</span>
                <span>{forgotStatus.message}</span>
              </div>
            )}

            <form onSubmit={handleSendForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="modern-input-group">
                <label className="modern-label" htmlFor="forgot-identifier">
                  <span>Username or Registered Email</span>
                </label>
                <input
                  id="forgot-identifier"
                  type="text"
                  className="modern-input"
                  required
                  placeholder="e.g. manager@billing.local or demo@billing.local"
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  style={{
                    background: '#F1F5F9',
                    border: 'none',
                    padding: '0.65rem 1.15rem',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                  onClick={() => setShowForgotModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modern-btn-submit"
                  style={{ width: 'auto', padding: '0.65rem 1.25rem', marginTop: 0 }}
                  disabled={isSendingReset}
                >
                  {isSendingReset ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
