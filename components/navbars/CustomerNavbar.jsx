"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import SafeImage from "@/components/SafeImage";
import {
  Bookmark,
  ChevronDown,
  Compass,
  Home,
  Loader2,
  LogOut,
  MapPin,
  MessageSquare,
  PackageSearch,
  ShoppingCart,
  Search,
  Settings,
  Sparkles,
  Store,
} from "lucide-react";
import { AUTH_UI_RESET_EVENT, useAuth } from "@/components/AuthProvider";
import LogoutButton from "@/components/LogoutButton";
import MobileSidebarDrawer from "@/components/nav/MobileSidebarDrawer";
import { useTheme } from "@/components/ThemeProvider";
import { useModal } from "../modals/ModalProvider";
import { fetchUnreadTotal } from "@/lib/messages";
import { resolveImageSrc } from "@/lib/safeImage";
import { BUSINESS_CATEGORIES, normalizeCategoryName } from "@/lib/businessCategories";
import {
  getAvailabilityBadgeStyle,
  normalizeInventory,
  sortListingsByAvailability,
} from "@/lib/inventory";
import { useCart } from "@/components/cart/CartProvider";
import { useLocation } from "@/components/location/LocationProvider";
import {
  getLocationLabel,
  isZipLike,
  normalizeSelectedLocation,
  setLocationSearchParams,
} from "@/lib/location";
import { getCustomerListingUrl } from "@/lib/ids/publicRefs";

const UNREAD_REFRESH_EVENT = "yb-unread-refresh";

const SEARCH_CATEGORIES = ["All", ...BUSINESS_CATEGORIES.map((cat) => cat.name)];

const getInitialSearchTerm = (params) =>
  (params?.get("q") || "").trim();

const getInitialCategory = (params) => {
  const currentCategory = (params?.get("category") || "").trim();
  const normalizedCurrent = normalizeCategoryName(currentCategory).toLowerCase();
  const matchedCategory = SEARCH_CATEGORIES.find(
    (category) => normalizeCategoryName(category).toLowerCase() === normalizedCurrent
  );
  return matchedCategory || "All";
};

function NavItem({ href, children, badgeCount, badgeReady, active, onNavigate }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(href, "nav-item")}
      className={`w-full text-left text-sm md:text-base transition ${
        active ? "text-white font-semibold" : "text-white/70 hover:text-white"
      }`}
      data-nav-guard="1"
    >
      <span className="flex items-center gap-2">
        {children}
        {badgeReady && badgeCount > 0 ? (
          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">
            {badgeCount}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export default function CustomerNavbar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = `${pathname}?${searchParams?.toString() || ""}`;
  return (
    <CustomerNavbarInner
      key={searchKey}
      pathname={pathname}
      searchParams={searchParams}
    />
  );
}

function CustomerNavbarInner({ pathname, searchParams }) {
  const router = useRouter();
  const {
    user,
    profile,
    loadingUser,
    supabase,
    authStatus,
    authBusy,
    authAction,
    authAttemptId,
    lastAuthEvent,
    providerInstanceId,
  } = useAuth();
  const { theme, hydrated } = useTheme();
  const isLight = hydrated ? theme === "light" : true;
  const { openModal } = useModal();
  const { itemCount } = useCart();
  const { location, hasLocation, setLocation } = useLocation();
  const authDiagEnabled =
    process.env.NEXT_PUBLIC_AUTH_DIAG === "1" &&
    process.env.NODE_ENV !== "production";
  const [, startTransition] = useTransition();

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(() => getInitialSearchTerm(searchParams));
  const [selectedCategory, setSelectedCategory] = useState(() => getInitialCategory(searchParams));
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [locationSuggestLoading, setLocationSuggestLoading] = useState(false);
  const [locationSuggestError, setLocationSuggestError] = useState(null);
  const [locationSuggestIndex, setLocationSuggestIndex] = useState(-1);
  const [locationSelectHint, setLocationSelectHint] = useState(null);
  const [searchResults, setSearchResults] = useState({
    items: [],
    businesses: [],
    places: [],
  });
  const sortedSearchItems = useMemo(
    () => sortListingsByAvailability(searchResults.items || []),
    [searchResults.items]
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const badgeReady = !loadingUser || Boolean(user);
  const mobileDrawerId = useId();
  const dropdownRef = useRef(null);
  const dropdownPanelRef = useRef(null);
  const searchBoxRef = useRef(null);
  const searchInputRef = useRef(null);
  const locationRef = useRef(null);
  const locationPrefillRef = useRef(false);
  const locationSuggestAbortRef = useRef(null);
  const locationSuggestReqIdRef = useRef(0);
  const locationSuggestSpinnerRef = useRef(null);
  const locationSuggestShownAtRef = useRef(0);
  const navSavedRef = useRef(null);
  const navSettingsRef = useRef(null);
  const searchRequestIdRef = useRef(0);
  const lastQueryRef = useRef("");
  // Location display derives only from the global provider state.
  const locationLabel = getLocationLabel(location);
  const locationNoMatchMessage = isZipLike(locationInput)
    ? "No matches. Try another postal code."
    : "No matches. Try another city.";
  // DEBUG_CLICK_DIAG / NAV_TRACE
  const clickDiagEnabled = process.env.NEXT_PUBLIC_CLICK_DIAG === "1";
  const diagClick = (label) => (event) => {
    if (!clickDiagEnabled) return;
    console.log("[CLICK_DIAG] REACT_ONCLICK", label, {
      defaultPrevented: event.defaultPrevented,
      target: event.target?.tagName,
      currentTarget: event.currentTarget?.tagName,
      pathname,
      profileMenuOpen,
      loadingUser,
      hasUser: !!user,
      hasProfile: !!profile,
      href: event.currentTarget?.getAttribute?.("href") || null,
    });
    queueMicrotask(() => {
      console.log("[CLICK_DIAG] REACT_ONCLICK_POST", { label, href: window.location.href });
    });
  };

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const isOpen = profileMenuOpen || mobileMenuOpen;
    document.documentElement.dataset.navMenuOpen = isOpen ? "1" : "0";
    return () => {
      delete document.documentElement.dataset.navMenuOpen;
    };
  }, [profileMenuOpen, mobileMenuOpen]);

  // DEBUG_CLICK_DIAG: trace search focus behavior on home
  useEffect(() => {
    if (!clickDiagEnabled || !pathname?.startsWith("/customer/home")) return undefined;
    const input = searchInputRef.current;
    if (!input) return undefined;
    const handler = (event) => {
      try {
        const { clientX, clientY } = event;
        const rect = input.getBoundingClientRect();
        setTimeout(() => {
          const active = document.activeElement === input;
          const topAtClick = document.elementFromPoint(clientX, clientY);
          const centerTop = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          const styles =
            topAtClick && typeof window !== "undefined"
              ? window.getComputedStyle(topAtClick)
              : null;
          console.log("[CLICK_DIAG] search focus check", {
            active,
            topAtClick: topAtClick?.className || topAtClick?.tagName,
            centerTop: centerTop?.className || centerTop?.tagName,
            styles: styles
              ? {
                  position: styles.position,
                  zIndex: styles.zIndex,
                  pointerEvents: styles.pointerEvents,
                  opacity: styles.opacity,
                  transform: styles.transform,
                }
              : null,
          });
        }, 50);
      } catch (err) {
        console.warn("[CLICK_DIAG] search focus check error", err);
      }
    };
    input.addEventListener("pointerdown", handler, { passive: true, capture: true });
    return () => {
      input.removeEventListener("pointerdown", handler, { passive: true, capture: true });
    };
  }, [clickDiagEnabled, pathname]);

  // DEBUG_CLICK_DIAG: global tracer on home to detect cancellations
  useEffect(() => {
    if (!clickDiagEnabled || !pathname?.startsWith("/customer/home")) return undefined;
    const logEventCapture = (event) => {
      try {
        console.log("[CLICK_DIAG] HOME_TRACE", {
          type: event.type,
          phase: "capture",
          defaultPrevented: event.defaultPrevented,
          cancelBubble: event.cancelBubble,
          target: event.target?.tagName,
          className: event.target?.className,
        });
      } catch {
        /* ignore */
      }
    };
    const logEventBubble = (event) => {
      try {
        console.log("[CLICK_DIAG] HOME_TRACE", {
          type: event.type,
          phase: "bubble",
          defaultPrevented: event.defaultPrevented,
          cancelBubble: event.cancelBubble,
          target: event.target?.tagName,
          className: event.target?.className,
        });
      } catch {
        /* ignore */
      }
    };
    const types = ["pointerdown", "click", "keydown"];
    types.forEach((t) => {
      document.addEventListener(t, logEventCapture, { capture: true, passive: true });
      document.addEventListener(t, logEventBubble, { passive: true });
    });
    return () => {
      types.forEach((t) => {
        document.removeEventListener(t, logEventCapture, { capture: true, passive: true });
        document.removeEventListener(t, logEventBubble, { passive: true });
      });
    };
  }, [clickDiagEnabled, pathname]);

  useEffect(() => {
    if (!clickDiagEnabled || !profileMenuOpen) return undefined;
    const panel = dropdownPanelRef.current;
    const navEl = dropdownRef.current;
    try {
      const panelRect = panel?.getBoundingClientRect();
      const navRect = navEl?.getBoundingClientRect();
      const samplePoint = panelRect
        ? { x: panelRect.left + 10, y: panelRect.top + 10 }
        : null;
      const topAtPanel = samplePoint
        ? document.elementFromPoint(samplePoint.x, samplePoint.y)
        : null;
      const zNav =
        navEl && typeof window !== "undefined"
          ? window.getComputedStyle(navEl).zIndex
          : null;
      const zPanel =
        panel && typeof window !== "undefined"
          ? window.getComputedStyle(panel).zIndex
          : null;
      console.log("[CLICK_DIAG] dropdown metrics", {
        navRect,
        panelRect,
        navZ: zNav,
        panelZ: zPanel,
        topAtPanel: topAtPanel?.className || topAtPanel?.tagName,
      });
    } catch (err) {
      console.warn("[CLICK_DIAG] dropdown metrics error", err);
    }
    return undefined;
  }, [clickDiagEnabled, profileMenuOpen]);

  useEffect(() => {
    if (!locationOpen) return undefined;
    const handleClickOutside = (event) => {
      if (!locationRef.current?.contains(event.target)) {
        setLocationOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setLocationOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [locationOpen]);

  useEffect(() => {
    let timeoutId = null;
    if (!locationOpen) {
      locationPrefillRef.current = false;
      return;
    }
    if (locationPrefillRef.current) return;
    locationPrefillRef.current = true;
    timeoutId = setTimeout(() => {
      setLocationInput(locationLabel !== "Your city" ? locationLabel : "");
    }, 0);
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [locationOpen, locationLabel]);

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
      if (locationSuggestAbortRef.current) {
        locationSuggestAbortRef.current.abort();
        locationSuggestAbortRef.current = null;
      }
    };

    // Clear delayed spinner timer on every run (ONLY clear timer)
    if (locationSuggestSpinnerRef.current) {
      clearTimeout(locationSuggestSpinnerRef.current);
      locationSuggestSpinnerRef.current = null;
    }

    if (!locationOpen) {
      abortInflight();
      locationSuggestReqIdRef.current += 1; // invalidate pending
      locationSuggestShownAtRef.current = 0;
      schedule(() => setLocationSuggestLoading(false));
      schedule(() => setLocationSuggestError(null));
      schedule(() => setLocationSuggestIndex(-1));
      schedule(() => setLocationSuggestions([]));
      schedule(() => setLocationSelectHint(null));
      return clearScheduled;
    }

    const term = locationInput.trim();

    // If user cleared input, clear suggestions.
    if (term.length === 0) {
      abortInflight();
      locationSuggestReqIdRef.current += 1;
      locationSuggestShownAtRef.current = 0;
      schedule(() => setLocationSuggestLoading(false));
      schedule(() => setLocationSuggestError(null));
      schedule(() => setLocationSuggestIndex(-1));
      schedule(() => setLocationSuggestions([]));
      schedule(() => setLocationSelectHint(null));
      return clearScheduled;
    }

    // If term is short (1 char), keep last suggestions to prevent flicker.
    if (term.length < 2) {
      abortInflight();
      locationSuggestReqIdRef.current += 1;
      locationSuggestShownAtRef.current = 0;
      schedule(() => setLocationSuggestLoading(false));
      schedule(() => setLocationSuggestError(null));
      schedule(() => setLocationSuggestIndex(-1));
      schedule(() => setLocationSelectHint(null));
      return clearScheduled;
    }

    const reqId = ++locationSuggestReqIdRef.current;

    abortInflight();
    const controller = new AbortController();
    locationSuggestAbortRef.current = controller;

    // Delay spinner so it doesn't flash on fast responses.
    locationSuggestSpinnerRef.current = setTimeout(() => {
      if (reqId !== locationSuggestReqIdRef.current) return;
      locationSuggestShownAtRef.current = Date.now();
      setLocationSuggestLoading(true);
    }, 150);

    const handle = setTimeout(() => {
      setLocationSuggestError(null);

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
          if (reqId !== locationSuggestReqIdRef.current) return;
          const next = Array.isArray(data?.suggestions) ? data.suggestions : [];
          setLocationSuggestions(next);
          setLocationSuggestIndex(-1);
          setLocationSelectHint(null);
          if (data?.error) {
            setLocationSuggestError(data.error);
          }
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          if (reqId !== locationSuggestReqIdRef.current) return;
          setLocationSuggestError(err?.message || "Location suggestions unavailable.");
          setLocationSuggestions([]);
          setLocationSuggestIndex(-1);
          setLocationSelectHint(null);
        })
        .finally(() => {
          if (controller.signal.aborted) return;
          if (reqId !== locationSuggestReqIdRef.current) return;
          if (locationSuggestSpinnerRef.current) {
            clearTimeout(locationSuggestSpinnerRef.current);
            locationSuggestSpinnerRef.current = null;
          }
          const shownAt = locationSuggestShownAtRef.current || 0;
          const elapsed = shownAt ? Date.now() - shownAt : 9999;
          const remaining = 300 - elapsed;

          if (remaining > 0) {
            setTimeout(() => {
              if (controller.signal.aborted) return;
              if (reqId !== locationSuggestReqIdRef.current) return;
              setLocationSuggestLoading(false);
            }, remaining);
          } else {
            setLocationSuggestLoading(false);
          }
        });
    }, 250);

    return () => {
      clearScheduled();
      clearTimeout(handle);
      controller.abort();
      if (locationSuggestSpinnerRef.current) {
        clearTimeout(locationSuggestSpinnerRef.current);
        locationSuggestSpinnerRef.current = null;
      }
    };
  }, [locationOpen, locationInput]);

  const applyLocationSuggestion = (suggestion) => {
    if (!suggestion) return;
    // We store city as the canonical location to match DB schema; zip is only used for lookup.
    setLocation(normalizeSelectedLocation(suggestion), { replace: true });
    setLocationInput("");
    setLocationSuggestions([]);
    setLocationSuggestIndex(-1);
    setLocationSelectHint(null);
    setLocationOpen(false);
  };

  // Hybrid search — fetch AI-style blend of items + businesses
  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 3) {
      queueMicrotask(() => {
        setSearchResults({ items: [], businesses: [], places: [] });
        setSearchError(null);
        setSearchLoading(false);
        setSuggestionsOpen(false);
      });
      lastQueryRef.current = "";
      return;
    }

    if (!hasLocation) {
      queueMicrotask(() => {
        setSearchResults({ items: [], businesses: [], places: [] });
        setSearchError("Select a location to search.");
        setSearchLoading(false);
        setSuggestionsOpen(false);
      });
      lastQueryRef.current = "";
      return;
    }

    const locationKey = location.city || "none";
    const normalized = `${term.toLowerCase()}::${selectedCategory.toLowerCase()}::${locationKey.toLowerCase()}`;
    if (normalized === lastQueryRef.current) {
      queueMicrotask(() => {
        setSuggestionsOpen(true);
      });
      return;
    }

    const controller = new AbortController();
    const requestId = ++searchRequestIdRef.current;

    const handle = setTimeout(() => {
      queueMicrotask(() => {
        setSearchLoading(true);
        setSearchError(null);
      });
      const categoryParam = selectedCategory !== "All" ? selectedCategory : "";
      const params = new URLSearchParams();
      params.set("q", term);
      if (categoryParam) params.set("category", categoryParam);
      if (location.city) {
        params.set("city", location.city);
      }
      fetch(`/api/search?${params.toString()}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            let message = "search_failed";
            try {
              const body = await res.json();
              message = body?.message || body?.error || message;
            } catch {
              // best effort
            }
            const err = new Error(message);
            err.code = res.status;
            throw err;
          }
          return res.json();
        })
        .then((data) => {
          if (searchRequestIdRef.current !== requestId) return;
          lastQueryRef.current = normalized;
          setSearchResults({
            items: data?.items || [],
            businesses: data?.businesses || [],
            places: data?.places || [],
          });
          setSuggestionsOpen(true);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          console.warn("Navbar search failed", err);
          if (searchRequestIdRef.current !== requestId) return;
          const isRateLimited =
            err?.code === 429 || err?.message === "rate_limit_exceeded";
          setSearchError(
            isRateLimited
              ? "You are searching too fast. Please wait a moment."
              : err?.message || "Search is warming up. Try again in a moment."
          );
        })
        .finally(() => {
          if (searchRequestIdRef.current === requestId) {
            setSearchLoading(false);
          }
        });
    }, 450);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [searchTerm, selectedCategory, hasLocation, location.city]);

  // Close dropdown on outside click for a more premium, lightweight feel
  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleClick = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
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
    if (typeof window === "undefined") return undefined;
    const handleReset = () => {
      setProfileMenuOpen(false);
      setMobileMenuOpen(false);
      setSuggestionsOpen(false);
    };
    window.addEventListener(AUTH_UI_RESET_EVENT, handleReset);
    return () => window.removeEventListener(AUTH_UI_RESET_EVENT, handleReset);
  }, []);

  // Close AI suggestions when clicking away
  useEffect(() => {
    if (!suggestionsOpen) return;
    const handleClick = (event) => {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(event.target)
      ) {
        setSuggestionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, [suggestionsOpen]);

  /* ---------------------------------------------------
     AVATAR PRIORITY
  --------------------------------------------------- */
  const googleAvatar = user?.user_metadata?.avatar_url || null;
  const hasAuth = Boolean(user);
  const disableReasons = useMemo(() => {
    const reasons = [];
    if (authBusy && lastAuthEvent !== "SIGNED_OUT") {
      reasons.push("authBusy");
    }
    if (loadingUser && !user && lastAuthEvent !== "SIGNED_OUT") {
      reasons.push("loadingUser");
    }
    return reasons;
  }, [authBusy, lastAuthEvent, loadingUser, user]);
  const disableCtas = disableReasons.length > 0;

  const avatar = resolveImageSrc(
    profile?.profile_photo_url?.trim() || googleAvatar || "",
    "/customer-placeholder.png"
  );

  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    user?.user_metadata?.email ||
    "Account";

  const email =
    profile?.email ||
    user?.email ||
    user?.user_metadata?.email ||
    null;

  const isActive = (href) => pathname === href;

  const closeMenus = () => {
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(min-width: 768px)");
    const handleChange = () => {
      if (media.matches) setMobileMenuOpen(false);
    };
    handleChange();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (!authDiagEnabled) return;
    console.log("[AUTH_DIAG] cta:CustomerNavbar", {
      providerInstanceId,
      authStatus,
      hasAuth: Boolean(user),
      authBusy,
      authAction,
      authAttemptId,
      lastAuthEvent,
      disableReasons,
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

    const login = document.querySelector("[data-customer-cta='login']");
    const signup = document.querySelector("[data-customer-cta='signup']");
    const modalDialog = document.querySelector("[aria-modal='true']");
    const drawerHost = document.querySelector("div[data-mobile-sidebar-drawer='1']");
    const overlayPresent = Boolean(modalDialog || drawerHost);

    const diagDisableReasons = [
      authBusy ? "authBusy" : null,
      loadingUser && !user ? "loadingUser" : null,
      authStatus === "loading" ? "authStatus=loading" : null,
      profileMenuOpen ? "profileMenuOpen" : null,
      mobileMenuOpen ? "mobileMenuOpen" : null,
      suggestionsOpen ? "suggestionsOpen" : null,
      overlayPresent ? "overlayPresent" : null,
      login?.disabled ? "login.disabled" : null,
      login?.getAttribute?.("aria-disabled") ? "login.aria-disabled" : null,
      signup?.disabled ? "signup.disabled" : null,
      signup?.getAttribute?.("aria-disabled") ? "signup.aria-disabled" : null,
    ].filter(Boolean);

    console.log("[AUTH_DIAG] cta:CustomerNavbar:render", {
      providerInstanceId,
      authStatus,
      hasAuth: Boolean(user),
      authBusy,
      authAction,
      authAttemptId,
      lastAuthEvent,
      disableReasons,
      diagDisableReasons,
      loginStyle: login ? logStyleChain(login, "login") : null,
      signupStyle: signup ? logStyleChain(signup, "signup") : null,
      overlayPresent,
      overlayNodes: {
        modalDialog: modalDialog ? describeNode(modalDialog) : null,
        drawerHost: drawerHost ? describeNode(drawerHost) : null,
      },
    });
  });

  const logNavDebug = (href, method) => {
    if (process.env.NODE_ENV === "production") return;
    if (href === "/customer/saved" || href === "/customer/settings") {
      console.info("[nav-debug]", { from: pathname, href, method });
    }
  };

  const handleNavigate = (href, method = "router.push") => {
    if (!href) return;
    logNavDebug(href, method);
    startTransition(() => {
      try {
        router.push(href);
      } catch (err) {
        console.error("[NAV_TRACE] router.push error", err);
        throw err;
      }
    });
  };

  // DEBUG_CLICK_DIAG
  useEffect(() => {
    if (!clickDiagEnabled) return undefined;
    const savedEl = navSavedRef.current;
    const settingsEl = navSettingsRef.current;
    if (savedEl) savedEl.dataset.clickdiagBound = "nav-saved";
    if (settingsEl) settingsEl.dataset.clickdiagBound = "nav-settings";
    return () => {
      if (savedEl) delete savedEl.dataset.clickdiagBound;
      if (settingsEl) delete settingsEl.dataset.clickdiagBound;
    };
  }, [clickDiagEnabled]);

  const handleNavCapture = (event) => {
    if (!clickDiagEnabled) return;
    console.log("[CLICK_DIAG] navbar capture", {
      target: event.target,
      currentTarget: event.currentTarget,
    });
  };

  const quickActions = [
    {
      href: "/customer/home",
      title: "YB Home",
      description: "Back to customer home",
      icon: Home,
    },
    {
      href: "/customer/nearby",
      title: "Nearby businesses",
      description: "Explore what's buzzing near you",
      icon: Compass,
    },
    {
      href: "/customer/messages",
      title: "Messages",
      description: "Chat with local businesses",
      icon: MessageSquare,
      showBadge: true,
    },
    {
      href: "/account/orders",
      title: "My Orders",
      description: "Track active requests",
      icon: ShoppingCart,
    },
    {
      href: "/account/purchase-history",
      title: "Purchase History",
      description: "Review fulfilled orders",
      icon: Bookmark,
    },
    {
      href: "/customer/saved",
      title: "Saved items",
      description: "Instant access to your favorites",
      icon: Bookmark,
      diag: "nav-saved",
    },
  ];

  const hasHybridResults =
    (searchResults.items?.length || 0) +
      (searchResults.businesses?.length || 0) +
      (searchResults.places?.length || 0) >
    0;

  const navigateToSearch = (query, category) => {
    const value = (query || "").trim();
    const nextCategory = (category || "").trim();
    const params = new URLSearchParams();
    if (value) params.set("q", value);
    if (nextCategory && nextCategory !== "All") params.set("category", nextCategory);
    const withLocation = setLocationSearchParams(params, location);
    const target = withLocation.toString()
      ? `/customer/home?${withLocation.toString()}`
      : "/customer/home";
    setSuggestionsOpen(false);
    router.push(target);
  };

  const handleSubmitSearch = (event) => {
    event.preventDefault();
    navigateToSearch(searchTerm || "", selectedCategory);
  };

  const handleCategoryChange = (event) => {
    const next = event.target.value;
    setSelectedCategory(next);
    navigateToSearch(searchTerm || "", next);
  };

  const handleSuggestionSelect = (value, itemRef) => {
    const next = (value || "").trim();
    if (!next) return;
    setSearchTerm(next);
    setSuggestionsOpen(false);
    if (itemRef) {
      const params = setLocationSearchParams(new URLSearchParams(), location);
      const suffix = params.toString();
      const target = getCustomerListingUrl({ public_id: itemRef, id: itemRef });
      hardNavigate(suffix ? `${target}?${suffix}` : target);
      return;
    }
    navigateToSearch(next, selectedCategory);
  };

  const categorySelectWidth = Math.max(selectedCategory.length, 3) + 6;

  const canLoadUnread = Boolean(user?.id) && authStatus !== "unauthenticated";
  const loadUnreadCount = useCallback(async () => {
    const userId = user?.id;
    if (!userId || !canLoadUnread) return;
    try {
      const total = await fetchUnreadTotal({
        supabase,
        userId,
        role: "customer",
      });
      setUnreadCount(total);
    } catch (err) {
      console.warn("Failed to load unread messages", err);
    }
  }, [supabase, user?.id, canLoadUnread]);

  useEffect(() => {
    if (!badgeReady || !canLoadUnread) return;
    queueMicrotask(() => {
      loadUnreadCount();
    });
  }, [badgeReady, canLoadUnread, loadUnreadCount]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleUnreadRefresh = () => {
      loadUnreadCount();
    };
    window.addEventListener(UNREAD_REFRESH_EVENT, handleUnreadRefresh);
    return () => window.removeEventListener(UNREAD_REFRESH_EVENT, handleUnreadRefresh);
  }, [loadUnreadCount]);

  /* ---------------------------------------------------
     NAVBAR UI
  --------------------------------------------------- */
  return (
    <nav
      className="fixed top-0 inset-x-0 z-[5000] theme-lock pointer-events-auto yb-navbar yb-navbar-bordered"
      data-clickdiag={clickDiagEnabled ? "navbar" : undefined}
      onClickCapture={handleNavCapture}
      data-nav-guard="1"
    >
      <div className="w-full px-5 sm:px-6 md:px-8 lg:px-10 xl:px-14 flex items-center justify-between h-20 gap-6">
        {/* MOBILE MENU BUTTON */}
        <button
          onClick={() => {
            setProfileMenuOpen(false);
            setMobileMenuOpen((open) => !open);
          }}
          className="md:hidden text-white mr-1"
          aria-label="Open menu"
          aria-expanded={mobileMenuOpen}
          aria-controls={mobileDrawerId}
        >
          <svg className="h-7 w-7" fill="none" stroke="currentColor">
            <path strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link
          href="/customer/home"
          onClick={closeMenus}
          aria-label="Go to home"
          className="touch-manipulation"
        >
          <span className="relative block h-10 w-10 md:hidden">
            <Image
              src="/business-placeholder2.png"
              alt="YourBarrio"
              fill
              sizes="40px"
              priority
              className="object-contain"
            />
          </span>
          <span className="relative hidden h-10 w-10 md:block md:h-32 md:w-32">
            <Image
              src="/logo.png"
              alt="YourBarrio"
              fill
              sizes="128px"
              priority
              className="object-contain"
            />
          </span>
        </Link>

        <div className="relative hidden md:flex items-center" ref={locationRef}>
          <button
            type="button"
            onClick={() => setLocationOpen((open) => !open)}
            className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-left text-white/90 transition hover:bg-white/15"
            aria-haspopup="dialog"
            aria-expanded={locationOpen}
          >
            <MapPin className="h-4 w-4 text-white/80" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">{locationLabel}</div>
            </div>
            <ChevronDown className="h-4 w-4 text-white/70" />
          </button>

          {locationOpen ? (
            <div className="absolute left-0 top-full z-50 mt-3 w-72 rounded-2xl p-4 yb-dropdown-surface">
              <div className="text-xs uppercase tracking-[0.22em] yb-dropdown-title">Set location</div>
              <div className="mt-2 text-sm yb-dropdown-muted">Enter a city or ZIP code.</div>
              <div className="mt-4 flex items-center gap-2">
                <input
                  type="text"
                  value={locationInput}
                  onChange={(event) => {
                    setLocationInput(event.target.value);
                    setLocationSelectHint(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setLocationSuggestIndex((prev) =>
                        Math.min(prev + 1, locationSuggestions.length - 1)
                      );
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setLocationSuggestIndex((prev) => Math.max(prev - 1, 0));
                      return;
                    }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (locationSuggestions.length > 0) {
                        const selected =
                          locationSuggestIndex >= 0 &&
                          locationSuggestions[locationSuggestIndex]
                            ? locationSuggestions[locationSuggestIndex]
                            : locationSuggestions[0];
                        applyLocationSuggestion(selected);
                        return;
                      }
                      setLocationSelectHint("Select a suggestion to set your location.");
                    }
                  }}
                  placeholder="e.g. Austin, 78701"
                  className="w-40 min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
                />
              </div>
              <div className="mt-3 text-xs yb-dropdown-muted min-h-[16px]">
                {locationSuggestLoading ? "Searching locations..." : ""}
              </div>
              {locationSuggestError ? (
                <div className="mt-3 text-xs text-rose-200">{locationSuggestError}</div>
              ) : null}
              {locationSelectHint ? (
                <div className="mt-2 text-xs yb-dropdown-muted">{locationSelectHint}</div>
              ) : null}
              {!locationSuggestLoading &&
              !locationSuggestError &&
              locationInput.trim().length >= 2 &&
              locationSuggestions.length === 0 ? (
                <div className="mt-3 text-xs yb-dropdown-muted">
                  {locationNoMatchMessage}
                </div>
              ) : null}
              {locationSuggestions.length > 0 ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-1">
                  {locationSuggestions.map((suggestion, idx) => (
                    <button
                      key={suggestion.id || suggestion.label || idx}
                      type="button"
                      onClick={() => applyLocationSuggestion(suggestion)}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg yb-dropdown-item ${
                      idx === locationSuggestIndex ? "bg-white/10" : ""
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

        <div className="hidden md:flex flex-1 justify-center">
          <div
            ref={searchBoxRef}
            className="w-full max-w-3xl relative"
          >
            <form
              onSubmit={handleSubmitSearch}
              className="flex flex-1 items-stretch rounded-2xl overflow-hidden border border-white/15 bg-white/10"
            >
              <div className="hidden lg:flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/70 bg-white/5 border-r border-white/10">
                <label htmlFor="customer-search-category" className="sr-only">
                  Category
                </label>
                <div className="relative">
                  <select
                    id="customer-search-category"
                    value={selectedCategory}
                    onChange={handleCategoryChange}
                    style={{ width: `${categorySelectWidth}ch` }}
                    className="appearance-none bg-transparent pr-7 text-base md:text-xs font-semibold uppercase tracking-[0.12em] text-white/80 focus:outline-none"
                  >
                    {SEARCH_CATEGORIES.map((category) => (
                      <option key={category} value={category} className="text-black">
                        {category}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 text-white/60" />
                </div>
              </div>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
                <input
                  id="customer-nav-search"
                  name="search"
                  ref={searchInputRef}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => setSuggestionsOpen(hasHybridResults || searchTerm.trim().length > 0)}
                  className="w-full bg-transparent py-3 pl-11 pr-3 text-sm text-white placeholder:text-white/60 focus:outline-none"
                  placeholder="Search tacos, coffee, salons, groceries..."
                  type="search"
                />
              </div>
              <button
                type="submit"
                className="px-5 bg-white text-sm font-semibold text-black hover:bg-white/90 transition yb-navbar-light"
              >
                Search
              </button>
            </form>

            {suggestionsOpen && (searchLoading || searchError || hasHybridResults) && (
              <div className="absolute left-0 right-0 top-full mt-2 z-50">
                <div className="rounded-2xl p-3 yb-dropdown-surface">
                  {searchError ? (
                    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-rose-200 mb-2">
                      {searchError}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] yb-dropdown-muted">
                        <PackageSearch className="h-4 w-4" />
                        Items
                        {searchLoading ? <Loader2 className="h-3 w-3 animate-spin yb-dropdown-muted" /> : null}
                      </div>
                      <div className="space-y-2">
                        {sortedSearchItems.slice(0, 4).map((item) => {
                          const inventory = normalizeInventory(item);
                          const badgeStyle = getAvailabilityBadgeStyle(
                            inventory.availability,
                            isLight
                          );
                          return (
                          <button
                            key={`item-${item.id}`}
                            type="button"
                            onClick={() =>
                              handleSuggestionSelect(item.title, item.public_id || item.id)
                            }
                            className="w-full text-left rounded-xl border border-white/10 bg-white/5 px-3 py-3 transition flex items-start gap-3 yb-dropdown-item"
                          >
                            <div className="h-10 w-10 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-[11px] font-semibold text-white/80">
                              {item.category
                                ? item.category.slice(0, 3).toUpperCase()
                                : "AI"}
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-semibold leading-snug">{item.title}</div>
                              <div className="text-[11px] yb-dropdown-muted">
                                {item.category || "Local listing"}
                                {item.price ? ` · $${item.price}` : ""}
                              </div>
                              <span
                                className="mt-2 inline-flex items-center rounded-full border bg-transparent px-2 py-1 text-[10px] font-semibold"
                                style={
                                  badgeStyle
                                    ? { color: badgeStyle.color, borderColor: badgeStyle.border }
                                    : undefined
                                }
                              >
                                {inventory.label}
                              </span>
                            </div>
                          </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] yb-dropdown-muted">
                        <Store className="h-4 w-4" />
                        Businesses & places
                      </div>
                      <div className="space-y-2">
                        {(searchResults.businesses || []).slice(0, 3).map((biz) => (
                          <button
                            key={`biz-${biz.id}`}
                            type="button"
                            onClick={() => handleSuggestionSelect(biz.name)}
                            className="w-full text-left rounded-xl border border-white/10 bg-white/5 px-3 py-3 transition flex items-start gap-3 yb-dropdown-item"
                          >
                            <div className="h-10 w-10 rounded-lg bg-emerald-500/20 border border-emerald-200/30 flex items-center justify-center">
                              <Store className="h-4 w-4 text-emerald-200" />
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-semibold leading-snug">{biz.name}</div>
                              <div className="text-[11px] yb-dropdown-muted">
                                {biz.category || "Local business"}
                                {biz.city ? ` · ${biz.city}` : ""}
                              </div>
                            </div>
                          </button>
                        ))}

                        {(searchResults.places || []).slice(0, 3).map((place) => (
                          <button
                            key={`place-${place.id}`}
                            type="button"
                            onClick={() => handleSuggestionSelect(place.name)}
                            className="w-full text-left rounded-xl border border-white/10 bg-white/5 px-3 py-3 transition flex items-start gap-3 yb-dropdown-item"
                          >
                            <div className="h-10 w-10 rounded-lg bg-blue-500/20 border border-blue-200/30 flex items-center justify-center">
                              <MapPin className="h-4 w-4 text-blue-100" />
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-semibold leading-snug">{place.name}</div>
                              <div className="text-[11px] yb-dropdown-muted">
                                {place.address || "Nearby result"}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleNavigate("/cart", "cart")}
          className="relative hidden md:inline-flex text-white/90 hover:text-white transition"
          aria-label="View cart"
          data-nav-guard="1"
        >
          <ShoppingCart className="h-6 w-6" />
          {itemCount > 0 ? (
            <span className="absolute -top-2 -right-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-black">
              {itemCount}
            </span>
          ) : null}
        </button>

        <div className="flex items-center gap-3 md:hidden">
          <button
            type="button"
            onClick={() => handleNavigate("/cart", "cart")}
            className="relative text-white/90 hover:text-white transition"
            aria-label="View cart"
            data-nav-guard="1"
          >
            <ShoppingCart className="h-6 w-6" />
            {itemCount > 0 ? (
              <span className="absolute -top-2 -right-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-black">
                {itemCount}
              </span>
            ) : null}
          </button>
        </div>

        {/* RIGHT — AUTH STATE */}
        <div className="hidden md:flex items-center gap-8">
          {!hasAuth && (
            <>
              <button
                type="button"
                onClick={() => openModal("customer-login")}
                disabled={disableCtas}
                aria-busy={disableCtas}
                className={`text-sm md:text-base transition text-white/70 hover:text-white ${
                  disableCtas ? "opacity-60 cursor-not-allowed" : ""
                }`}
                data-customer-cta="login"
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => openModal("customer-signup")}
                disabled={disableCtas}
                aria-busy={disableCtas}
                className={`px-5 py-2 rounded-xl bg-[var(--color-primary)] text-white font-semibold ${
                  disableCtas ? "opacity-60 cursor-not-allowed" : ""
                }`}
                data-customer-cta="signup"
              >
                Sign Up
              </button>
            </>
          )}

          {hasAuth && (
            <div
              className="relative"
              ref={dropdownRef}
              data-clickdiag={clickDiagEnabled ? "dropdown" : undefined}
              data-nav-guard="1"
            >
              {profileMenuOpen ? (
                <button
                  type="button"
                  aria-label="Close profile menu"
                  className="fixed inset-0 z-[5050] cursor-default"
                  onClick={() => setProfileMenuOpen(false)}
                  data-nav-guard="1"
                />
              ) : null}
              <button
                onClick={() => setProfileMenuOpen((open) => !open)}
                data-clickdiag={clickDiagEnabled ? "navbar-user" : undefined}
                className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-1.5 border border-white/10 hover:border-white/30 transition"
              >
                <div className="relative">
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
                  {badgeReady && unreadCount > 0 ? (
                    <span className="absolute -bottom-1 -left-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </div>
                <span className="hidden sm:block text-sm font-semibold text-white/90 max-w-[120px] truncate">
                  {displayName}
                </span>
                <ChevronDown className="h-4 w-4 text-white/70" />
              </button>

              {profileMenuOpen && (
                <div
                  className="absolute right-0 mt-4 w-80 rounded-3xl px-1.5 pb-3 pt-1.5 yb-dropdown-surface z-[5100]"
                  data-clickdiag={clickDiagEnabled ? "dropdown" : undefined}
                  ref={dropdownPanelRef}
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
                        <p className="text-sm font-semibold">{displayName}</p>
                        {email && (
                          <p className="text-xs yb-dropdown-muted">{email}</p>
                        )}
                      </div>
                    </div>

                    <div className="px-2 pb-1 pt-2 space-y-1">
                      {quickActions.map(({ href, title, description, icon: Icon, diag, showBadge }) => (
                        <Link
                          key={href}
                          href={href}
                          onClick={(e) => {
                            if (clickDiagEnabled && e.defaultPrevented) {
                              console.warn("[CLICK_DIAG] nav link defaultPrevented", {
                                href,
                                stack: new Error().stack,
                              });
                            }
                            if (diag === "nav-saved") {
                              diagClick("NAV_SAVED_BUBBLE")(e);
                            }
                          }}
                          data-clickdiag={clickDiagEnabled ? diag || undefined : undefined}
                          data-clickdiag-bound={clickDiagEnabled && diag ? diag : undefined}
                          ref={diag === "nav-saved" ? navSavedRef : undefined}
                          onClickCapture={diag === "nav-saved" ? diagClick("NAV_SAVED_CAPTURE") : undefined}
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-white/10 touch-manipulation text-left"
                          data-safe-nav="1"
                        >
                          <div className="h-11 w-11 rounded-2xl bg-white/10 flex items-center justify-center text-white">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold">{title}</p>
                              {showBadge && badgeReady && unreadCount > 0 ? (
                                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                                  {unreadCount}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs yb-dropdown-muted">{description}</p>
                          </div>
                        </Link>
                      ))}
                    </div>

                    <div className="mt-2 border-t border-white/10 px-4 pt-3">
                      <Link
                        href="/customer/settings"
                        onClick={(e) => {
                          if (clickDiagEnabled && e.defaultPrevented) {
                            console.warn("[CLICK_DIAG] nav link defaultPrevented", {
                              href: "/customer/settings",
                              stack: new Error().stack,
                            });
                          }
                          diagClick("NAV_SETTINGS_BUBBLE")(e);
                        }}
                        className="flex w-full items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold transition hover:bg-white/10 touch-manipulation text-left"
                        data-clickdiag={clickDiagEnabled ? "nav-settings" : undefined}
                        data-clickdiag-bound={clickDiagEnabled ? "nav-settings" : undefined}
                        ref={navSettingsRef}
                        onClickCapture={diagClick("NAV_SETTINGS_CAPTURE")}
                        data-safe-nav="1"
                      >
                        <span className="flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          Account settings
                        </span>
                      </Link>
                      <LogoutButton
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                        onSuccess={closeMenus}
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </LogoutButton>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      <div
        className="md:hidden px-5 sm:px-6 pt-2 pb-4 border-t border-white/10"
        data-nav-guard="1"
      >
        <form
          onSubmit={handleSubmitSearch}
          className="relative flex w-[calc(100%-3rem)] items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-3 py-2"
        >
          <Search className="h-4 w-4 text-white/70" />
          <input
            id="customer-nav-search-mobile"
            name="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent pr-12 text-base md:text-sm placeholder:text-white/60 focus:outline-none"
            placeholder="Search YourBarrio"
            type="search"
          />
          <button
            type="submit"
            aria-label="Search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-white p-1.5 text-black yb-navbar-light"
          >
            <Search className="h-4 w-4" />
          </button>
        </form>
      </div>

      <MobileSidebarDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title={hasAuth ? "My account" : "Welcome"}
        id={mobileDrawerId}
      >
        <div className="flex flex-col gap-5 text-white" data-nav-guard="1">
          {!hasAuth && (
            <>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openModal("customer-login");
                }}
                disabled={disableCtas}
                aria-busy={disableCtas}
                className={`text-left text-white/70 hover:text-white ${
                  disableCtas ? "opacity-60 cursor-not-allowed" : ""
                }`}
                data-customer-cta="login"
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openModal("customer-signup");
                }}
                disabled={disableCtas}
                aria-busy={disableCtas}
                className={`px-4 py-2 bg-[var(--color-primary)] rounded-xl text-center font-semibold ${
                  disableCtas ? "opacity-60 cursor-not-allowed" : ""
                }`}
                data-customer-cta="signup"
              >
                Sign Up
              </button>
            </>
          )}

          {hasAuth && (
            <>
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <SafeImage
                  src={avatar}
                  alt="Profile avatar"
                  className="h-11 w-11 rounded-2xl object-cover border border-white/20"
                  width={44}
                  height={44}
                  sizes="44px"
                  useNextImage
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                  {email ? (
                    <p className="text-xs text-white/60 truncate">{email}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <MapPin className="h-4 w-4 text-white/80" />
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/50">Location</p>
                    <p className="text-sm font-semibold text-white truncate">{locationLabel}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleNavigate("/cart", "cart")}
                  className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/90 transition hover:text-white"
                  aria-label="View cart"
                  data-nav-guard="1"
                >
                  <ShoppingCart className="h-5 w-5" />
                  {itemCount > 0 ? (
                    <span className="absolute -top-2 -right-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-black">
                      {itemCount}
                    </span>
                  ) : null}
                </button>
              </div>
              <NavItem
                href="/customer/home"
                active={isActive("/customer/home")}
                badgeReady={badgeReady}
                onNavigate={handleNavigate}
              >
                <Home className="h-4 w-4" />
                YB Home
              </NavItem>
              <NavItem
                href="/customer/nearby"
                active={isActive("/customer/nearby")}
                badgeReady={badgeReady}
                onNavigate={handleNavigate}
              >
                Nearby businesses
              </NavItem>
              <NavItem
                href="/customer/messages"
                badgeCount={unreadCount}
                active={isActive("/customer/messages")}
                badgeReady={badgeReady}
                onNavigate={handleNavigate}
              >
                Messages
              </NavItem>
              <NavItem
                href="/account/orders"
                active={isActive("/account/orders")}
                badgeReady={badgeReady}
                onNavigate={handleNavigate}
              >
                My Orders
              </NavItem>
              <NavItem
                href="/account/purchase-history"
                active={isActive("/account/purchase-history")}
                badgeReady={badgeReady}
                onNavigate={handleNavigate}
              >
                Purchase History
              </NavItem>
              <NavItem
                href="/customer/saved"
                active={isActive("/customer/saved")}
                badgeReady={badgeReady}
                onNavigate={handleNavigate}
              >
                Saved items
              </NavItem>
              <NavItem
                href="/customer/settings"
                active={isActive("/customer/settings")}
                badgeReady={badgeReady}
                onNavigate={handleNavigate}
              >
                Account settings
              </NavItem>
            </>
          )}

          {hasAuth ? <LogoutButton mobile /> : null}
        </div>
      </MobileSidebarDrawer>
    </nav>
  );
}
