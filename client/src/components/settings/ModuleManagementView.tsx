// client/src/components/settings/ModuleManagementView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  APP_MODULES,
  TOTAL_PARENT_MODULES,
  TOTAL_SUB_MODULES,
  DEFAULT_ROLE_MODULE_ACCESS,
  type RoleModuleAccessConfig,
  type AppModule,
  type AppSubModule,
} from '../../../../shared/modules.ts';
import { fetchModuleAccess, saveModuleAccess } from '../../api.ts';
import './ModuleManagementView.css';

// Lucide icon components or inline SVGs
import {
  LayoutDashboard,
  ShoppingCart,
  Warehouse,
  Bell,
  Package,
  Tag,
  Layers,
  BarChart2,
  Percent,
  Users,
  Truck,
  Briefcase,
  FileSpreadsheet,
  UserCog,
  Settings,
  ShieldCheck,
  Store,
  CreditCard,
  ChevronRight,
  ChevronDown,
  Search,
  Lock,
  Check,
  RotateCcw,
  HelpCircle,
  X,
  AlertCircle,
} from 'lucide-react';

interface ModuleManagementViewProps {
  onModuleAccessUpdated?: (newConfig: RoleModuleAccessConfig) => void;
  onNavigateTab?: (tab: string) => void;
  onSelectSettingsTab?: (tab: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ModuleManagementView: React.FC<ModuleManagementViewProps> = ({
  onModuleAccessUpdated,
  onNavigateTab,
  onSelectSettingsTab,
  showToast = (msg: string) => alert(msg),
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedConfig, setSavedConfig] = useState<RoleModuleAccessConfig>(DEFAULT_ROLE_MODULE_ACCESS);
  const [draftConfig, setDraftConfig] = useState<RoleModuleAccessConfig>(DEFAULT_ROLE_MODULE_ACCESS);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  // Expanded parent rows state (modules with sub-modules start expanded)
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({
    inventory: true,
    accounts: true,
    gst: true,
  });

  // Load config on mount
  useEffect(() => {
    let isMounted = true;
    async function loadConfig() {
      setLoading(true);
      try {
        const res = await fetchModuleAccess();
        if (isMounted && res && res.access) {
          // Safeguard: Ensure Super Admin Settings is locked true
          res.access.owner.settings = true;
          setSavedConfig(res.access);
          setDraftConfig(res.access);
        }
      } catch (err) {
        console.error('Failed to load module access config:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  // Compute unsaved changes count and affected roles
  const { unsavedCount, changedRoles } = useMemo(() => {
    let count = 0;
    const rolesChanged = new Set<string>();
    const roles: Array<'owner' | 'manager' | 'cashier'> = ['owner', 'manager', 'cashier'];

    for (const role of roles) {
      const savedMap = savedConfig[role] || {};
      const draftMap = draftConfig[role] || {};

      for (const mod of APP_MODULES) {
        const sVal = savedMap[mod.key] ?? DEFAULT_ROLE_MODULE_ACCESS[role][mod.key] ?? true;
        const dVal = draftMap[mod.key] ?? DEFAULT_ROLE_MODULE_ACCESS[role][mod.key] ?? true;
        if (sVal !== dVal) {
          count++;
          rolesChanged.add(role === 'owner' ? 'Super Admin' : role === 'manager' ? 'Store Manager' : 'Cashier');
        }

        if (mod.subModules) {
          for (const sub of mod.subModules) {
            const sSub = savedMap[sub.key] ?? DEFAULT_ROLE_MODULE_ACCESS[role][sub.key] ?? true;
            const dSub = draftMap[sub.key] ?? DEFAULT_ROLE_MODULE_ACCESS[role][sub.key] ?? true;
            if (sSub !== dSub) {
              count++;
              rolesChanged.add(role === 'owner' ? 'Super Admin' : role === 'manager' ? 'Store Manager' : 'Cashier');
            }
          }
        }
      }
    }

    return {
      unsavedCount: count,
      changedRoles: Array.from(rolesChanged),
    };
  }, [savedConfig, draftConfig]);

  // Window beforeunload warning when changes are pending
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (unsavedCount > 0) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes to role module access. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [unsavedCount]);

  // Toggle module for a specific role
  const handleToggle = useCallback(
    (role: 'owner' | 'manager' | 'cashier', key: string) => {
      // Super Admin Settings is locked and non-modifiable
      if (role === 'owner' && key === 'settings') {
        return;
      }

      setDraftConfig((prev) => {
        const currentRoleMap = prev[role] || {};
        const currentValue = currentRoleMap[key] ?? DEFAULT_ROLE_MODULE_ACCESS[role][key] ?? true;
        const newValue = !currentValue;

        return {
          ...prev,
          [role]: {
            ...currentRoleMap,
            [key]: newValue,
          },
        };
      });
    },
    []
  );

  // Toggle parent expand/collapse
  const toggleExpand = (parentKey: string) => {
    setExpandedKeys((prev) => ({
      ...prev,
      [parentKey]: !prev[parentKey],
    }));
  };

  // Discard changes
  const handleDiscard = () => {
    if (unsavedCount > 0) {
      const confirmDiscard = window.confirm(
        `Are you sure you want to discard ${unsavedCount} unsaved change${unsavedCount > 1 ? 's' : ''}?`
      );
      if (!confirmDiscard) return;
    }
    setDraftConfig(savedConfig);
  };

  // Save changes
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Ensure Super Admin Settings is strictly true
      const payload: RoleModuleAccessConfig = {
        ...draftConfig,
        owner: {
          ...draftConfig.owner,
          settings: true,
        },
      };

      const res = await saveModuleAccess(payload);
      if (res && res.success) {
        setSavedConfig(res.access || payload);
        setDraftConfig(res.access || payload);
        showToast('Module access permissions saved successfully!', 'success');
        if (onModuleAccessUpdated) {
          onModuleAccessUpdated(res.access || payload);
        }
      } else {
        throw new Error(res?.message || 'Failed to save module access');
      }
    } catch (err: any) {
      console.error('Error saving module access:', err);
      showToast(err.message || 'Failed to save module access. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Calculate enabled count per role for summary cards
  const roleStats = useMemo(() => {
    const roles: Array<'owner' | 'manager' | 'cashier'> = ['owner', 'manager', 'cashier'];
    const counts: Record<'owner' | 'manager' | 'cashier', number> = {
      owner: 0,
      manager: 0,
      cashier: 0,
    };

    for (const role of roles) {
      const roleMap = draftConfig[role] || {};
      let enabledCount = 0;
      for (const mod of APP_MODULES) {
        const isEnabled = mod.key === 'settings' && role === 'owner' ? true : (roleMap[mod.key] ?? DEFAULT_ROLE_MODULE_ACCESS[role][mod.key] ?? true);
        if (isEnabled) enabledCount++;
      }
      counts[role] = enabledCount;
    }

    return counts;
  }, [draftConfig]);

  // Filter modules based on search and status
  const filteredModules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return APP_MODULES.filter((mod) => {
      const matchesSearch =
        !q ||
        mod.name.toLowerCase().includes(q) ||
        mod.description.toLowerCase().includes(q) ||
        (mod.subModules &&
          mod.subModules.some(
            (sub) => sub.name.toLowerCase().includes(q) || sub.description.toLowerCase().includes(q)
          ));

      if (!matchesSearch) return false;

      // Status filter check
      if (statusFilter === 'all') return true;

      const roles: Array<'owner' | 'manager' | 'cashier'> = ['owner', 'manager', 'cashier'];
      const isEnabledForAnyRole = roles.some((role) => {
        if (mod.key === 'settings' && role === 'owner') return true;
        const roleMap = draftConfig[role] || {};
        return roleMap[mod.key] ?? DEFAULT_ROLE_MODULE_ACCESS[role][mod.key] ?? true;
      });

      const isDisabledForAnyRole = roles.some((role) => {
        if (mod.key === 'settings' && role === 'owner') return false;
        const roleMap = draftConfig[role] || {};
        return !(roleMap[mod.key] ?? DEFAULT_ROLE_MODULE_ACCESS[role][mod.key] ?? true);
      });

      if (statusFilter === 'enabled') return isEnabledForAnyRole;
      if (statusFilter === 'disabled') return isDisabledForAnyRole;

      return true;
    });
  }, [searchQuery, statusFilter, draftConfig]);

  // Counts for filter pills
  const filterCounts = useMemo(() => {
    const roles: Array<'owner' | 'manager' | 'cashier'> = ['owner', 'manager', 'cashier'];
    let enabledCount = 0;
    let disabledCount = 0;

    for (const mod of APP_MODULES) {
      const isEnabledForAnyRole = roles.some((role) => {
        if (mod.key === 'settings' && role === 'owner') return true;
        const roleMap = draftConfig[role] || {};
        return roleMap[mod.key] ?? DEFAULT_ROLE_MODULE_ACCESS[role][mod.key] ?? true;
      });

      const isDisabledForAnyRole = roles.some((role) => {
        if (mod.key === 'settings' && role === 'owner') return false;
        const roleMap = draftConfig[role] || {};
        return !(roleMap[mod.key] ?? DEFAULT_ROLE_MODULE_ACCESS[role][mod.key] ?? true);
      });

      if (isEnabledForAnyRole) enabledCount++;
      if (isDisabledForAnyRole) disabledCount++;
    }

    return {
      all: TOTAL_PARENT_MODULES,
      enabled: enabledCount,
      disabled: disabledCount,
    };
  }, [draftConfig]);

  // Helper to render module icon
  const renderModuleIcon = (iconName: string) => {
    switch (iconName) {
      case 'LayoutDashboard':
        return <LayoutDashboard size={18} strokeWidth={2.2} />;
      case 'ShoppingCart':
        return <ShoppingCart size={18} strokeWidth={2.2} />;
      case 'Warehouse':
        return <Warehouse size={18} strokeWidth={2.2} />;
      case 'Bell':
        return <Bell size={18} strokeWidth={2.2} />;
      case 'Package':
        return <Package size={18} strokeWidth={2.2} />;
      case 'Tag':
        return <Tag size={18} strokeWidth={2.2} />;
      case 'Layers':
        return <Layers size={18} strokeWidth={2.2} />;
      case 'BarChart2':
        return <BarChart2 size={18} strokeWidth={2.2} />;
      case 'Percent':
        return <Percent size={18} strokeWidth={2.2} />;
      case 'Users':
        return <Users size={18} strokeWidth={2.2} />;
      case 'Truck':
        return <Truck size={18} strokeWidth={2.2} />;
      case 'Briefcase':
        return <Briefcase size={18} strokeWidth={2.2} />;
      case 'FileSpreadsheet':
        return <FileSpreadsheet size={18} strokeWidth={2.2} />;
      case 'UserCog':
        return <UserCog size={18} strokeWidth={2.2} />;
      case 'Settings':
        return <Settings size={18} strokeWidth={2.2} />;
      default:
        return <Layers size={18} strokeWidth={2.2} />;
    }
  };

  return (
    <div className="mm-container">
      {/* Page Header */}
      <div className="mm-page-header">
        <div>
          <h1 className="mm-header-title">Module Management</h1>
          <p className="mm-header-desc">
            Manage module visibility and access permissions for each user role.
          </p>
        </div>
        <div className="mm-header-right">
          {unsavedCount > 0 && (
            <span className="mm-unsaved-pill" title="Changes pending save">
              <AlertCircle size={14} />
              {unsavedCount} unsaved change{unsavedCount > 1 ? 's' : ''}
            </span>
          )}
          <button
            type="button"
            className="mm-btn-outline"
            onClick={handleDiscard}
            disabled={unsavedCount === 0 || saving}
            title="Discard changes and revert to saved settings"
          >
            <RotateCcw size={15} /> Discard changes
          </button>
          <button
            type="button"
            className="mm-btn-primary"
            onClick={handleSave}
            disabled={unsavedCount === 0 || saving}
            title="Save changes to database"
          >
            {saving ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14 }} /> Saving...
              </>
            ) : (
              <>
                <Check size={16} /> Save changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4. Three Summary Cards */}
      <div className="mm-summary-grid">
        {/* Super Admin Card */}
        <div className="mm-summary-card">
          <div className="mm-summary-header">
            <div className="mm-role-tile">
              <ShieldCheck size={22} strokeWidth={2.2} />
            </div>
            <div>
              <div className="mm-summary-role-name">Super Admin</div>
              <div className="mm-summary-sub">Total enabled modules</div>
            </div>
          </div>
          <div className="mm-summary-count">
            {roleStats.owner} / {TOTAL_PARENT_MODULES} modules
          </div>
          <div className="mm-progress-track">
            <div
              className="mm-progress-fill"
              style={{ width: `${(roleStats.owner / TOTAL_PARENT_MODULES) * 100}%` }}
            />
          </div>
          <div className="mm-summary-note">
            {roleStats.owner === TOTAL_PARENT_MODULES ? (
              <>
                <Lock size={12} style={{ color: '#49364A' }} /> All modules enabled · Settings locked on
              </>
            ) : (
              `${TOTAL_PARENT_MODULES - roleStats.owner} modules hidden from sidebar`
            )}
          </div>
        </div>

        {/* Store Manager Card */}
        <div className="mm-summary-card">
          <div className="mm-summary-header">
            <div className="mm-role-tile">
              <Store size={22} strokeWidth={2.2} />
            </div>
            <div>
              <div className="mm-summary-role-name">Store Manager</div>
              <div className="mm-summary-sub">Total enabled modules</div>
            </div>
          </div>
          <div className="mm-summary-count">
            {roleStats.manager} / {TOTAL_PARENT_MODULES} modules
          </div>
          <div className="mm-progress-track">
            <div
              className="mm-progress-fill"
              style={{ width: `${(roleStats.manager / TOTAL_PARENT_MODULES) * 100}%` }}
            />
          </div>
          <div className="mm-summary-note">
            {roleStats.manager === TOTAL_PARENT_MODULES
              ? 'All modules enabled'
              : `${TOTAL_PARENT_MODULES - roleStats.manager} modules hidden from the sidebar`}
          </div>
        </div>

        {/* Cashier Card */}
        <div className="mm-summary-card">
          <div className="mm-summary-header">
            <div className="mm-role-tile">
              <CreditCard size={22} strokeWidth={2.2} />
            </div>
            <div>
              <div className="mm-summary-role-name">Cashier</div>
              <div className="mm-summary-sub">Total enabled modules</div>
            </div>
          </div>
          <div className="mm-summary-count">
            {roleStats.cashier} / {TOTAL_PARENT_MODULES} modules
          </div>
          <div className="mm-progress-track">
            <div
              className="mm-progress-fill"
              style={{ width: `${(roleStats.cashier / TOTAL_PARENT_MODULES) * 100}%` }}
            />
          </div>
          <div className="mm-summary-note">
            {roleStats.cashier === TOTAL_PARENT_MODULES
              ? 'All modules enabled'
              : `${TOTAL_PARENT_MODULES - roleStats.cashier} modules hidden from the sidebar`}
          </div>
        </div>
      </div>

      {/* 5. Module Access Configuration Card */}
      <div className="mm-config-card">
        <div className="mm-config-header">
          <div>
            <h2 className="mm-config-title">Module access configuration</h2>
            <p className="mm-config-helper">
              Turning off a parent module hides all of its sub-modules for that role.
            </p>
          </div>
          <div className="mm-config-toolbar">
            <div className="mm-search-box">
              <Search size={15} className="mm-search-icon" />
              <input
                type="text"
                className="mm-search-input"
                placeholder="Search modules…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#9E97A1',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="mm-segmented-filter">
              <button
                type="button"
                className={`mm-filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                All ({filterCounts.all})
              </button>
              <button
                type="button"
                className={`mm-filter-btn ${statusFilter === 'enabled' ? 'active' : ''}`}
                onClick={() => setStatusFilter('enabled')}
              >
                Enabled
              </button>
              <button
                type="button"
                className={`mm-filter-btn ${statusFilter === 'disabled' ? 'active' : ''}`}
                onClick={() => setStatusFilter('disabled')}
              >
                Disabled
              </button>
            </div>
          </div>
        </div>

        {/* Configuration Table */}
        <div className="mm-table-wrap">
          {loading ? (
            <div style={{ padding: '2rem' }}>
              <div className="mm-skeleton-row" />
              <div className="mm-skeleton-row" />
              <div className="mm-skeleton-row" />
              <div className="mm-skeleton-row" />
              <div className="mm-skeleton-row" />
            </div>
          ) : (
            <table className="mm-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Module</th>
                  <th className="mm-th-role">
                    <span className="mm-role-dot" /> Super Admin
                  </th>
                  <th className="mm-th-role">
                    <span className="mm-role-dot" /> Store Manager
                  </th>
                  <th className="mm-th-role">
                    <span className="mm-role-dot" /> Cashier
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredModules.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6B6670' }}>
                      <AlertCircle size={32} style={{ color: '#A39DA5', marginBottom: '0.5rem' }} />
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>No modules match your filter</div>
                      <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                        Try clearing your search term or selecting "All".
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredModules.map((mod: AppModule) => {
                    const hasSubModules = mod.subModules && mod.subModules.length > 0;
                    const isExpanded = Boolean(expandedKeys[mod.key]);

                    // State for each role for parent module
                    const saEnabled = mod.key === 'settings' ? true : (draftConfig.owner[mod.key] ?? true);
                    const smEnabled = draftConfig.manager[mod.key] ?? true;
                    const caEnabled = draftConfig.cashier[mod.key] ?? false;

                    return (
                      <React.Fragment key={mod.key}>
                        {/* Parent Row */}
                        <tr className="mm-row-parent">
                          <td>
                            <div className="mm-module-col">
                              {hasSubModules ? (
                                <button
                                  type="button"
                                  className={`mm-chevron-btn ${isExpanded ? 'open' : ''}`}
                                  onClick={() => toggleExpand(mod.key)}
                                  aria-label={isExpanded ? 'Collapse submodules' : 'Expand submodules'}
                                  title={isExpanded ? 'Collapse submodules' : 'Expand submodules'}
                                >
                                  <ChevronRight size={18} />
                                </button>
                              ) : (
                                <div className="mm-chevron-placeholder" />
                              )}
                              <div className="mm-icon-tile">
                                {renderModuleIcon(mod.icon)}
                              </div>
                              <div className="mm-module-text-wrap">
                                <div className="mm-module-name-row">
                                  <span className="mm-module-name">{mod.name}</span>
                                  {hasSubModules ? (
                                    <span className="mm-submodule-badge">
                                      {mod.subModules!.length} sub-modules
                                    </span>
                                  ) : (
                                    <span className="mm-toplevel-badge">Top-level module</span>
                                  )}
                                </div>
                                <span className="mm-module-desc">{mod.description}</span>
                              </div>
                            </div>
                          </td>

                          {/* Super Admin Toggle */}
                          <td>
                            <div className="mm-toggle-cell">
                              {mod.key === 'settings' ? (
                                <div>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={true}
                                    aria-disabled={true}
                                    className="mm-switch-track on locked-admin"
                                    title="Settings is mandatory for Super Admin and cannot be disabled."
                                  >
                                    <span className="mm-switch-knob locked">
                                      <Lock size={9} strokeWidth={3} />
                                    </span>
                                  </button>
                                  <span className="mm-switch-label on locked">
                                    Enabled <Lock size={11} strokeWidth={2.5} />
                                  </span>
                                  <div className="mm-lock-helper">
                                    Settings is mandatory for Super Admin and cannot be disabled.
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={saEnabled}
                                    className={`mm-switch-track ${saEnabled ? 'on' : ''}`}
                                    onClick={() => handleToggle('owner', mod.key)}
                                    title={`Click to ${saEnabled ? 'disable' : 'enable'} ${mod.name} for Super Admin`}
                                  >
                                    <span className="mm-switch-knob" />
                                  </button>
                                  <span className={`mm-switch-label ${saEnabled ? 'on' : 'off'}`}>
                                    {saEnabled ? 'Enabled' : 'Disabled'}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>

                          {/* Store Manager Toggle */}
                          <td>
                            <div className="mm-toggle-cell">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={smEnabled}
                                className={`mm-switch-track ${smEnabled ? 'on' : ''}`}
                                onClick={() => handleToggle('manager', mod.key)}
                                title={`Click to ${smEnabled ? 'disable' : 'enable'} ${mod.name} for Store Manager`}
                              >
                                <span className="mm-switch-knob" />
                              </button>
                              <span className={`mm-switch-label ${smEnabled ? 'on' : 'off'}`}>
                                {smEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </td>

                          {/* Cashier Toggle */}
                          <td>
                            <div className="mm-toggle-cell">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={caEnabled}
                                className={`mm-switch-track ${caEnabled ? 'on' : ''}`}
                                onClick={() => handleToggle('cashier', mod.key)}
                                title={`Click to ${caEnabled ? 'disable' : 'enable'} ${mod.name} for Cashier`}
                              >
                                <span className="mm-switch-knob" />
                              </button>
                              <span className={`mm-switch-label ${caEnabled ? 'on' : 'off'}`}>
                                {caEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                          </td>
                        </tr>

                        {/* Sub-Module Rows (if expanded) */}
                        {hasSubModules &&
                          isExpanded &&
                          mod.subModules!.map((sub: AppSubModule) => {
                            // Sub-module draft values
                            const saSubVal = draftConfig.owner[sub.key] ?? true;
                            const smSubVal = draftConfig.manager[sub.key] ?? true;
                            const caSubVal = draftConfig.cashier[sub.key] ?? false;

                            return (
                              <tr key={sub.key} className="mm-row-sub">
                                <td>
                                  <div className="mm-submodule-col">
                                    <span className="mm-tree-connector">└─</span>
                                    <div>
                                      <div className="mm-submodule-name">{sub.name}</div>
                                      <div className="mm-submodule-desc">{sub.description}</div>
                                    </div>
                                  </div>
                                </td>

                                {/* Super Admin Sub-Toggle */}
                                <td>
                                  <div className="mm-toggle-cell">
                                    {!saEnabled ? (
                                      <>
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={false}
                                          aria-disabled={true}
                                          className="mm-switch-track dashed-inactive"
                                          title={`Parent module "${mod.name}" is disabled. Sub-module is hidden.`}
                                        >
                                          <span className="mm-switch-knob inactive" />
                                        </button>
                                        <span className="mm-switch-label hidden-parent">
                                          Hidden with parent
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={saSubVal}
                                          className={`mm-switch-track ${saSubVal ? 'on' : ''}`}
                                          onClick={() => handleToggle('owner', sub.key)}
                                          title={`Click to ${saSubVal ? 'disable' : 'enable'} ${sub.name} for Super Admin`}
                                        >
                                          <span className="mm-switch-knob" />
                                        </button>
                                        <span className={`mm-switch-label ${saSubVal ? 'on' : 'off'}`}>
                                          {saSubVal ? 'Enabled' : 'Disabled'}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </td>

                                {/* Store Manager Sub-Toggle */}
                                <td>
                                  <div className="mm-toggle-cell">
                                    {!smEnabled ? (
                                      <>
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={false}
                                          aria-disabled={true}
                                          className="mm-switch-track dashed-inactive"
                                          title={`Parent module "${mod.name}" is disabled. Sub-module is hidden.`}
                                        >
                                          <span className="mm-switch-knob inactive" />
                                        </button>
                                        <span className="mm-switch-label hidden-parent">
                                          Hidden with parent
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={smSubVal}
                                          className={`mm-switch-track ${smSubVal ? 'on' : ''}`}
                                          onClick={() => handleToggle('manager', sub.key)}
                                          title={`Click to ${smSubVal ? 'disable' : 'enable'} ${sub.name} for Store Manager`}
                                        >
                                          <span className="mm-switch-knob" />
                                        </button>
                                        <span className={`mm-switch-label ${smSubVal ? 'on' : 'off'}`}>
                                          {smSubVal ? 'Enabled' : 'Disabled'}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </td>

                                {/* Cashier Sub-Toggle */}
                                <td>
                                  <div className="mm-toggle-cell">
                                    {!caEnabled ? (
                                      <>
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={false}
                                          aria-disabled={true}
                                          className="mm-switch-track dashed-inactive"
                                          title={`Parent module "${mod.name}" is disabled. Sub-module is hidden.`}
                                        >
                                          <span className="mm-switch-knob inactive" />
                                        </button>
                                        <span className="mm-switch-label hidden-parent">
                                          Hidden with parent
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={caSubVal}
                                          className={`mm-switch-track ${caSubVal ? 'on' : ''}`}
                                          onClick={() => handleToggle('cashier', sub.key)}
                                          title={`Click to ${caSubVal ? 'disable' : 'enable'} ${sub.name} for Cashier`}
                                        >
                                          <span className="mm-switch-knob" />
                                        </button>
                                        <span className={`mm-switch-label ${caSubVal ? 'on' : 'off'}`}>
                                          {caSubVal ? 'Enabled' : 'Disabled'}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Table Footer */}
        <div className="mm-table-footer">
          <div className="mm-footer-info">
            Showing {TOTAL_PARENT_MODULES} modules · {TOTAL_SUB_MODULES} sub-modules
          </div>
          <div className="mm-footer-lock-notice">
            <Lock size={13} />
            <span>Settings always stays on for Super Admin.</span>
          </div>
        </div>
      </div>

      {/* 6. Sticky Bottom Save Bar */}
      {unsavedCount > 0 && (
        <div className="mm-sticky-save-bar">
          <div className="mm-savebar-left">
            <span className="mm-savebar-dot" />
            <span>
              You have {unsavedCount} unsaved change{unsavedCount > 1 ? 's' : ''} across{' '}
              <strong>{changedRoles.join(', ')}</strong>.
            </span>
          </div>
          <div className="mm-savebar-actions">
            <button
              type="button"
              className="mm-btn-savebar-discard"
              onClick={handleDiscard}
              disabled={saving}
              title="Discard changes"
            >
              Discard
            </button>
            <button
              type="button"
              className="mm-btn-savebar-save"
              onClick={handleSave}
              disabled={saving}
              title="Save changes"
            >
              {saving ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14 }} /> Saving...
                </>
              ) : (
                <>
                  <Check size={16} /> Save changes
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
