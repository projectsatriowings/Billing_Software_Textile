import React, { useState, useMemo } from 'react';
import type { User, Shop } from '../../api.ts';
import './notificationsPage.css';

interface NotificationsPageViewProps {
  user: User;
  shop: Shop | null;
  selectedBranch?: string;
  branches?: any[];
  shiftNotifications: any[];
  unreadShiftNotifCount: number;
  onRefresh: () => void;
  onMarkAllRead: () => void;
  onNotificationClick: (notif: any) => void;
  setActiveTab: (tab: any) => void;
}

export const NotificationsPageView: React.FC<NotificationsPageViewProps> = ({
  user,
  shop,
  selectedBranch,
  branches,
  shiftNotifications,
  unreadShiftNotifCount,
  onRefresh,
  onMarkAllRead,
  onNotificationClick,
  setActiveTab,
}) => {
  const [filterCategory, setFilterCategory] = useState<'all' | 'open' | 'close' | 'discrepancy' | 'day_closing'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Just now';
    const time = new Date(dateStr).getTime();
    if (isNaN(time)) return 'Just now';
    const diff = Math.max(0, Date.now() - time);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const formatFullDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Safe parse metadata helper
  const parseMeta = (notif: any) => {
    let m = notif.metadata;
    if (typeof m === 'string') {
      try { m = JSON.parse(m); } catch {}
    }
    return m || {};
  };

  // Category counts
  const counts = useMemo(() => {
    let total = shiftNotifications.length;
    let unread = 0;
    let open = 0;
    let close = 0;
    let discrepancy = 0;
    let dayClosing = 0;

    for (const n of shiftNotifications) {
      const isUnread = !n.isRead && !n.is_read;
      if (isUnread) unread++;

      if (n.type === 'shift_open') open++;
      else if (n.type === 'shift_close') {
        close++;
        const meta = parseMeta(n);
        if (meta.varianceMinor && meta.varianceMinor !== 0) discrepancy++;
      } else if (n.type === 'approval' || n.type === 'rejection') {
        dayClosing++;
      }
    }

    return { total, unread, open, close, discrepancy, dayClosing };
  }, [shiftNotifications]);

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return shiftNotifications.filter((n) => {
      const isUnread = !n.isRead && !n.is_read;
      if (unreadOnly && !isUnread) return false;

      const meta = parseMeta(n);

      if (filterCategory === 'open' && n.type !== 'shift_open') return false;
      if (filterCategory === 'close' && n.type !== 'shift_close') return false;
      if (filterCategory === 'discrepancy') {
        if (n.type !== 'shift_close' || !meta.varianceMinor || meta.varianceMinor === 0) return false;
      }
      if (filterCategory === 'day_closing') {
        if (n.type !== 'approval' && n.type !== 'rejection') return false;
      }

      if (q) {
        const titleMatch = String(n.title || '').toLowerCase().includes(q);
        const msgMatch = String(n.message || '').toLowerCase().includes(q);
        const cashierMatch = String(n.cashierName || n.cashier_name || meta.cashierName || '').toLowerCase().includes(q);
        const shiftNumMatch = String(meta.shiftNumber || '').toLowerCase().includes(q);
        const branchMatch = String(n.branchName || n.branch_name || meta.branchName || '').toLowerCase().includes(q);
        const counterMatch = String(meta.counter || '').toLowerCase().includes(q);

        if (!titleMatch && !msgMatch && !cashierMatch && !shiftNumMatch && !branchMatch && !counterMatch) {
          return false;
        }
      }

      return true;
    });
  }, [shiftNotifications, filterCategory, searchQuery, unreadOnly]);

  const activeBranchName = useMemo(() => {
    if (!selectedBranch || selectedBranch.toLowerCase() === 'all') return 'All Branches Consolidated';
    const found = branches?.find((b: any) => b.id === selectedBranch || b.code === selectedBranch);
    return found ? `${found.name} (${found.code})` : selectedBranch;
  }, [selectedBranch, branches]);

  const isSuperAdmin = Boolean(
    user && (user.role === 'owner' || user.role === 'admin' || String(user.role).toUpperCase() === 'SUPER_ADMIN')
  );

  return (
    <div className={`notif-page-wrapper ${isSuperAdmin ? 'theme-super-admin' : ''}`}>
      {/* 1. Header Card */}
      <div className="notif-page-header-card bento-card-3d">
        <div className="notif-header-left">
          <div className="notif-header-icon-box">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
          </div>
          <div>
            <h1 className="notif-header-title">
              Notifications &amp; Shift Register Alerts
              {counts.unread > 0 && (
                <span className="notif-unread-badge-pill">{counts.unread} new</span>
              )}
            </h1>
            <p className="notif-header-subtitle">
              Live cashier drawer opening float verifications, shift closing sales summaries &amp; store audit alerts for {activeBranchName}.
            </p>
          </div>
        </div>

        <div className="notif-header-actions">
          <span className={`notif-role-tag ${user?.role || 'user'}`}>
            {user?.role === 'owner' ? 'Super Admin' : user?.role === 'manager' ? 'Store Manager' : 'Cashier Station'}
          </span>

          <button
            type="button"
            className="notif-btn-refresh"
            onClick={onRefresh}
            title="Refresh notifications"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span>Refresh</span>
          </button>

          {counts.unread > 0 && (
            <button
              type="button"
              className="notif-btn-mark-all"
              onClick={onMarkAllRead}
              title="Mark all notifications as read"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Mark all read</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Asymmetrical Bento KPI Deck */}
      <div className="notif-kpi-deck">
        {/* 2A. Hero Bento Tile: Unread Alerts */}
        <div className="notif-kpi-hero-card bento-card-3d">
          <div className="notif-kpi-hero-top">
            <div>
              <span className="notif-kpi-hero-tag">Actionable Alerts</span>
              <h3 className="notif-kpi-hero-title">Unread Shift Alerts</h3>
            </div>
            <div className="notif-kpi-hero-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
          </div>

          <div className={`notif-kpi-hero-val ${counts.unread > 0 ? 'has-unread' : ''}`}>
            {counts.unread}
          </div>

          <div className={`notif-kpi-hero-status ${counts.unread > 0 ? 'active' : 'clear'}`}>
            {counts.unread > 0 ? '● Real-Time Review Required' : '✓ All Alerts Reviewed'}
          </div>

          <p className="notif-kpi-hero-desc">
            {counts.unread > 0
              ? `${counts.unread} unread shift & closing events pending review.`
              : 'All terminal shifts and register events are caught up.'}
          </p>
        </div>

        {/* 2B. Secondary 2x2 Bento Grid */}
        <div className="notif-kpi-secondary-grid">
          {/* Card 1: Total Notifications */}
          <div className="notif-kpi-card bento-card-3d">
            <div className="notif-kpi-icon all">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            </div>
            <div className="notif-kpi-meta">
              <span className="notif-kpi-val">{counts.total}</span>
              <span className="notif-kpi-label">Total Notifications</span>
            </div>
          </div>

          {/* Card 2: Shift Starts */}
          <div className="notif-kpi-card bento-card-3d">
            <div className="notif-kpi-icon open">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            </div>
            <div className="notif-kpi-meta">
              <span className="notif-kpi-val">{counts.open}</span>
              <span className="notif-kpi-label">Shift Starts (Float Checks)</span>
            </div>
          </div>

          {/* Card 3: Shift Closings */}
          <div className="notif-kpi-card bento-card-3d">
            <div className="notif-kpi-icon close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            </div>
            <div className="notif-kpi-meta">
              <span className="notif-kpi-val">{counts.close}</span>
              <span className="notif-kpi-label">Shift Closings (Sales &amp; Bills)</span>
            </div>
          </div>

          {/* Card 4: Cash Discrepancies */}
          <div className="notif-kpi-card bento-card-3d">
            <div className="notif-kpi-icon variance">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <div className="notif-kpi-meta">
              <span className="notif-kpi-val" style={{ color: counts.discrepancy > 0 ? '#d97706' : 'inherit' }}>
                {counts.discrepancy}
              </span>
              <span className="notif-kpi-label">Cash Discrepancies</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Controls & Filter Bar */}
      <div className="notif-filter-bar bento-card-3d">
        <div className="notif-tabs-group">
          <button
            type="button"
            className={`notif-tab-btn ${filterCategory === 'all' ? 'active' : ''}`}
            onClick={() => setFilterCategory('all')}
          >
            <span>All</span>
            <span className="notif-tab-count">{counts.total}</span>
          </button>

          <button
            type="button"
            className={`notif-tab-btn ${filterCategory === 'open' ? 'active' : ''}`}
            onClick={() => setFilterCategory('open')}
          >
            <span>Shift Starts (Float)</span>
            <span className="notif-tab-count">{counts.open}</span>
          </button>

          <button
            type="button"
            className={`notif-tab-btn ${filterCategory === 'close' ? 'active' : ''}`}
            onClick={() => setFilterCategory('close')}
          >
            <span>Shift Closings (Sales)</span>
            <span className="notif-tab-count">{counts.close}</span>
          </button>

          <button
            type="button"
            className={`notif-tab-btn ${filterCategory === 'discrepancy' ? 'active' : ''}`}
            onClick={() => setFilterCategory('discrepancy')}
          >
            <span>Discrepancies</span>
            <span className="notif-tab-count">{counts.discrepancy}</span>
          </button>

          {counts.dayClosing > 0 && (
            <button
              type="button"
              className={`notif-tab-btn ${filterCategory === 'day_closing' ? 'active' : ''}`}
              onClick={() => setFilterCategory('day_closing')}
            >
              <span>Day Closing Audits</span>
              <span className="notif-tab-count">{counts.dayClosing}</span>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div className="notif-search-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search cashier, shift #, counter, branch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="notif-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.8rem' }}
              >
                ✕
              </button>
            )}
          </div>

          <label className="notif-unread-only-toggle">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            <span>Unread only</span>
          </label>
        </div>
      </div>

      {/* 4. Notifications List */}
      <div className="notif-cards-list">
        {filteredNotifications.length === 0 ? (
          <div className="notif-empty-state bento-card-3d">
            <div className="notif-empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            </div>
            <h3 className="notif-empty-title">No Notifications Found</h3>
            <p className="notif-empty-desc">
              {searchQuery || unreadOnly || filterCategory !== 'all'
                ? 'No notifications match your current filter criteria. Try clearing search or selecting All.'
                : 'Cashier shift opening float checks and shift closing sales summaries will appear here in real time.'}
            </p>
            {(searchQuery || unreadOnly || filterCategory !== 'all') && (
              <button
                type="button"
                className="notif-btn-refresh"
                onClick={() => {
                  setSearchQuery('');
                  setUnreadOnly(false);
                  setFilterCategory('all');
                }}
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          filteredNotifications.map((n) => {
            const isShiftOpen = n.type === 'shift_open';
            const isShiftClose = n.type === 'shift_close';
            const isApproval = n.type === 'approval';
            const isRejection = n.type === 'rejection';
            const meta = parseMeta(n);

            const isUnread = !n.isRead && !n.is_read;
            const createdAt = n.createdAt || n.created_at;
            const branchName = n.branchName || n.branch_name || meta.branchName || '';
            const cashierName = n.cashierName || n.cashier_name || meta.cashierName || 'Cashier';
            const isVarianceWarning = isShiftClose && meta.varianceMinor && meta.varianceMinor !== 0;

            const cardClass = `notif-card-item bento-card-3d ${
              isShiftOpen ? 'shift-open' : isVarianceWarning ? 'variance-warning' : isShiftClose ? 'shift-close' : ''
            } ${isUnread ? 'unread' : ''}`;

            return (
              <div
                key={n.id}
                className={cardClass}
                onClick={() => onNotificationClick(n)}
                style={{ cursor: 'pointer' }}
              >
                {/* Card Top Row */}
                <div className="notif-card-top-row">
                  <div className="notif-card-title-group">
                    <div className={`notif-card-icon-pill ${isShiftOpen ? 'open' : isVarianceWarning ? 'warning' : 'close'}`}>
                      {isShiftOpen ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                          <line x1="12" y1="22.08" x2="12" y2="12"></line>
                        </svg>
                      ) : isVarianceWarning ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                          <line x1="12" y1="9" x2="12" y2="13"></line>
                          <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                          <line x1="8" y1="21" x2="16" y2="21"></line>
                          <line x1="12" y1="17" x2="12" y2="21"></line>
                        </svg>
                      )}
                    </div>

                    {isUnread && <span className="notif-unread-dot" title="Unread notification" />}

                    <h3 className="notif-card-title">{n.title}</h3>
                  </div>

                  <span className={`notif-card-status-pill ${isShiftOpen ? 'open' : isVarianceWarning ? 'warn' : 'close'}`}>
                    {isShiftOpen
                      ? 'Drawer Open'
                      : isShiftClose
                      ? meta.varianceText || 'Shift Closed'
                      : isApproval
                      ? 'Approved'
                      : isRejection
                      ? 'Recount Requested'
                      : 'Activity'}
                  </span>
                </div>

                {/* Subrow (Branch, Counter, Cashier, Timestamp) */}
                <div className="notif-card-meta-row">
                  {branchName && (
                    <span className="notif-branch-badge">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                      </svg>
                      {branchName}
                    </span>
                  )}

                  {meta.counter && (
                    <span className="notif-counter-badge">
                      {meta.counter}
                    </span>
                  )}

                  <span style={{ fontWeight: 600, color: '#475569' }}>
                    Cashier: <strong style={{ color: '#0f172a' }}>{cashierName}</strong>
                  </span>

                  <span className="notif-timestamp">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>{formatTimeAgo(createdAt)}</span>
                    <span style={{ color: '#94a3b8' }}>•</span>
                    <span style={{ color: '#94a3b8' }}>{formatFullDate(createdAt)}</span>
                  </span>
                </div>

                {/* Description Message */}
                <p className="notif-card-desc">{n.message}</p>

                {/* Structured Metrics Grid: Shift Open */}
                {isShiftOpen && (
                  <div className="notif-metrics-grid">
                    <div className="notif-metric-cell">
                      <span className="notif-metric-label">Counter Terminal</span>
                      <span className="notif-metric-value">{meta.counter || 'Counter 1'}</span>
                    </div>
                    <div className="notif-metric-cell">
                      <span className="notif-metric-label">Opening Drawer Float</span>
                      <span className="notif-metric-value float">{meta.openingCashFormatted || '₹0.00'}</span>
                    </div>
                    <div className="notif-metric-cell">
                      <span className="notif-metric-label">Shift Number</span>
                      <span className="notif-metric-value">#{meta.shiftNumber || 'SHF'}</span>
                    </div>
                  </div>
                )}

                {/* Structured Metrics Grid: Shift Close */}
                {isShiftClose && (
                  <div className="notif-metrics-grid">
                    <div className="notif-metric-cell">
                      <span className="notif-metric-label">Today's Sales</span>
                      <span className="notif-metric-value sales">{meta.totalSalesFormatted || '₹0.00'}</span>
                    </div>
                    <div className="notif-metric-cell">
                      <span className="notif-metric-label">Total Bills</span>
                      <span className="notif-metric-value">{meta.invoicesCount ?? 0}</span>
                    </div>
                    <div className="notif-metric-cell">
                      <span className="notif-metric-label">Returns / Refunds</span>
                      <span className="notif-metric-value returns">
                        {meta.returnsCount ?? 0} ({meta.cashRefundsFormatted || '₹0.00'})
                      </span>
                    </div>
                    <div className="notif-metric-cell">
                      <span className="notif-metric-label">Drawer Counted</span>
                      <span className="notif-metric-value drawer">{meta.countedCashFormatted || '₹0.00'}</span>
                    </div>
                    <div className="notif-metric-cell">
                      <span className="notif-metric-label">Discrepancy Status</span>
                      <span className={`notif-metric-value ${isVarianceWarning ? 'returns' : 'sales'}`}>
                        {meta.varianceText || 'Balanced'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Card Actions Footer */}
                <div className="notif-card-actions">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {user?.role !== 'cashier' && (
                      <button
                        type="button"
                        className="notif-nav-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTab('day-closing');
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                        <span>View in Day Closing</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="notif-nav-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (user?.role === 'cashier') {
                          setActiveTab('shifts');
                        } else {
                          setActiveTab('pos');
                        }
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="9" cy="21" r="1"></circle>
                        <circle cx="20" cy="21" r="1"></circle>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                      </svg>
                      <span>{user?.role === 'cashier' ? 'Manage My Shift' : 'Open POS Counter'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    className="notif-dismiss-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNotificationClick(n);
                    }}
                  >
                    {isUnread ? 'Mark as read' : 'Read ✓'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
