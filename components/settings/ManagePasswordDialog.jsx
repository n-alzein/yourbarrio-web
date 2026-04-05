"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const MIN_PASSWORD_LENGTH = 8;

function getAuthProviderInfo(authUser) {
  const provider = authUser?.app_metadata?.provider || null;
  const providers = authUser?.app_metadata?.providers || null;
  const normalizedProviders = Array.isArray(providers)
    ? providers
    : providers
      ? [providers]
      : [];
  return { provider, providers: normalizedProviders };
}

const classes = {
  backdrop:
    "fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.5)] px-4 py-10",
  panel:
    "w-full max-w-lg rounded-2xl border border-[var(--yb-border)] bg-[var(--yb-bg)] p-6 text-[var(--yb-text)] shadow-[0_24px_64px_-24px_rgba(15,23,42,0.35)]",
  title: "text-xl font-semibold text-[var(--yb-text)]",
  subtitle: "mt-1 text-sm text-[var(--yb-text-muted)]",
  closeButton:
    "inline-flex h-9 items-center justify-center rounded-full border border-[var(--yb-border)] bg-[var(--yb-surface)] px-3 text-xs font-semibold text-[var(--yb-text-secondary)] transition hover:border-slate-300 hover:text-[var(--yb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--brand-rgb),0.35)]",
  loadingRow: "mt-6 flex items-center gap-3 text-sm text-[var(--yb-text-secondary)]",
  spinner:
    "h-5 w-5 animate-spin rounded-full border-2 border-[var(--yb-border)] border-t-[var(--yb-focus)]",
  oauthCard:
    "mt-6 space-y-4 rounded-xl border border-[var(--yb-border)] bg-[var(--yb-surface)] p-4",
  bodyText: "text-sm text-[var(--yb-text-secondary)]",
  primaryButton:
    "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--brand-rgb),0.35)]",
  primaryButtonEnabled:
    "yb-primary-button text-white",
  primaryButtonDisabled:
    "yb-primary-button text-white",
  label: "mb-1.5 block text-sm font-medium text-[var(--yb-text-secondary)]",
  input:
    "h-11 w-full appearance-none rounded-xl border border-[var(--yb-border)] bg-[var(--yb-bg)] px-3 text-base text-[var(--yb-text)] placeholder:text-[var(--yb-text-muted)] transition md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--brand-rgb),0.35)] focus-visible:border-[var(--yb-focus)]",
  inputError:
    "border-rose-600 focus-visible:border-rose-600 focus-visible:ring-[rgba(225,29,72,0.3)]",
  helperBase: "mt-1.5 min-h-[1.25rem] text-xs",
  helperMuted: "text-[var(--yb-text-muted)]",
  helperError: "text-rose-700",
  actions: "flex flex-wrap items-center gap-3 pt-2",
  resetTextButton:
    "text-sm font-semibold text-[var(--yb-focus)] transition hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--brand-rgb),0.35)] rounded-md",
  resetTextButtonDisabled: "cursor-not-allowed text-slate-400",
  alertError:
    "mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800",
  alertSuccess:
    "mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800",
};

export default function ManagePasswordDialog({
  open,
  onClose,
  supabase,
  user,
  onSuccess,
}) {
  const [authUser, setAuthUser] = useState(user ?? null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState({
    current: false,
    password: false,
    confirm: false,
  });
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const didInitRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setErrorMessage("");
    setInfoMessage("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTouched({ current: false, password: false, confirm: false });
    setSubmitAttempted(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!supabase) return;
    let active = true;
    setLoadingUser(true);
    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setAuthUser(user ?? null);
          setErrorMessage(error.message || "Unable to load user details.");
          return;
        }
        setAuthUser(data?.user ?? user ?? null);
      })
      .catch(() => {
        if (!active) return;
        setAuthUser(user ?? null);
      })
      .finally(() => {
        if (!active) return;
        setLoadingUser(false);
      });
    return () => {
      active = false;
    };
  }, [open, supabase, user]);

  useEffect(() => {
    if (!open) return;
    if (didInitRef.current) return;
    didInitRef.current = true;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      didInitRef.current = false;
    };
  }, [onClose, open]);

  const { provider, providers } = useMemo(
    () => getAuthProviderInfo(authUser),
    [authUser]
  );
  const canUpdatePassword = useMemo(() => {
    if (provider === "email") return true;
    if (providers.includes("email")) return true;
    return false;
  }, [provider, providers]);

  const userEmail = authUser?.email || user?.email || "";

  const passwordTooShort =
    newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LENGTH;
  const passwordsMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;
  const currentPasswordMissing = currentPassword.length === 0;

  const showCurrentError =
    (touched.current || submitAttempted) && currentPasswordMissing;
  const showPasswordError =
    (touched.password || submitAttempted) && passwordTooShort;
  const showConfirmError =
    (touched.confirm || submitAttempted) &&
    (confirmPassword.length === 0 || passwordsMismatch);

  const formValid =
    currentPassword.length > 0 &&
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword.length >= MIN_PASSWORD_LENGTH &&
    newPassword === confirmPassword;

  const handleClose = () => {
    setErrorMessage("");
    setInfoMessage("");
    onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setErrorMessage("");
    setInfoMessage("");

    if (!formValid || !supabase) return;
    if (!userEmail) {
      setErrorMessage("We couldn't verify your account email.");
      return;
    }

    setSaving(true);
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    });

    if (verifyError) {
      setSaving(false);
      setErrorMessage(verifyError.message || "Current password is incorrect.");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setSaving(false);

    if (error) {
      setErrorMessage(error.message || "Failed to update password.");
      return;
    }

    if (onSuccess) {
      onSuccess("Password updated.");
    }
    handleClose();
  };

  const handleSendReset = async () => {
    if (!supabase || !userEmail) return;
    setSendingReset(true);
    setErrorMessage("");
    setInfoMessage("");
    try {
      const redirectTo = `${window.location.origin}/auth/update-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo,
      });
      if (error) {
        setErrorMessage(error.message || "Failed to send reset email.");
      } else {
        setInfoMessage("Password reset email sent.");
      }
    } catch (err) {
      setErrorMessage(err?.message || "Failed to send reset email.");
    } finally {
      setSendingReset(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className={classes.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Manage password"
      onClick={handleClose}
    >
      <div
        className={classes.panel}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className={classes.title}>Manage password</h2>
            <p className={classes.subtitle}>Update how you sign in to YourBarrio.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className={classes.closeButton}
          >
            Close
          </button>
        </div>

        {loadingUser ? (
          <div className={classes.loadingRow}>
            <div className={classes.spinner} />
            Loading security details...
          </div>
        ) : null}

        {!loadingUser && !canUpdatePassword ? (
          <div className={classes.oauthCard}>
            <p className={classes.bodyText}>
              You signed in with Google. Manage your password through your
              Google account or set a password via email reset.
            </p>
            <button
              type="button"
              onClick={handleSendReset}
              disabled={!userEmail || sendingReset}
              className={`${classes.primaryButton} ${
                userEmail && !sendingReset
                  ? classes.primaryButtonEnabled
                  : classes.primaryButtonDisabled
              }`}
            >
              {sendingReset ? "Sending..." : "Send password reset email"}
            </button>
          </div>
        ) : null}

        {!loadingUser && canUpdatePassword ? (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="current-password" className={classes.label}>
                Current password
              </label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                onBlur={() =>
                  setTouched((prev) => ({ ...prev, current: true }))
                }
                className={`${classes.input} ${showCurrentError ? classes.inputError : ""}`}
                placeholder="Enter your current password"
                autoComplete="current-password"
                aria-invalid={showCurrentError}
              />
              <p
                className={`${classes.helperBase} ${
                  showCurrentError ? classes.helperError : classes.helperMuted
                }`}
              >
                {showCurrentError
                  ? "Enter your current password."
                  : "Required to verify your update."}
              </p>
            </div>
            <div>
              <label htmlFor="new-password" className={classes.label}>
                New password
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                onBlur={() =>
                  setTouched((prev) => ({ ...prev, password: true }))
                }
                className={`${classes.input} ${showPasswordError ? classes.inputError : ""}`}
                placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
                autoComplete="new-password"
                aria-invalid={showPasswordError}
              />
              <p
                className={`${classes.helperBase} ${
                  showPasswordError ? classes.helperError : classes.helperMuted
                }`}
              >
                {showPasswordError
                  ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
                  : "Use at least 8 characters."}
              </p>
            </div>

            <div>
              <label htmlFor="confirm-password" className={classes.label}>
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                onBlur={() =>
                  setTouched((prev) => ({ ...prev, confirm: true }))
                }
                className={`${classes.input} ${showConfirmError ? classes.inputError : ""}`}
                placeholder="Re-enter your new password"
                autoComplete="new-password"
                aria-invalid={showConfirmError}
              />
              <p
                className={`${classes.helperBase} ${
                  showConfirmError ? classes.helperError : classes.helperMuted
                }`}
              >
                {showConfirmError
                  ? "Passwords must match."
                  : "Make sure both entries match."}
              </p>
            </div>

            <div className={classes.actions}>
              <button
                type="submit"
                disabled={!formValid || saving}
                className={`${classes.primaryButton} ${
                  formValid && !saving
                    ? classes.primaryButtonEnabled
                    : classes.primaryButtonDisabled
                }`}
              >
                {saving ? "Updating..." : "Update password"}
              </button>
              <button
                type="button"
                onClick={handleSendReset}
                disabled={!userEmail || sendingReset}
                className={`${classes.resetTextButton} ${
                  !userEmail || sendingReset ? classes.resetTextButtonDisabled : ""
                }`}
              >
                {sendingReset ? "Sending reset..." : "Send password reset email"}
              </button>
            </div>
          </form>
        ) : null}

        {errorMessage ? <div className={classes.alertError}>{errorMessage}</div> : null}

        {infoMessage ? <div className={classes.alertSuccess}>{infoMessage}</div> : null}
      </div>
    </div>
  );
}
