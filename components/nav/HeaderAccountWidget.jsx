"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, MapPin } from "lucide-react";
import SafeImage from "@/components/SafeImage";
import { AUTH_UI_RESET_EVENT, useAuth } from "@/components/AuthProvider";
import LogoutButton from "@/components/LogoutButton";
import { useModal } from "@/components/modals/ModalProvider";
import MobileSidebarDrawer from "@/components/nav/MobileSidebarDrawer";
import CartNavActionClient from "@/components/nav/CartNavActionClient";
import AccountMenuItems from "@/components/nav/AccountMenuItems";
import AccountSidebar from "@/components/nav/AccountSidebar";
import { fetchUnreadTotal } from "@/lib/messages";
import { resolveImageSrc } from "@/lib/safeImage";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useLocation } from "@/components/location/LocationProvider";
import { getLocationLabel, isZipLike, normalizeSelectedLocation } from "@/lib/location";

const UNREAD_REFRESH_EVENT = "yb-unread-refresh";

export default function HeaderAccountWidget({
  surface = "public",
  variant = "desktop",
  forcedAuth = null,
  mobileMenuOpen = false,
  onCloseMobileMenu,
  mobileDrawerId,
}) {
  const {
    supabase,
    user,
    profile,
    role,
    authStatus,
    rateLimited,
    rateLimitMessage,
    authBusy,
    authAction,
    authAttemptId,
    lastAuthEvent,
    providerInstanceId,
  } = useAuth();
  const { openModal } = useModal();
  const { location, setLocation } = useLocation();
  const authDiagEnabled =
    process.env.NEXT_PUBLIC_AUTH_DIAG === "1" &&
    process.env.NODE_ENV !== "production";
  const loading = authStatus === "loading";
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [accountSidebarOpen, setAccountSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileLocationOpen, setMobileLocationOpen] = useState(false);
  const [mobileLocationInput, setMobileLocationInput] = useState("");
  const [mobileLocationSuggestions, setMobileLocationSuggestions] = useState([]);
  const [mobileLocationSuggestLoading, setMobileLocationSuggestLoading] = useState(false);
  const [mobileLocationSuggestError, setMobileLocationSuggestError] = useState(null);
  const [mobileLocationSuggestIndex, setMobileLocationSuggestIndex] = useState(-1);
  const [mobileLocationSelectHint, setMobileLocationSelectHint] = useState(null);
  // Location display derives only from the global provider state.
  const locationLabel = getLocationLabel(location);
  const mobileLocationNoMatchMessage = isZipLike(mobileLocationInput)
    ? "No matches. Try another postal code."
    : "No matches. Try another city.";
  const dropdownRef = useRef(null);
  const accountTriggerRef = useRef(null);
  const lastUnreadKeyRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const unreadRequestIdRef = useRef(0);
  const mobileLocationPrefillRef = useRef(false);
  const mobileLocationSuggestAbortRef = useRef(null);
  const mobileLocationSuggestReqIdRef = useRef(0);
  const mobileLocationSuggestSpinnerRef = useRef(null);
  const mobileLocationSuggestShownAtRef = useRef(0);

  const supportModeActive = Boolean(forcedAuth?.supportMode);
  const accountUser = forcedAuth?.user || user;
  const accountProfile = forcedAuth?.profile || profile;
  const effectiveRole = forcedAuth?.role || role;
  const isCustomer = effectiveRole === "customer";
  const isBusiness = effectiveRole === "business";
  const sidebarFeatureEnabled = process.env.NEXT_PUBLIC_ACCOUNT_SIDEBAR !== "0";
  const [useSidebarDesktop, setUseSidebarDesktop] = useState(() => {
    if (typeof window === "undefined") return false;
    if (!sidebarFeatureEnabled) return false;
    return window.matchMedia("(min-width: 1024px)").matches;
  });

  const avatar = resolveImageSrc(
    accountProfile?.profile_photo_url?.trim() ||
      accountUser?.user_metadata?.avatar_url ||
      "",
    "/customer-placeholder.png"
  );

  const displayName =
    accountProfile?.full_name ||
    accountProfile?.business_name ||
    accountUser?.user_metadata?.full_name ||
    accountUser?.user_metadata?.name ||
    accountUser?.email ||
    "Account";

  const email = accountProfile?.email || accountUser?.email || null;
  const hasAuth = Boolean(accountUser);
  const disableCtas = authBusy || loading;
  const showRateLimit = rateLimited && hasAuth;

  const unreadUserId = accountUser?.id || accountProfile?.id;
  const canLoadUnread =
    Boolean(unreadUserId) &&
    isCustomer &&
    (authStatus === "authenticated" || (authStatus === "loading" && hasAuth));
  const loadUnreadCount = useCallback(async () => {
    const activeClient = supabase ?? getSupabaseBrowserClient();
    if (!activeClient || !canLoadUnread) {
      return;
    }
    const requestId = ++unreadRequestIdRef.current;
    try {
      const total = await fetchUnreadTotal({
        supabase: activeClient,
        userId: unreadUserId,
        role: "customer",
      });
      if (requestId !== unreadRequestIdRef.current) return;
      setUnreadCount(total);
    } catch {
      // best effort
    }
  }, [supabase, canLoadUnread, unreadUserId]);

  const scheduleUnreadRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      void loadUnreadCount();
    }, 0);
  }, [loadUnreadCount]);

  useEffect(() => {
    if (!hasAuth || !isCustomer || !unreadUserId || authStatus === "unauthenticated") {
      return undefined;
    }
    const key = `${unreadUserId}:${authStatus}`;
    if (lastUnreadKeyRef.current === key) return undefined;
    lastUnreadKeyRef.current = key;
    scheduleUnreadRefresh();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleUnreadRefresh();
      }
    };
    window.addEventListener("focus", scheduleUnreadRefresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", scheduleUnreadRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [hasAuth, isCustomer, scheduleUnreadRefresh, unreadUserId, authStatus]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleClick = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    if (mobileMenuOpen) return;
    const timeoutId = setTimeout(() => {
      setMobileLocationOpen(false);
      setMobileLocationInput("");
      setMobileLocationSuggestions([]);
      setMobileLocationSuggestIndex(-1);
      setMobileLocationSelectHint(null);
      setMobileLocationSuggestError(null);
      setMobileLocationSuggestLoading(false);
      mobileLocationPrefillRef.current = false;
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [mobileMenuOpen]);

  useEffect(() => {
    let timeoutId = null;
    if (!mobileLocationOpen) {
      mobileLocationPrefillRef.current = false;
      return;
    }
    if (mobileLocationPrefillRef.current) return;
    mobileLocationPrefillRef.current = true;
    timeoutId = setTimeout(() => {
      setMobileLocationInput(locationLabel !== "Your city" ? locationLabel : "");
    }, 0);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [mobileLocationOpen, locationLabel]);

  useEffect(() => {
    const scheduled = new Set();
    const schedule = (fn) => {
      const id = setTimeout(fn, 0);
      scheduled.add(id);
    };
    const clearScheduled = () => {
      scheduled.forEach((id) => clearTimeout(id));
      scheduled.clear();
    };
    const abortInflight = () => {
      if (mobileLocationSuggestAbortRef.current) {
        mobileLocationSuggestAbortRef.current.abort();
        mobileLocationSuggestAbortRef.current = null;
      }
    };

    if (mobileLocationSuggestSpinnerRef.current) {
      clearTimeout(mobileLocationSuggestSpinnerRef.current);
      mobileLocationSuggestSpinnerRef.current = null;
    }

    if (!mobileLocationOpen) {
      abortInflight();
      mobileLocationSuggestReqIdRef.current += 1;
      mobileLocationSuggestShownAtRef.current = 0;
      schedule(() => setMobileLocationSuggestLoading(false));
      schedule(() => setMobileLocationSuggestError(null));
      schedule(() => setMobileLocationSuggestIndex(-1));
      schedule(() => setMobileLocationSuggestions([]));
      schedule(() => setMobileLocationSelectHint(null));
      return clearScheduled;
    }

    const term = mobileLocationInput.trim();

    if (term.length === 0) {
      abortInflight();
      mobileLocationSuggestReqIdRef.current += 1;
      mobileLocationSuggestShownAtRef.current = 0;
      schedule(() => setMobileLocationSuggestLoading(false));
      schedule(() => setMobileLocationSuggestError(null));
      schedule(() => setMobileLocationSuggestIndex(-1));
      schedule(() => setMobileLocationSuggestions([]));
      schedule(() => setMobileLocationSelectHint(null));
      return clearScheduled;
    }

    if (term.length < 2) {
      abortInflight();
      mobileLocationSuggestReqIdRef.current += 1;
      mobileLocationSuggestShownAtRef.current = 0;
      schedule(() => setMobileLocationSuggestLoading(false));
      schedule(() => setMobileLocationSuggestError(null));
      schedule(() => setMobileLocationSuggestIndex(-1));
      schedule(() => setMobileLocationSelectHint(null));
      return clearScheduled;
    }

    const reqId = ++mobileLocationSuggestReqIdRef.current;

    abortInflight();
    const controller = new AbortController();
    mobileLocationSuggestAbortRef.current = controller;

    mobileLocationSuggestSpinnerRef.current = setTimeout(() => {
      if (reqId !== mobileLocationSuggestReqIdRef.current) return;
      mobileLocationSuggestShownAtRef.current = Date.now();
      setMobileLocationSuggestLoading(true);
    }, 150);

    const handle = setTimeout(() => {
      setMobileLocationSuggestError(null);

      const debug = process.env.NODE_ENV !== "production";
      const url = debug
        ? `/api/location-suggest?q=${encodeURIComponent(term)}&debug=1`
        : `/api/location-suggest?q=${encodeURIComponent(term)}`;

      fetch(url, { signal: controller.signal })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error || "location_suggest_failed");
          }
          return data;
        })
        .then((data) => {
          if (controller.signal.aborted) return;
          if (reqId !== mobileLocationSuggestReqIdRef.current) return;
          const next = Array.isArray(data?.suggestions) ? data.suggestions : [];
          setMobileLocationSuggestions(next);
          setMobileLocationSuggestIndex(-1);
          setMobileLocationSelectHint(null);
          if (data?.error) {
            setMobileLocationSuggestError(data.error);
          }
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          if (reqId !== mobileLocationSuggestReqIdRef.current) return;
          setMobileLocationSuggestError(err?.message || "Location suggestions unavailable.");
          setMobileLocationSuggestions([]);
          setMobileLocationSuggestIndex(-1);
          setMobileLocationSelectHint(null);
        })
        .finally(() => {
          if (controller.signal.aborted) return;
          if (reqId !== mobileLocationSuggestReqIdRef.current) return;
          if (mobileLocationSuggestSpinnerRef.current) {
            clearTimeout(mobileLocationSuggestSpinnerRef.current);
            mobileLocationSuggestSpinnerRef.current = null;
          }
          const shownAt = mobileLocationSuggestShownAtRef.current || 0;
          const elapsed = shownAt ? Date.now() - shownAt : 9999;
          const remaining = 300 - elapsed;

          if (remaining > 0) {
            setTimeout(() => {
              if (controller.signal.aborted) return;
              if (reqId !== mobileLocationSuggestReqIdRef.current) return;
              setMobileLocationSuggestLoading(false);
            }, remaining);
          } else {
            setMobileLocationSuggestLoading(false);
          }
        });
    }, 250);

    return () => {
      clearScheduled();
      clearTimeout(handle);
      controller.abort();
      if (mobileLocationSuggestSpinnerRef.current) {
        clearTimeout(mobileLocationSuggestSpinnerRef.current);
        mobileLocationSuggestSpinnerRef.current = null;
      }
    };
  }, [mobileLocationOpen, mobileLocationInput]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleUnreadRefresh = () => {
      loadUnreadCount();
    };
    window.addEventListener(UNREAD_REFRESH_EVENT, handleUnreadRefresh);
    return () => window.removeEventListener(UNREAD_REFRESH_EVENT, handleUnreadRefresh);
  }, [loadUnreadCount]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleReset = () => {
      setProfileMenuOpen(false);
      setAccountSidebarOpen(false);
    };
    window.addEventListener(AUTH_UI_RESET_EVENT, handleReset);
    return () => window.removeEventListener(AUTH_UI_RESET_EVENT, handleReset);
  }, []);

  useEffect(() => {
    if (!sidebarFeatureEnabled || typeof window === "undefined") return undefined;
    const media = window.matchMedia("(min-width: 1024px)");
    const handleChange = () => {
      const matches = media.matches;
      setUseSidebarDesktop(matches);
      if (matches) {
        setProfileMenuOpen(false);
      } else {
        setAccountSidebarOpen(false);
      }
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, [sidebarFeatureEnabled]);

  const applyMobileLocationSuggestion = (suggestion) => {
    if (!suggestion) return;
    setLocation(normalizeSelectedLocation(suggestion), { replace: true });
    setMobileLocationInput("");
    setMobileLocationSuggestions([]);
    setMobileLocationSuggestIndex(-1);
    setMobileLocationSelectHint(null);
    setMobileLocationOpen(false);
  };

  useEffect(() => {
    if (!authDiagEnabled) return;
    console.log("[AUTH_DIAG] cta:HeaderAccountWidget", {
      providerInstanceId,
      authStatus,
      hasAuth,
      authBusy,
      authAction,
      authAttemptId,
      lastAuthEvent,
      disableCtas,
    });
  });

  useEffect(() => {
    if (!authDiagEnabled) return undefined;
    if (typeof window === "undefined") return undefined;

    const describeNode = (node) => {
      if (!node || !node.tagName) return null;
      const id = node.id ? `#${node.id}` : "";
      const className =
        typeof node.className === "string" && node.className.trim()
          ? `.${node.className.trim().split(/\s+/).slice(0, 3).join(".")}`
          : "";
      return `${node.tagName.toLowerCase()}${id}${className}`;
    };

    const logStyleChain = (el, label) => {
      const chain = [];
      let current = el;
      let depth = 0;
      while (current && depth < 7) {
        const style = window.getComputedStyle(current);
        chain.push({
          label: depth === 0 ? label : `parent-${depth}`,
          node: describeNode(current),
          pointerEvents: style.pointerEvents,
          opacity: style.opacity,
          position: style.position,
          zIndex: style.zIndex,
        });
        if (current.tagName?.toLowerCase() === "body") break;
        current = current.parentElement;
        depth += 1;
      }
      return chain;
    };

    const login = document.querySelector("[data-public-cta='signin']");
    const signup = document.querySelector("[data-public-cta='signup']");
    const modalDialog = document.querySelector("[aria-modal='true']");
    const drawerHost = document.querySelector("div[data-mobile-sidebar-drawer='1']");
    const overlayPresent = Boolean(modalDialog || drawerHost);

    const diagDisableReasons = [
      authBusy ? "authBusy" : null,
      loading && !hasAuth ? "authStatus=loading" : null,
      profileMenuOpen ? "profileMenuOpen" : null,
      overlayPresent ? "overlayPresent" : null,
      login?.disabled ? "signin.disabled" : null,
      login?.getAttribute?.("aria-disabled") ? "signin.aria-disabled" : null,
      signup?.disabled ? "signup.disabled" : null,
      signup?.getAttribute?.("aria-disabled") ? "signup.aria-disabled" : null,
    ].filter(Boolean);

    console.log("[AUTH_DIAG] cta:HeaderAccountWidget:render", {
      providerInstanceId,
      authStatus,
      hasAuth,
      authBusy,
      authAction,
      authAttemptId,
      lastAuthEvent,
      disableCtas,
      diagDisableReasons,
      loginStyle: login ? logStyleChain(login, "signin") : null,
      signupStyle: signup ? logStyleChain(signup, "signup") : null,
      overlayPresent,
      overlayNodes: {
        modalDialog: modalDialog ? describeNode(modalDialog) : null,
        drawerHost: drawerHost ? describeNode(drawerHost) : null,
      },
    });
  });

  const desktopSkeleton = (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-2xl bg-white/10 border border-white/10" />
      <div className="h-4 w-20 rounded bg-white/10" />
    </div>
  );

  const scheduleProfileMenuClose = useCallback(() => {
    if (!profileMenuOpen) return;
    if (typeof queueMicrotask === "function") {
      queueMicrotask(() => setProfileMenuOpen(false));
    } else {
      setTimeout(() => setProfileMenuOpen(false), 0);
    }
  }, [profileMenuOpen]);

  const handleAccountNavigate = useCallback(() => {
    if (useSidebarDesktop) {
      setAccountSidebarOpen(false);
      return;
    }
    scheduleProfileMenuClose();
  }, [useSidebarDesktop, scheduleProfileMenuClose]);

  if (variant === "desktop") {
    if (showRateLimit) {
      return (
        <div className="text-sm text-white/70" aria-live="polite">
          {rateLimitMessage || "Temporarily rate-limited. Please wait a moment."}
        </div>
      );
    }
    if (loading && !hasAuth) return desktopSkeleton;

    if (!hasAuth) {
      return (
        <>
          <button
            type="button"
            onClick={() => openModal("customer-login")}
            disabled={disableCtas}
            aria-busy={disableCtas}
            className={`text-sm md:text-base transition text-white/70 hover:text-white ${
              disableCtas ? "opacity-60 cursor-not-allowed" : ""
            }`}
            data-public-cta="signin"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => openModal("customer-signup")}
            disabled={disableCtas}
            aria-busy={disableCtas}
            className={`px-5 py-2 rounded-xl bg-[var(--color-primary)] text-white font-semibold ${
              disableCtas ? "opacity-60 cursor-not-allowed" : ""
            }`}
            data-public-cta="signup"
          >
            Sign up
          </button>
        </>
      );
    }

    return (
      <>
        <div className="flex items-center gap-3">
        {isBusiness ? (
          <Link
            href="/business/dashboard"
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white/90 border border-white/20 hover:bg-white/10 transition"
          >
            Dashboard
          </Link>
        ) : null}
        <div className="relative" ref={dropdownRef} data-nav-guard="1">
          <button
            ref={accountTriggerRef}
            onClick={() => {
              if (useSidebarDesktop) {
                setAccountSidebarOpen(true);
                return;
              }
              setProfileMenuOpen((open) => !open);
            }}
            className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-1.5 border border-white/10 hover:border-white/30 transition"
            data-nav-guard="1"
            aria-haspopup="dialog"
            aria-expanded={useSidebarDesktop ? accountSidebarOpen : profileMenuOpen}
          >
            <span className="relative">
              <SafeImage
                src={avatar}
                alt="Profile avatar"
                className="h-10 w-10 rounded-2xl object-cover border border-white/20"
                width={40}
                height={40}
                sizes="40px"
                useNextImage
                priority
              />
              {unreadCount > 0 ? (
                <span className="absolute -bottom-1 -left-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </span>
            <span className="hidden sm:block text-sm font-semibold text-white/90 max-w-[120px] truncate">
              {displayName}
            </span>
            <ChevronDown className="h-4 w-4 text-white/70" />
          </button>

          {profileMenuOpen ? (
            <div
              className="absolute right-0 mt-4 w-80 rounded-3xl px-1.5 pb-3 pt-1.5 yb-dropdown-surface z-[5100]"
              data-nav-guard="1"
            >
              <div className="rounded-[26px]">
                <div className="flex items-center gap-3 px-4 py-4">
                  <SafeImage
                    src={avatar}
                    alt="Profile avatar"
                    className="h-12 w-12 rounded-2xl object-cover border border-white/20"
                    width={48}
                    height={48}
                    sizes="48px"
                    useNextImage
                  />
                  <div>
                    {supportModeActive ? (
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                        Viewing as
                      </p>
                    ) : null}
                    <p className="text-sm font-semibold">{displayName}</p>
                    {email ? <p className="text-xs yb-dropdown-muted">{email}</p> : null}
                  </div>
                </div>

                <AccountMenuItems
                  variant="dropdown"
                  isCustomer={isCustomer}
                  isBusiness={isBusiness}
                  unreadCount={unreadCount}
                  onNavigate={handleAccountNavigate}
                  logout={(
                    <LogoutButton
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                      onSuccess={() => setProfileMenuOpen(false)}
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </LogoutButton>
                  )}
                />
              </div>
            </div>
          ) : null}
        </div>
        </div>
        {hasAuth && useSidebarDesktop ? (
          <AccountSidebar
            open={accountSidebarOpen}
            onOpenChange={setAccountSidebarOpen}
            anchorRef={accountTriggerRef}
            displayName={displayName}
            email={email}
            avatar={avatar}
          >
            <AccountMenuItems
              variant="sidebar"
              isCustomer={isCustomer}
              isBusiness={isBusiness}
              unreadCount={unreadCount}
              onNavigate={handleAccountNavigate}
              logout={(
                <LogoutButton
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                  onSuccess={() => setAccountSidebarOpen(false)}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </LogoutButton>
              )}
            />
          </AccountSidebar>
        ) : null}
      </>
    );
  }

  return (
    <MobileSidebarDrawer
      open={mobileMenuOpen}
      onClose={() => onCloseMobileMenu?.()}
      title={hasAuth ? "My account" : "Welcome"}
      id={mobileDrawerId}
      showHeader={!hasAuth}
    >
      <div
        className="flex flex-col gap-6"
        data-nav-surface={surface}
        data-nav-guard="1"
      >
        {hasAuth ? (
          <div className="flex items-center gap-3 rounded-2xl border border-[var(--yb-border)] bg-white px-4 py-3">
            <SafeImage
              src={avatar}
              alt="Profile avatar"
              className="h-11 w-11 rounded-2xl object-cover border border-[var(--yb-border)]"
              width={44}
              height={44}
              sizes="44px"
              useNextImage
            />
            <div className="min-w-0">
              {supportModeActive ? (
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                  Viewing as
                </p>
              ) : null}
              <p className="text-sm font-semibold truncate">{displayName}</p>
              {email ? <p className="text-xs yb-dropdown-muted truncate">{email}</p> : null}
            </div>
          </div>
        ) : null}

        {showRateLimit ? (
          <div className="text-sm text-white/70" aria-live="polite">
            {rateLimitMessage || "Temporarily rate-limited. Please wait a moment."}
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileLocationOpen((open) => !open)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[var(--yb-border)] bg-white px-4 py-3 text-left transition hover:bg-black/5"
              aria-expanded={mobileLocationOpen}
              aria-controls="mobile-location-editor"
            >
              <MapPin className="h-4 w-4" />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.2em] yb-dropdown-muted">Location</p>
                <p className="text-sm font-semibold truncate">{locationLabel}</p>
              </div>
              <ChevronDown
                className={`h-4 w-4 yb-dropdown-muted transition ${
                  mobileLocationOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            <CartNavActionClient variant="mobile" onNavigate={onCloseMobileMenu} />
          </div>

          {mobileLocationOpen ? (
            <div
              id="mobile-location-editor"
              className="rounded-2xl border border-[var(--yb-border)] bg-white px-4 py-4"
            >
              <div className="text-xs uppercase tracking-[0.22em] yb-dropdown-muted">
                Set location
              </div>
              <div className="mt-2 text-sm yb-dropdown-muted">Enter a city or ZIP code.</div>
              <div className="mt-4 flex items-center gap-2">
                <input
                  type="text"
                  value={mobileLocationInput}
                  onChange={(event) => {
                    setMobileLocationInput(event.target.value);
                    setMobileLocationSelectHint(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setMobileLocationSuggestIndex((prev) =>
                        Math.min(prev + 1, mobileLocationSuggestions.length - 1)
                      );
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setMobileLocationSuggestIndex((prev) => Math.max(prev - 1, 0));
                      return;
                    }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (mobileLocationSuggestions.length > 0) {
                        const selected =
                          mobileLocationSuggestIndex >= 0 &&
                          mobileLocationSuggestions[mobileLocationSuggestIndex]
                            ? mobileLocationSuggestions[mobileLocationSuggestIndex]
                            : mobileLocationSuggestions[0];
                        applyMobileLocationSuggestion(selected);
                        return;
                      }
                      setMobileLocationSelectHint("Select a suggestion to set your location.");
                    }
                  }}
                  placeholder="e.g. Austin, 78701"
                  className="w-full rounded-lg border border-[var(--yb-border)] bg-white px-3 py-2 text-base placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--yb-focus)] focus:border-[var(--yb-focus)]"
                />
              </div>
              <div className="mt-3 text-xs yb-dropdown-muted min-h-[16px]">
                {mobileLocationSuggestLoading ? "Searching locations..." : ""}
              </div>
              {mobileLocationSuggestError ? (
                <div className="mt-3 text-xs text-rose-600">
                  {mobileLocationSuggestError}
                </div>
              ) : null}
              {mobileLocationSelectHint ? (
                <div className="mt-2 text-xs yb-dropdown-muted">
                  {mobileLocationSelectHint}
                </div>
              ) : null}
              {!mobileLocationSuggestLoading &&
              !mobileLocationSuggestError &&
              mobileLocationInput.trim().length >= 2 &&
              mobileLocationSuggestions.length === 0 ? (
                <div className="mt-3 text-xs yb-dropdown-muted">
                  {mobileLocationNoMatchMessage}
                </div>
              ) : null}
              {mobileLocationSuggestions.length > 0 ? (
                <div className="mt-3 rounded-xl border border-[var(--yb-border)] bg-white p-1">
                  {mobileLocationSuggestions.map((suggestion, idx) => (
                    <button
                      key={suggestion.id || suggestion.label || idx}
                      type="button"
                      onClick={() => applyMobileLocationSuggestion(suggestion)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-black/5 rounded-lg ${
                        idx === mobileLocationSuggestIndex ? "bg-black/5" : ""
                      }`}
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {!showRateLimit ? (
          !hasAuth ? (
            <>
              <button
                type="button"
                onClick={() => {
                  onCloseMobileMenu?.();
                  openModal("customer-login");
                }}
                disabled={disableCtas}
                aria-busy={disableCtas}
                className={`w-full text-center yb-dropdown-muted hover:text-[var(--yb-text)] ${
                  disableCtas ? "opacity-60 cursor-not-allowed" : ""
                }`}
                data-public-cta="signin"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  onCloseMobileMenu?.();
                  openModal("customer-signup");
                }}
                disabled={disableCtas}
                aria-busy={disableCtas}
                className={`px-4 py-2 bg-[var(--color-primary)] rounded-xl text-center font-semibold text-white ${
                  disableCtas ? "opacity-60 cursor-not-allowed" : ""
                }`}
                data-public-cta="signup"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              {isBusiness ? (
                <Link
                  href="/business/dashboard"
                  onClick={() => onCloseMobileMenu?.()}
                  className="text-left yb-dropdown-muted hover:text-[var(--yb-text)]"
                  data-safe-nav="1"
                >
                  Business dashboard
                </Link>
              ) : null}

              {isCustomer ? (
                <AccountMenuItems
                  variant="sidebar"
                  isCustomer={isCustomer}
                  isBusiness={false}
                  unreadCount={unreadCount}
                  onNavigate={() => onCloseMobileMenu?.()}
                  logout={(
                    <LogoutButton mobile onSuccess={() => onCloseMobileMenu?.()} />
                  )}
                />
              ) : null}
            </>
          )
        ) : null}

        {hasAuth && !isCustomer ? (
          <LogoutButton mobile onSuccess={() => onCloseMobileMenu?.()} />
        ) : null}
      </div>
    </MobileSidebarDrawer>
  );
}
