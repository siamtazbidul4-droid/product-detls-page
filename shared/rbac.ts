export type StaffRole =
  | 'customer'
  | 'super_admin'
  | 'admin'
  | 'order_manager'
  | 'inventory_manager'
  | 'catalog_manager'
  | 'customer_support'
  | 'finance_accounts';

export type Permission =
  | 'dashboard:view'
  | 'catalog:read'
  | 'catalog:write'
  | 'inventory:read'
  | 'inventory:write'
  | 'orders:read'
  | 'orders:transition'
  | 'orders:cancel'
  | 'returns:manage'
  | 'payments:read'
  | 'payments:refund'
  | 'reviews:moderate'
  | 'cms:write'
  | 'ads:write'
  | 'coupons:write'
  | 'customers:read'
  | 'support:manage'
  | 'reports:read'
  | 'staff:manage'
  | 'settings:write'
  | 'audit:read';

export const STAFF_ROLES: StaffRole[] = [
  'super_admin',
  'admin',
  'order_manager',
  'inventory_manager',
  'catalog_manager',
  'customer_support',
  'finance_accounts',
];

const ALL_PERMISSIONS: Permission[] = [
  'dashboard:view',
  'catalog:read',
  'catalog:write',
  'inventory:read',
  'inventory:write',
  'orders:read',
  'orders:transition',
  'orders:cancel',
  'returns:manage',
  'payments:read',
  'payments:refund',
  'reviews:moderate',
  'cms:write',
  'ads:write',
  'coupons:write',
  'customers:read',
  'support:manage',
  'reports:read',
  'staff:manage',
  'settings:write',
  'audit:read',
];

export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  customer: [],
  super_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter((p) => p !== 'staff:manage'),
  order_manager: [
    'dashboard:view',
    'orders:read',
    'orders:transition',
    'orders:cancel',
    'returns:manage',
    'customers:read',
  ],
  inventory_manager: [
    'dashboard:view',
    'catalog:read',
    'inventory:read',
    'inventory:write',
    'reports:read',
  ],
  catalog_manager: [
    'dashboard:view',
    'catalog:read',
    'catalog:write',
    'cms:write',
    'ads:write',
    'coupons:write',
  ],
  customer_support: [
    'dashboard:view',
    'orders:read',
    'returns:manage',
    'reviews:moderate',
    'customers:read',
    'support:manage',
  ],
  finance_accounts: [
    'dashboard:view',
    'orders:read',
    'payments:read',
    'payments:refund',
    'reports:read',
    'audit:read',
  ],
};

export function hasPermission(role: StaffRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function isStaffRole(role: StaffRole | undefined): boolean {
  return Boolean(role && role !== 'customer');
}
