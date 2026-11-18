import React, { useState } from 'react';
import { api, setToken, type User, type Shop } from '../api';
import './cashier-login.css';
import './auth/bentoLogin.css';

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
      setError(err?.message || 'Invalid credentials. Please verify your login details.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      setForgotStatus({ message: 'Please enter your username or email address.', isError: true });
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
        message: "If an account with this identifier exists, a password reset link has been dispatched to the registered address.",
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

  // Role Metadata Config
  const isCashier = selectedRole === 'cashier' || selectedRole === 'cashier2';
  const roleDisplay = {
    title: selectedRole === 'super_admin'
      ? 'Super Admin Portal'
      : selectedRole === 'store_manager'
      ? 'Store Manager Portal'
      : 'Cashier Billing Counter',
    clearance: selectedRole === 'super_admin'
      ? 'HQ Executive Clearance'
      : selectedRole === 'store_manager'
      ? 'Branch Operations Clearance'
      : 'POS Terminal Clearance',
    subtitle: selectedRole === 'super_admin'
      ? 'Consolidated sales network, multi-branch governance & system audit trail.'
      : selectedRole === 'store_manager'
      ? 'Branch oversight: register closing approvals, drawer cash audits & staff controls.'
      : 'Rapid retail billing: live barcode scanning, cash float balancing & counter checkout.',
    icon: selectedRole === 'super_admin' ? '👑' : selectedRole === 'store_manager' ? '🏪' : '💳',
    inputLabel: selectedRole === 'super_admin'
      ? 'Super Admin Email'
      : selectedRole === 'store_manager'
      ? 'Store Manager Username or Email'
      : 'Cashier Employee ID or Email',
    placeholder: selectedRole === 'super_admin'
      ? 'e.g. demo@billing.local'
      : selectedRole === 'store_manager'
      ? 'e.g. manager@billing.local'
      : 'e.g. cashier@billing.local or CSH-101',
    btnText: selectedRole === 'super_admin'
      ? 'Login as Super Admin'
      : selectedRole === 'store_manager'
      ? 'Login as Store Manager'
      : selectedRole === 'cashier2'
      ? 'Login as Cashier 2 (Lakshmi)'
      : 'Login as Cashier Counter',
  };

  return (
    <div className="bento-login-page">
      {/* 1. Modern Bento Top Navigation Bar */}
      <header className="bento-login-topbar">
        <div className="bento-login-brand" onClick={onBackToHome}>
          <div className="bento-login-brand-icon">⚡</div>
          <div>
            <h1 className="bento-login-brand-title">
              Adaptive Billing
              <span className="bento-login-brand-tag">v2.6 Enterprise</span>
            </h1>
          </div>
        </div>

        <div className="bento-login-top-actions">
          <div className="bento-login-live-pill">
            <span className="bento-login-live-dot" />
            <span>Multi-Branch Cloud Sync Active</span>
          </div>

          <button
            type="button"
            className="bento-btn-back-home"
            onClick={onBackToHome}
            title="Return to Landing Page"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Back to Home</span>
          </button>
        </div>
      </header>

      {/* 2. Bento Grid Layout (Left: Role Hub + Telemetry; Right: Master Auth Gateway) */}
      <main className="bento-login-container">
        {/* Left Bento Column */}
        <section className="bento-left-column">
          {/* 3A: Role Hub Selector Tile */}
          <div className="bento-role-hub-card bento-login-card-3d">
            <div className="bento-tile-header">
              <div>
                <div className="bento-tile-eyebrow">PORTAL ACCESS LEVEL</div>
                <h2 className="bento-tile-heading">Choose Your Workspace</h2>
              </div>
            </div>

            <div className="bento-role-options-list">
              {/* Role 1: Super Admin */}
              <button
                type="button"
                className={`bento-role-card-btn ${selectedRole === 'super_admin' ? 'active' : ''}`}
                onClick={() => handleRoleTabChange('super_admin')}
              >
                <div className="bento-role-card-left">
                  <div className="bento-role-card-icon">👑</div>
                  <div className="bento-role-card-meta">
                    <span className="bento-role-card-title">Super Admin</span>
                    <span className="bento-role-card-subtitle">Headquarters & Global Governance</span>
                  </div>
                </div>
                <span className="bento-role-badge">HQ Clearance</span>
              </button>

              {/* Role 2: Store Manager */}
              <button
                type="button"
                className={`bento-role-card-btn ${selectedRole === 'store_manager' ? 'active' : ''}`}
                onClick={() => handleRoleTabChange('store_manager')}
              >
                <div className="bento-role-card-left">
                  <div className="bento-role-card-icon">🏪</div>
                  <div className="bento-role-card-meta">
                    <span className="bento-role-card-title">Store Manager</span>
                    <span className="bento-role-card-subtitle">Branch Operations & Register Audit</span>
                  </div>
                </div>
                <span className="bento-role-badge">Branch Ops</span>
              </button>

              {/* Role 3: Cashier Counter */}
              <button
                type="button"
                className={`bento-role-card-btn ${isCashier ? 'active' : ''}`}
                onClick={() => handleRoleTabChange('cashier')}
              >
                <div className="bento-role-card-left">
                  <div className="bento-role-card-icon">💳</div>
                  <div className="bento-role-card-meta">
                    <span className="bento-role-card-title">Cashier Counter</span>
                    <span className="bento-role-card-subtitle">Fast-Lane POS & Drawer Float</span>
                  </div>
                </div>
                <span className="bento-role-badge">POS Station</span>
              </button>
            </div>
          </div>

          {/* 3B: Role-Adaptive Telemetry Bento Card */}
          <div className="bento-telemetry-card bento-login-card-3d">
            <div className="bento-telemetry-header">
              <h3 className="bento-telemetry-title">
                <span>{selectedRole === 'super_admin' ? '📊' : selectedRole === 'store_manager' ? '🛡️' : '⚡'}</span>
                <span>
                  {selectedRole === 'super_admin'
                    ? 'Consolidated Enterprise Telemetry'
                    : selectedRole === 'store_manager'
                    ? 'Store Branch & Register Telemetry'
                    : 'Terminal Hardware & POS Engine'}
                </span>
              </h3>
            </div>

            <div className="bento-telemetry-grid">
              {selectedRole === 'super_admin' && (
                <>
                  <div className="bento-telemetry-cell">
                    <span className="bento-telemetry-label">Network Sales</span>
                    <span className="bento-telemetry-val highlight">₹1,48,920</span>
                  </div>
                  <div className="bento-telemetry-cell">
                    <span className="bento-telemetry-label">Active Branches</span>
                    <span className="bento-telemetry-val">3 Live</span>
                  </div>
                  <div className="bento-telemetry-cell">
                    <span className="bento-telemetry-label">Compliance</span>
                    <span className="bento-telemetry-val">GST e-Invoice</span>
                  </div>
                  <div className="bento-telemetry-cell">
                    <span className="bento-telemetry-label">Cloud Uptime</span>
                    <span className="bento-telemetry-val">99.98%</span>
                  </div>
                </>
              )}

              {selectedRole === 'store_manager' && (
                <>
                  <div className="bento-telemetry-cell">
                    <span className="bento-telemetry-label">Shift Status</span>
                    <span className="bento-telemetry-val highlight">Balanced</span>
                  </div>
                  <div className="bento-telemetry-cell">
                    <span className="bento-telemetry-label">Active Counters</span>
                    <span className="bento-telemetry-val">2 Online</span>
                  </div>
                  <div className="bento-telemetry-cell">
                    <span className="bento-telemetry-label">Drawer Floats</span>
                    <span className="bento-telemetry-val">Verified</span>
                  </div>
                  <div className="bento-telemetry-cell">
                    <span className="bento-telemetry-label">Shift Approvals</span>
                    <span className="bento-telemetry-val">0 Pending</span>
                  </div>
                </>
              )}

              {isCashier && (
                <>
                  <div className="bento-telemetry-cell">
                    <span className="bento-telemetry-label">Scanner Latency</span>
                    <span className="bento-telemetry-val highlight">&lt; 15ms</span>
                  </div>
                  <div className="bento-telemetry-cell">
                    <span className="bento-telemetry-label">CFD 2nd Screen</span>
                    <span className="bento-telemetry-val">Active Sync</span>
                  </div>
                  <div className="bento-telemetry-cell">
                    <span className="bento-telemetry-label">Receipt Printer</span>
                    <span className="bento-telemetry-val">ESC/POS Ready</span>
                  </div>
                  <div className="bento-telemetry-cell">
                    <span className="bento-telemetry-label">Offline Buffer</span>
                    <span className="bento-telemetry-val">Secured</span>
                  </div>
                </>
              )}
            </div>

            <div className="bento-telemetry-footer-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
              <span>
                {selectedRole === 'super_admin'
                  ? 'Audit trails are cryptographically sealed with timestamping.'
                  : selectedRole === 'store_manager'
                  ? 'Dual-authorization enforced on high-value discounts & returns.'
                  : 'Instant hotkey checkout and barcode buffer acceleration enabled.'}
              </span>
            </div>
          </div>

          {/* 3C: 1-Click Role Demonstrations Bento Tile */}
          <div className="bento-demo-creds-card bento-login-card-3d">
            <div className="bento-demo-title-row">
              <span className="bento-demo-title">1-Click Fast Demonstrations</span>
              <span className="bento-demo-subtitle">Instant Credentials</span>
            </div>

            <div className="bento-demo-grid">
              <button
                type="button"
                className={`bento-demo-btn ${selectedRole === 'super_admin' ? 'active' : ''}`}
                onClick={() => handleRoleTabChange('super_admin')}
                title="Login as Super Admin"
              >
                <span className="bento-demo-btn-label">👑 Admin</span>
                <span className="bento-demo-btn-email">demo@billing.local</span>
              </button>

              <button
                type="button"
                className={`bento-demo-btn ${selectedRole === 'store_manager' ? 'active' : ''}`}
                onClick={() => handleRoleTabChange('store_manager')}
                title="Login as Store Manager"
              >
                <span className="bento-demo-btn-label">🏪 Manager</span>
                <span className="bento-demo-btn-email">manager@billing.local</span>
              </button>

              <button
                type="button"
                className={`bento-demo-btn ${selectedRole === 'cashier' ? 'active' : ''}`}
                onClick={() => handleRoleTabChange('cashier')}
                title="Login as Cashier 1"
              >
                <span className="bento-demo-btn-label">💳 Cashier 1</span>
                <span className="bento-demo-btn-email">cashier@billing.local</span>
              </button>

              <button
                type="button"
                className={`bento-demo-btn ${selectedRole === 'cashier2' ? 'active' : ''}`}
                onClick={() => handleRoleTabChange('cashier2')}
                title="Login as Cashier 2 (Lakshmi)"
              >
                <span className="bento-demo-btn-label">💳 Cashier 2</span>
                <span className="bento-demo-btn-email">lakshmi@billing.local</span>
              </button>
            </div>
          </div>
        </section>

        {/* Right Bento Column: Master Authentication Gateway Card */}
        <section className="bento-auth-gateway-card bento-login-card-3d">
          <div>
            <div className="bento-gateway-header">
              <div className="bento-gateway-role-badge-row">
                <div className="bento-gateway-icon-box">{roleDisplay.icon}</div>
                <span className="bento-gateway-clearance-pill">{roleDisplay.clearance}</span>
              </div>
              <h2 className="bento-gateway-title">{roleDisplay.title}</h2>
              <p className="bento-gateway-subtitle">{roleDisplay.subtitle}</p>
            </div>

            {error && (
              <div className="bento-login-error-banner" role="alert">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="bento-login-form">
              {/* Email / Username Input */}
              <div className="bento-form-group">
                <label className="bento-form-label" htmlFor="bento-login-email">
                  <span>{roleDisplay.inputLabel}</span>
                  <span className="required-star">*</span>
                </label>
                <div className="bento-input-wrapper">
                  <span className="bento-input-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </span>
                  <input
                    id="bento-login-email"
                    type={selectedRole === 'super_admin' ? 'email' : 'text'}
                    className="bento-form-input"
                    required
                    autoFocus
                    placeholder={roleDisplay.placeholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete={isCashier ? 'username' : 'email'}
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="bento-form-group">
                <label className="bento-form-label" htmlFor="bento-login-password">
                  <span>Password</span>
                  <span className="required-star">*</span>
                </label>
                <div className="bento-input-wrapper">
                  <span className="bento-input-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                  </span>
                  <input
                    id="bento-login-password"
                    type={showPassword ? 'text' : 'password'}
                    className="bento-form-input"
                    required
                    placeholder="Enter your security password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="bento-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Utility Row: Remember Me & Forgot Password */}
              <div className="bento-login-options-row">
                <label className="bento-checkbox-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Remember my session</span>
                </label>

                <button
                  type="button"
                  className="bento-forgot-btn"
                  onClick={() => {
                    setForgotIdentifier(email);
                    setForgotStatus(null);
                    setShowForgotModal(true);
                  }}
                >
                  Forgot password?
                </button>
              </div>

              {/* Submit CTA Button */}
              <button
                type="submit"
                className="bento-btn-submit"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span>Authenticating Clearance...</span>
                ) : (
                  <>
                    <span>{roleDisplay.btnText}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                      <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Footer Credentials Info */}
          <div className="bento-gateway-footer">
            <div className="bento-register-row">
              <span>Don't have an account registered yet?</span>
              <button
                type="button"
                className="bento-register-link"
                onClick={onNavigateRegister}
              >
                Register Your Business →
              </button>
            </div>

            <div className="bento-security-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <span>TLS 1.3 End-to-End Encrypted • Banking-Grade Multi-Branch Token Validation</span>
            </div>
          </div>
        </section>
      </main>

      {/* 5. 3D Bento Forgot Password Modal */}
      {showForgotModal && (
        <div className="bento-modal-backdrop" onClick={() => setShowForgotModal(false)}>
          <div
            className="bento-modal-card bento-login-card-3d"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="bento-modal-header">
              <h3 className="bento-modal-title">Reset Your Security Password</h3>
              <button
                type="button"
                className="bento-modal-close"
                onClick={() => setShowForgotModal(false)}
                title="Close"
              >
                ✕
              </button>
            </div>

            <p className="bento-modal-desc">
              Enter your registered username or email address. A secure recovery credential link will be dispatched immediately.
            </p>

            {forgotStatus && (
              <div className={`bento-login-error-banner ${forgotStatus.isError ? '' : 'success'}`} style={forgotStatus.isError ? {} : { background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.35)', color: '#047857' }}>
                <span>{forgotStatus.isError ? '⚠️' : '✅'}</span>
                <span>{forgotStatus.message}</span>
              </div>
            )}

            <form onSubmit={handleSendForgotPassword} className="bento-login-form">
              <div className="bento-form-group">
                <label className="bento-form-label" htmlFor="bento-forgot-identifier">
                  <span>Username or Registered Email</span>
                </label>
                <input
                  id="bento-forgot-identifier"
                  type="text"
                  className="bento-form-input"
                  style={{ paddingLeft: '1rem' }}
                  required
                  placeholder="e.g. manager@billing.local or demo@billing.local"
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                />
                <div style={{ marginTop: '4px', fontSize: '0.74rem', color: 'var(--bento-login-text-muted)', lineHeight: '1.4' }}>
                  <strong>Note:</strong> Cashier terminals without an external email should contact the Store Manager for instant pin resets.
                </div>
              </div>

              <div className="bento-modal-actions">
                <button
                  type="button"
                  className="bento-btn-back-home"
                  onClick={() => setShowForgotModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bento-btn-submit"
                  style={{ width: 'auto', padding: '0.65rem 1.25rem', marginTop: 0 }}
                  disabled={isSendingReset}
                >
                  {isSendingReset ? 'Dispatching...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
