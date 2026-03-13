export const GENERIC_INVALID_CREDENTIALS_MESSAGE = "The email or password is incorrect.";
export const BLOCKED_LOGIN_ERROR_CODE = "yb_blocked_account";
const AUTH_UI_RESET_SUPPRESS_KEY = "__YB_SUPPRESS_AUTH_UI_RESET_UNTIL";

export function createBlockedLoginError() {
  const error = new Error(BLOCKED_LOGIN_ERROR_CODE);
  error.code = BLOCKED_LOGIN_ERROR_CODE;
  return error;
}

export function suppressAuthUiResetForCredentialsError(ms = 4000) {
  if (typeof window === "undefined") return;
  window[AUTH_UI_RESET_SUPPRESS_KEY] = Date.now() + Math.max(0, Number(ms) || 0);
}

export function shouldSuppressAuthUiReset() {
  if (typeof window === "undefined") return false;
  const until = Number(window[AUTH_UI_RESET_SUPPRESS_KEY] || 0);
  if (!until || Number.isNaN(until)) return false;
  if (until <= Date.now()) {
    delete window[AUTH_UI_RESET_SUPPRESS_KEY];
    return false;
  }
  return true;
}

export function isGenericInvalidCredentialsError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  if (code === BLOCKED_LOGIN_ERROR_CODE || message.includes(BLOCKED_LOGIN_ERROR_CODE)) {
    return true;
  }
  return (
    code.includes("invalid_grant") ||
    code.includes("invalid_credentials") ||
    message.includes("invalid login credentials") ||
    message.includes("invalid credentials") ||
    message.includes("email or password") ||
    message.includes("account or password")
  );
}
