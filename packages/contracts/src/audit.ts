/**
 * What the audit log records an action as. One list, so the page offers exactly these and the API refuses any
 * other value: the page used to offer six actions the log never writes, and each gave a server error (F-057).
 * Kept equal to the Prisma `AuditAction` enum; `audit-actions.spec.ts` in the API checks that.
 */
export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'IMPORT',
  'EXPORT',
  'IMPERSONATE_START',
  'IMPERSONATE_END',
  'APPROVE',
  'REJECT',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
