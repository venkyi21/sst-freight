export type NavPage = 'dashboard' | 'directory' | 'team' | 'quotes' | 'accounting' | 'customs' | 'reporting' | 'integrations' | 'settings' | 'auditlog' | 'platformadmin'

// Default org-avatar colors (white-label axis, ADR-0019) — real hex values, deliberately NOT
// theme tokens: an org's color is its own brand data, stored in the DB, independent of the app
// theme. Amber/cyan darkened for white-text legibility on the light theme (ADR-0031); orgs that
// picked the old values keep them (see docs/tech-debt.md).
export const TENANT_COLORS = ['#2563eb', '#10b981', '#8b5cf6', '#d97706', '#ef4444', '#0891b2']

// Week 14 (ADR-0021): the 28 states + 8 union territories GST recognizes as distinct place-of-
// supply jurisdictions — used for both an org's home state (gst_state) and a contact's state,
// so the two values being compared always come from the same fixed list (no free-text drift).
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const
