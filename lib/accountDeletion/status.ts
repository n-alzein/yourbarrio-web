export const ACCOUNT_STATUS = {
  ACTIVE: "active",
  PENDING_DELETION: "pending_deletion",
  DISABLED: "disabled",
  DELETED: "deleted",
} as const;

export type AccountStatus =
  (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS] | null;

export function normalizeAccountStatus(value: unknown): AccountStatus {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === ACCOUNT_STATUS.ACTIVE ||
    normalized === ACCOUNT_STATUS.PENDING_DELETION ||
    normalized === ACCOUNT_STATUS.DISABLED ||
    normalized === ACCOUNT_STATUS.DELETED
  ) {
    return normalized;
  }
  return null;
}

export function isBlockedAccountStatus(status: unknown): boolean {
  const normalized = normalizeAccountStatus(status);
  return (
    normalized === ACCOUNT_STATUS.PENDING_DELETION ||
    normalized === ACCOUNT_STATUS.DISABLED ||
    normalized === ACCOUNT_STATUS.DELETED
  );
}

export function getAccountDeletedRedirectPath() {
  return "/account-deleted";
}

// Backward-compatible alias for older imports.
export function getPendingDeletionRedirectPath() {
  return getAccountDeletedRedirectPath();
}
