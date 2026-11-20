// shared/modules.ts
// Single source of truth for all sidebar modules and access control permissions in Ledgerly

export interface AppSubModule {
  key: string;
  parentKey: string;
  name: string;
  description: string;
  route: string;
}

export interface AppModule {
  key: string;
  name: string;
  description: string;
  icon: string;
  route: string;
  isSettingsLocked?: boolean;
  subModules?: AppSubModule[];
}

export const APP_MODULES: AppModule[] = [
  {
    key: 'dashboard',
    name: 'Dashboard',
    description: 'Executive revenue overview, sales analytics & live store metrics',
    icon: 'LayoutDashboard',
    route: 'dashboard',
  },
  {
    key: 'pos',
    name: 'POS Counter',
    description: 'High-speed retail checkout, barcode scanner & quick billing',
    icon: 'ShoppingCart',
    route: 'pos',
  },
  {
    key: 'wholesale',
    name: 'Wholesale Billing',
    description: 'B2B tax invoices, bulk wholesale orders & settlement terms',
    icon: 'Warehouse',
    route: 'wholesale',
  },
  {
    key: 'notifications',
    name: 'Notifications',
    description: 'Cashier shift alerts, opening floats & store audit notifications',
    icon: 'Bell',
    route: 'notifications',
  },
  {
    key: 'items',
    name: 'Products',
    description: 'Item master catalogue, barcode generation, HSN codes & pricing',
    icon: 'Package',
    route: 'items',
  },
  {
    key: 'categories',
    name: 'Categories',
    description: 'Multi-level category hierarchy, tax classification & product grouping',
    icon: 'Tag',
    route: 'categories',
  },
  {
    key: 'inventory',
    name: 'Inventory Hub',
    description: 'Multi-branch stock balances, adjustments & automated replenishment',
    icon: 'Layers',
    route: 'inventory',
    subModules: [
      {
        key: 'inventory.levels',
        parentKey: 'inventory',
        name: 'Stock Levels',
        description: 'Real-time stock valuation, balances & physical discrepancy adjustment',
        route: 'inventory',
      },
      {
        key: 'inventory.transfers',
        parentKey: 'inventory',
        name: 'Stock Transfers',
        description: 'Inter-branch stock transfer requests, dispatch & receipt confirmation',
        route: 'stock-transfer',
      },
      {
        key: 'inventory.reports',
        parentKey: 'inventory',
        name: 'Purchase Orders',
        description: 'Vendor reorder suggestions, stock movements & replenishment tracking',
        route: 'product-movement',
      },
    ],
  },
  {
    key: 'sales-analysis',
    name: 'Sales Analysis',
    description: 'Hourly customer traffic curves, profit margins & sales breakdown',
    icon: 'BarChart2',
    route: 'sales-analysis',
  },
  {
    key: 'promotions',
    name: 'Discounts & Offers',
    description: 'Automated discount rules, promotional coupons & campaign triggers',
    icon: 'Percent',
    route: 'promotions',
  },
  {
    key: 'customers',
    name: 'Customers',
    description: 'Customer contact directory, purchase history & loyalty points wallet',
    icon: 'Users',
    route: 'customers',
  },
  {
    key: 'suppliers',
    name: 'Suppliers',
    description: 'Vendor directory, purchase invoices & supplier balance reconciliation',
    icon: 'Truck',
    route: 'suppliers',
  },
  {
    key: 'accounts',
    name: 'Accounts & Finance',
    description: 'Operational expenses, supplier payments, cash drawer & ledgers',
    icon: 'Briefcase',
    route: 'invoices',
    subModules: [
      {
        key: 'accounts.expenses',
        parentKey: 'accounts',
        name: 'Expenses',
        description: 'Operational business expenditures, vendor GST vouchers & petty cash',
        route: 'expenses',
      },
      {
        key: 'accounts.payments',
        parentKey: 'accounts',
        name: 'Payments & Ledgers',
        description: 'Accounts receivable/payable, payment vouchers & customer credit dues',
        route: 'payments',
      },
    ],
  },
  {
    key: 'gst',
    name: 'GST Filing',
    description: 'Statutory GST tax compliance, ITC reconciliation & return preparation',
    icon: 'FileSpreadsheet',
    route: 'gst-overview',
    subModules: [
      {
        key: 'gst.gstr1',
        parentKey: 'gst',
        name: 'GSTR-1',
        description: 'Outward supplies register, B2B invoices & B2C counter sales',
        route: 'gst-gstr1',
      },
      {
        key: 'gst.gstr3b',
        parentKey: 'gst',
        name: 'GSTR-3B',
        description: 'Monthly summary liabilities, reviewed eligible ITC & net tax payable',
        route: 'gst-gstr3b',
      },
      {
        key: 'gst.hsn',
        parentKey: 'gst',
        name: 'HSN Summary',
        description: 'HSN code sales distribution, GSTR-2B ITC matching & statutory export',
        route: 'gst-itc-reconciliation',
      },
    ],
  },
  {
    key: 'user-management',
    name: 'User Management',
    description: 'Staff credentials, role assignments, counter locks & permissions',
    icon: 'UserCog',
    route: 'user-management',
  },
  {
    key: 'settings',
    name: 'Settings',
    description: 'Enterprise store configuration, tax GSTINs, thermal printers & modules',
    icon: 'Settings',
    route: 'settings',
    isSettingsLocked: true,
  },
];

export const TOTAL_PARENT_MODULES = APP_MODULES.length; // 15
export const TOTAL_SUB_MODULES = APP_MODULES.reduce(
  (acc, mod) => acc + (mod.subModules ? mod.subModules.length : 0),
  0
); // 8

export type ModuleAccessMap = Record<string, boolean>;
export type RoleModuleAccessConfig = Record<'owner' | 'manager' | 'cashier', ModuleAccessMap>;

export const DEFAULT_ROLE_MODULE_ACCESS: RoleModuleAccessConfig = {
  owner: {
    dashboard: true,
    pos: true,
    wholesale: true,
    notifications: true,
    items: true,
    categories: true,
    inventory: true,
    'inventory.levels': true,
    'inventory.transfers': true,
    'inventory.reports': true,
    'sales-analysis': true,
    promotions: true,
    customers: true,
    suppliers: true,
    accounts: true,
    'accounts.expenses': true,
    'accounts.payments': true,
    gst: true,
    'gst.gstr1': true,
    'gst.gstr3b': true,
    'gst.hsn': true,
    'user-management': true,
    settings: true,
  },
  manager: {
    dashboard: true,
    pos: true,
    wholesale: true,
    notifications: true,
    items: true,
    categories: true,
    inventory: true,
    'inventory.levels': true,
    'inventory.transfers': true,
    'inventory.reports': true,
    'sales-analysis': true,
    promotions: true,
    customers: true,
    suppliers: true,
    accounts: true,
    'accounts.expenses': true,
    'accounts.payments': true,
    gst: true,
    'gst.gstr1': true,
    'gst.gstr3b': true,
    'gst.hsn': true,
    'user-management': true,
    settings: true,
  },
  cashier: {
    dashboard: false,
    pos: true,
    wholesale: false,
    notifications: true,
    items: false,
    categories: false,
    inventory: false,
    'inventory.levels': false,
    'inventory.transfers': false,
    'inventory.reports': false,
    'sales-analysis': false,
    promotions: false,
    customers: false,
    suppliers: false,
    accounts: false,
    'accounts.expenses': false,
    'accounts.payments': false,
    gst: false,
    'gst.gstr1': false,
    'gst.gstr3b': false,
    'gst.hsn': false,
    'user-management': false,
    settings: false,
  },
};

/**
 * Checks whether a module or sub-module is enabled for a given role in the config.
 * Inherits parent state: if a parent module is disabled, all its sub-modules are effectively disabled.
 */
export function isModuleEnabledForRole(
  config: RoleModuleAccessConfig | undefined,
  role: string | undefined,
  moduleKey: string
): boolean {
  if (!config || !role) return true;
  const canonicalRole = (role === 'super_admin' ? 'owner' : role) as 'owner' | 'manager' | 'cashier';
  const roleAccess = config[canonicalRole] || DEFAULT_ROLE_MODULE_ACCESS[canonicalRole] || DEFAULT_ROLE_MODULE_ACCESS.owner;

  // Settings is permanently locked on for Super Admin
  if (canonicalRole === 'owner' && moduleKey === 'settings') {
    return true;
  }

  // Check if sub-module: if so, verify parent module first
  if (moduleKey.includes('.')) {
    const parentKey = moduleKey.split('.')[0];
    const parentEnabled = roleAccess[parentKey] ?? DEFAULT_ROLE_MODULE_ACCESS[canonicalRole]?.[parentKey] ?? true;
    if (!parentEnabled) return false;
  }

  return roleAccess[moduleKey] ?? DEFAULT_ROLE_MODULE_ACCESS[canonicalRole]?.[moduleKey] ?? true;
}
