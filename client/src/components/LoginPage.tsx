import React, { useState } from 'react';
import { api, setToken, type User, type Shop } from '../api';
import './auth/modernLogin.css';

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

  const roleMeta = {
    super_admin: {
      key: 'super-admin',
      image: '/images/super-admin.png',
      title: 'Super Admin Portal',
      subtitle: 'Enterprise headquarters: consolidated sales, multi-branch network & governance.',
      heroTitle: 'Consolidated Enterprise Control.',
      heroSubtitle: 'Manage headquarters sales, branch inventory and company governance all in one real-time workspace.',
      inputLabel: 'Super Admin Email',
      placeholder: 'demo@billing.local',
      btnText: 'Log In as Super Admin',
      badge: '👑 HQ Super Admin',
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
      badge: '🏪 Store Manager',
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
      badge: '💳 Cashier Station',
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
            LEFT HALF: USER'S GENERATED IMAGE DISPLAY
            ------------------------------------------------------------------ */}
        <div className="modern-login-left">
          {currentMeta.image && !failedImages[currentMeta.image] ? (
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
            <div id="user-image-fallback-frame" className="image-placeholder-frame">
              <div className="placeholder-badge">
                <span>{currentMeta.badge}</span>
              </div>

              <div className="placeholder-hero-text-block">
                <h2 className="placeholder-hero-title">{currentMeta.heroTitle}</h2>
                <p className="placeholder-hero-subtitle">{currentMeta.heroSubtitle}</p>
              </div>

              <div className="placeholder-upload-hint">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <span>Image slot reserved • Ready for your custom illustration</span>
              </div>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------
            RIGHT HALF: CLEAN MODERN LOGIN FORM (Matching Image 2 Reference)
            ------------------------------------------------------------------ */}
        <div className="modern-login-right">
          <div className="modern-login-form-inner">
            <div>
              {/* Top Navigation Row */}
              <div className="modern-login-top-row">
              <div className="modern-brand-logo" onClick={onBackToHome}>
                <div className="modern-brand-icon">⚡</div>
                <span>Adaptive Billing</span>
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

            {/* 3 Role Selection Segmented Tabs */}
            <div className="modern-role-tabs-strip">
              <button
                type="button"
                className={`modern-role-tab tab-super-admin ${selectedRole === 'super_admin' ? 'active' : ''}`}
                onClick={() => handleRoleTabChange('super_admin')}
              >
                <span>👑</span>
                <span>Super Admin</span>
              </button>

              <button
                type="button"
                className={`modern-role-tab tab-store-manager ${selectedRole === 'store_manager' ? 'active' : ''}`}
                onClick={() => handleRoleTabChange('store_manager')}
              >
                <span>🏪</span>
                <span>Store Manager</span>
              </button>

              <button
                type="button"
                className={`modern-role-tab tab-cashier ${isCashier ? 'active' : ''}`}
                onClick={() => handleRoleTabChange('cashier')}
              >
                <span>💳</span>
                <span>Cashier Counter</span>
              </button>
            </div>

            {/* Form Title & Context */}
            <div className="modern-form-heading-block">
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
                  <span>{currentMeta.inputLabel}</span>
                  <span className="req-star">*</span>
                </label>
                <div className="modern-input-wrapper">
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
                  <span>Password</span>
                  <span className="req-star">*</span>
                </label>
                <div className="modern-input-wrapper">
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
                  <span>Remember me</span>
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
                  Forgot your password?
                </button>
              </div>

              <button
                type="submit"
                className="modern-btn-submit"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span>Authenticating...</span>
                ) : (
                  <span>{currentMeta.btnText}</span>
                )}
              </button>
            </form>
          </div>

          <div>
            {/* 1-Click Role Demonstrations */}
            <div className="modern-demos-box">
              <div className="modern-demos-header">1-Click Role Demonstrations</div>
              <div className="modern-demos-grid">
                <button
                  type="button"
                  className={`modern-demo-chip ${selectedRole === 'super_admin' ? 'active' : ''}`}
                  onClick={() => handleRoleTabChange('super_admin')}
                  title="Super Admin (demo@billing.local)"
                >
                  <span className="modern-demo-chip-title">👑 Admin</span>
                  <span className="modern-demo-chip-email">demo@billing.local</span>
                </button>

                <button
                  type="button"
                  className={`modern-demo-chip ${selectedRole === 'store_manager' ? 'active' : ''}`}
                  onClick={() => handleRoleTabChange('store_manager')}
                  title="Store Manager (manager@billing.local)"
                >
                  <span className="modern-demo-chip-title">🏪 Manager</span>
                  <span className="modern-demo-chip-email">manager@billing.local</span>
                </button>

                <button
                  type="button"
                  className={`modern-demo-chip ${selectedRole === 'cashier' ? 'active' : ''}`}
                  onClick={() => handleRoleTabChange('cashier')}
                  title="Cashier 1 (cashier@billing.local)"
                >
                  <span className="modern-demo-chip-title">💳 Cashier 1</span>
                  <span className="modern-demo-chip-email">cashier@billing.local</span>
                </button>

                <button
                  type="button"
                  className={`modern-demo-chip ${selectedRole === 'cashier2' ? 'active' : ''}`}
                  onClick={() => handleRoleTabChange('cashier2')}
                  title="Cashier 2 (lakshmi@billing.local)"
                >
                  <span className="modern-demo-chip-title">💳 Cashier 2</span>
                  <span className="modern-demo-chip-email">lakshmi@billing.local</span>
                </button>
              </div>
            </div>

            {/* Footer Register Link */}
            <div className="modern-footer-row">
              <span>Don't have an account? </span>
              <button
                type="button"
                className="modern-register-link"
                onClick={onNavigateRegister}
              >
                Register Your Business
              </button>
            </div>
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
