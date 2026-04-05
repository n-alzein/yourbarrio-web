"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Heart,
  MapPin,
  MoreHorizontal,
  Shield,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import useBusinessProfileAccessGate from "@/components/auth/useBusinessProfileAccessGate";
import { useCurrentAccountContext } from "@/lib/auth/useCurrentAccountContext";
import { extractPhotoUrls, primaryPhotoUrl } from "@/lib/listingPhotos";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getAuthedContext } from "@/lib/auth/getAuthedContext";
import { useParams, usePathname, useRouter } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import { getOrCreateConversation } from "@/lib/messages";
import { useTheme } from "@/components/ThemeProvider";
import { getAvailabilityBadgeStyle, normalizeInventory } from "@/lib/inventory";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { useCart } from "@/components/cart/CartProvider";
import ReportModal from "@/components/moderation/ReportModal";
import ListingDescription from "@/components/listings/ListingDescription";
import { isUuid } from "@/lib/ids/isUuid";
import {
  getPurchaseRestrictionHelpText,
  getPurchaseRestrictionMessage,
} from "@/lib/auth/purchaseAccess";
import { descriptionSnippet } from "@/lib/listingDescription";
import { getCustomerBusinessUrl, getListingUrl } from "@/lib/ids/publicRefs";
import {
  getBusinessTypeLabel,
  getListingCategoryLabel,
} from "@/lib/taxonomy/compat";
import {
  getBusinessTypePlaceholder,
  getListingCategoryPlaceholder,
} from "@/lib/taxonomy/placeholders";

export default function ListingDetails({ params }) {
  const { supabase, user } = useAuth();
  const accountContext = useCurrentAccountContext();
  const gateBusinessProfileAccess = useBusinessProfileAccessGate();
  const router = useRouter();
  const { theme, hydrated } = useTheme();
  const isLight = hydrated ? theme === "light" : true;
  const { addItem } = useCart();
  const routeParams = useParams();
  const pathname = usePathname();
  const [resolvedParams, setResolvedParams] = useState(params);
  const listingRef = routeParams?.id || resolvedParams?.id;

  useEffect(() => {
    let active = true;
    if (params && typeof params.then === "function") {
      params.then((value) => {
        if (active) setResolvedParams(value);
      });
    } else {
      setResolvedParams(params);
    }
    return () => {
      active = false;
    };
  }, [params]);

  const [listing, setListing] = useState(null);
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [statusMessage, setStatusMessage] = useState("");
  const [messageStatus, setMessageStatus] = useState("");
  const [messageLoading, setMessageLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [heroSrc, setHeroSrc] = useState("/listing-placeholder.png");
  const [cartToast, setCartToast] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportToast, setReportToast] = useState(null);
  const [listingMenuOpen, setListingMenuOpen] = useState(false);
  const toastTimerRef = useRef(null);
  const listingMenuRef = useRef(null);
  const loginHref = useMemo(() => {
    const currentPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : pathname || "/";
    return `/?modal=customer-login&next=${encodeURIComponent(currentPath || "/")}`;
  }, [pathname]);

  const requireAuth = useCallback(
    (actionName, setMessage) => {
      if (user?.id) return true;
      const message = actionName
        ? `Log in to ${actionName}.`
        : "Please log in to continue.";
      if (typeof setMessage === "function") {
        setMessage(message);
      }
      router.push(loginHref);
      return false;
    },
    [user?.id, router, loginHref]
  );

  useEffect(() => {
    let isMounted = true;
    const accountId = user?.id || null;
    const shouldUseServer = Boolean(accountId);

    async function load() {
      if (!listingRef) return;
      setLoading(true);
      setError(null);

      try {
        if (shouldUseServer) {
          const response = await fetchWithTimeout(
            `/api/customer/listings?id=${encodeURIComponent(listingRef)}`,
            {
              method: "GET",
              credentials: "include",
              timeoutMs: 12000,
            }
          );
          if (!response.ok) {
            const message = await response.text();
            throw new Error(message || "Failed to load listing");
          }
          const payload = await response.json();
          if (!isMounted) return;
          setListing(payload?.listing ?? null);
          setBusiness(payload?.business ?? null);
          setIsSaved(Boolean(payload?.isSaved));
          setHeroSrc(
            primaryPhotoUrl(payload?.listing?.photo_url) ||
              getListingCategoryPlaceholder(payload?.listing)
          );
          return;
        }

        const client = supabase ?? getSupabaseBrowserClient();
        if (!client) {
          setError("We couldn’t connect. Try again.");
          setLoading(false);
          return;
        }

        const { data: item, error: listingError } = await client
          .from("listings")
          .select("*, category_info:business_categories(name,slug)")
          .eq(isUuid(listingRef) ? "id" : "public_id", listingRef)
          .maybeSingle();

        if (listingError) throw listingError;
        if (!item) throw new Error("Listing not found");

        if (!isMounted) return;
        setListing(item);
        setHeroSrc(
          primaryPhotoUrl(item.photo_url) || getListingCategoryPlaceholder(item)
        );

        const { data: biz } = await client
          .from("businesses")
          .select(
            "id,owner_user_id,public_id,business_name,business_type,category,city,address,website,phone,profile_photo_url,verification_status"
          )
          .eq("owner_user_id", item.business_id)
          .maybeSingle();

        if (!biz) {
          throw new Error("Business not found");
        }

        if (isMounted) {
          setBusiness({
            ...biz,
            id: biz.owner_user_id,
            full_name: null,
          });
        }
      } catch (err) {
        console.error("Failed to load listing", err);
        if (isMounted) setError("We couldn’t load this item. Try again.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [supabase, listingRef, user?.id]);

  useEffect(() => {
    let active = true;
    const accountId = user?.id || null;
    if (!accountId || !listing?.id) return () => {};
    const checkSaved = async () => {
      const client = supabase ?? getSupabaseBrowserClient();
      if (!client) return;
      const { data } = await client
        .from("saved_listings")
        .select("id")
        .eq("user_id", accountId)
        .eq("listing_id", listing.id)
        .maybeSingle();
      if (!active) return;
      setIsSaved(!!data);
    };
    checkSaved();
    return () => {
      active = false;
    };
  }, [supabase, user?.id, listing?.id]);

  const handleToggleSave = async () => {
    if (!listing?.id) return;
    if (!requireAuth("save listings", setStatusMessage)) return;
    setSaveLoading(true);
    setStatusMessage("");
    try {
      const { client, userId } = await getAuthedContext("toggleSaveListing");
      if (isSaved) {
        await client
          .from("saved_listings")
          .delete()
          .eq("user_id", userId)
          .eq("listing_id", listing.id);
        setIsSaved(false);
        setStatusMessage("Removed from saved.");
      } else {
        await client
          .from("saved_listings")
          .insert({ user_id: userId, listing_id: listing.id });
        setIsSaved(true);
        setStatusMessage("Saved to your list.");
      }
    } catch (err) {
      console.error("Save toggle failed", err);
      setStatusMessage(err?.message || "Could not update saved state.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleMessageBusiness = async () => {
    const businessId = business?.id;

    if (!businessId) {
      setMessageStatus("Business info unavailable.");
      return;
    }
    if (!requireAuth("message businesses", setMessageStatus)) return;

    setMessageLoading(true);
    setMessageStatus("");

    try {
      const { client, userId, session } = await getAuthedContext(
        "getOrCreateConversation"
      );
      const conversationId = await getOrCreateConversation({
        supabase: client,
        businessId,
        session,
      });
      if (conversationId) {
        router.push(`/customer/messages/${conversationId}`);
      } else {
        setMessageStatus("Could not open messages yet.");
      }
    } catch (err) {
      const message =
        err?.message ||
        err?.details ||
        "Could not open messages yet.";
      console.error("Failed to start conversation", err);
      setMessageStatus(message);
    } finally {
      setMessageLoading(false);
    }
  };

  const formattedPrice = useMemo(() => {
    if (!listing?.price) return null;
    try {
      return Number(listing.price).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      return listing.price;
    }
  }, [listing?.price]);

  useEffect(() => {
    if (!cartToast) return undefined;
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setCartToast(null);
    }, 6000);
    return () => clearTimeout(toastTimerRef.current);
  }, [cartToast]);

  useEffect(() => {
    if (!reportToast) return undefined;
    const timeoutId = setTimeout(() => setReportToast(null), 5000);
    return () => clearTimeout(timeoutId);
  }, [reportToast]);

  useEffect(() => {
    if (!listingMenuOpen) return undefined;
    const handleOutsideClick = (event) => {
      if (!listingMenuRef.current) return;
      if (!listingMenuRef.current.contains(event.target)) {
        setListingMenuOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setListingMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [listingMenuOpen]);

  const handleAddToCart = async () => {
    if (!listing?.id) return;
    if (
      accountContext.purchaseRestricted
    ) {
      setStatusMessage(getPurchaseRestrictionMessage());
      return;
    }
    if (accountContext.rolePending) {
      setStatusMessage("We’re still confirming your account. Try again.");
      return;
    }
    if (!requireAuth("place orders", setStatusMessage)) return;
    setStatusMessage("");

    const result = await addItem({
      listingId: listing.id,
      quantity,
    });

    if (result?.error) {
      setStatusMessage(result.error);
      return;
    }

    setStatusMessage("Added to cart.");
    setCartToast({
      message: "Added to cart",
      actions: [
        { label: "View cart", onClick: () => router.push("/cart") },
        {
          label: "Checkout",
          onClick: () =>
            router.push(
              listing.business_id
                ? `/checkout?business_id=${encodeURIComponent(listing.business_id)}`
                : "/checkout"
            ),
        },
      ],
    });
  };

  const handleShareListing = async () => {
    if (!listing?.id) return;
    const url =
      typeof window !== "undefined" ? window.location.href : getListingUrl(listing);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: listing.title || "Listing",
          text: descriptionSnippet(listing.description || "", 160),
          url,
        });
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setStatusMessage("Listing link copied.");
      } else {
        setStatusMessage("Share is unavailable on this device.");
      }
    } catch {
      setStatusMessage("Could not share listing.");
    } finally {
      setListingMenuOpen(false);
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen px-4 md:px-8 lg:px-12 py-12"
        style={{ background: "var(--background)", color: "var(--text)" }}
      >
        <div className="max-w-6xl mx-auto animate-pulse space-y-6">
          <div className="h-4 w-32 rounded-full" style={{ background: "var(--surface)" }} />
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-[460px] rounded-2xl" style={{ background: "var(--surface)" }} />
            <div className="h-[460px] rounded-2xl" style={{ background: "var(--surface)" }} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="min-h-screen px-4 md:px-8 lg:px-12 py-12"
        style={{ background: "var(--background)", color: "var(--text)" }}
      >
        <div className="max-w-3xl mx-auto">
          <Link
            href="/customer/home"
            className="inline-flex items-center gap-2 text-sm opacity-80 hover:opacity-100"
          >
            <ArrowLeft className="h-4 w-4" /> Back to results
          </Link>
          <div
            className="mt-6 rounded-2xl p-6 shadow-sm"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <p className="text-lg font-semibold">Something went wrong</p>
            <p className="text-sm opacity-80 mt-2">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!listing) return null;

  const storeName = business?.business_name || business?.full_name || "Local business";
  const city = business?.city || "Your area";
  const address = business?.address || null;
  const listingCategory = getListingCategoryLabel(listing, "Local listing");
  const businessType = getBusinessTypeLabel(business, "Local business");
  const showMessage = !accountContext.isBusiness;
  const purchaseRestricted = accountContext.purchaseRestricted;
  const purchaseEligibilityPending = accountContext.rolePending;
  const galleryPhotos = extractPhotoUrls(listing.photo_url);
  const inventory = normalizeInventory(listing);
  const badgeStyle = getAvailabilityBadgeStyle(inventory.availability, isLight);
  const isOutOfStock = inventory.availability === "out";
  const isCustomerListingRoute = pathname?.startsWith("/customer/listings");
  const businessProfileHref = business?.id ? getCustomerBusinessUrl(business) : null;
  const isBusinessVerified = ["auto_verified", "manually_verified"].includes(
    String(business?.verification_status || "").trim().toLowerCase()
  );

  return (
    <>
      <div
        className={`px-4 md:px-8 lg:px-12 ${
          isCustomerListingRoute
            ? "pt-0 pb-2 md:pt-0 -mt-24 md:-mt-16"
            : "pt-4 pb-3 md:pt-3 md:pb-2"
        }`}
        style={{
          background: "var(--background)",
          color: "var(--text)",
          borderBottom: "1px solid rgba(15,23,42,0.05)",
        }}
      >
        <div className="max-w-6xl mx-auto space-y-4">
        <div
          className={`flex flex-wrap items-center justify-between gap-3 opacity-80 mb-2 ${
            isCustomerListingRoute ? "mt-10 md:mt-12" : "mt-2"
          }`}
        >
          <Link
            href="/customer/home"
            className="inline-flex items-center gap-2 text-sm hover:opacity-100"
          >
            <ArrowLeft className="h-4 w-4" /> Back to discovery
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div
              className="relative overflow-hidden rounded-3xl shadow-[0_18px_40px_-32px_rgba(15,23,42,0.22)]"
              style={{ background: "var(--surface)", border: "1px solid rgba(15,23,42,0.08)" }}
            >
              {galleryPhotos.length > 1 ? (
                <div className="absolute left-4 top-4 z-10 flex flex-col gap-2 rounded-[20px] border p-2 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.18)]">
                  {galleryPhotos.map((photo, idx) => {
                    const active = heroSrc === photo;
                    return (
                      <button
                        key={`${photo}-${idx}`}
                        type="button"
                        onClick={() => setHeroSrc(photo)}
                        className={`flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-[16px] border p-1.5 transition duration-200 ${
                          active
                            ? "shadow-sm"
                            : "hover:-translate-y-0.5 hover:shadow-sm"
                        }`}
                        style={{
                          background: "#ffffff",
                          borderColor: active
                            ? "rgba(110,52,255,0.3)"
                            : "rgba(15,23,42,0.08)",
                          boxShadow: active
                            ? "0 0 0 2px rgba(110,52,255,0.14)"
                            : undefined,
                        }}
                        aria-label={`View photo ${idx + 1}`}
                      >
                        <SafeImage
                          src={photo}
                          alt={`Listing photo ${idx + 1}`}
                          className="object-contain"
                          width={64}
                          height={64}
                          sizes="64px"
                          useNextImage
                          fallbackSrc={getListingCategoryPlaceholder(listing)}
                        />
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div
                className="relative flex h-[420px] w-full items-center justify-center overflow-hidden p-5"
                style={{ background: "#ffffff" }}
              >
                <div
                  className="pointer-events-none absolute inset-4 rounded-[28px]"
                  style={{
                    boxShadow:
                      "inset 0 0 0 1px rgba(15,23,42,0.05), inset 0 -18px 32px -32px rgba(15,23,42,0.12)",
                  }}
                />
                <SafeImage
                  src={heroSrc || getListingCategoryPlaceholder(listing)}
                  alt={listing.title}
                  className="object-contain"
                  fill
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  useNextImage
                  loading="lazy"
                  onError={() => {
                    const fallback = getListingCategoryPlaceholder(listing);
                    if (heroSrc !== fallback) {
                      setHeroSrc(fallback);
                    }
                  }}
                  style={{ objectPosition: "center center" }}
                  referrerPolicy="no-referrer"
                  fallbackSrc={getListingCategoryPlaceholder(listing)}
                />
                <div className="pointer-events-none absolute inset-0 ring-1 ring-black/[0.04]" />
              </div>
              <div className="space-y-0 p-5 md:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-72">
                    <Shield className="h-3.5 w-3.5 opacity-80" />
                    {listingCategory}
                  </span>
                  <span
                    className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                    style={
                      badgeStyle
                        ? {
                            color: badgeStyle.color,
                            borderColor: badgeStyle.border,
                            background: badgeStyle.background,
                          }
                        : undefined
                    }
                  >
                    {inventory.label}
                  </span>
                </div>
                <div className="mt-4 space-y-2.5">
                  <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em] md:text-[2rem]">
                    {listing.title}
                  </h1>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-sm opacity-80">
                    <span>{city}</span>
                    {address ? (
                      <>
                        <span className="h-1 w-1 rounded-full bg-slate-300" />
                        <span className="truncate max-w-full">{address}</span>
                      </>
                    ) : null}
                    {businessType ? (
                      <>
                        <span className="h-1 w-1 rounded-full bg-slate-300" />
                        <span>{businessType}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="mt-5 border-t pt-4" style={{ borderColor: "rgba(15,23,42,0.08)" }}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[18px]"
                        style={{ background: "var(--surface)", border: "1px solid rgba(15,23,42,0.08)" }}
                      >
                        <SafeImage
                          src={business?.profile_photo_url || getBusinessTypePlaceholder(business)}
                          alt={storeName}
                          fill
                          className="object-cover"
                          sizes="48px"
                          useNextImage
                          fallbackSrc={getBusinessTypePlaceholder(business)}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-sm font-semibold md:text-[15px]">{storeName}</p>
                          {isBusinessVerified ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-[rgba(111,52,255,0.88)]">
                              <BadgeCheck className="h-3.5 w-3.5" />
                              Verified
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-75">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {city}
                          </span>
                          {businessType ? <span>{businessType}</span> : null}
                          {business?.website ? (
                            <Link
                              href={business.website}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-4 hover:opacity-100"
                            >
                              {business.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {showMessage ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1 sm:justify-end">
                        {businessProfileHref ? (
                          <Link
                            href={businessProfileHref}
                            onClick={(event) => {
                              if (!gateBusinessProfileAccess(event, businessProfileHref)) {
                                return;
                              }
                            }}
                            className="inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-sm font-medium transition hover:bg-black/[0.03]"
                            style={{ borderColor: "rgba(15,23,42,0.08)" }}
                          >
                            View business profile
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          onClick={handleMessageBusiness}
                          disabled={messageLoading}
                          className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium transition ${
                            messageLoading ? "opacity-70" : "hover:opacity-90"
                          }`}
                          style={{
                            color: "var(--yb-focus)",
                          }}
                        >
                          {messageLoading ? "Opening messages..." : "Message business"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {messageStatus ? (
                    <div
                      className="mt-3 rounded-xl px-3 py-2 text-xs"
                      style={{ background: "rgba(111,52,255,0.05)", border: "1px solid rgba(111,52,255,0.1)" }}
                    >
                      {messageStatus}
                    </div>
                  ) : null}
                </div>
                <ListingDescription
                  htmlOrText={listing.description}
                  fallback="A local item from YourBarrio businesses."
                  className="mt-5 text-[15px]"
                />
              </div>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div
              className="rounded-3xl p-5 shadow-[0_22px_44px_-30px_rgba(15,23,42,0.24)]"
              style={{ background: "var(--surface)", border: "1px solid rgba(15,23,42,0.08)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-65">
                    Ready to order
                  </p>
                  <div className="text-[2rem] font-semibold leading-none tracking-[-0.03em]">
                    {formattedPrice ? `$${formattedPrice}` : "Contact store"}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                      style={
                        badgeStyle
                          ? {
                              color: badgeStyle.color,
                              borderColor: badgeStyle.border,
                              background: badgeStyle.background,
                            }
                          : undefined
                      }
                    >
                      {inventory.label}
                    </span>
                    <span className="opacity-75">Sold by {storeName}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleToggleSave}
                    className="rounded-full p-2 transition hover:bg-black/[0.04]"
                    aria-pressed={isSaved}
                    aria-label={isSaved ? "Unsave listing" : "Save listing"}
                    disabled={saveLoading}
                  >
                    <Heart
                      className={`h-5 w-5 ${isSaved ? "text-rose-400" : "opacity-70"}`}
                      fill={isSaved ? "currentColor" : "none"}
                    />
                  </button>
                  <div className="relative" ref={listingMenuRef}>
                    <button
                      type="button"
                      onClick={() => setListingMenuOpen((open) => !open)}
                      className="rounded-full p-2 transition hover:bg-black/[0.04]"
                      aria-expanded={listingMenuOpen}
                      aria-label="Open listing actions menu"
                    >
                      <MoreHorizontal className="h-5 w-5 opacity-80" />
                    </button>
                    {listingMenuOpen ? (
                      <div className="absolute right-0 top-11 z-30 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                        <button
                          type="button"
                          onClick={handleShareListing}
                          className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-100"
                        >
                          Share
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await handleToggleSave();
                            setListingMenuOpen(false);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-100"
                        >
                          {isSaved ? "Unsave" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setListingMenuOpen(false);
                            setReportModalOpen(true);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-100"
                        >
                          Report
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

                <div className="mt-6 space-y-4 border-t pt-4" style={{ borderColor: "rgba(15,23,42,0.08)" }}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(111,52,255,0.08)] text-[var(--yb-focus)]">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Delivery available</p>
                    <p className="text-xs opacity-75">Delivered within the business service area.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(111,52,255,0.08)] text-[var(--yb-focus)]">
                    <ShoppingBag className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Pickup available</p>
                    <p className="text-xs opacity-75">Choose in-store pickup at checkout.</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
                    Quantity
                  </label>
                  {!isOutOfStock ? (
                    <span className="text-xs opacity-70">Choose delivery or pickup at checkout</span>
                  ) : null}
                </div>
                <select
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  disabled={isOutOfStock || purchaseRestricted || purchaseEligibilityPending}
                  className="w-full rounded-xl px-3 py-3 text-base font-semibold md:text-sm"
                  style={{ background: "var(--surface)", border: "1px solid rgba(15,23,42,0.08)", color: "var(--text)" }}
                >
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {idx + 1}
                    </option>
                  ))}
                </select>

                {purchaseEligibilityPending ? (
                  <div
                    className="mt-4 rounded-2xl border px-4 py-3"
                    style={{ background: "var(--overlay)", borderColor: "var(--border)" }}
                  >
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-xl px-3 py-3 text-sm font-semibold opacity-70"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      Checking account...
                    </button>
                    <p className="mt-2 text-xs opacity-80">
                      We’re confirming your account before enabling checkout.
                    </p>
                  </div>
                ) : purchaseRestricted ? (
                  <div
                    className="mt-4 rounded-2xl border px-4 py-3"
                    style={{ background: "var(--overlay)", borderColor: "var(--border)" }}
                  >
                    <button
                      type="button"
                      disabled
                      className="w-full rounded-xl px-3 py-3 text-sm font-semibold opacity-70"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      Customer accounts only
                    </button>
                    <p className="mt-2 text-xs opacity-80">
                      {getPurchaseRestrictionHelpText()}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={isOutOfStock}
                    className="yb-auth-cta mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(111,52,255,0.24)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      background: isOutOfStock ? "rgba(15,23,42,0.12)" : "var(--yb-focus)",
                      color: isOutOfStock ? "rgba(15,23,42,0.46)" : "#ffffff",
                      boxShadow: isOutOfStock
                        ? "none"
                        : "0 12px 24px -20px rgba(110,52,255,0.38)",
                    }}
                  >
                    Add to cart
                  </button>
                )}

                {isOutOfStock ? (
                  <div className="mt-4 text-xs opacity-75">
                    This item is currently out of stock
                  </div>
                ) : statusMessage ? (
                  <div
                    className="mt-4 text-xs rounded-xl px-3 py-2"
                    style={{ background: "var(--overlay)", border: "1px solid rgba(15,23,42,0.08)" }}
                  >
                    {statusMessage}
                  </div>
                ) : purchaseEligibilityPending ? (
                  <div className="mt-4 text-xs opacity-80">
                    We’re confirming your account before enabling checkout.
                  </div>
                ) : purchaseRestricted ? (
                  <div className="mt-4 text-xs opacity-80">
                    Browse listings with your business account, but switch to a customer account to place orders.
                  </div>
                ) : (
                  <div className="mt-4 text-xs leading-5 opacity-75">
                    Choose delivery or pickup at checkout. Charges apply after business confirms.
                  </div>
                )}

                <div className="mt-6 border-t pt-4" style={{ borderColor: "rgba(15,23,42,0.08)" }}>
                  <div className="flex items-center gap-2 text-[13px] font-semibold">
                    <Shield className="h-4 w-4 text-[var(--yb-focus)] opacity-80" />
                    <p>What to expect</p>
                  </div>
                  <ul className="mt-2.5 space-y-2 text-[13px] leading-6 opacity-70">
                    <li>Message the business to confirm any final details.</li>
                    <li>Delivery windows are shared after the order is confirmed.</li>
                    <li>Pickup instructions are sent directly by the business.</li>
                  </ul>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
    {cartToast ? (
      <div className="fixed bottom-6 right-6 z-50">
        <div
          className="rounded-2xl border px-4 py-3 shadow-xl"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <p className="text-sm font-semibold">{cartToast.message}</p>
          <div className="mt-3 flex items-center gap-2">
            {cartToast.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  action.onClick();
                  setCartToast(null);
                }}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: "var(--border)" }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    ) : null}
    <ReportModal
      open={reportModalOpen}
      onClose={() => setReportModalOpen(false)}
      targetType="listing"
      targetId={listing?.id}
      targetLabel={listing?.title || "Listing"}
      meta={{
        listing_id: listing?.id || null,
        business_id: listing?.business_id || null,
      }}
      onSubmitted={(payload) => {
        setReportToast(payload?.message || "Thanks - your report has been received.");
      }}
    />
      {reportToast ? (
        <div className="fixed bottom-6 left-6 z-50">
          <div className="rounded-2xl border border-gray-300 bg-white px-4 py-3 shadow-xl text-sm font-medium text-gray-900">
            {reportToast}
          </div>
        </div>
      ) : null}
    </>
  );
}
