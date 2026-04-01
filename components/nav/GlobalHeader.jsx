"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ChevronDown,
  Loader2,
  MapPin,
  PackageSearch,
  Search,
  Store,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import CartNavActionClient from "@/components/nav/CartNavActionClient";
import HeaderAccountWidget from "@/components/nav/HeaderAccountWidget";
import { BUSINESS_CATEGORIES, normalizeCategoryName } from "@/lib/businessCategories";
import {
  getAvailabilityBadgeStyle,
  normalizeInventory,
  sortListingsByAvailability,
} from "@/lib/inventory";
import { AUTH_UI_RESET_EVENT } from "@/components/AuthProvider";
import { useLocation } from "@/components/location/LocationProvider";
import {
  getLocationCacheKey,
  getLocationLabel,
  isZipLike,
  normalizeSelectedLocation,
} from "@/lib/location";
import { markNavInProgress } from "@/lib/nav/safariNavGuard";

const SEARCH_CATEGORIES = ["All", ...BUSINESS_CATEGORIES.map((cat) => cat.name)];

const getInitialSearchTerm = (params) => (params?.get("q") || "").trim();

const getInitialCategory = (params) => {
  const currentCategory = (params?.get("category") || "").trim();
  const normalizedCurrent = normalizeCategoryName(currentCategory).toLowerCase();
  const matchedCategory = SEARCH_CATEGORIES.find(
    (category) => normalizeCategoryName(category).toLowerCase() === normalizedCurrent
  );
  return matchedCategory || "All";
};

export default function GlobalHeader({
  surface = "public",
  showSearch = true,
  forcedAuth = null,
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme, hydrated } = useTheme();
  const isLight = hydrated ? theme === "light" : true;
  const { location, hasLocation, setLocation } = useLocation();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileDrawerId = useMemo(
    () => `global-mobile-drawer-${surface || "public"}`,
    [surface]
  );

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
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const searchBoxRef = useRef(null);
  const searchInputRef = useRef(null);
  const locationRef = useRef(null);
  const locationPrefillRef = useRef(false);
  const locationSuggestAbortRef = useRef(null);
  const locationSuggestReqIdRef = useRef(0);
  const locationSuggestSpinnerRef = useRef(null);
  const locationSuggestShownAtRef = useRef(0);
  const searchRequestIdRef = useRef(0);
  const lastQueryRef = useRef("");
  // Keep first client render aligned with SSR to avoid hydration mismatches.
  const locationLabel = mounted ? getLocationLabel(location) : "Set location";
  const locationNoMatchMessage = isZipLike(locationInput)
    ? "No matches. Try another postal code."
    : "No matches. Try another city.";

  const sortedSearchItems = useMemo(
    () => sortListingsByAvailability(searchResults.items || []),
    [searchResults.items]
  );

  const baseSearchPath = surface === "customer" ? "/customer/home" : "/listings";
  const listingPath = surface === "customer" ? "/customer/listings" : "/listings";
  const logoHref = surface === "customer" ? "/customer/home" : "/";

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
    const target = params.toString()
      ? `${baseSearchPath}?${params.toString()}`
      : baseSearchPath;
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

  const handleSuggestionSelect = (value, itemId) => {
    const next = (value || "").trim();
    if (!next) return;
    setSearchTerm(next);
    setSuggestionsOpen(false);
    if (itemId) {
      router.push(`${listingPath}/${itemId}`);
      return;
    }
    navigateToSearch(next, selectedCategory);
  };

  const categorySelectWidth = Math.max(selectedCategory.length, 3) + 6;

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

    const locationKey = getLocationCacheKey(location);
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
  }, [searchTerm, selectedCategory, hasLocation, location]);

  // Close AI suggestions when clicking away
  useEffect(() => {
    if (!suggestionsOpen) return;
    const handleClick = (event) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target)) {
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
      setLocationInput(locationLabel !== "Set location" ? locationLabel : "");
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
    setLocation(normalizeSelectedLocation(suggestion));
    router.refresh();
    setLocationInput("");
    setLocationSuggestions([]);
    setLocationSuggestIndex(-1);
    setLocationSelectHint(null);
    setLocationOpen(false);
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleReset = () => {
      setMobileMenuOpen(false);
      setSuggestionsOpen(false);
    };
    window.addEventListener(AUTH_UI_RESET_EVENT, handleReset);
    return () => window.removeEventListener(AUTH_UI_RESET_EVENT, handleReset);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 w-full z-50 theme-lock pointer-events-auto yb-navbar yb-navbar-bordered"
      data-nav-surface={surface}
      data-nav-guard="1"
      data-testid={surface === "customer" ? "customer-navbar" : "global-navbar"}
    >
      <div className="mx-auto flex h-20 w-full max-w-[1380px] items-center justify-between gap-3 px-4 sm:px-6 lg:gap-4 lg:px-7 xl:gap-5 xl:px-8">
        <button
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="text-white mr-0 lg:hidden"
          aria-label="Open menu"
          aria-expanded={mobileMenuOpen}
          aria-controls={mobileDrawerId}
        >
          <svg className="h-7 w-7" fill="none" stroke="currentColor">
            <path strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link
          href={logoHref}
          aria-label="Go to home"
          className="touch-manipulation shrink-0"
          onPointerDownCapture={() => markNavInProgress(logoHref)}
        >
          <span className="relative block h-10 w-10 lg:hidden">
            <Image
              src="/business-placeholder2.png"
              alt="YourBarrio"
              fill
              sizes="40px"
              priority
              className="object-contain"
            />
          </span>
          <span className="hidden lg:block">
            <Image
              src="/logo.png"
              alt="YourBarrio"
              width={867}
              height={306}
              sizes="(min-width: 1280px) 162px, 150px"
              priority
              className="h-auto w-[150px] object-contain xl:w-[162px]"
            />
          </span>
        </Link>

        <div className="relative hidden lg:flex items-center" ref={locationRef}>
          <button
            type="button"
            onClick={() => setLocationOpen((open) => !open)}
            className={`flex h-11 max-w-[208px] items-center gap-2.5 rounded-xl border bg-white/7 px-3.5 text-left text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors duration-200 ease-out hover:bg-purple-500/10 ${
              locationOpen ? "border-purple-400" : "border-white/15"
            }`}
            aria-haspopup="dialog"
            aria-expanded={locationOpen}
          >
            <MapPin className="h-4 w-4 shrink-0 text-white/75 transition-colors duration-200 ease-out hover:text-purple-400" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold">{locationLabel}</div>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-white/65 transition-colors duration-200 ease-out hover:text-purple-400" />
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

        {showSearch ? (
          <div className="flex flex-1 justify-center lg:hidden" data-nav-guard="1">
            <form
              onSubmit={handleSubmitSearch}
              className="relative flex w-[92%] items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-3 py-2 transition-[border-color,box-shadow] duration-200 ease-out hover:border-purple-400/60 focus-within:border-purple-400/70 focus-within:ring-2 focus-within:ring-purple-500/40 md:w-full"
              style={{
                boxShadow: "0 0 0 0 rgba(124,58,237,0)",
              }}
            >
              <Search className="h-4 w-4 text-white/70" />
              <input
                id="global-nav-search-mobile"
                name="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={(event) => {
                  event.currentTarget.form?.style.setProperty(
                    "box-shadow",
                    "0 0 0 2px rgba(124,58,237,0.25)"
                  );
                }}
                onBlur={(event) => {
                  event.currentTarget.form?.style.setProperty(
                    "box-shadow",
                    "0 0 0 0 rgba(124,58,237,0)"
                  );
                }}
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
        ) : null}

        {showSearch ? (
          <div className="hidden flex-1 justify-center lg:flex" data-nav-guard="1">
            <div
              ref={searchBoxRef}
              className="relative w-full max-w-[40rem] xl:max-w-[42rem]"
              data-nav-guard="1"
            >
            <form
              onSubmit={handleSubmitSearch}
              className="flex h-11 flex-1 items-stretch overflow-hidden rounded-xl border border-white/15 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[border-color,box-shadow] duration-200 ease-out hover:border-purple-400/60 focus-within:border-purple-400/70 focus-within:ring-2 focus-within:ring-purple-500/40"
              style={{
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 0 rgba(124,58,237,0)",
              }}
            >
                <div
                  className={`hidden h-full lg:flex items-center gap-2 border-r bg-white/5 px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70 transition-colors duration-200 ease-out hover:bg-purple-500/10 ${
                    selectedCategory !== "All" ? "border-purple-400/70" : "border-white/10"
                  }`}
                >
                  <label htmlFor="global-search-category" className="sr-only">
                    Category
                  </label>
                  <div className="relative">
                    <select
                      id="global-search-category"
                      value={selectedCategory}
                      onChange={handleCategoryChange}
                      style={{ width: `${categorySelectWidth}ch` }}
                      className="appearance-none bg-transparent pr-7 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 focus:outline-none"
                    >
                      {SEARCH_CATEGORIES.map((category) => (
                        <option key={category} value={category} className="text-black">
                          {category}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 text-white/60 transition-colors duration-200 ease-out group-hover:text-purple-400" />
                  </div>
                </div>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60 transition-colors duration-200 ease-out hover:text-purple-400" />
                  <input
                    id="global-nav-search"
                    name="search"
                    ref={searchInputRef}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={() => setSuggestionsOpen(hasHybridResults || searchTerm.trim().length > 0)}
                    onFocusCapture={(event) => {
                      event.currentTarget.form?.style.setProperty(
                        "box-shadow",
                        "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 2px rgba(124,58,237,0.25)"
                      );
                    }}
                    onBlurCapture={(event) => {
                      event.currentTarget.form?.style.setProperty(
                        "box-shadow",
                        "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 0 rgba(124,58,237,0)"
                      );
                    }}
                    className="h-full w-full bg-transparent pl-11 pr-4 text-sm text-white placeholder:text-white/60 focus:outline-none"
                    placeholder="Search tacos, coffee, salons, groceries..."
                    type="search"
                  />
                </div>
                <button
                  type="submit"
                  className="h-full min-w-[92px] bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90 yb-navbar-light"
                >
                  Search
                </button>
              </form>

              {suggestionsOpen && (searchLoading || searchError || hasHybridResults) ? (
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
                          {searchLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin yb-dropdown-muted" />
                          ) : null}
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
                                onClick={() => handleSuggestionSelect(item.title, item.id)}
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
              ) : null}
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex flex-1" />
        )}

        <div className="hidden items-center gap-4 lg:flex xl:gap-5">
          <CartNavActionClient />
          <HeaderAccountWidget surface={surface} variant="desktop" forcedAuth={forcedAuth} />
        </div>

      </div>

      <HeaderAccountWidget
        surface={surface}
        variant="mobile"
        forcedAuth={forcedAuth}
        mobileMenuOpen={mobileMenuOpen}
        onCloseMobileMenu={() => setMobileMenuOpen(false)}
        mobileDrawerId={mobileDrawerId}
      />
    </nav>
  );
}
