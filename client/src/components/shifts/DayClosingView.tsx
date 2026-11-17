import React, { useState, useEffect } from 'react';
import {
  fetchDayClosingPreview,
  fetchDayClosingAudit,
  submitDayClosing,
  approveDayClosing,
  rejectDayClosing,
  reopenDayClosing,
  fetchDayClosingComparison,
  fetchDayClosingAnalytics,
  fetchDayClosingHistory,
  fetchCounterSalesReport,
  fetchCashierSalesReport,
  fetchDayClosingSchedules,
  saveDayClosingSchedule,
  fetchDayClosingCompliance,
  sendDayClosingReminder,
  fetchDayClosingNotifications,
  markDayClosingNotificationRead,
  withAuthToken,
  type User,
  type Shop,
  type SmartAuditResult,
  type SmartAuditIssue,
  type SmartAuditSeverity,
  type SmartAuditDetectorId,
} from '../../api.ts';
import {
  RupeeIcon,
  BanknoteIcon,
  CreditCardIcon,
  RefreshCwIcon,
  TrendingUpIcon,
  WalletIcon,
  ScaleIcon,
  ClockIcon,
  RotateCcwIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  AlertOctagonIcon,
  FileTextIcon,
  FileSpreadsheetIcon,
  DownloadIcon,
  LockIcon,
  StoreIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BarChart3Icon,
  PackageIcon,
  TagIcon,
  ReceiptIcon,
  Building2Icon,
  FilterIcon,
  CheckCircleIcon,
  PrinterIcon,
  InfoIcon,
  UserIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '../inventory/InventoryIcons.tsx';
import './dayClosing.css';

interface DayClosingViewProps {
  user: User;
  shop: Shop | null;
  selectedBranch?: string;
  branches?: any[];
}

type TabType = 'closing' | 'breakdown' | 'comparison' | 'analytics' | 'compliance' | 'history';

const ALL_DETECTORS: Array<{
  id: SmartAuditDetectorId;
  name: string;
  category: 'accuracy' | 'activity' | 'readiness';
  categoryLabel: string;
  description: string;
}> = [
  {
    id: 'cash_shortage',
    name: 'Cash Shortage Detector',
    category: 'accuracy',
    categoryLabel: 'Financial Accuracy',
    description: 'Compares expected closing cash with physical counted cash to detect and quantify cash drawer deficits.',
  },
  {
    id: 'cash_excess',
    name: 'Cash Excess Detector',
    category: 'accuracy',
    categoryLabel: 'Financial Accuracy',
    description: 'Identifies cash surplus in drawer above expected tender collections and opening floats.',
  },
  {
    id: 'sales_mismatch',
    name: 'Sales Mismatch Detector',
    category: 'accuracy',
    categoryLabel: 'Financial Accuracy',
    description: 'Cross-verifies individual invoice line-item pricing and GST tax calculations against header totals.',
  },
  {
    id: 'payment_mismatch',
    name: 'Payment Mismatch Detector',
    category: 'accuracy',
    categoryLabel: 'Financial Accuracy',
    description: 'Reconciles invoice settlement records against ledger receipts and detects orphan or split discrepancies.',
  },
  {
    id: 'duplicate_transactions',
    name: 'Duplicate Transaction Detector',
    category: 'accuracy',
    categoryLabel: 'Financial Accuracy',
    description: 'Identifies rapid identical billings (< 3 mins) and cross-invoice payment reference collisions.',
  },
  {
    id: 'missing_transactions',
    name: 'Missing Transaction Detector',
    category: 'accuracy',
    categoryLabel: 'Financial Accuracy',
    description: 'Detects business date attribution anomalies, unfinalized receipts, or cross-midnight timestamp drift.',
  },
  {
    id: 'unusual_refund',
    name: 'Unusual Refund Detector',
    category: 'activity',
    categoryLabel: 'Business Activity',
    description: 'Flags exceptional refund volumes, single credit notes ≥ ₹2,000, or refunds exceeding 150% average bill.',
  },
  {
    id: 'pending_bills',
    name: 'Pending Bill Detector',
    category: 'activity',
    categoryLabel: 'Business Activity',
    description: 'Identifies unsettled credit invoices and active unclosed cashier shifts prior to day sealing.',
  },
  {
    id: 'unusual_discount',
    name: 'Unusual Discount Detector',
    category: 'activity',
    categoryLabel: 'Business Activity',
    description: 'Monitors high-percentage (≥ 20%) or large nominal (≥ ₹500) promotional markdowns for audit review.',
  },
  {
    id: 'stock_sales_consistency',
    name: 'Stock & Sales Consistency Detector',
    category: 'activity',
    categoryLabel: 'Business Activity',
    description: 'Validates that completed inventory-tracked sales have corresponding stock deduction ledger entries.',
  },
  {
    id: 'unassigned_transactions',
    name: 'Unassigned Transaction Detector',
    category: 'activity',
    categoryLabel: 'Business Activity',
    description: 'Isolates transactions lacking confirmed Counter ID, Cashier ID, or Shift ID attribution.',
  },
  {
    id: 'closing_readiness',
    name: 'Closing Readiness Detector',
    category: 'readiness',
    categoryLabel: 'Closing Readiness',
    description: 'Aggregates all 11 diagnostic checks to formulate overall readiness score and definitive closing guidance.',
  },
];

export const DayClosingView: React.FC<DayClosingViewProps> = ({
  user,
  shop,
  selectedBranch,
  branches,
}) => {
  // Navigation: Clean, dedicated tabs
  const [activeTab, setActiveTab] = useState<TabType>('closing');

  // Branch & Filter states
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    selectedBranch || (branches && branches[0]?.id) || 'MAIN'
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [selectedCounterId, setSelectedCounterId] = useState<string>('');

  // Tab 1: Day Closing Live Preview & Reconciliation state
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [preview, setPreview] = useState<any | null>(null);
  const [actualCashStr, setActualCashStr] = useState<string>('');
  const [closingRemarks, setClosingRemarks] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Smart Closing Audit & Detector Engine state
  const [auditData, setAuditData] = useState<SmartAuditResult | null>(null);
  const [auditExpanded, setAuditExpanded] = useState<boolean>(false);
  const [auditFilter, setAuditFilter] = useState<'all' | 'critical' | 'warning' | 'info' | 'detectors'>('all');
  const [expandedIssueIds, setExpandedIssueIds] = useState<Record<string, boolean>>({});
  const [reviewedIssueIds, setReviewedIssueIds] = useState<Record<string, boolean>>({});
  const [runningLiveAudit, setRunningLiveAudit] = useState<boolean>(false);

  // Tab: Counter & Cashier Sales Reports Breakdown
  const [breakdownSubTab, setBreakdownSubTab] = useState<'counter' | 'cashier'>('counter');
  const [counterSalesData, setCounterSalesData] = useState<any | null>(null);
  const [loadingCounterSales, setLoadingCounterSales] = useState(false);
  const [cashierSalesData, setCashierSalesData] = useState<any | null>(null);
  const [loadingCashierSales, setLoadingCashierSales] = useState(false);

  // Tab: Schedules & Compliance Monitoring
  const [complianceData, setComplianceData] = useState<any | null>(null);
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [scheduleData, setScheduleData] = useState<any | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [expClosingTime, setExpClosingTime] = useState('22:00');
  const [firstReminderMin, setFirstReminderMin] = useState<number>(30);
  const [secondReminderMin, setSecondReminderMin] = useState<number>(15);
  const [finalReminder, setFinalReminder] = useState<boolean>(true);
  const [overdueIntervalMin, setOverdueIntervalMin] = useState<number>(30);
  const [autoAlert, setAutoAlert] = useState<boolean>(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);

  // In-app Notifications & Alerts
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);

  // Tab 2: Comparison state
  const [comparisonData, setComparisonData] = useState<any | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);

  // Tab 3: Custom Date Range Analytics state
  const [analyticsStartDate, setAnalyticsStartDate] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [analyticsEndDate, setAnalyticsEndDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [analyticsPreset, setAnalyticsPreset] = useState<string>('this_month');
  const [analyticsData, setAnalyticsData] = useState<any | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Tab 4: History state
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Reopen Modal state
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenTargetId, setReopenTargetId] = useState<string>('');
  const [reopenReason, setReopenReason] = useState<string>('');
  const [reopenPin, setReopenPin] = useState<string>('');
  const [reopening, setReopening] = useState(false);

  // Reject / Recount Modal state
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string>('');
  const [rejectReason, setRejectReason] = useState<string>('');
  const [rejecting, setRejecting] = useState(false);

  // Messages
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const activeBranchId = selectedBranchId || selectedBranch || 'MAIN';
  const userRole = String(user.role || '').toUpperCase();
  const isCashierUser = userRole === 'CASHIER' || userRole === 'COUNTER';
  const isManagerOrOwner = ['OWNER', 'SUPER_ADMIN', 'STORE_MANAGER', 'MANAGER'].includes(userRole);
  const isOwner = ['OWNER', 'SUPER_ADMIN'].includes(userRole);
  const isManager = userRole === 'MANAGER' || userRole === 'STORE_MANAGER';

  // Synchronize branch selection when parent props change
  useEffect(() => {
    if (selectedBranch && selectedBranch !== selectedBranchId) {
      setSelectedBranchId(selectedBranch);
    }
  }, [selectedBranch]);

  useEffect(() => {
    if (isCashierUser && activeTab !== 'closing') {
      setActiveTab('closing');
    }
  }, [isCashierUser, activeTab]);

  const [selectedCashierId, setSelectedCashierId] = useState<string>(() => {
    return isCashierUser ? user.id : '';
  });

  useEffect(() => {
    if (isCashierUser && selectedCashierId !== user.id) {
      setSelectedCashierId(user.id);
    }
  }, [user.id, isCashierUser]);

  const fmt = (minor: number = 0) =>
    `₹${((minor || 0) / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // --------------------------------------------------------------------------
  // Data Fetchers
  // --------------------------------------------------------------------------
  const loadPreview = async () => {
    try {
      setLoadingPreview(true);
      setError(null);
      const res = await fetchDayClosingPreview({
        branchId: activeBranchId,
        date: selectedDate,
        shiftId: selectedShiftId || undefined,
        cashierId: selectedCashierId || undefined,
        counterId: selectedCounterId || undefined,
      });
      setPreview(res);
      if (res.closedRecord?.audit_summary && Object.keys(res.closedRecord.audit_summary).length > 0) {
        setAuditData(res.closedRecord.audit_summary);
      } else if (res.audit) {
        setAuditData(res.audit);
      }
      const expected = res.cashReconciliation?.expectedClosingCashMinor ?? 0;
      if (res.status === 'open' || res.status === 'reopened') {
        setActualCashStr(((expected || 0) / 100).toFixed(2));
        setClosingRemarks(res.closedRecord?.remarks || '');
      } else if (res.closedRecord?.actual_cash_minor != null) {
        setActualCashStr((res.closedRecord.actual_cash_minor / 100).toFixed(2));
        setClosingRemarks(res.closedRecord.remarks || '');
      } else {
        setActualCashStr(((expected || 0) / 100).toFixed(2));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch day closing preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleRunLiveAudit = async (customActualCash?: number) => {
    try {
      setRunningLiveAudit(true);
      const actualVal = customActualCash !== undefined
        ? customActualCash
        : Math.round((parseFloat(actualCashStr) || 0) * 100);

      const res = await fetchDayClosingAudit({
        branchId: activeBranchId,
        date: selectedDate,
        shiftId: selectedShiftId || undefined,
        cashierId: selectedCashierId || undefined,
        counterId: selectedCounterId || undefined,
        actualCashMinor: actualVal,
      });
      if (res.success && res.audit) {
        setAuditData(res.audit);
      }
    } catch (err: any) {
      console.error('Failed to run live audit:', err);
    } finally {
      setRunningLiveAudit(false);
    }
  };

  const toggleIssueReviewed = (issueId: string) => {
    setReviewedIssueIds(prev => ({
      ...prev,
      [issueId]: !prev[issueId],
    }));
  };

  const toggleIssueExpanded = (issueId: string) => {
    setExpandedIssueIds(prev => ({
      ...prev,
      [issueId]: !prev[issueId],
    }));
  };

  const filteredAuditIssues = React.useMemo(() => {
    if (!auditData?.issues) return [];
    if (auditFilter === 'all') return auditData.issues;
    if (auditFilter === 'critical') return auditData.issues.filter(i => i.severity === 'critical');
    if (auditFilter === 'warning') return auditData.issues.filter(i => i.severity === 'warning');
    if (auditFilter === 'info') return auditData.issues.filter(i => i.severity === 'info');
    return auditData.issues;
  }, [auditData, auditFilter]);

  const loadNotifications = async () => {
    try {
      const res = await fetchDayClosingNotifications({ branchId: activeBranchId });
      if (res.success) {
        setNotifications(res.notifications || []);
        setUnreadNotifCount(res.unreadCount || 0);
      }
    } catch {
      // background silent catch
    }
  };

  const handleDismissNotification = async (notifId: string) => {
    try {
      await markDayClosingNotificationRead(notifId);
      setNotifications(prev => prev.filter(n => n.id !== notifId));
      setUnreadNotifCount(prev => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  };

  const loadCounterSales = async () => {
    try {
      setLoadingCounterSales(true);
      setError(null);
      const res = await fetchCounterSalesReport({
        branchId: activeBranchId,
        date: selectedDate,
      });
      setCounterSalesData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load counter sales report');
    } finally {
      setLoadingCounterSales(false);
    }
  };

  const loadCashierSales = async () => {
    try {
      setLoadingCashierSales(true);
      setError(null);
      const res = await fetchCashierSalesReport({
        branchId: activeBranchId,
        date: selectedDate,
      });
      setCashierSalesData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load cashier sales report');
    } finally {
      setLoadingCashierSales(false);
    }
  };

  const loadCompliance = async () => {
    try {
      setLoadingCompliance(true);
      setError(null);
      const res = await fetchDayClosingCompliance({
        branchId: activeBranchId,
        date: selectedDate,
      });
      setComplianceData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load closing compliance');
    } finally {
      setLoadingCompliance(false);
    }
  };

  const loadSchedule = async () => {
    try {
      setLoadingSchedule(true);
      const res = await fetchDayClosingSchedules(activeBranchId);
      if (res.success && res.schedule) {
        setScheduleData(res.schedule);
        setExpClosingTime(res.schedule.expectedClosingTime || res.schedule.expected_closing_time || '22:00');
        setFirstReminderMin(res.schedule.firstReminderMinutesBefore ?? res.schedule.first_reminder_minutes_before ?? 30);
        setSecondReminderMin(res.schedule.secondReminderMinutesBefore ?? res.schedule.second_reminder_minutes_before ?? 15);
        setFinalReminder(res.schedule.finalReminderAtClosing ?? res.schedule.final_reminder_at_closing ?? true);
        setOverdueIntervalMin(res.schedule.overdueReminderIntervalMinutes ?? res.schedule.overdue_reminder_interval_minutes ?? 30);
        setAutoAlert(res.schedule.autoAlertOverdue ?? res.schedule.auto_alert_overdue ?? true);
      }
    } catch {
      // ignore
    } finally {
      setLoadingSchedule(false);
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingSchedule(true);
      setError(null);
      await saveDayClosingSchedule({
        branchId: activeBranchId,
        expectedClosingTime: expClosingTime,
        firstReminderMinutesBefore: firstReminderMin,
        secondReminderMinutesBefore: secondReminderMin,
        finalReminderAtClosing: finalReminder,
        overdueReminderIntervalMinutes: overdueIntervalMin,
        autoAlertOverdue: autoAlert,
        enabled: true,
      });
      setSuccessMsg('Closing schedule and reminder settings saved successfully.');
      loadSchedule();
      loadCompliance();
    } catch (err: any) {
      setError(err.message || 'Failed to save schedule settings');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleSendReminder = async (cashierId?: string | null) => {
    try {
      setSendingReminder(true);
      setError(null);
      const res = await sendDayClosingReminder({
        branchId: activeBranchId,
        cashierId: cashierId || null,
        date: selectedDate,
        reminderType: 'manual',
        message: `Management Reminder: Please count physical cash and submit your register reconciliation for ${selectedDate}.`,
      });
      setSuccessMsg(res.message || 'Closing reminder sent successfully.');
      loadCompliance();
      loadNotifications();
    } catch (err: any) {
      setError(err.message || 'Failed to send closing reminder');
    } finally {
      setSendingReminder(false);
    }
  };

  const handleExportCounterCsv = () => {
    if (!counterSalesData?.counters?.length) return;
    const header = [
      'Counter Code',
      'Counter Name',
      'Is Exception',
      'Invoices Count',
      'Returns Count',
      'Gross Sales (Rs)',
      'Discounts (Rs)',
      'Returns Value (Rs)',
      'Net Sales (Rs)',
      'Taxable Sales (Rs)',
      'GST Collected (Rs)',
      'COGS (Rs)',
      'Gross Profit (Rs)',
      'Margin %',
      'Credit Sales (Rs)',
      'Cash Collections (Rs)',
      'UPI Collections (Rs)',
      'Card Collections (Rs)',
      'Total Collections (Rs)',
    ];
    const escapeCsv = (str: any) => `"${String(str ?? '').replace(/"/g, '""')}"`;
    const rows = counterSalesData.counters.map((c: any) => [
      c.counterCode,
      c.counterName,
      c.isException ? 'YES (UNASSIGNED)' : 'NO',
      c.invoicesCount,
      c.returnsCount,
      (c.grossSalesMinor / 100).toFixed(2),
      (c.discountsTotalMinor / 100).toFixed(2),
      (c.returnsTotalMinor / 100).toFixed(2),
      (c.netSalesMinor / 100).toFixed(2),
      (c.taxableSalesMinor / 100).toFixed(2),
      (c.gstCollectedMinor / 100).toFixed(2),
      (c.netCogsMinor / 100).toFixed(2),
      (c.grossProfitMinor / 100).toFixed(2),
      c.marginPct + '%',
      (c.creditSalesMinor / 100).toFixed(2),
      (c.collections.cash / 100).toFixed(2),
      (c.collections.upi / 100).toFixed(2),
      (c.collections.card / 100).toFixed(2),
      (c.collections.total / 100).toFixed(2),
    ]);
    const csv = [header, ...rows].map(r => r.map(escapeCsv).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Counter_Sales_Report_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCashierCsv = () => {
    if (!cashierSalesData?.cashiers?.length) return;
    const header = [
      'Cashier Name',
      'Role',
      'Closing Status',
      'Is Exception',
      'Invoices Count',
      'Returns Count',
      'Gross Sales (Rs)',
      'Discounts (Rs)',
      'Returns Value (Rs)',
      'Net Sales (Rs)',
      'Taxable Sales (Rs)',
      'GST Collected (Rs)',
      'COGS (Rs)',
      'Gross Profit (Rs)',
      'Margin %',
      'Credit Sales (Rs)',
      'Cash Collections (Rs)',
      'UPI Collections (Rs)',
      'Card Collections (Rs)',
      'Total Collections (Rs)',
      'Actual Cash (Rs)',
      'Expected Cash (Rs)',
      'Cash Difference (Rs)',
    ];
    const escapeCsv = (str: any) => `"${String(str ?? '').replace(/"/g, '""')}"`;
    const rows = cashierSalesData.cashiers.map((c: any) => [
      c.cashierName,
      c.cashierRole,
      c.closingStatus,
      c.isException ? 'YES (UNASSIGNED)' : 'NO',
      c.invoicesCount,
      c.returnsCount,
      (c.grossSalesMinor / 100).toFixed(2),
      (c.discountsTotalMinor / 100).toFixed(2),
      (c.returnsTotalMinor / 100).toFixed(2),
      (c.netSalesMinor / 100).toFixed(2),
      (c.taxableSalesMinor / 100).toFixed(2),
      (c.gstCollectedMinor / 100).toFixed(2),
      (c.netCogsMinor / 100).toFixed(2),
      (c.grossProfitMinor / 100).toFixed(2),
      c.marginPct + '%',
      (c.creditSalesMinor / 100).toFixed(2),
      (c.collections.cash / 100).toFixed(2),
      (c.collections.upi / 100).toFixed(2),
      (c.collections.card / 100).toFixed(2),
      (c.collections.total / 100).toFixed(2),
      c.actualCashMinor != null ? (c.actualCashMinor / 100).toFixed(2) : '—',
      c.expectedCashMinor != null ? (c.expectedCashMinor / 100).toFixed(2) : '—',
      c.varianceMinor != null ? (c.varianceMinor / 100).toFixed(2) : '—',
    ]);
    const csv = [header, ...rows].map(r => r.map(escapeCsv).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Cashier_Sales_Report_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const loadComparison = async () => {
    try {
      setLoadingComparison(true);
      setError(null);
      const res = await fetchDayClosingComparison({
        branchId: activeBranchId,
        date: selectedDate,
      });
      setComparisonData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch sales comparison');
    } finally {
      setLoadingComparison(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      setLoadingAnalytics(true);
      setError(null);
      const res = await fetchDayClosingAnalytics({
        branchId: activeBranchId,
        startDate: analyticsStartDate,
        endDate: analyticsEndDate,
      });
      setAnalyticsData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch date range analytics');
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      setError(null);
      const res = await fetchDayClosingHistory({
        branchId: activeBranchId,
        limit: 50,
      });
      setHistory(res?.history || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch closing history');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [activeBranchId]);

  useEffect(() => {
    if (activeTab === 'closing') {
      loadPreview();
    } else if (activeTab === 'breakdown') {
      loadCounterSales();
      loadCashierSales();
    } else if (activeTab === 'comparison') {
      loadComparison();
    } else if (activeTab === 'analytics') {
      loadAnalytics();
    } else if (activeTab === 'compliance') {
      loadCompliance();
      loadSchedule();
    } else if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeBranchId, selectedDate, selectedShiftId, selectedCashierId, selectedCounterId, activeTab]);

  const handleApplyPreset = (preset: string) => {
    setAnalyticsPreset(preset);
    const d = new Date();
    const todayStr = d.toISOString().slice(0, 10);

    if (preset === 'today') {
      setAnalyticsStartDate(todayStr);
      setAnalyticsEndDate(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date(d.getTime() - 86400000).toISOString().slice(0, 10);
      setAnalyticsStartDate(y);
      setAnalyticsEndDate(y);
    } else if (preset === 'last_7_days') {
      const s = new Date(d.getTime() - 6 * 86400000).toISOString().slice(0, 10);
      setAnalyticsStartDate(s);
      setAnalyticsEndDate(todayStr);
    } else if (preset === 'last_30_days') {
      const s = new Date(d.getTime() - 29 * 86400000).toISOString().slice(0, 10);
      setAnalyticsStartDate(s);
      setAnalyticsEndDate(todayStr);
    } else if (preset === 'this_month') {
      const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
      setAnalyticsStartDate(start);
      setAnalyticsEndDate(todayStr);
    } else if (preset === 'last_month') {
      const start = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
      const end = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
      setAnalyticsStartDate(start);
      setAnalyticsEndDate(end);
    }
  };

  // --------------------------------------------------------------------------
  // Action Handlers
  // --------------------------------------------------------------------------
  const handleSubmitClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview) return;

    if (preview.status === 'approved' || preview.status === 'closed') {
      alert('This business date is already approved and sealed.');
      return;
    }

    if (isNaN(parseFloat(actualCashStr))) {
      alert('Please enter a valid actual closing cash amount.');
      return;
    }

    const actualCashMinor = Math.round((parseFloat(actualCashStr) || 0) * 100);
    const expectedCashMinor = preview.cashReconciliation?.expectedClosingCashMinor || 0;
    const diffMinor = actualCashMinor - expectedCashMinor;

    // Discrepancy explanation mandatory if there is cash variance
    if (Math.abs(diffMinor) > 0 && closingRemarks.trim().length < 3) {
      alert(`Cash difference of ${diffMinor >= 0 ? '+' : ''}${fmt(diffMinor)} detected.\n\nPlease provide a brief discrepancy reason in the remarks field before submitting.`);
      return;
    }

    const confirmMsg =
      `Submit Day Closing for ${preview.bdate || selectedDate}?\n\n` +
      `Expected Cash: ${fmt(expectedCashMinor)}\n` +
      `Counted Cash:  ${fmt(actualCashMinor)}\n` +
      `Difference:    ${diffMinor >= 0 ? '+' : ''}${fmt(diffMinor)}\n\n` +
      `This will seal today's register and record cash drawer floats.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await submitDayClosing({
        branchId: activeBranchId,
        date: preview.bdate || selectedDate,
        shiftId: selectedShiftId || undefined,
        cashierId: selectedCashierId || undefined,
        counterId: selectedCounterId || undefined,
        status: isCashierUser ? 'submitted' : undefined,
        actualCashMinor,
        remarks: closingRemarks.trim(),
        auditSummary: auditData || preview?.audit,
      });
      setSuccessMsg(`Day closing submitted successfully! Reference: ${res.dayClosing?.id || 'OK'}`);
      await loadPreview();
    } catch (err: any) {
      setError(err.message || 'Failed to submit day closing');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveClosing = async (closingId: string) => {
    if (!window.confirm('Approve and permanently lock this day closing? All transactions on this date will be sealed.')) return;
    try {
      setActionLoading(true);
      setError(null);
      await approveDayClosing(closingId);
      setSuccessMsg('Day closing approved and locked successfully!');
      await loadPreview();
      await loadHistory();
    } catch (err: any) {
      setError(err.message || 'Failed to approve day closing');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenReopenModal = (closingId: string) => {
    setReopenTargetId(closingId);
    setReopenReason('');
    setReopenPin('');
    setIsReopenModalOpen(true);
  };

  const handleConfirmReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenTargetId) return;
    if (reopenReason.trim().length < 5) {
      alert('Please provide a meaningful reason (at least 5 characters) for reopening.');
      return;
    }
    if (isManager && !reopenPin.trim()) {
      alert('Security PIN or password is required for Manager reopening authorization.');
      return;
    }

    try {
      setReopening(true);
      setError(null);
      await reopenDayClosing(reopenTargetId, reopenReason.trim(), reopenPin.trim() || undefined);
      setSuccessMsg('Business day has been reopened. Invoices unlocked for correction.');
      setIsReopenModalOpen(false);
      await loadPreview();
      await loadHistory();
    } catch (err: any) {
      setError(err.message || 'Failed to reopen day closing');
    } finally {
      setReopening(false);
    }
  };

  const handleOpenRejectModal = (closingId: string) => {
    setRejectTargetId(closingId);
    setRejectReason('');
    setIsRejectModalOpen(true);
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTargetId) return;
    if (rejectReason.trim().length < 5) {
      alert('Please provide a specific reason for rejection / recount (at least 5 characters).');
      return;
    }

    try {
      setRejecting(true);
      setError(null);
      await rejectDayClosing(rejectTargetId, rejectReason.trim());
      setSuccessMsg('Day closing returned to Cashier for recount and correction.');
      setIsRejectModalOpen(false);
      await loadPreview();
      await loadHistory();
    } catch (err: any) {
      setError(err.message || 'Failed to reject day closing');
    } finally {
      setRejecting(false);
    }
  };

  const handlePrint = (closingId: string) => {
    const tid = shop?.id || preview?.closedRecord?.tenant_id || preview?.closedRecord?.tenantId || '';
    const query = tid ? `?tenantId=${encodeURIComponent(tid)}` : '';
    window.open(withAuthToken(`/api/day-closing/${closingId}/print${query}`), '_blank', 'width=950,height=800');
  };

  const handleExportCsv = (closingId?: string) => {
    if (closingId) {
      window.open(withAuthToken(`/api/day-closing/${closingId}/export.csv`), '_blank');
    } else {
      window.open(withAuthToken(`/api/day-closing/history/export.csv?branchId=${encodeURIComponent(activeBranchId)}`), '_blank');
    }
  };

  // Computed values from preview
  const sales = preview?.salesSummary || {
    grossSalesMinor: 0,
    totalDiscountsMinor: 0,
    returnsTotalMinor: 0,
    netSalesMinor: 0,
    gstCollectedMinor: 0,
    invoicesCount: 0,
    cancelledInvoicesCount: 0,
    averageBillValueMinor: 0,
    totalProductsSold: 0,
    totalQuantitiesSold: 0,
    totalCustomersBilled: 0,
    newCustomersCount: 0,
    customerCreditBalanceMinor: 0,
  };

  const returns = preview?.returnSummary || {
    totalReturnsCount: 0,
    totalReturnValueMinor: 0,
    cashRefundsPaidMinor: 0,
    upiRefundsPaidMinor: 0,
    totalRefundsPaidMinor: 0,
    exchangeCreditAdjustedMinor: 0,
    storeCreditsIssuedMinor: 0,
  };

  const exchanges = preview?.exchangeSummary || {
    exchangesCount: 0,
    exchangeAdjustedMinor: 0,
    newProductsSoldMinor: 0,
    remainingCustomerCreditMinor: 0,
  };

  const payments = preview?.paymentSummary || {
    cashCollectionsMinor: 0,
    upiCollectionsMinor: 0,
    cardCollectionsMinor: 0,
    storeCreditMinor: 0,
  };

  const profit = preview?.profitSummary || {
    netSalesMinor: 0,
    netCogsMinor: 0,
    grossProfitMinor: 0,
    operatingExpensesMinor: 0,
    netProfitMinor: 0,
  };

  const cashRec = preview?.cashReconciliation || {
    openingCashMinor: 0,
    cashSalesReceivedMinor: 0,
    cashRefundsPaidMinor: 0,
    cashInMinor: 0,
    cashOutMinor: 0,
    cashExpensesMinor: 0,
    expectedClosingCashMinor: 0,
  };

  const marginPct = sales.netSalesMinor > 0
    ? (profit.grossProfitMinor / sales.netSalesMinor) * 100
    : 0;

  const operatingMarginPct = sales.netSalesMinor > 0
    ? (profit.netProfitMinor / sales.netSalesMinor) * 100
    : 0;

  const actualCashMinor = Math.round((parseFloat(actualCashStr) || 0) * 100);
  const expectedCashMinor = cashRec.expectedClosingCashMinor || 0;
  const cashDifferenceMinor = actualCashMinor - expectedCashMinor;

  const closingStatus = preview?.status || (preview?.isClosed ? 'closed' : 'open');
  const closedRecord = preview?.closedRecord || null;

  return (
    <div className="day-closing-wrapper">
      {/* --------------------------------------------------------------------
          1. Header Card
          -------------------------------------------------------------------- */}
      <div className="day-closing-header-card">
        <div className="day-closing-header-left">
          <div className="day-closing-header-icon">
            <LockIcon size={24} />
          </div>
          <div>
            <h1 className="day-closing-title">Day Closing & Register Reconciliation</h1>
            <p className="day-closing-subtitle">
              Audit daily sales, returns, cash drawer floats, and seal register transactions
            </p>
          </div>
        </div>

        <div className="day-closing-header-right">
          {closedRecord?.id && (
            <>
              <button
                onClick={() => handlePrint(closedRecord.id)}
                className="btn-print"
                title="Print Official Closing Statement"
              >
                <PrinterIcon size={15} />
                Print Statement
              </button>

              <button
                onClick={() => handleExportCsv(closedRecord.id)}
                className="btn-export"
                title="Download closing details in Excel CSV format"
              >
                <FileSpreadsheetIcon size={15} />
                Export CSV
              </button>
            </>
          )}

          <button
            onClick={() => {
              if (activeTab === 'closing') loadPreview();
              else if (activeTab === 'comparison') loadComparison();
              else if (activeTab === 'analytics') loadAnalytics();
              else if (activeTab === 'history') loadHistory();
            }}
            disabled={loadingPreview || loadingComparison || loadingAnalytics || loadingHistory}
            className="day-closing-refresh-btn"
          >
            <RefreshCwIcon size={14} className={(loadingPreview || loadingComparison || loadingAnalytics || loadingHistory) ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------------------
          2. Tab Navigation Bar (4 Clean, Dedicated Tabs)
          -------------------------------------------------------------------- */}
      <div className="day-closing-tabs-bar">
        <button
          onClick={() => setActiveTab('closing')}
          className={`day-closing-tab-btn ${activeTab === 'closing' ? 'active' : ''}`}
        >
          <LockIcon size={15} />
          Register Closing & Reconciliation
        </button>

        {!isCashierUser && (
          <>
            <button
              onClick={() => setActiveTab('breakdown')}
              className={`day-closing-tab-btn ${activeTab === 'breakdown' ? 'active' : ''}`}
            >
              <FileSpreadsheetIcon size={15} />
              Counter & Cashier Reports
            </button>

            <button
              onClick={() => setActiveTab('comparison')}
              className={`day-closing-tab-btn ${activeTab === 'comparison' ? 'active' : ''}`}
            >
              <ScaleIcon size={15} />
              Today vs Previous Day Comparison
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`day-closing-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            >
              <BarChart3Icon size={15} />
              Custom Date Range Analytics
            </button>

            <button
              onClick={() => setActiveTab('compliance')}
              className={`day-closing-tab-btn ${activeTab === 'compliance' ? 'active' : ''}`}
            >
              <CheckCircleIcon size={15} />
              Schedules & Compliance
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`day-closing-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            >
              <ClockIcon size={15} />
              Closing History & Audit Logs
            </button>
          </>
        )}
      </div>

      {/* --------------------------------------------------------------------
          3. Global Filter Controls Bar
          -------------------------------------------------------------------- */}
      <div className="day-closing-filter-bar">
        <div className="day-closing-filter-group">
          {branches && branches.length > 0 && !isCashierUser && (
            <div className="day-closing-filter-item">
              <Building2Icon size={15} style={{ color: '#4f46e5' }} />
              <select
                value={activeBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="day-closing-select"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code || b.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          {isCashierUser && (
            <div className="day-closing-filter-item" title="Assigned Branch">
              <Building2Icon size={15} style={{ color: '#4f46e5' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>
                {branches?.find((b: any) => b.id === activeBranchId)?.name || activeBranchId}
              </span>
            </div>
          )}

          {activeTab === 'closing' || activeTab === 'comparison' ? (
            <div className="day-closing-filter-item">
              <ClockIcon size={15} style={{ color: '#059669' }} />
              {isCashierUser ? (
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>
                  {selectedDate}
                </span>
              ) : (
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="day-closing-input"
                />
              )}
            </div>
          ) : null}

          {/* Cashier Filter / Context Badge */}
          {activeTab === 'closing' && (
            <>
              {isCashierUser ? (
                <div className="day-closing-filter-item" title="Logged in as Cashier (Counter Register)">
                  <UserIcon size={14} style={{ color: '#0284c7' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>
                    Cashier: {user.name}
                  </span>
                </div>
              ) : (
                <div className="day-closing-filter-item">
                  <UserIcon size={14} style={{ color: '#0284c7' }} />
                  <select
                    value={selectedCashierId}
                    onChange={(e) => {
                      setSelectedCashierId(e.target.value);
                      setActualCashStr('');
                      setClosingRemarks('');
                    }}
                    className="day-closing-select"
                    title="Filter by individual Cashier / Counter register"
                  >
                    <option value="">All Cashiers (Consolidated)</option>
                    {preview?.availableCashiers && preview.availableCashiers.length > 0
                      ? preview.availableCashiers.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            Cashier: {c.name} {c.role ? `(${c.role})` : ''}
                          </option>
                        ))
                      : null}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Counter Filter */}
          {activeTab === 'closing' && !isCashierUser && preview?.availableCounters && preview.availableCounters.length > 0 && (
            <div className="day-closing-filter-item">
              <Building2Icon size={14} style={{ color: '#0d9488' }} />
              <select
                value={selectedCounterId}
                onChange={(e) => setSelectedCounterId(e.target.value)}
                className="day-closing-select"
                title="Filter by Counter Terminal"
              >
                <option value="">All Counters (Store-wide)</option>
                {preview.availableCounters.map((cnt: any) => (
                  <option key={cnt.id} value={cnt.id || cnt.code}>
                    Counter: {cnt.name} ({cnt.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeTab === 'closing' && preview?.availableShifts && preview.availableShifts.length > 0 && (
            <div className="day-closing-filter-item">
              <FilterIcon size={14} style={{ color: '#6366f1' }} />
              <select
                value={selectedShiftId}
                onChange={(e) => setSelectedShiftId(e.target.value)}
                className="day-closing-select"
              >
                <option value="">All Shifts (Consolidated Full Day)</option>
                {preview.availableShifts.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    Shift {s.shift_number || s.id.slice(0, 6)} ({s.cashier_name || 'Cashier'})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
          Tenant: <strong style={{ color: '#0f172a' }}>{shop?.name || 'Main Organization'}</strong>
        </div>
      </div>

      {/* Overdue Register Alert */}
      {preview?.scheduleInfo?.isOverdue && (
        <div style={{
          background: '#fff1f2',
          border: '1px solid #fecdd3',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#9f1239',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangleIcon size={18} style={{ color: '#e11d48' }} />
            <div>
              <strong>Overdue Register Alert:</strong> Expected closing time was{' '}
              <strong>{preview.scheduleInfo.expectedClosingTime}</strong> ({preview.scheduleInfo.minutesOverdue} mins overdue). Please complete cash count and submit day closing.
            </div>
          </div>
          {preview.scheduleInfo.lastReminderSentAt && (
            <span style={{ fontSize: '0.75rem', color: '#be123c' }}>
              Last reminder: {new Date(preview.scheduleInfo.lastReminderSentAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {/* In-app Notifications Banner */}
      {notifications && notifications.length > 0 && notifications.map((n: any) => (
        <div key={n.id} style={{
          background: n.type === 'rejection' ? '#fffbeb' : (n.type === 'approval' ? '#f0fdf4' : '#eff6ff'),
          border: `1px solid ${n.type === 'rejection' ? '#fde68a' : (n.type === 'approval' ? '#bbf7d0' : '#bfdbfe')}`,
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: n.type === 'rejection' ? '#92400e' : (n.type === 'approval' ? '#166534' : '#1e40af'),
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {n.type === 'rejection' ? <AlertTriangleIcon size={16} /> : (n.type === 'approval' ? <CheckCircleIcon size={16} /> : <InfoIcon size={16} />)}
            <div>
              <strong>{n.title}:</strong> {n.message}
            </div>
          </div>
          <button
            onClick={() => handleDismissNotification(n.id)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', color: 'inherit' }}
            title="Dismiss notification"
          >
            ✕
          </button>
        </div>
      ))}

      {/* Alerts */}
      {error && (
        <div className="day-closing-alert error">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangleIcon size={18} />
            <span><strong>Error:</strong> {error}</span>
          </div>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', color: '#b91c1c' }}>✕</button>
        </div>
      )}

      {successMsg && (
        <div className="day-closing-alert success">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2Icon size={18} />
            <span><strong>Success:</strong> {successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', color: '#047857' }}>✕</button>
        </div>
      )}

      {/* ====================================================================
          TAB 1: REGISTER CLOSING & CASH RECONCILIATION
          ==================================================================== */}
      {activeTab === 'closing' && (
        <>
          {/* --------------------------------------------------------------------
              Smart Closing Audit & Detector Overview Bar & Expandable Panel
              -------------------------------------------------------------------- */}
          {auditData && (
            <>
              <div className="smart-audit-bar">
                <div className="smart-audit-bar-left">
                  {/* Readiness Status Badge */}
                  <div className={`smart-audit-status-badge ${auditData.readinessStatus}`}>
                    {auditData.readinessStatus === 'ready_to_submit' ? (
                      <ShieldCheckIcon size={16} />
                    ) : (
                      <ShieldAlertIcon size={16} />
                    )}
                    <span>
                      {auditData.readinessStatus === 'ready_to_submit' && 'Ready to Submit'}
                      {auditData.readinessStatus === 'ready_with_warnings' && 'Ready with Warnings'}
                      {auditData.readinessStatus === 'action_required' && 'Action Required'}
                    </span>
                  </div>

                  {/* Diagnostic Metric Pills */}
                  <div className="smart-audit-pills-group">
                    <span className="smart-audit-counter-pill score" title="Overall closing compliance & readiness score">
                      <strong>Score:</strong> {auditData.readinessScore}/100
                    </span>

                    {auditData.criticalCount > 0 && (
                      <span className="smart-audit-counter-pill critical">
                        <AlertOctagonIcon size={13} />
                        <strong>{auditData.criticalCount}</strong> Critical
                      </span>
                    )}

                    {auditData.warningCount > 0 && (
                      <span className="smart-audit-counter-pill warning">
                        <AlertTriangleIcon size={13} />
                        <strong>{auditData.warningCount}</strong> Warnings
                      </span>
                    )}

                    {auditData.infoCount > 0 && (
                      <span className="smart-audit-counter-pill info">
                        <InfoIcon size={13} />
                        <strong>{auditData.infoCount}</strong> Observations
                      </span>
                    )}

                    {auditData.issues.length === 0 && (
                      <span className="smart-audit-counter-pill" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#047857' }}>
                        <CheckIcon size={13} />
                        All 12 Detectors Clear
                      </span>
                    )}
                  </div>
                </div>

                <div className="smart-audit-bar-right">
                  <button
                    type="button"
                    onClick={() => handleRunLiveAudit()}
                    disabled={runningLiveAudit || loadingPreview}
                    className="smart-audit-run-btn"
                    title="Re-run all 12 financial and operational audit detectors in real time"
                  >
                    <RefreshCwIcon size={13} className={runningLiveAudit ? 'animate-spin' : ''} />
                    {runningLiveAudit ? 'Auditing...' : 'Run Audit Check'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuditExpanded(!auditExpanded)}
                    className="smart-audit-toggle-btn"
                    title={auditExpanded ? 'Collapse audit details' : 'Expand detailed detector report and formula breakdown'}
                  >
                    <span>{auditExpanded ? 'Hide Details' : `Audit Details (${auditData.issues.length})`}</span>
                    {auditExpanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                  </button>
                </div>
              </div>

              {/* Expandable Audit Details Panel */}
              {auditExpanded && (
                <div className="smart-audit-panel">
                  <div className="smart-audit-header">
                    <div className="smart-audit-header-title">
                      <h3>Smart Closing Audit & Verification Report</h3>
                      <p>
                        Intelligent multi-point financial mismatch detection, transaction ledger reconciliation, and business anomaly analysis.
                      </p>
                    </div>

                    <div className="smart-audit-filter-tabs">
                      <button
                        type="button"
                        onClick={() => setAuditFilter('all')}
                        className={`smart-audit-filter-tab ${auditFilter === 'all' ? 'active' : ''}`}
                      >
                        All Issues ({auditData.issues.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuditFilter('critical')}
                        className={`smart-audit-filter-tab ${auditFilter === 'critical' ? 'active' : ''}`}
                      >
                        Critical ({auditData.criticalCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuditFilter('warning')}
                        className={`smart-audit-filter-tab ${auditFilter === 'warning' ? 'active' : ''}`}
                      >
                        Warnings ({auditData.warningCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuditFilter('info')}
                        className={`smart-audit-filter-tab ${auditFilter === 'info' ? 'active' : ''}`}
                      >
                        Observations ({auditData.infoCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuditFilter('detectors')}
                        className={`smart-audit-filter-tab ${auditFilter === 'detectors' ? 'active' : ''}`}
                      >
                        All 12 Detectors
                      </button>
                    </div>
                  </div>

                  {/* Panel Content: Issues List or Detectors Grid */}
                  {auditFilter === 'detectors' ? (
                    <div className="smart-audit-detectors-grid">
                      {ALL_DETECTORS.map((detector) => {
                        const matchingIssues = auditData.issues.filter((i) => i.detector === detector.id);
                        const hasCritical = matchingIssues.some((i) => i.severity === 'critical');
                        const hasWarning = matchingIssues.some((i) => i.severity === 'warning');
                        const hasInfo = matchingIssues.some((i) => i.severity === 'info');
                        const statusClass = hasCritical ? 'failed' : hasWarning ? 'warning' : hasInfo ? 'info' : 'passed';

                        return (
                          <div key={detector.id} className={`smart-audit-detector-card ${statusClass}`}>
                            <div className="smart-audit-detector-top">
                              <span className="smart-audit-detector-name">{detector.name}</span>
                              <span className={`smart-audit-detector-badge ${statusClass}`}>
                                {statusClass === 'passed' && 'Passed'}
                                {statusClass === 'failed' && 'Action Required'}
                                {statusClass === 'warning' && 'Warning'}
                                {statusClass === 'info' && 'Observation'}
                              </span>
                            </div>
                            <div className="smart-audit-detector-cat">{detector.categoryLabel}</div>
                            <p className="smart-audit-detector-desc">{detector.description}</p>
                            {matchingIssues.length > 0 && (
                              <div style={{ marginTop: '0.65rem', fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>
                                {matchingIssues.length} issue(s) flagged
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="smart-audit-issues-list">
                      {filteredAuditIssues.length === 0 ? (
                        <div className="smart-audit-clean-state">
                          <ShieldCheckIcon size={44} style={{ color: '#059669', marginBottom: '8px' }} />
                          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                            {auditFilter === 'all'
                              ? 'All 12 Reconciliation Checks Passed Cleanly'
                              : `No ${auditFilter.toUpperCase()} issues detected`}
                          </div>
                          <div style={{ fontSize: '0.825rem', color: '#64748b', maxWidth: '460px', marginTop: '4px' }}>
                            All ledger entries, tender settlements, invoice line totals, and cashier attributions match expected values.
                          </div>
                        </div>
                      ) : (
                        filteredAuditIssues.map((issue) => {
                          const isExpanded = !!expandedIssueIds[issue.id];
                          const isReviewed = !!reviewedIssueIds[issue.id];
                          const detName = ALL_DETECTORS.find(d => d.id === issue.detector)?.name || issue.detector;
                          const formulaBreakdown = issue.details?.formulaBreakdown;
                          const supportingItems = (
                            issue.details?.supportingItems ||
                            issue.details?.items ||
                            issue.details?.invoices ||
                            issue.details?.affectedInvoices ||
                            issue.details?.pairs ||
                            issue.details?.highDiscounts ||
                            issue.details?.unusualRefunds ||
                            issue.details?.affectedLines ||
                            []
                          ) as any[];

                          return (
                            <div
                              key={issue.id}
                              className={`smart-audit-issue-card ${issue.severity} ${isReviewed ? 'reviewed' : ''}`}
                            >
                              <div
                                className="smart-audit-issue-header"
                                onClick={() => toggleIssueExpanded(issue.id)}
                              >
                                <div>
                                  <div className="smart-audit-issue-title-row">
                                    <span className={`smart-audit-severity-tag ${issue.severity}`}>
                                      {issue.severity === 'critical' ? (
                                        <AlertOctagonIcon size={12} />
                                      ) : issue.severity === 'warning' ? (
                                        <AlertTriangleIcon size={12} />
                                      ) : (
                                        <InfoIcon size={12} />
                                      )}
                                      {issue.severity.toUpperCase()}
                                    </span>
                                    <h4 className="smart-audit-issue-title">{issue.title}</h4>
                                  </div>
                                  <p className="smart-audit-issue-desc">{issue.description}</p>

                                  <div className="smart-audit-context-tags">
                                    <span className="smart-audit-context-tag">
                                      {detName}
                                    </span>
                                    {(issue.counterCode || issue.counterId) && (
                                      <span className="smart-audit-context-tag">
                                        Counter: {issue.counterCode || issue.counterId}
                                      </span>
                                    )}
                                    {(issue.cashierName || issue.cashierId) && (
                                      <span className="smart-audit-context-tag">
                                        Cashier: {issue.cashierName || issue.cashierId}
                                      </span>
                                    )}
                                    {issue.count != null && issue.count > 0 && (
                                      <span className="smart-audit-context-tag">
                                        {issue.count} Record(s)
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="smart-audit-issue-metrics">
                                  {issue.amountMinor != null && (
                                    <div className="smart-audit-metric-badge">
                                      <span className="smart-audit-metric-label">Amount</span>
                                      <span className="smart-audit-metric-value">{fmt(issue.amountMinor)}</span>
                                    </div>
                                  )}
                                  <div className={`smart-audit-chevron ${isExpanded ? 'open' : ''}`}>
                                    <ChevronDownIcon size={16} />
                                  </div>
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="smart-audit-issue-expanded">
                                  <div className="smart-audit-action-callout">
                                    <strong>Recommended Action:</strong> {issue.recommendedAction || issue.details?.actionRequired || 'Review records.'}
                                  </div>

                                  {formulaBreakdown && (
                                    <div className="smart-audit-detail-block">
                                      <div className="smart-audit-detail-title">Reconciliation Breakdown</div>
                                      <div className="smart-audit-formula-box">{formulaBreakdown}</div>
                                    </div>
                                  )}

                                  {supportingItems.length > 0 && (
                                    <div className="smart-audit-detail-block">
                                      <div className="smart-audit-detail-title">
                                        Supporting Records ({supportingItems.length})
                                      </div>
                                      <table className="smart-audit-supporting-table">
                                        <thead>
                                          <tr>
                                            <th>Reference / ID</th>
                                            <th>Description / Reason</th>
                                            <th style={{ textAlign: 'right' }}>Amount</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {supportingItems.slice(0, 8).map((item, idx) => (
                                            <tr key={idx}>
                                              <td><code>{item.reference || item.invoiceNumber || item.invoice1 || item.id || `Item #${idx + 1}`}</code></td>
                                              <td>{item.description || item.reason || item.type || item.paymentMethod || '—'}</td>
                                              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                                {item.amountMinor != null
                                                  ? fmt(item.amountMinor)
                                                  : (item.totalMinor != null
                                                      ? fmt(item.totalMinor)
                                                      : (item.discountMinor != null ? fmt(item.discountMinor) : '—'))}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                      {supportingItems.length > 8 && (
                                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '6px', textAlign: 'right' }}>
                                          + {supportingItems.length - 8} additional records
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  <div className="smart-audit-expanded-footer">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleIssueReviewed(issue.id);
                                      }}
                                      className={`smart-audit-review-btn ${isReviewed ? 'active' : ''}`}
                                    >
                                      <CheckIcon size={14} />
                                      {isReviewed ? 'Marked as Reviewed' : 'Mark as Reviewed'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {/* Closing Reminder Alert Banner */}
          {preview?.closingReminder?.hasUnclosedPrevDay && (
            <div className="day-closing-alert warning">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangleIcon size={18} style={{ color: '#d97706', flexShrink: 0 }} />
                <span>
                  <strong>Closing Reminder:</strong> Previous business day ({preview.closingReminder.prevDayDate}) register has not been approved and sealed yet. Please review and seal previous day to maintain continuous audit records.
                </span>
              </div>
              <button
                onClick={() => setSelectedDate(preview.closingReminder.prevDayDate)}
                className="day-closing-refresh-btn"
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
              >
                Inspect {preview.closingReminder.prevDayDate}
              </button>
            </div>
          )}

          {/* Duplicate Transaction Warning Banner */}
          {preview?.duplicateAlerts && preview.duplicateAlerts.length > 0 && (
            <div className="day-closing-alert warning">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertOctagonIcon size={18} style={{ color: '#d97706', flexShrink: 0 }} />
                <span>
                  <strong>Duplicate Billing Alert:</strong> Detected {preview.duplicateAlerts.length} potential duplicate invoice pair(s) with identical customer phone and amount within 3 minutes ({preview.duplicateAlerts.map((d: any) => `${d.invoice1} & ${d.invoice2} for ${fmt(d.amountMinor)}`).join(', ')}). Please verify before sealing register.
                </span>
              </div>
            </div>
          )}

          {/* Lifecycle Status Ribbon */}
          <div className={`day-closing-status-banner ${closingStatus}`}>
            <div className="status-banner-left">
              <div className={`status-banner-icon ${closingStatus}`}>
                {closingStatus === 'open' ? (
                  <CheckCircleIcon size={20} />
                ) : closingStatus === 'submitted' ? (
                  <ClockIcon size={20} />
                ) : closingStatus === 'reopened' ? (
                  <AlertTriangleIcon size={20} />
                ) : (
                  <LockIcon size={20} />
                )}
              </div>
              <div>
                <div className="status-banner-title">
                  {closingStatus === 'open' && `Register Open — Active Trading on ${selectedDate}`}
                  {closingStatus === 'submitted' && `Day Closing Submitted — Awaiting Management Approval`}
                  {closingStatus === 'approved' && `Day Closing Approved & Sealed (${selectedDate})`}
                  {closingStatus === 'closed' && `Day Closing Sealed (${selectedDate})`}
                  {closingStatus === 'reopened' && `Day Closing Reopened for Corrections`}
                </div>
                <div className="status-banner-desc">
                  {closingStatus === 'open' && 'Cashier can balance drawer floats and submit end-of-day reconciliation.'}
                  {closingStatus === 'submitted' && `Submitted by ${closedRecord?.closed_by_name || 'Cashier'}. Store Manager or Owner approval required to lock.`}
                  {closingStatus === 'approved' && `Approved by ${closedRecord?.approved_by_name || 'Manager'}. Transactions are sealed against ordinary edits.`}
                  {closingStatus === 'reopened' && `Reopened by ${closedRecord?.reopened_by_name || 'Owner'}. Reason: "${closedRecord?.reopen_reason || 'N/A'}"`}
                </div>
              </div>
            </div>

            <div className="status-banner-actions">
              {closingStatus === 'submitted' && isManagerOrOwner && closedRecord?.id && (
                <>
                  <button
                    onClick={() => handleApproveClosing(closedRecord.id)}
                    disabled={actionLoading}
                    className="btn-approve"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <CheckCircle2Icon size={15} />
                    Approve & Lock Day Closing
                  </button>

                  <button
                    onClick={() => handleOpenRejectModal(closedRecord.id)}
                    disabled={actionLoading}
                    className="btn-reject"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <RotateCcwIcon size={15} />
                    Reject / Recount
                  </button>
                </>
              )}

              {closingStatus === 'reopened' && isManagerOrOwner && closedRecord?.id && (
                <button
                  onClick={() => handleApproveClosing(closedRecord.id)}
                  disabled={actionLoading}
                  className="btn-approve"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckCircle2Icon size={15} />
                  Approve & Re-Seal Day Closing
                </button>
              )}

              {(closingStatus === 'approved' || closingStatus === 'closed') && (isOwner || isManager) && closedRecord?.id && (
                <button
                  onClick={() => handleOpenReopenModal(closedRecord.id)}
                  className="btn-reopen"
                >
                  <RotateCcwIcon size={15} />
                  Reopen Business Day
                </button>
              )}

              {closedRecord?.id && (
                <button
                  onClick={() => handlePrint(closedRecord.id)}
                  className="btn-print"
                >
                  <PrinterIcon size={15} />
                  Print Statement
                </button>
              )}
            </div>
          </div>

          {/* Clean 6-Card Financial KPI Grid */}
          <div className="financial-kpi-grid">
            {/* 1. Gross Sales */}
            <div className="fin-kpi-card blue">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Gross Sales</span>
                <div className="fin-kpi-icon"><TrendingUpIcon size={14} /></div>
              </div>
              <div className="fin-kpi-val">{fmt(sales.grossSalesMinor)}</div>
              <span className="fin-kpi-sub">Pre-discount, excl. GST</span>
            </div>

            {/* 2. Sales Returns */}
            <div className="fin-kpi-card rose">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Sales Returns</span>
                <div className="fin-kpi-icon"><RotateCcwIcon size={14} /></div>
              </div>
              <div className="fin-kpi-val" style={{ color: '#e11d48' }}>-{fmt(sales.returnsTotalMinor)}</div>
              <span className="fin-kpi-sub">{returns.totalReturnsCount || 0} credit notes issued</span>
            </div>

            {/* 3. Net Sales (Highlight) */}
            <div className="fin-kpi-card green highlight">
              <div className="fin-kpi-top">
                <span className="fin-kpi-label">Net Sales</span>
                <div className="fin-kpi-icon"><RupeeIcon size={14} /></div>
              </div>
              <div className="fin-kpi-val">{fmt(sales.netSalesMinor)}</div>
              <span className="fin-kpi-sub">Gross - Discounts - Returns</span>
            </div>

            {/* For Cashiers: Show operational cards (Bills, Discounts, GST). For Management: Show Profitability & Margin cards */}
            {isCashierUser ? (
              <>
                <div className="fin-kpi-card purple">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Total Invoices</span>
                    <div className="fin-kpi-icon"><ReceiptIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val" style={{ color: '#7e22ce' }}>{sales.invoicesCount || 0} bills</div>
                  <span className="fin-kpi-sub">Completed sales transactions</span>
                </div>

                <div className="fin-kpi-card amber">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Discounts Given</span>
                    <div className="fin-kpi-icon"><TagIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val">{fmt(sales.totalDiscountsMinor)}</div>
                  <span className="fin-kpi-sub">Bill & item discounts applied</span>
                </div>

                <div className="fin-kpi-card green">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">GST Collected</span>
                    <div className="fin-kpi-icon"><RupeeIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val" style={{ color: '#15803d' }}>{fmt(sales.gstCollectedMinor)}</div>
                  <span className="fin-kpi-sub">CGST + SGST + IGST</span>
                </div>
              </>
            ) : (
              <>
                {/* 4. Gross Profit */}
                <div className="fin-kpi-card purple">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Gross Profit</span>
                    <div className="fin-kpi-icon"><TrendingUpIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val" style={{ color: '#7e22ce' }}>{fmt(profit.grossProfitMinor)}</div>
                  <span className="fin-kpi-sub">{marginPct.toFixed(1)}% Gross Margin</span>
                </div>

                {/* 5. Operating Expenses */}
                <div className="fin-kpi-card amber">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Operating Expenses</span>
                    <div className="fin-kpi-icon"><ArrowUpRightIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val">{fmt(profit.operatingExpensesMinor)}</div>
                  <span className="fin-kpi-sub">Branch petty & overheads</span>
                </div>

                {/* 6. Operating Profit */}
                <div className="fin-kpi-card green">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Operating Profit</span>
                    <div className="fin-kpi-icon"><RupeeIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val" style={{ color: profit.netProfitMinor >= 0 ? '#15803d' : '#b91c1c' }}>
                    {fmt(profit.netProfitMinor)}
                  </div>
                  <span className="fin-kpi-sub">{operatingMarginPct.toFixed(1)}% Net Margin</span>
                </div>
              </>
            )}
          </div>

          {/* Quick KPI Strip */}
          <div className="quick-kpi-strip">
            <div>Total Invoices: <strong>{sales.invoicesCount || 0} bills</strong></div>
            <div>Avg Bill Value: <strong>{fmt(sales.averageBillValueMinor)}</strong></div>
            <div>GST Collected: <strong>{fmt(sales.gstCollectedMinor)}</strong></div>
            <div>Discounts Given: <strong>{fmt(sales.totalDiscountsMinor)}</strong></div>
            <div>Cancelled Invoices: <strong>{sales.cancelledInvoicesCount || 0}</strong></div>
            <div>Outstanding Credit: <strong style={{ color: '#7e22ce' }}>{fmt(sales.customerCreditBalanceMinor)}</strong></div>
          </div>

          {/* Bento Grid: Tender Collections (60%) & Cash Drawer Reconciliation (40%) */}
          <div className="day-closing-bento-grid">
            {/* LEFT 7 COLUMNS: Tender Collections & Returns */}
            <div className="bento-col-7">
              {/* Tender Collections */}
              <div className="day-closing-card">
                <div className="day-closing-card-header">
                  <div className="day-closing-card-title-group">
                    <WalletIcon size={18} style={{ color: '#10b981' }} />
                    <span>Tender & Settlement Collections</span>
                  </div>
                  <span className="day-closing-card-badge emerald">
                    Payment Channels
                  </span>
                </div>

                <div className="tender-kpi-grid">
                  <div className="tender-kpi-card cash">
                    <div className="tender-header">
                      <BanknoteIcon size={15} />
                      <span>Physical Cash</span>
                    </div>
                    <div className="tender-amount">{fmt(payments.cashCollectionsMinor)}</div>
                  </div>

                  <div className="tender-kpi-card upi">
                    <div className="tender-header">
                      <RefreshCwIcon size={14} />
                      <span>UPI / QR</span>
                    </div>
                    <div className="tender-amount">{fmt(payments.upiCollectionsMinor)}</div>
                  </div>

                  <div className="tender-kpi-card card">
                    <div className="tender-header">
                      <CreditCardIcon size={14} />
                      <span>Card / POS</span>
                    </div>
                    <div className="tender-amount">{fmt(payments.cardCollectionsMinor)}</div>
                  </div>

                  <div className="tender-kpi-card credit">
                    <div className="tender-header">
                      <StoreIcon size={14} />
                      <span>Store Credit</span>
                    </div>
                    <div className="tender-amount">{fmt(payments.storeCreditMinor)}</div>
                  </div>
                </div>
              </div>

              {/* Returns, Refunds & Exchanges */}
              <div className="day-closing-card">
                <div className="day-closing-card-header">
                  <div className="day-closing-card-title-group">
                    <RotateCcwIcon size={18} style={{ color: '#f43f5e' }} />
                    <span>Returns, Refunds & Exchanges</span>
                  </div>
                  <span className="day-closing-card-badge rose">
                    {returns.totalReturnsCount || 0} Return Events
                  </span>
                </div>

                <div>
                  <div className="detail-list-row">
                    <span className="detail-list-label">Total Returned Merchandise Value:</span>
                    <span className="detail-list-val rose">{fmt(returns.totalReturnValueMinor)}</span>
                  </div>
                  <div className="detail-list-row">
                    <span className="detail-list-label">Cash Refunds Disbursed:</span>
                    <span className="detail-list-val">{fmt(returns.cashRefundsPaidMinor)}</span>
                  </div>
                  <div className="detail-list-row">
                    <span className="detail-list-label">UPI Refunds Processed:</span>
                    <span className="detail-list-val">{fmt(returns.upiRefundsPaidMinor)}</span>
                  </div>
                  <div className="detail-list-row">
                    <span className="detail-list-label">Exchange Credits Applied to New Sales:</span>
                    <span className="detail-list-val indigo">{fmt(returns.exchangeCreditAdjustedMinor)}</span>
                  </div>
                  <div className="detail-list-row">
                    <span className="detail-list-label">Store Credit Notes Issued:</span>
                    <span className="detail-list-val purple">{fmt(returns.storeCreditsIssuedMinor)}</span>
                  </div>
                  <div className="detail-list-row">
                    <span className="detail-list-label">New Merchandise Sold in Exchanges:</span>
                    <span className="detail-list-val">{fmt(exchanges.newProductsSoldMinor)}</span>
                  </div>
                </div>

                <div className="detail-notice-box" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <InfoIcon size={16} style={{ color: '#4f46e5', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Accounting Integrity:</strong> Exchanges seamlessly offset customer return credit against new merchandise sold without inflating gross cash collections. Resellable returns restore inventory cost, while damaged goods are quarantined separately.
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT 5 COLUMNS: Dedicated Cash Drawer Reconciliation */}
            <div className="bento-col-5">
              <div className="day-closing-card">
                <div className="day-closing-card-header">
                  <div className="day-closing-card-title-group">
                    <BanknoteIcon size={18} style={{ color: '#10b981' }} />
                    <span>Cash Drawer Reconciliation</span>
                  </div>
                  <span className={`day-closing-card-badge ${selectedCashierId || isCashierUser ? 'emerald' : ''}`}>
                    {selectedCashierId || isCashierUser
                      ? (preview?.availableCashiers?.find((c: any) => c.id === (selectedCashierId || user.id))?.name
                          ? `Cashier: ${preview.availableCashiers.find((c: any) => c.id === (selectedCashierId || user.id)).name}`
                          : `Cashier Register`)
                      : 'Store Consolidated'}
                  </span>
                </div>

                <div className="cash-rec-container">
                  <div className="cash-rec-row">
                    <span className="cash-rec-label">Opening Cash Float</span>
                    <span className="cash-rec-val">{fmt(cashRec.openingCashMinor)}</span>
                  </div>

                  <div className="cash-rec-row">
                    <span className="cash-rec-label" style={{ color: '#15803d' }}>
                      <ArrowDownLeftIcon size={14} /> (+) Cash Sales Received
                    </span>
                    <span className="cash-rec-val plus">+{fmt(cashRec.cashSalesReceivedMinor)}</span>
                  </div>

                  <div className="cash-rec-row">
                    <span className="cash-rec-label" style={{ color: '#15803d' }}>
                      (+) Cash In / Drawer Deposits
                    </span>
                    <span className="cash-rec-val plus">+{fmt(cashRec.cashInMinor)}</span>
                  </div>

                  <div className="cash-rec-row">
                    <span className="cash-rec-label" style={{ color: '#b91c1c' }}>
                      <ArrowUpRightIcon size={14} /> (-) Cash Refunds Paid Out
                    </span>
                    <span className="cash-rec-val minus">-{fmt(cashRec.cashRefundsPaidMinor)}</span>
                  </div>

                  <div className="cash-rec-row">
                    <span className="cash-rec-label" style={{ color: '#b91c1c' }}>
                      (-) Cash Expenses Paid
                    </span>
                    <span className="cash-rec-val minus">-{fmt(cashRec.cashExpensesMinor)}</span>
                  </div>

                  <div className="cash-rec-row">
                    <span className="cash-rec-label" style={{ color: '#b91c1c' }}>
                      (-) Cash Out / Withdrawals
                    </span>
                    <span className="cash-rec-val minus">-{fmt(cashRec.cashOutMinor)}</span>
                  </div>

                  {/* Expected Closing Cash Banner */}
                  <div className="cash-rec-expected-box">
                    <span className="cash-rec-expected-label">Expected Closing Cash:</span>
                    <span className="cash-rec-expected-val">{fmt(cashRec.expectedClosingCashMinor)}</span>
                  </div>

                  {/* Cash Variance Warning Alert */}
                  {Math.abs(cashDifferenceMinor) > 5000 && (closingStatus === 'open' || closingStatus === 'reopened') && (
                    <div style={{
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '10px',
                      padding: '0.65rem 0.85rem',
                      fontSize: '0.775rem',
                      color: '#92400e',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontWeight: 600
                    }}>
                      <AlertTriangleIcon size={16} style={{ color: '#d97706', flexShrink: 0 }} />
                      <span>Notice: High cash variance detected ({cashDifferenceMinor >= 0 ? '+' : ''}{fmt(cashDifferenceMinor)}). Discrepancy reason is mandatory in remarks before submission.</span>
                    </div>
                  )}

                  {/* Submission Form (Active if open or reopened) */}
                  {closingStatus === 'open' || closingStatus === 'reopened' ? (
                    <form onSubmit={handleSubmitClosing} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      <div className="cash-rec-input-group">
                        <label className="cash-rec-input-label">
                          Enter the actual cash counted (₹) *
                        </label>
                        <div className="cash-rec-input-wrapper">
                          <span className="cash-rec-input-prefix">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={actualCashStr}
                            onChange={(e) => setActualCashStr(e.target.value)}
                            onBlur={() => handleRunLiveAudit()}
                            placeholder="0.00"
                            className="cash-rec-input"
                          />
                        </div>
                      </div>

                      {/* Variance Pill */}
                      <div className={`cash-rec-diff-pill ${
                        cashDifferenceMinor === 0
                          ? 'balanced'
                          : cashDifferenceMinor > 0
                          ? 'surplus'
                          : 'deficit'
                      }`}>
                        <span>
                          {cashDifferenceMinor === 0
                            ? 'Cash Matched'
                            : cashDifferenceMinor > 0
                            ? 'Cash Excess'
                            : 'Cash Shortage'}
                        </span>
                        <span>
                          {cashDifferenceMinor >= 0 ? '+' : ''}{fmt(cashDifferenceMinor)}
                        </span>
                      </div>

                      <div className="cash-rec-input-group">
                        <label className="cash-rec-input-label">
                          Closing Remarks / Discrepancy Reason {Math.abs(cashDifferenceMinor) > 0 ? '*' : ''}
                        </label>
                        <textarea
                          rows={2}
                          value={closingRemarks}
                          onChange={(e) => setClosingRemarks(e.target.value)}
                          placeholder="e.g. Counted by cashier, minor coin variation"
                          className="cash-rec-remarks-input"
                          required={Math.abs(cashDifferenceMinor) > 0}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submitting}
                        className="cash-rec-submit-btn"
                      >
                        <LockIcon size={16} />
                        {submitting
                          ? 'Submitting Closing...'
                          : closingStatus === 'reopened'
                          ? 'Submit & Re-Seal Day Closing'
                          : 'Submit Day Closing'}
                      </button>
                    </form>
                  ) : (
                    /* Closed or Submitted View */
                    <div style={{ marginTop: '0.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                        <span style={{ color: '#64748b' }}>Actual Closing Cash:</span>
                        <strong style={{ color: '#0f172a' }}>{fmt(closedRecord?.actual_cash_minor)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                        <span style={{ color: '#64748b' }}>Cash Discrepancy:</span>
                        <strong style={{ color: (closedRecord?.variance_minor || 0) < 0 ? '#b91c1c' : (closedRecord?.variance_minor || 0) > 0 ? '#1d4ed8' : '#15803d' }}>
                          {(closedRecord?.variance_minor || 0) === 0
                            ? 'Cash Matched'
                            : (closedRecord?.variance_minor || 0) < 0
                            ? `Cash Shortage (${fmt(closedRecord?.variance_minor || 0)})`
                            : `Cash Excess (+${fmt(closedRecord?.variance_minor || 0)})`}
                        </strong>
                      </div>
                      {closedRecord?.remarks && (
                        <div style={{ fontSize: '0.75rem', color: '#475569', fontStyle: 'italic', paddingTop: '4px' }}>
                          "{closedRecord.remarks}"
                        </div>
                      )}

                      {closingStatus === 'submitted' && (
                        <div style={{
                          marginTop: '0.5rem',
                          padding: '0.65rem 0.85rem',
                          background: '#fffbeb',
                          border: '1px solid #fde68a',
                          borderRadius: '8px',
                          fontSize: '0.775rem',
                          color: '#92400e',
                          fontWeight: 600
                        }}>
                          {isCashierUser
                            ? 'Your Day Closing is submitted. Modification is locked awaiting Management review.'
                            : 'Submitted by cashier. Review and approve or reject below.'}
                        </div>
                      )}

                      {closingStatus === 'submitted' && isManagerOrOwner && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                          <button
                            onClick={() => handleApproveClosing(closedRecord.id)}
                            disabled={actionLoading}
                            className="btn-approve"
                            style={{ flex: 1, justifyContent: 'center' }}
                          >
                            <CheckCircle2Icon size={15} />
                            Approve
                          </button>
                          <button
                            onClick={() => handleOpenRejectModal(closedRecord.id)}
                            disabled={actionLoading}
                            className="btn-reject"
                            style={{ flex: 1, justifyContent: 'center' }}
                          >
                            <RotateCcwIcon size={15} />
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ====================================================================
          TAB: COUNTER & CASHIER SALES REPORTS
          ==================================================================== */}
      {activeTab === 'breakdown' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Sub-navigation pill toggle: Counter vs Cashier */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', padding: '12px 18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setBreakdownSubTab('counter')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: breakdownSubTab === 'counter' ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                  background: breakdownSubTab === 'counter' ? '#eef2ff' : '#ffffff',
                  color: breakdownSubTab === 'counter' ? '#4338ca' : '#475569',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Building2Icon size={16} />
                Counter-wise Sales Report
              </button>

              <button
                onClick={() => setBreakdownSubTab('cashier')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: breakdownSubTab === 'cashier' ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                  background: breakdownSubTab === 'cashier' ? '#eef2ff' : '#ffffff',
                  color: breakdownSubTab === 'cashier' ? '#4338ca' : '#475569',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <UserIcon size={16} />
                Cashier-wise Sales Report
              </button>
            </div>

            <div>
              {breakdownSubTab === 'counter' ? (
                <button
                  onClick={handleExportCounterCsv}
                  disabled={!counterSalesData?.counters?.length}
                  className="btn-export"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <FileSpreadsheetIcon size={15} />
                  Export Counter CSV
                </button>
              ) : (
                <button
                  onClick={handleExportCashierCsv}
                  disabled={!cashierSalesData?.cashiers?.length}
                  className="btn-export"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <FileSpreadsheetIcon size={15} />
                  Export Cashier CSV
                </button>
              )}
            </div>
          </div>

          {/* COUNTER REPORT CONTENT */}
          {breakdownSubTab === 'counter' && (
            <>
              {loadingCounterSales ? (
                <div style={{ padding: '3rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <RefreshCwIcon size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#4f46e5' }} />
                  <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>Aggregating counter-wise sales records...</p>
                </div>
              ) : counterSalesData ? (
                <>
                  {/* KPI Summary Cards */}
                  <div className="fin-kpi-grid">
                    <div className="fin-kpi-card blue">
                      <span className="fin-kpi-title">Gross Sales</span>
                      <div className="fin-kpi-val">{fmt(counterSalesData.consolidatedTotal?.grossSalesMinor)}</div>
                      <span className="fin-kpi-sub">{counterSalesData.consolidatedTotal?.invoicesCount || 0} Bills Across Counters</span>
                    </div>

                    <div className="fin-kpi-card rose">
                      <span className="fin-kpi-title">Sales Returns</span>
                      <div className="fin-kpi-val">-{fmt(counterSalesData.consolidatedTotal?.returnsTotalMinor)}</div>
                      <span className="fin-kpi-sub">{counterSalesData.consolidatedTotal?.returnsCount || 0} Credit Notes</span>
                    </div>

                    <div className="fin-kpi-card emerald">
                      <span className="fin-kpi-title">Net Sales</span>
                      <div className="fin-kpi-val">{fmt(counterSalesData.consolidatedTotal?.netSalesMinor)}</div>
                      <span className="fin-kpi-sub">Total Counter Revenue</span>
                    </div>

                    <div className="fin-kpi-card purple">
                      <span className="fin-kpi-title">Gross Profit</span>
                      <div className="fin-kpi-val">{fmt(counterSalesData.consolidatedTotal?.grossProfitMinor)}</div>
                      <span className="fin-kpi-sub">{counterSalesData.consolidatedTotal?.marginPct || 0}% Overall Margin</span>
                    </div>

                    <div className="fin-kpi-card orange">
                      <span className="fin-kpi-title">Total Collections</span>
                      <div className="fin-kpi-val">{fmt(counterSalesData.consolidatedTotal?.collections?.total)}</div>
                      <span className="fin-kpi-sub">Cash: {fmt(counterSalesData.consolidatedTotal?.collections?.cash)}</span>
                    </div>
                  </div>

                  {counterSalesData.exceptionCount > 0 && (
                    <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangleIcon size={16} />
                      <span><strong>Notice:</strong> {counterSalesData.exceptionCount} unassigned counter transaction group(s) detected. Shown separately below for audit compliance.</span>
                    </div>
                  )}

                  {/* Counter Table */}
                  <div className="day-closing-card">
                    <div className="day-closing-card-header">
                      <div className="day-closing-card-title-group">
                        <Building2Icon size={18} style={{ color: '#4f46e5' }} />
                        <span>Counter Sales & Collections Breakdown ({selectedDate})</span>
                      </div>
                      <span className="day-closing-card-badge">
                        {counterSalesData.counters.length} Counter Registers
                      </span>
                    </div>

                    <div className="data-table-container">
                      <table className="analytics-table">
                        <thead>
                          <tr>
                            <th>Counter</th>
                            <th>Invoices</th>
                            <th>Gross Sales</th>
                            <th>Discounts</th>
                            <th>Returns</th>
                            <th>Net Sales</th>
                            <th>Taxable</th>
                            <th>GST</th>
                            <th>COGS</th>
                            <th>Gross Profit</th>
                            <th>Margin</th>
                            <th>Cash</th>
                            <th>UPI</th>
                            <th>Card</th>
                            <th>Credit Sales</th>
                          </tr>
                        </thead>
                        <tbody>
                          {counterSalesData.counters.map((c: any) => (
                            <tr key={c.counterKey} style={c.isException ? { background: '#fffbeb' } : {}}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <strong>{c.counterName}</strong>
                                  {c.isException ? (
                                    <span style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                      EXCEPTION
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>({c.counterCode})</span>
                                  )}
                                </div>
                              </td>
                              <td>{c.invoicesCount}</td>
                              <td>{fmt(c.grossSalesMinor)}</td>
                              <td>{fmt(c.discountsTotalMinor)}</td>
                              <td style={{ color: c.returnsTotalMinor > 0 ? '#dc2626' : 'inherit' }}>
                                {c.returnsTotalMinor > 0 ? `-${fmt(c.returnsTotalMinor)}` : '₹0.00'}
                              </td>
                              <td style={{ fontWeight: 700, color: '#16a34a' }}>{fmt(c.netSalesMinor)}</td>
                              <td>{fmt(c.taxableSalesMinor)}</td>
                              <td>{fmt(c.gstCollectedMinor)}</td>
                              <td>{fmt(c.netCogsMinor)}</td>
                              <td style={{ fontWeight: 700, color: '#4f46e5' }}>{fmt(c.grossProfitMinor)}</td>
                              <td>{c.marginPct}%</td>
                              <td>{fmt(c.collections.cash)}</td>
                              <td>{fmt(c.collections.upi)}</td>
                              <td>{fmt(c.collections.card)}</td>
                              <td style={{ color: c.creditSalesMinor > 0 ? '#7e22ce' : 'inherit', fontWeight: c.creditSalesMinor > 0 ? 600 : 400 }}>
                                {fmt(c.creditSalesMinor)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                            <td>CONSOLIDATED TOTAL</td>
                            <td>{counterSalesData.consolidatedTotal?.invoicesCount}</td>
                            <td>{fmt(counterSalesData.consolidatedTotal?.grossSalesMinor)}</td>
                            <td>{fmt(counterSalesData.consolidatedTotal?.discountsTotalMinor)}</td>
                            <td style={{ color: '#dc2626' }}>-{fmt(counterSalesData.consolidatedTotal?.returnsTotalMinor)}</td>
                            <td style={{ color: '#16a34a' }}>{fmt(counterSalesData.consolidatedTotal?.netSalesMinor)}</td>
                            <td>{fmt(counterSalesData.consolidatedTotal?.taxableSalesMinor)}</td>
                            <td>{fmt(counterSalesData.consolidatedTotal?.gstCollectedMinor)}</td>
                            <td>{fmt(counterSalesData.consolidatedTotal?.netCogsMinor)}</td>
                            <td style={{ color: '#4f46e5' }}>{fmt(counterSalesData.consolidatedTotal?.grossProfitMinor)}</td>
                            <td>{counterSalesData.consolidatedTotal?.marginPct}%</td>
                            <td>{fmt(counterSalesData.consolidatedTotal?.collections?.cash)}</td>
                            <td>{fmt(counterSalesData.consolidatedTotal?.collections?.upi)}</td>
                            <td>{fmt(counterSalesData.consolidatedTotal?.collections?.card)}</td>
                            <td>{fmt(counterSalesData.consolidatedTotal?.creditSalesMinor)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </>
          )}

          {/* CASHIER REPORT CONTENT */}
          {breakdownSubTab === 'cashier' && (
            <>
              {loadingCashierSales ? (
                <div style={{ padding: '3rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                  <RefreshCwIcon size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#4f46e5' }} />
                  <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>Aggregating cashier-wise sales and registers...</p>
                </div>
              ) : cashierSalesData ? (
                <>
                  {/* KPI Summary Cards */}
                  <div className="fin-kpi-grid">
                    <div className="fin-kpi-card blue">
                      <span className="fin-kpi-title">Gross Sales</span>
                      <div className="fin-kpi-val">{fmt(cashierSalesData.consolidatedTotal?.grossSalesMinor)}</div>
                      <span className="fin-kpi-sub">{cashierSalesData.consolidatedTotal?.invoicesCount || 0} Bills Across Cashiers</span>
                    </div>

                    <div className="fin-kpi-card rose">
                      <span className="fin-kpi-title">Sales Returns</span>
                      <div className="fin-kpi-val">-{fmt(cashierSalesData.consolidatedTotal?.returnsTotalMinor)}</div>
                      <span className="fin-kpi-sub">{cashierSalesData.consolidatedTotal?.returnsCount || 0} Credit Notes</span>
                    </div>

                    <div className="fin-kpi-card emerald">
                      <span className="fin-kpi-title">Net Sales</span>
                      <div className="fin-kpi-val">{fmt(cashierSalesData.consolidatedTotal?.netSalesMinor)}</div>
                      <span className="fin-kpi-sub">Total Cashier Revenue</span>
                    </div>

                    <div className="fin-kpi-card purple">
                      <span className="fin-kpi-title">Gross Profit</span>
                      <div className="fin-kpi-val">{fmt(cashierSalesData.consolidatedTotal?.grossProfitMinor)}</div>
                      <span className="fin-kpi-sub">{cashierSalesData.consolidatedTotal?.marginPct || 0}% Overall Margin</span>
                    </div>

                    <div className="fin-kpi-card orange">
                      <span className="fin-kpi-title">Total Collections</span>
                      <div className="fin-kpi-val">{fmt(cashierSalesData.consolidatedTotal?.collections?.total)}</div>
                      <span className="fin-kpi-sub">Cash: {fmt(cashierSalesData.consolidatedTotal?.collections?.cash)}</span>
                    </div>
                  </div>

                  {cashierSalesData.exceptionCount > 0 && (
                    <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangleIcon size={16} />
                      <span><strong>Notice:</strong> {cashierSalesData.exceptionCount} unassigned cashier transaction group(s) detected. Shown separately below for audit compliance.</span>
                    </div>
                  )}

                  {/* Cashier Table */}
                  <div className="day-closing-card">
                    <div className="day-closing-card-header">
                      <div className="day-closing-card-title-group">
                        <UserIcon size={18} style={{ color: '#4f46e5' }} />
                        <span>Cashier Sales & Closing Status Breakdown ({selectedDate})</span>
                      </div>
                      <span className="day-closing-card-badge">
                        {cashierSalesData.cashiers.length} Active Cashiers
                      </span>
                    </div>

                    <div className="data-table-container">
                      <table className="analytics-table">
                        <thead>
                          <tr>
                            <th>Cashier Name</th>
                            <th>Role</th>
                            <th>Closing Status</th>
                            <th>Invoices</th>
                            <th>Gross Sales</th>
                            <th>Returns</th>
                            <th>Net Sales</th>
                            <th>Taxable</th>
                            <th>GST</th>
                            <th>Gross Profit</th>
                            <th>Cash Collections</th>
                            <th>UPI</th>
                            <th>Card</th>
                            <th>Actual Counted</th>
                            <th>Expected Cash</th>
                            <th>Difference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cashierSalesData.cashiers.map((c: any) => (
                            <tr key={c.cashierKey} style={c.isException ? { background: '#fffbeb' } : {}}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <strong>{c.cashierName}</strong>
                                  {c.isException && (
                                    <span style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                      EXCEPTION
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.cashierRole}</td>
                              <td>
                                <span style={{
                                  fontSize: '0.72rem',
                                  padding: '2px 8px',
                                  borderRadius: '9999px',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  background: c.closingStatus === 'approved' || c.closingStatus === 'closed' ? '#dcfce7' : (c.closingStatus === 'submitted' ? '#dbeafe' : (c.closingStatus === 'reopened' ? '#fee2e2' : '#f1f5f9')),
                                  color: c.closingStatus === 'approved' || c.closingStatus === 'closed' ? '#15803d' : (c.closingStatus === 'submitted' ? '#1d4ed8' : (c.closingStatus === 'reopened' ? '#b91c1c' : '#64748b')),
                                }}>
                                  {c.closingStatus}
                                </span>
                              </td>
                              <td>{c.invoicesCount}</td>
                              <td>{fmt(c.grossSalesMinor)}</td>
                              <td style={{ color: c.returnsTotalMinor > 0 ? '#dc2626' : 'inherit' }}>
                                {c.returnsTotalMinor > 0 ? `-${fmt(c.returnsTotalMinor)}` : '₹0.00'}
                              </td>
                              <td style={{ fontWeight: 700, color: '#16a34a' }}>{fmt(c.netSalesMinor)}</td>
                              <td>{fmt(c.taxableSalesMinor)}</td>
                              <td>{fmt(c.gstCollectedMinor)}</td>
                              <td style={{ fontWeight: 700, color: '#4f46e5' }}>{fmt(c.grossProfitMinor)}</td>
                              <td>{fmt(c.collections.cash)}</td>
                              <td>{fmt(c.collections.upi)}</td>
                              <td>{fmt(c.collections.card)}</td>
                              <td>{c.actualCashMinor != null ? fmt(c.actualCashMinor) : '—'}</td>
                              <td>{c.expectedCashMinor != null ? fmt(c.expectedCashMinor) : '—'}</td>
                              <td style={{
                                fontWeight: 700,
                                color: (c.varianceMinor || 0) === 0 ? '#15803d' : ((c.varianceMinor || 0) > 0 ? '#2563eb' : '#dc2626')
                              }}>
                                {c.varianceMinor != null ? ((c.varianceMinor > 0 ? '+' : '') + fmt(c.varianceMinor)) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                            <td colSpan={3}>CONSOLIDATED TOTAL</td>
                            <td>{cashierSalesData.consolidatedTotal?.invoicesCount}</td>
                            <td>{fmt(cashierSalesData.consolidatedTotal?.grossSalesMinor)}</td>
                            <td style={{ color: '#dc2626' }}>-{fmt(cashierSalesData.consolidatedTotal?.returnsTotalMinor)}</td>
                            <td style={{ color: '#16a34a' }}>{fmt(cashierSalesData.consolidatedTotal?.netSalesMinor)}</td>
                            <td>{fmt(cashierSalesData.consolidatedTotal?.taxableSalesMinor)}</td>
                            <td>{fmt(cashierSalesData.consolidatedTotal?.gstCollectedMinor)}</td>
                            <td style={{ color: '#4f46e5' }}>{fmt(cashierSalesData.consolidatedTotal?.grossProfitMinor)}</td>
                            <td>{fmt(cashierSalesData.consolidatedTotal?.collections?.cash)}</td>
                            <td>{fmt(cashierSalesData.consolidatedTotal?.collections?.upi)}</td>
                            <td>{fmt(cashierSalesData.consolidatedTotal?.collections?.card)}</td>
                            <td colSpan={3}>—</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 2: TODAY VS PREVIOUS DAY COMPARISON
          ==================================================================== */}
      {activeTab === 'comparison' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {loadingComparison ? (
            <div style={{ padding: '3rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <RefreshCwIcon size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#6366f1' }} />
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>Calculating daily comparisons and trend analytics...</p>
            </div>
          ) : comparisonData ? (
            <>
              {/* Comprehensive Comparison Table */}
              <div className="day-closing-card">
                <div className="day-closing-card-header">
                  <div className="day-closing-card-title-group">
                    <ScaleIcon size={18} style={{ color: '#4f46e5' }} />
                    <span>Detailed Variance & Growth Comparison ({comparisonData.bdate} vs {comparisonData.previousDate})</span>
                  </div>
                </div>

                <div className="data-table-container">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Current Period ({comparisonData.bdate})</th>
                        <th>Previous Business Day ({comparisonData.previousDate})</th>
                        <th>Difference</th>
                        <th>Growth %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(comparisonData.metrics || {}).map(([key, m]: [string, any]) => {
                        const isCount = key.toLowerCase().includes('count');
                        const isGrowthPos = (m.growthPct || 0) > 0;
                        const isGrowthNeg = (m.growthPct || 0) < 0;

                        const labelMap: Record<string, string> = {
                          grossSales: 'Gross Sales (excl. GST)',
                          totalDiscounts: 'Total Discounts Given',
                          salesReturns: 'Sales Returns (Credit Notes)',
                          netSales: 'Net Sales Revenue',
                          cogs: 'Cost of Goods Sold (COGS)',
                          grossProfit: 'Gross Profit',
                          expenses: 'Operating Expenses',
                          netProfit: 'Net Operating Profit',
                          invoicesCount: 'Total Invoices Issued',
                          averageBillValue: 'Average Bill Value',
                          refundsPaid: 'Refunds Paid Out',
                        };

                        return (
                          <tr key={key}>
                            <td style={{ fontWeight: 700, color: '#0f172a' }}>{labelMap[key] || key}</td>
                            <td style={{ fontWeight: 800 }}>{isCount ? m.current : fmt(m.current)}</td>
                            <td style={{ color: '#64748b' }}>{isCount ? m.previous : fmt(m.previous)}</td>
                            <td style={{ fontWeight: 700, color: m.diff >= 0 ? '#15803d' : '#b91c1c' }}>
                              {m.diff >= 0 ? '+' : ''}{isCount ? m.diff : fmt(m.diff)}
                            </td>
                            <td>
                              <span className={`growth-badge ${isGrowthPos ? 'positive' : isGrowthNeg ? 'negative' : 'neutral'}`}>
                                {isGrowthPos ? '+ ' : isGrowthNeg ? '- ' : ''}
                                {(m.growthPct || 0).toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ====================================================================
          TAB 3: CUSTOM DATE RANGE ANALYTICS
          ==================================================================== */}
      {activeTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Date Range Selector Card */}
          <div className="day-closing-card">
            <div className="day-closing-card-header">
              <div className="day-closing-card-title-group">
                <BarChart3Icon size={18} style={{ color: '#4f46e5' }} />
                <span>Custom Date Range Business Analysis</span>
              </div>

              <div className="preset-pills-bar">
                {[
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: 'last_7_days', label: 'Last 7 Days' },
                  { id: 'this_month', label: 'This Month' },
                  { id: 'last_month', label: 'Last Month' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleApplyPreset(p.id)}
                    className={`preset-pill-btn ${analyticsPreset === p.id ? 'active' : ''}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="day-closing-filter-item">
                <span>Start Date:</span>
                <input
                  type="date"
                  value={analyticsStartDate}
                  onChange={(e) => {
                    setAnalyticsStartDate(e.target.value);
                    setAnalyticsPreset('custom');
                  }}
                  className="day-closing-input"
                />
              </div>

              <div className="day-closing-filter-item">
                <span>End Date:</span>
                <input
                  type="date"
                  value={analyticsEndDate}
                  onChange={(e) => {
                    setAnalyticsEndDate(e.target.value);
                    setAnalyticsPreset('custom');
                  }}
                  className="day-closing-input"
                />
              </div>

              <button
                onClick={loadAnalytics}
                disabled={loadingAnalytics}
                className="btn-approve"
                style={{ background: '#4f46e5' }}
              >
                <RefreshCwIcon size={14} className={loadingAnalytics ? 'animate-spin' : ''} />
                Calculate Range
              </button>
            </div>
          </div>

          {loadingAnalytics ? (
            <div style={{ padding: '3rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <RefreshCwIcon size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#6366f1' }} />
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>Aggregating multi-day financial records...</p>
            </div>
          ) : analyticsData?.current ? (
            <>
              {/* Range Financial Summary Grid */}
              <div className="financial-kpi-grid">
                <div className="fin-kpi-card blue">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Gross Sales</span>
                    <div className="fin-kpi-icon"><TrendingUpIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val">{fmt(analyticsData.current.grossSalesMinor)}</div>
                  <span className="fin-kpi-sub">Total billed before tax</span>
                </div>

                <div className="fin-kpi-card rose">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Returns</span>
                    <div className="fin-kpi-icon"><RotateCcwIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val" style={{ color: '#e11d48' }}>-{fmt(analyticsData.current.returnsMinor)}</div>
                  <span className="fin-kpi-sub">Total returned goods</span>
                </div>

                <div className="fin-kpi-card green highlight">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Net Sales</span>
                    <div className="fin-kpi-icon"><RupeeIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val">{fmt(analyticsData.current.netSalesMinor)}</div>
                  <span className="fin-kpi-sub">Net revenue realized</span>
                </div>

                <div className="fin-kpi-card purple">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Gross Profit</span>
                    <div className="fin-kpi-icon"><TrendingUpIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val" style={{ color: '#7e22ce' }}>{fmt(analyticsData.current.grossProfitMinor)}</div>
                  <span className="fin-kpi-sub">{((analyticsData.current.grossMarginPct || 0)).toFixed(1)}% Gross Margin</span>
                </div>

                <div className="fin-kpi-card amber">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Expenses</span>
                    <div className="fin-kpi-icon"><ArrowUpRightIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val">{fmt(analyticsData.current.expensesMinor)}</div>
                  <span className="fin-kpi-sub">Operating costs</span>
                </div>

                <div className="fin-kpi-card green">
                  <div className="fin-kpi-top">
                    <span className="fin-kpi-label">Operating Profit</span>
                    <div className="fin-kpi-icon"><RupeeIcon size={14} /></div>
                  </div>
                  <div className="fin-kpi-val" style={{ color: (analyticsData.current.netProfitMinor || 0) >= 0 ? '#15803d' : '#b91c1c' }}>
                    {fmt(analyticsData.current.netProfitMinor)}
                  </div>
                  <span className="fin-kpi-sub">{((analyticsData.current.netMarginPct || 0)).toFixed(1)}% Net Margin</span>
                </div>
              </div>

              {/* Range Daily Series Breakdown */}
              {analyticsData.dailySeries && analyticsData.dailySeries.length > 0 && (
                <div className="day-closing-card">
                  <div className="day-closing-card-header">
                    <div className="day-closing-card-title-group">
                      <FileTextIcon size={18} style={{ color: '#4f46e5' }} />
                      <span>Daily Breakdown in Range ({analyticsStartDate} to {analyticsEndDate})</span>
                    </div>
                    <span className="day-closing-card-badge">
                      {analyticsData.dailySeries.length} Days Recorded
                    </span>
                  </div>

                  <div className="data-table-container">
                    <table className="analytics-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Invoices Count</th>
                          <th>Gross Sales</th>
                          <th>Net Sales</th>
                          <th>Gross Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData.dailySeries.map((d: any) => (
                          <tr key={d.date}>
                            <td style={{ fontWeight: 800, color: '#0f172a' }}>{d.date}</td>
                            <td>{d.invoicesCount || 0}</td>
                            <td>{fmt(d.grossSalesMinor)}</td>
                            <td style={{ fontWeight: 700, color: '#15803d' }}>{fmt(d.netSalesMinor)}</td>
                            <td style={{ fontWeight: 800, color: '#4f46e5' }}>{fmt(d.grossProfitMinor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ====================================================================
          TAB: SCHEDULES & COMPLIANCE MONITORING
          ==================================================================== */}
      {activeTab === 'compliance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {loadingCompliance ? (
            <div style={{ padding: '3rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <RefreshCwIcon size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#4f46e5' }} />
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>Checking closing compliance and register schedules...</p>
            </div>
          ) : complianceData ? (
            <>
              {/* Compliance KPI summary */}
              <div className="fin-kpi-grid">
                <div className="fin-kpi-card blue">
                  <span className="fin-kpi-title">Expected Closing Time</span>
                  <div className="fin-kpi-val" style={{ fontSize: '1.4rem' }}>{complianceData.expectedClosingTime}</div>
                  <span className="fin-kpi-sub">
                    {complianceData.isBranchOverdue ? (
                      <span style={{ color: '#dc2626', fontWeight: 700 }}>⚠️ {complianceData.minutesOverdue} mins Overdue</span>
                    ) : (
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ On Schedule</span>
                    )}
                  </span>
                </div>

                <div className="fin-kpi-card purple">
                  <span className="fin-kpi-title">Closing Progress</span>
                  <div className="fin-kpi-val">{complianceData.summary.completionPct}%</div>
                  <span className="fin-kpi-sub">{complianceData.summary.closedCount} of {complianceData.summary.totalRegisters} Registers Sealed</span>
                </div>

                <div className="fin-kpi-card emerald">
                  <span className="fin-kpi-title">Approved Registers</span>
                  <div className="fin-kpi-val">{complianceData.summary.closedCount}</div>
                  <span className="fin-kpi-sub">Audited & Reconciled</span>
                </div>

                <div className="fin-kpi-card orange">
                  <span className="fin-kpi-title">Pending / Submitted</span>
                  <div className="fin-kpi-val">{complianceData.summary.pendingCount + complianceData.summary.submittedCount}</div>
                  <span className="fin-kpi-sub">{complianceData.summary.submittedCount} Awaiting Review</span>
                </div>

                <div className="fin-kpi-card rose">
                  <span className="fin-kpi-title">Overdue Registers</span>
                  <div className="fin-kpi-val">{complianceData.summary.overdueCount}</div>
                  <span className="fin-kpi-sub">Past Expected Time</span>
                </div>
              </div>

              {/* Action Banner: Send Reminder */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                    Cashier Closing Reminders & Alerts
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                    Send in-app reminder notification to all pending cashiers to seal their registers.
                    {complianceData.lastReminderSentAt && (
                      <span style={{ marginLeft: '8px', color: '#4f46e5', fontWeight: 600 }}>
                        (Last sent: {new Date(complianceData.lastReminderSentAt).toLocaleTimeString()} - {complianceData.lastReminderType})
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => handleSendReminder(null)}
                  disabled={sendingReminder}
                  className="btn-approve"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <ClockIcon size={15} />
                  {sendingReminder ? 'Sending...' : 'Send Reminder to All'}
                </button>
              </div>

              {/* Two columns: Register Compliance Matrix (left 65%) and Schedule Settings Form (right 35%) */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem' }}>
                {/* Cashier Register Status Grid */}
                <div className="day-closing-card">
                  <div className="day-closing-card-header">
                    <div className="day-closing-card-title-group">
                      <CheckCircleIcon size={18} style={{ color: '#4f46e5' }} />
                      <span>Cashier Register Compliance Matrix</span>
                    </div>
                    <span className="day-closing-card-badge">
                      {complianceData.cashierMatrix.length} Cashiers
                    </span>
                  </div>

                  <div className="data-table-container">
                    <table className="analytics-table">
                      <thead>
                        <tr>
                          <th>Cashier</th>
                          <th>Role</th>
                          <th>Status</th>
                          <th>Physical Counted</th>
                          <th>Variance</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {complianceData.cashierMatrix.map((cm: any) => (
                          <tr key={cm.cashierId}>
                            <td>
                              <strong>{cm.cashierName}</strong>
                            </td>
                            <td style={{ fontSize: '0.75rem', color: '#64748b' }}>{cm.role}</td>
                            <td>
                              <span style={{
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                background: cm.status === 'approved' || cm.status === 'closed' ? '#dcfce7' : (cm.status === 'submitted' ? '#dbeafe' : (cm.isOverdue ? '#fee2e2' : '#fef3c7')),
                                color: cm.status === 'approved' || cm.status === 'closed' ? '#15803d' : (cm.status === 'submitted' ? '#1d4ed8' : (cm.isOverdue ? '#b91c1c' : '#92400e')),
                              }}>
                                {cm.isOverdue ? 'OVERDUE' : cm.status}
                              </span>
                            </td>
                            <td>{cm.actualCashMinor != null ? fmt(cm.actualCashMinor) : '—'}</td>
                            <td style={{
                              fontWeight: 700,
                              color: cm.varianceMinor == null ? 'inherit' : (cm.varianceMinor === 0 ? '#15803d' : (cm.varianceMinor > 0 ? '#2563eb' : '#dc2626'))
                            }}>
                              {cm.varianceMinor != null ? ((cm.varianceMinor > 0 ? '+' : '') + fmt(cm.varianceMinor)) : '—'}
                            </td>
                            <td>
                              {cm.status !== 'approved' && cm.status !== 'closed' && (
                                <button
                                  onClick={() => handleSendReminder(cm.cashierId)}
                                  disabled={sendingReminder}
                                  className="day-closing-refresh-btn"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                                  title="Send individual reminder"
                                >
                                  Remind
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Schedule Settings Editor Form */}
                <div className="day-closing-card">
                  <div className="day-closing-card-header">
                    <div className="day-closing-card-title-group">
                      <ClockIcon size={18} style={{ color: '#4f46e5' }} />
                      <span>Closing Schedule Settings</span>
                    </div>
                  </div>

                  <form onSubmit={handleSaveSchedule} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                        Expected Closing Time (24h)
                      </label>
                      <input
                        type="time"
                        value={expClosingTime}
                        onChange={(e) => setExpClosingTime(e.target.value)}
                        className="day-closing-input"
                        style={{ width: '100%' }}
                        required
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                        1st Reminder (Minutes Before)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="180"
                        value={firstReminderMin}
                        onChange={(e) => setFirstReminderMin(Number(e.target.value))}
                        className="day-closing-input"
                        style={{ width: '100%' }}
                        required
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                        2nd Reminder (Minutes Before)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={secondReminderMin}
                        onChange={(e) => setSecondReminderMin(Number(e.target.value))}
                        className="day-closing-input"
                        style={{ width: '100%' }}
                        required
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        id="finalRemCheckbox"
                        checked={finalReminder}
                        onChange={(e) => setFinalReminder(e.target.checked)}
                      />
                      <label htmlFor="finalRemCheckbox" style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600, cursor: 'pointer' }}>
                        Send Final Reminder at Expected Time
                      </label>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                        Overdue Alert Repeat (Minutes)
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="120"
                        value={overdueIntervalMin}
                        onChange={(e) => setOverdueIntervalMin(Number(e.target.value))}
                        className="day-closing-input"
                        style={{ width: '100%' }}
                        required
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        id="autoAlertCheckbox"
                        checked={autoAlert}
                        onChange={(e) => setAutoAlert(e.target.checked)}
                      />
                      <label htmlFor="autoAlertCheckbox" style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600, cursor: 'pointer' }}>
                        Auto-Alert When Overdue
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={savingSchedule}
                      className="cash-rec-submit-btn"
                      style={{ marginTop: '8px' }}
                    >
                      {savingSchedule ? 'Saving...' : 'Save Schedule Settings'}
                    </button>
                  </form>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ====================================================================
          TAB 4: CLOSING HISTORY & AUDIT LOGS
          ==================================================================== */}
      {activeTab === 'history' && (
        <div className="day-closing-card">
          <div className="day-closing-card-header">
            <div className="day-closing-card-title-group">
              <ClockIcon size={18} style={{ color: '#4f46e5' }} />
              <span>Previous Day Closings & Sealed Audit Trail</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                onClick={() => handleExportCsv()}
                className="day-closing-refresh-btn"
                title="Download all past day closings in CSV format"
              >
                <DownloadIcon size={14} />
                Export All CSV
              </button>
              <span className="day-closing-card-badge">
                {history.length} Records Logged
              </span>
            </div>
          </div>

          {loadingHistory ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
              Loading history records...
            </div>
          ) : history.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
              No day closing records found for this branch.
            </div>
          ) : (
            <div className="data-table-container">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Gross Sales</th>
                    <th>Returns</th>
                    <th>Net Sales</th>
                    <th>Expected Cash</th>
                    <th>Actual Cash</th>
                    <th>Variance</th>
                    <th>Gross Profit</th>
                    <th>Submitted By</th>
                    <th>Approved By</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const variance = h.variance_minor ?? 0;
                    const status = h.status || 'closed';
                    const isExpanded = expandedHistoryId === h.id;

                    return (
                      <React.Fragment key={h.id}>
                        <tr
                          style={{ cursor: 'pointer' }}
                          onClick={() => setExpandedHistoryId(isExpanded ? null : h.id)}
                        >
                          <td style={{ fontWeight: 800, color: '#0f172a' }}>{h.bdate}</td>
                          <td>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              fontSize: '0.725rem',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              background: status === 'approved' || status === 'closed' ? '#eef2ff' : status === 'submitted' ? '#fffbeb' : '#fff1f2',
                              color: status === 'approved' || status === 'closed' ? '#4338ca' : status === 'submitted' ? '#92400e' : '#be123c',
                            }}>
                              {status}
                            </span>
                          </td>
                          <td>{fmt(h.gross_sales_minor)}</td>
                          <td style={{ color: '#e11d48' }}>-{fmt(h.returns_total_minor || h.sales_returns_minor)}</td>
                          <td style={{ fontWeight: 700, color: '#15803d' }}>{fmt(h.net_sales_minor)}</td>
                          <td>{fmt(h.expected_cash_minor)}</td>
                          <td style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(h.actual_cash_minor)}</td>
                          <td>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              fontSize: '0.725rem',
                              fontWeight: 800,
                              background: variance === 0 ? '#ecfdf5' : variance > 0 ? '#eff6ff' : '#fef2f2',
                              color: variance === 0 ? '#047857' : variance > 0 ? '#1d4ed8' : '#b91c1c',
                            }}>
                              {variance >= 0 ? '+' : ''}{fmt(variance)}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700, color: '#4f46e5' }}>{fmt(h.gross_profit_minor)}</td>
                          <td style={{ color: '#64748b' }}>{h.closed_by_name || 'Cashier'}</td>
                          <td style={{ color: '#64748b' }}>{h.approved_by_name || '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePrint(h.id);
                                }}
                                className="day-closing-refresh-btn"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                title="Print Statement"
                              >
                                Print
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportCsv(h.id);
                                }}
                                className="day-closing-refresh-btn"
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                title="Download CSV"
                              >
                                CSV
                              </button>

                              {(status === 'approved' || status === 'closed') && isOwner && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenReopenModal(h.id);
                                  }}
                                  className="day-closing-refresh-btn"
                                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#ea580c' }}
                                >
                                  Reopen
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Audit Log Details Row */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={12} style={{ background: '#f8fafc', padding: '1rem 1.25rem' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', fontSize: '0.8rem' }}>
                                <div>
                                  <div style={{ color: '#64748b', fontWeight: 600 }}>Submitted By</div>
                                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{h.closed_by_name || 'Cashier'}</div>
                                  <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                                    {h.closed_at ? new Date(h.closed_at).toLocaleString('en-IN') : '—'}
                                  </div>
                                </div>

                                <div>
                                  <div style={{ color: '#64748b', fontWeight: 600 }}>Approved By</div>
                                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{h.approved_by_name || 'Pending Approval'}</div>
                                  <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                                    {h.approved_at ? new Date(h.approved_at).toLocaleString('en-IN') : '—'}
                                  </div>
                                </div>

                                <div>
                                  <div style={{ color: '#64748b', fontWeight: 600 }}>Reopened By</div>
                                  <div style={{ fontWeight: 800, color: h.reopened_by_name ? '#b91c1c' : '#0f172a' }}>
                                    {h.reopened_by_name || 'Not Reopened'}
                                  </div>
                                  {h.reopen_reason && (
                                    <div style={{ color: '#991b1b', fontSize: '0.75rem', fontStyle: 'italic' }}>
                                      "{h.reopen_reason}"
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <div style={{ color: '#64748b', fontWeight: 600 }}>Closing Remarks / Note</div>
                                  <div style={{ fontWeight: 600, color: '#334155' }}>
                                    {h.remarks || 'No remarks recorded.'}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------
          REOPEN DAY CLOSING MODAL DIALOG
          -------------------------------------------------------------------- */}
      {isReopenModalOpen && (
        <div className="day-closing-modal-backdrop" onClick={() => setIsReopenModalOpen(false)}>
          <div className="day-closing-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="day-closing-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangleIcon size={20} style={{ color: '#ea580c' }} />
                <span className="day-closing-modal-title">Reopen Business Day</span>
              </div>
              <button
                onClick={() => setIsReopenModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmReopen} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.825rem', color: '#475569', lineHeight: 1.5 }}>
                Reopening a closed day unlocks invoices and shifts for adjustments. This audit event will be permanently recorded with your user ID and timestamp.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                  Mandatory Reopening Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="e.g. Backdated return entry required, cashier invoice adjustment"
                  className="cash-rec-remarks-input"
                />
              </div>

              {isManager && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                    Manager Authorization PIN / Password *
                  </label>
                  <input
                    type="password"
                    required
                    value={reopenPin}
                    onChange={(e) => setReopenPin(e.target.value)}
                    placeholder="Enter security PIN or account password"
                    className="day-closing-input"
                    style={{ width: '100%' }}
                  />
                  <span style={{ fontSize: '0.725rem', color: '#64748b' }}>
                    Authorized permission with secure PIN verification is required for managers.
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsReopenModalOpen(false)}
                  className="day-closing-refresh-btn"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={reopening || reopenReason.trim().length < 5 || (isManager && !reopenPin.trim())}
                  className="btn-reopen"
                >
                  {reopening ? 'Reopening...' : 'Confirm & Reopen Day'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------
          REJECT / RECOUNT MODAL DIALOG
          -------------------------------------------------------------------- */}
      {isRejectModalOpen && (
        <div className="day-closing-modal-backdrop" onClick={() => setIsRejectModalOpen(false)}>
          <div className="day-closing-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="day-closing-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <RotateCcwIcon size={20} style={{ color: '#dc2626' }} />
                <span className="day-closing-modal-title">Reject Day Closing & Request Recount</span>
              </div>
              <button
                onClick={() => setIsRejectModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmReject} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.825rem', color: '#475569', lineHeight: 1.5 }}>
                Rejecting this closing submission returns the register to the Cashier for physical recount and adjustment. Please state the reason clearly.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                  Rejection & Recount Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Unexplained cash shortage of ₹200. Please recheck coin tray and physical drawer."
                  className="cash-rec-remarks-input"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsRejectModalOpen(false)}
                  className="day-closing-refresh-btn"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={rejecting || rejectReason.trim().length < 5}
                  className="btn-reject"
                >
                  {rejecting ? 'Rejecting...' : 'Reject & Return to Cashier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
