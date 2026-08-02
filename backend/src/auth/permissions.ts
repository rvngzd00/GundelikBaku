export const PERMISSIONS = [
  'platform.manage', 'dashboard.read', 'audit.read',
  'users.read', 'users.manage', 'roles.manage',
  'vendors.read', 'vendors.manage', 'vendors.approve',
  'catalog.read', 'catalog.create', 'catalog.update', 'catalog.delete', 'catalog.publish',
  'inventory.read', 'inventory.manage',
  'orders.read', 'orders.manage', 'orders.refund',
  'customers.read', 'customers.manage',
  'cms.read', 'cms.create', 'cms.update', 'cms.delete', 'cms.publish',
  'media.read', 'media.manage',
  'editor.read', 'editor.manage', 'editor.publish',
  'seo.read', 'seo.manage', 'seo.audit',
  'campaigns.read', 'campaigns.manage',
  'coupons.read', 'coupons.manage',
  'qr.read', 'qr.manage', 'qr.analytics',
  'loyalty.read', 'loyalty.manage',
  'classifieds.read', 'classifieds.moderate',
  'analytics.read', 'analytics.export',
  'settings.read', 'settings.manage'
] as const;

export type Permission = typeof PERMISSIONS[number];

export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  admin: PERMISSIONS.filter((permission) => permission !== 'platform.manage'),
  editor: ['dashboard.read', 'cms.read', 'cms.create', 'cms.update', 'cms.publish', 'media.read', 'media.manage', 'editor.read', 'editor.manage', 'editor.publish', 'seo.read'],
  seo: ['dashboard.read', 'cms.read', 'cms.update', 'seo.read', 'seo.manage', 'seo.audit', 'analytics.read'],
  moderator: ['dashboard.read', 'cms.read', 'classifieds.read', 'classifieds.moderate', 'vendors.read', 'catalog.read', 'media.read'],
  vendor_owner: [
    'dashboard.read', 'catalog.read', 'catalog.create', 'catalog.update', 'catalog.delete',
    'inventory.read', 'inventory.manage', 'orders.read', 'orders.manage',
    'campaigns.read', 'campaigns.manage', 'coupons.read', 'coupons.manage',
    'qr.read', 'qr.manage', 'qr.analytics', 'analytics.read', 'media.read', 'media.manage', 'loyalty.read', 'loyalty.manage'
  ],
  vendor_staff: ['dashboard.read', 'catalog.read', 'catalog.create', 'catalog.update', 'inventory.read', 'inventory.manage', 'orders.read', 'orders.manage', 'media.read', 'media.manage', 'loyalty.read'],
  customer: []
};
