"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Heart,
  MapPin,
  Minus,
  MoreHorizontal,
  Plus,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import useBusinessProfileAccessGate from "@/components/auth/useBusinessProfileAccessGate";
import { useCurrentAccountContext } from "@/lib/auth/useCurrentAccountContext";
import { resolveListingMedia } from "@/lib/resolveListingMedia";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getAuthedContext } from "@/lib/auth/getAuthedContext";
import { useParams, usePathname, useRouter } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import { getOrCreateConversation } from "@/lib/messages";
import {
  getMaxPurchasableQuantity,
  normalizeInventory,
} from "@/lib/inventory";
import {
  clampListingQuantitySelection,
  getCartItemIdsForListingSelection,
  getListingAvailabilityKey,
  getListingAvailabilityMessage,
  getQuantityInCartForListingSelection,
  resolveListingQuantityState,
} from "@/lib/cart/listingAvailability";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { useCart } from "@/components/cart/CartProvider";
import { useModal } from "@/components/modals/ModalProvider";
import ReportModal from "@/components/moderation/ReportModal";
import ListingDescription from "@/components/listings/ListingDescription";
import ListingOptionSelectors from "@/components/listings/ListingOptionSelectors";
import { isUuid } from "@/lib/ids/isUuid";
import { setAuthIntent } from "@/lib/auth/authIntent";
import {
  getPurchaseRestrictionHelpText,
  getPurchaseRestrictionMessage,
} from "@/lib/auth/purchaseAccess";
import { descriptionSnippet } from "@/lib/listingDescription";
import {
  DELIVERY_FULFILLMENT_TYPE,
  deriveFulfillmentSummary,
  formatCents,
  PICKUP_FULFILLMENT_TYPE,
} from "@/lib/fulfillment";
import { getPickupAvailabilityLabel } from "@/lib/pickupAvailability";
import {
  buildVariantLabel,
  getListingVariants,
  getMatchingVariant,
  getVariantInventoryListing,
} from "@/lib/listingOptions";
import { formatEntityId } from "@/lib/entityIds";
import { calculateListingPricing } from "@/lib/pricing";
import { getCustomerBusinessUrl, getListingUrl } from "@/lib/ids/publicRefs";
import { getSelectedPhotoUrl } from "@/lib/listingPhotos";
import {
  getBusinessTypeLabel,
  getListingCategoryLabel,
} from "@/lib/taxonomy/compat";
import {
  getBusinessTypePlaceholder,
  getListingCategoryPlaceholder,
} from "@/lib/taxonomy/placeholders";
import {
  getSeededListingBadgeLabel,
  isSeededListing,
  SEEDED_LISTING_PREVIEW_MESSAGE,
} from "@/lib/seededListings";
import { cn } from "@/lib/utils/cx";

const PENDING_AUTH_ACTION_STORAGE_KEY = "yb:pendingAuthAction";

function writePendingAuthAction(intent) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_AUTH_ACTION_STORAGE_KEY, JSON.stringify(intent));
  } catch {}
}

function getInitialHeroSrc(listing) {
  const resolvedMedia = resolveListingMedia(listing);
  return resolvedMedia.coverImageUrl || getListingCategoryPlaceholder(listing);
}

function getGalleryRenderSrc(image, fallbackSrc) {
  if (!image || typeof image !== "object") return fallbackSrc || null;

  const selectedVariantUrl = getSelectedPhotoUrl(image);
  if (typeof selectedVariantUrl === "string" && selectedVariantUrl.trim()) {
    return selectedVariantUrl.trim();
  }

  const candidates = [
    image.original?.url,
    image.original?.publicUrl,
    image.original?.public_url,
    image.enhanced?.url,
    image.enhanced?.publicUrl,
    image.enhanced?.public_url,
    image.publicUrl,
    image.public_url,
    image.image_url,
    image.storage_path,
    image.url,
  ];

  const resolved = candidates.find((value) => typeof value === "string" && value.trim());
  return resolved ? resolved.trim() : fallbackSrc || null;
}

export default function ListingDetailsClient({
  params,
  backHref = "/",
  backLabel = "Back to discovery",
  renderedAt = null,
  initialListing = null,
  initialBusiness = null,
  initialListingOptions = null,
  initialIsSaved = false,
  previewBanner = null,
}) {
  const { supabase, user } = useAuth();
  const accountContext = useCurrentAccountContext();
  const gateBusinessProfileAccess = useBusinessProfileAccessGate();
  const router = useRouter();
  const { addItem, items, setFulfillmentType: updateCartFulfillmentType } = useCart();
  const { openModal } = useModal();
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

  const [listing, setListing] = useState(initialListing);
  const [business, setBusiness] = useState(initialBusiness);
  const [loading, setLoading] = useState(!initialListing);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [fulfillmentType, setFulfillmentType] = useState("pickup");
  const [statusMessage, setStatusMessage] = useState("");
  const [cartActionLoading, setCartActionLoading] = useState(false);
  const [messageStatus, setMessageStatus] = useState("");
  const [messageLoading, setMessageLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(Boolean(initialIsSaved));
  const [saveLoading, setSaveLoading] = useState(false);
  const [heroSrc, setHeroSrc] = useState(() => getInitialHeroSrc(initialListing));
  const [cartToast, setCartToast] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportToast, setReportToast] = useState(null);
  const [listingMenuOpen, setListingMenuOpen] = useState(false);
  const [listingOptions, setListingOptions] = useState(initialListingOptions);
  const [selectedVariantOptions, setSelectedVariantOptions] = useState({});
  const [serverAvailableQuantityBySelection, setServerAvailableQuantityBySelection] = useState({});
  const [previewCloseHelp, setPreviewCloseHelp] = useState("");
  const seededListing = isSeededListing(listing, { business });
  const toastTimerRef = useRef(null);
  const listingMenuRef = useRef(null);
  const getCurrentPath = useCallback(() => {
    if (typeof window !== "undefined") {
      return `${window.location.pathname}${window.location.search}`;
    }
    return pathname || "/";
  }, [pathname]);
  const requireAuth = useCallback(
    (actionName, setMessage, intent = null) => {
      if (user?.id) return true;
      const message = actionName
        ? `Log in to ${actionName}.`
        : "Please log in to continue.";
      if (typeof setMessage === "function") {
        setMessage(message);
      }
      const currentPath = getCurrentPath();
      setAuthIntent({ redirectTo: currentPath, role: "customer" });
      if (intent) {
        writePendingAuthAction({
          ...intent,
          pathname: currentPath,
        });
      }
      openModal("customer-login", { next: currentPath });
      return false;
    },
    [getCurrentPath, openModal, user?.id]
  );

  useEffect(() => {
    let isMounted = true;
    const accountId = user?.id || null;
    const shouldUseServer = Boolean(accountId);

    async function load() {
      if (initialListing) {
        setLoading(false);
        return;
      }
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
          setListingOptions(payload?.listingOptions || null);
          return;
        }

        const client = supabase ?? getSupabaseBrowserClient();
        if (!client) {
          setError("We couldn’t connect. Try again.");
          setLoading(false);
          return;
        }

        const { data: item, error: listingError } = await client
          .from("public_listings_v")
          .select("*")
          .eq(isUuid(listingRef) ? "id" : "public_id", listingRef)
          .maybeSingle();

        if (listingError) throw listingError;
        if (!item) throw new Error("Listing not found");

        if (!isMounted) return;
        setListing(item);
        setListingOptions(await getListingVariants(client, item.id));

        const { data: biz } = await client
          .from("businesses")
          .select(
            "id,owner_user_id,public_id,business_name,business_type,category,city,address,website,phone,profile_photo_url,verification_status,pickup_enabled_default,local_delivery_enabled_default,default_delivery_fee_cents,delivery_radius_miles,delivery_min_order_cents,delivery_notes,hours_json"
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
  }, [initialListing, supabase, listingRef, user?.id]);

  useEffect(() => {
    let active = true;
    const accountId = user?.id || null;
    if (!accountId || !listing?.id || accountContext.isBusiness || accountContext.rolePending) {
      setIsSaved(false);
      return () => {};
    }
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
  }, [accountContext.isBusiness, accountContext.rolePending, supabase, user?.id, listing?.id]);

  const resolvedMedia = useMemo(() => resolveListingMedia(listing), [listing]);

  useEffect(() => {
    const nextHero = resolvedMedia.coverImageUrl || getListingCategoryPlaceholder(listing);
    if (!nextHero) return;
    setHeroSrc((current) => {
      if (resolvedMedia.images.some((image) => image?.url === current)) {
        return current;
      }
      return nextHero;
    });
  }, [listing, resolvedMedia]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!previewBanner) return;
    console.info("[LISTING_PREVIEW_MEDIA_DEBUG]", {
      stage: "client_before_render",
      listingId: listing?.id || null,
      resolvedImagesLength: resolvedMedia.images.length,
      resolvedFirstImageUrl: resolvedMedia.images[0]?.url || null,
    });
  }, [listing?.id, previewBanner, resolvedMedia]);

  const handleToggleSave = async () => {
    if (!listing?.id) return;
    if (accountContext.isBusiness || accountContext.rolePending) return;
    if (
      !requireAuth("save listings", setStatusMessage, {
        type: "save_item",
        listingId: listing.id,
        businessId: listing.business_id || null,
      })
    ) {
      return;
    }
    setSaveLoading(true);
    setStatusMessage("");
    try {
      const response = await fetch("/api/customer/saved-listings", {
        method: isSaved ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ listingId: listing.id }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Could not update saved state.");
      }
      setIsSaved(!isSaved);
      setStatusMessage(isSaved ? "Removed from saved." : "Saved to your list.");
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
    if (
      !requireAuth("message businesses", setMessageStatus, {
        type: "message_business",
        listingId: listing?.id || null,
        businessId,
      })
    ) {
      return;
    }

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

  const activeVariants = useMemo(
    () =>
      (Array.isArray(listingOptions?.variants) ? listingOptions.variants : []).filter(
        (variant) => variant?.is_active !== false
      ),
    [listingOptions?.variants]
  );
  const hasVariantOptions = Boolean(listingOptions?.hasOptions && activeVariants.length > 0);
  const selectedVariant = useMemo(
    () =>
      hasVariantOptions
        ? getMatchingVariant(activeVariants, selectedVariantOptions)
        : null,
    [activeVariants, hasVariantOptions, selectedVariantOptions]
  );
  const purchasableListing = useMemo(
    () =>
      hasVariantOptions && selectedVariant
        ? getVariantInventoryListing(listing, selectedVariant)
        : listing,
    [hasVariantOptions, listing, selectedVariant]
  );
  const fulfillmentSummary = useMemo(
    () =>
      deriveFulfillmentSummary({
        listings: purchasableListing ? [purchasableListing] : [],
        business,
        subtotalCents:
          Math.round(
            Number(
              selectedVariant?.price !== null && selectedVariant?.price !== undefined
                ? selectedVariant.price
                : listing?.price || 0
            ) * 100
          ) * quantity,
        currentFulfillmentType: fulfillmentType,
      }),
    [business, fulfillmentType, listing, purchasableListing, quantity, selectedVariant?.price]
  );
  const maxPurchasableQuantity = useMemo(
    () =>
      hasVariantOptions
        ? selectedVariant
          ? getMaxPurchasableQuantity(purchasableListing)
          : 0
        : getMaxPurchasableQuantity(listing),
    [hasVariantOptions, listing, purchasableListing, selectedVariant]
  );
  const selectedAvailabilityKey = useMemo(
    () => getListingAvailabilityKey(selectedVariant?.id || null),
    [selectedVariant?.id]
  );
  const cartSelectionIncludesAllVariants = hasVariantOptions && !selectedVariant?.id;
  const quantityInCart = useMemo(
    () =>
      getQuantityInCartForListingSelection({
        cartItems: items,
        listingId: listing?.id,
        variantId: selectedVariant?.id || null,
        includeAllVariants: cartSelectionIncludesAllVariants,
      }),
    [
      cartSelectionIncludesAllVariants,
      items,
      listing?.id,
      selectedVariant?.id,
    ]
  );
  const excludedCartItemIds = useMemo(
    () =>
      getCartItemIdsForListingSelection({
        cartItems: items,
        listingId: listing?.id,
        variantId: selectedVariant?.id || null,
        includeAllVariants: cartSelectionIncludesAllVariants,
      }),
    [
      cartSelectionIncludesAllVariants,
      items,
      listing?.id,
      selectedVariant?.id,
    ]
  );
  const serverAvailableQuantity = serverAvailableQuantityBySelection[selectedAvailabilityKey] ?? null;
  const quantitySelectionState = useMemo(
    () =>
      resolveListingQuantityState({
        inventoryMaxQuantity: maxPurchasableQuantity,
        selectedQuantity: quantity,
        serverAvailableQuantity,
        quantityInCart,
      }),
    [maxPurchasableQuantity, quantity, quantityInCart, serverAvailableQuantity]
  );
  const selectableQuantityCap = quantitySelectionState.selectableQuantityCap;
  const availabilityStatusMessage = useMemo(
    () =>
      getListingAvailabilityMessage({
        inventoryMaxQuantity: maxPurchasableQuantity,
        serverAvailableQuantity,
        quantityInCart,
      }),
    [maxPurchasableQuantity, quantityInCart, serverAvailableQuantity]
  );
  const pickupAvailabilityLabel = useMemo(
    () =>
      getPickupAvailabilityLabel({
        pickupAvailable: fulfillmentSummary.pickupAvailable,
        hours: business?.hours_json,
        timeZone: business?.timezone || listing?.timezone || null,
        now: renderedAt || undefined,
      }),
    [
      business?.hours_json,
      business?.timezone,
      fulfillmentSummary.pickupAvailable,
      listing?.timezone,
      renderedAt,
    ]
  );
  const formattedPrice = useMemo(() => {
    const priceSource =
      selectedVariant?.price !== null && selectedVariant?.price !== undefined
        ? selectedVariant.price
        : listing?.price;
    if (!priceSource) return null;
    const finalPriceCents =
      selectedVariant?.price !== null && selectedVariant?.price !== undefined
        ? Math.round(Number(selectedVariant.price || 0) * 100)
        : Number(listing?.finalPriceCents);
    if (Number.isFinite(finalPriceCents) && finalPriceCents > 0) {
      return (finalPriceCents / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    try {
      return (calculateListingPricing(priceSource).finalPriceCents / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      return priceSource;
    }
  }, [listing?.finalPriceCents, listing?.price, selectedVariant?.price]);

  useEffect(() => {
    if (!listing?.id || seededListing) return undefined;

    const controller = new AbortController();
    const query = new URLSearchParams({ listing_id: String(listing.id) });
    if (selectedVariant?.id) {
      query.set("variant_id", String(selectedVariant.id));
    }
    for (const cartItemId of excludedCartItemIds) {
      query.append("exclude_cart_item_id", cartItemId);
    }

    (async () => {
      try {
        const response = await fetch(`/api/cart/availability?${query.toString()}`, {
          method: "GET",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load availability.");
        }

        setServerAvailableQuantityBySelection((current) => ({
          ...current,
          [selectedAvailabilityKey]: Math.max(
            0,
            Number(payload?.available_quantity ?? payload?.availableQuantity ?? 0)
          ),
        }));
      } catch (err) {
        if (err?.name === "AbortError") return;
        setServerAvailableQuantityBySelection((current) => ({
          ...current,
          [selectedAvailabilityKey]: null,
        }));
      }
    })();

    return () => controller.abort();
  }, [
    excludedCartItemIds,
    hasVariantOptions,
    listing?.id,
    seededListing,
    selectedAvailabilityKey,
    selectedVariant?.id,
  ]);

  useEffect(() => {
    if (!listing) return;
    setQuantity((current) => clampListingQuantitySelection(current, selectableQuantityCap));
  }, [listing, selectableQuantityCap]);

  useEffect(() => {
    setServerAvailableQuantityBySelection({});
  }, [listing?.id]);

  useEffect(() => {
    setSelectedVariantOptions({});
  }, [listing?.id]);

  useEffect(() => {
    if (!hasVariantOptions) {
      setSelectedVariantOptions({});
    }
  }, [hasVariantOptions, listing?.id]);

  useEffect(() => {
    if (
      fulfillmentSummary.selectedFulfillmentType &&
      fulfillmentSummary.selectedFulfillmentType !== fulfillmentType
    ) {
      setFulfillmentType(fulfillmentSummary.selectedFulfillmentType);
    }
  }, [fulfillmentSummary.selectedFulfillmentType, fulfillmentType]);

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

  const executeAddToCart = useCallback(
    async ({ listingId, selectedQuantity, selectedFulfillmentType, businessId }) => {
      if (!listingId) return;
      if (isSeededListing(purchasableListing, { business })) {
        setStatusMessage(SEEDED_LISTING_PREVIEW_MESSAGE);
        return;
      }
      setCartActionLoading(true);
      setStatusMessage("");
      try {
        const result = await addItem({
          listingId,
          quantity: selectedQuantity,
          fulfillmentType: selectedFulfillmentType,
          listing: listing
            ? {
                ...purchasableListing,
                price:
                  selectedVariant?.price !== null && selectedVariant?.price !== undefined
                    ? selectedVariant.price
                    : listing.price,
                available_fulfillment_methods: fulfillmentSummary.availableMethods,
              }
            : null,
          business,
          variantId: selectedVariant?.id || null,
          variantLabel: selectedVariant ? buildVariantLabel(selectedVariant.options) : null,
          selectedOptions: selectedVariant?.options || null,
        });

        if (result?.error) {
          if (result?.code === "insufficient_inventory" && result?.maxQuantity != null) {
            const nextAvailableQuantity = Math.max(0, Number(result.maxQuantity || 0));
            setServerAvailableQuantityBySelection((current) => ({
              ...current,
              [selectedAvailabilityKey]: nextAvailableQuantity,
            }));
            setQuantity((current) =>
              clampListingQuantitySelection(current, nextAvailableQuantity)
            );
            setStatusMessage(
              nextAvailableQuantity <= 0 ? "Currently unavailable." : result.error
            );
            return;
          }
          setStatusMessage(result.error);
          return;
        }

        const fulfillmentResult = await updateCartFulfillmentType(selectedFulfillmentType, {
          cartId: result?.cart?.id || null,
          businessId: businessId || null,
        });

        if (fulfillmentResult?.error) {
          setStatusMessage(fulfillmentResult.error);
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
                  businessId
                    ? `/checkout?business_id=${encodeURIComponent(businessId)}`
                    : "/checkout"
                ),
            },
          ],
        });
      } catch (err) {
        setStatusMessage(err?.message || "Failed to add this item to your cart.");
      } finally {
        setCartActionLoading(false);
      }
    },
    [
      addItem,
      business,
      fulfillmentSummary.availableMethods,
      listing,
      purchasableListing,
      router,
      selectedAvailabilityKey,
      selectedVariant,
      updateCartFulfillmentType,
    ]
  );

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
    if (hasVariantOptions && !selectedVariant?.id) {
      setStatusMessage("Select each product option before adding this item to your cart.");
      return;
    }
    if (!fulfillmentSummary.availableMethods.includes(fulfillmentType)) {
      setStatusMessage(
        fulfillmentSummary.deliveryUnavailableReason ||
          "That fulfillment option is not available for this listing."
      );
      return;
    }
    if (selectableQuantityCap <= 0) {
      setStatusMessage("Currently unavailable.");
      return;
    }
    await executeAddToCart({
      listingId: listing.id,
      selectedQuantity: Math.min(quantity, selectableQuantityCap),
      selectedFulfillmentType: fulfillmentType,
      businessId: listing.business_id || null,
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

  const handleClosePreview = useCallback(() => {
    if (!previewBanner?.editorHref) return;
    if (previewBanner?.isFromEditorPreview) {
      setPreviewCloseHelp("");
      window.close();
      window.setTimeout(() => {
        setPreviewCloseHelp("You can close this preview tab and return to the editor.");
      }, 250);
      return;
    }
    if (typeof window !== "undefined") {
      window.location.href = previewBanner.editorHref;
    }
  }, [previewBanner?.editorHref, previewBanner?.isFromEditorPreview]);

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
            href={backHref}
            className="inline-flex items-center gap-2 text-sm opacity-80 hover:opacity-100"
          >
            <ArrowLeft className="h-4 w-4" /> {backLabel}
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
  const displayListingId =
    formatEntityId("listing", listing?.public_id) || null;
  const city = business?.city || "Your area";
  const address = seededListing ? null : business?.address || null;
  const listingCategory = getListingCategoryLabel(listing, "Local listing");
  const businessType = getBusinessTypeLabel(business, "Local business");
  const showMessage = !accountContext.isBusiness;
  const showSaveControls = !accountContext.isBusiness && !accountContext.rolePending;
  const purchaseRestricted = accountContext.purchaseRestricted;
  const purchaseEligibilityPending = accountContext.rolePending;
  const galleryItems = resolvedMedia.images
    .map((image, index) => {
      const src = getGalleryRenderSrc(image, getListingCategoryPlaceholder(listing));
      if (!src) return null;
      return {
        key: image?.id || `${src}-${index}`,
        src,
        image,
      };
    })
    .filter(Boolean);
  const galleryPhotos = galleryItems.map((item) => item.src).filter(Boolean);
  const mobileGalleryItems = galleryItems.slice(0, 5);
  const mobileGalleryOverflowCount = Math.max(
    galleryItems.length - mobileGalleryItems.length,
    0
  );
  const inventory = normalizeInventory(listing);
  const selectedInventory = normalizeInventory(purchasableListing);
  const isOutOfStock =
    (hasVariantOptions ? selectedInventory.availability === "out" : inventory.availability === "out") ||
    selectableQuantityCap <= 0;
  const allAvailableUnitsAlreadyInCart =
    quantitySelectionState.allAvailableUnitsAlreadyInCart;
  const availabilityText = seededListing
    ? getSeededListingBadgeLabel(listing)
    : hasVariantOptions && !selectedVariant
      ? allAvailableUnitsAlreadyInCart
        ? "Currently unavailable"
        : "Select options"
      : allAvailableUnitsAlreadyInCart
        ? "Currently unavailable"
      : (hasVariantOptions ? selectedInventory.availability : inventory.availability) === "out"
        ? "Out of stock"
      : "In stock";
  const availabilityTextClassName = seededListing
    ? "text-slate-600"
    : isOutOfStock
      ? "text-slate-500"
      : "text-neutral-500";
  const availabilityDotClassName = seededListing
    ? "bg-slate-400"
    : isOutOfStock
      ? "bg-slate-400"
      : "bg-emerald-500";
  const businessProfileHref = business?.id ? getCustomerBusinessUrl(business) : null;
  const isBusinessVerified = ["auto_verified", "manually_verified"].includes(
    String(business?.verification_status || "").trim().toLowerCase()
  );
  const pickupOnly =
    fulfillmentSummary.pickupAvailable && !fulfillmentSummary.deliveryAvailable;
  const deliveryOnly =
    !fulfillmentSummary.pickupAvailable && fulfillmentSummary.deliveryAvailable;
  const bothFulfillmentOptionsAvailable =
    fulfillmentSummary.pickupAvailable && fulfillmentSummary.deliveryAvailable;
  const deliveryOnlySubtitle =
    Number(fulfillmentSummary.deliveryFeeCents || 0) > 0
      ? `$${formatCents(fulfillmentSummary.deliveryFeeCents)} delivery`
      : "Delivery available";
  const quantityControlsDisabled =
    seededListing ||
    isOutOfStock ||
    purchaseRestricted ||
    purchaseEligibilityPending ||
    (hasVariantOptions && !selectedVariant?.id);
  const canDecreaseQuantity = quantity > 1 && !quantityControlsDisabled;
  const canIncreaseQuantity =
    quantity < selectableQuantityCap && !quantityControlsDisabled;
  const addToCartDisabled =
    seededListing ||
    isOutOfStock ||
    cartActionLoading ||
    (hasVariantOptions && !selectedVariant?.id);
  const inlineStatusMessage =
    statusMessage === "No items in cart." ? "" : statusMessage || availabilityStatusMessage;

  return (
    <>
      <div
        className="px-4 pb-3 pt-4 md:px-8 md:pb-2 md:pt-3 lg:px-12"
        style={{
          background: "var(--background)",
          color: "var(--text)",
          borderBottom: "1px solid rgba(15,23,42,0.05)",
        }}
      >
        <div className="max-w-6xl mx-auto space-y-4">
        {previewBanner ? (
          <div
            className="flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50/90 px-4 py-3 text-sm text-violet-900 md:flex-row md:items-center md:justify-between"
            data-testid="listing-preview-banner"
          >
            <p className="font-medium">
              Preview mode — this is how customers will see your listing after publishing.
            </p>
            {previewBanner.editorHref ? (
              <div className="flex flex-col items-start gap-1 md:items-end">
                <button
                  type="button"
                  onClick={handleClosePreview}
                  className="inline-flex items-center gap-2 text-sm font-medium text-violet-700 underline-offset-4 transition hover:text-violet-900 hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {previewBanner?.isFromEditorPreview ? "Close preview" : "Back to editor"}
                </button>
                {previewCloseHelp ? (
                  <p className="text-xs text-violet-700">{previewCloseHelp}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {!previewBanner ? (
          <div
            className="mb-2 mt-2 flex flex-wrap items-center justify-between gap-3 opacity-80"
          >
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 text-sm hover:opacity-100"
            >
              <ArrowLeft className="h-4 w-4" /> {backLabel}
            </Link>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div
              className="relative overflow-visible rounded-3xl shadow-[0_18px_40px_-32px_rgba(15,23,42,0.22)]"
              style={{ background: "var(--surface)", border: "1px solid rgba(15,23,42,0.08)" }}
            >
              {galleryPhotos.length > 1 ? (
                <div className="absolute left-4 top-4 z-10 hidden flex-col gap-2 rounded-[20px] border p-2 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.18)] md:flex">
                  {galleryItems.map((item, idx) => {
                    const active = heroSrc === item.src;
                    return (
                      <button
                        key={`${item.key}-${idx}`}
                        type="button"
                        onClick={() => setHeroSrc(item.src)}
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
                          src={item.src}
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
                className="relative w-full aspect-[4/3] overflow-hidden rounded-2xl bg-white"
              >
                <div
                  className="pointer-events-none absolute inset-4 rounded-[28px]"
                  style={{
                    boxShadow:
                      "inset 0 0 0 1px rgba(15,23,42,0.05), inset 0 -18px 32px -32px rgba(15,23,42,0.12)",
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <div className="relative h-full w-full">
                    <SafeImage
                      src={heroSrc || getListingCategoryPlaceholder(listing)}
                      alt={listing.title}
                      className="max-h-full max-w-full object-contain"
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
                  </div>
                </div>
                <div className="pointer-events-none absolute inset-0 ring-1 ring-black/[0.04]" />
              </div>
              {galleryPhotos.length > 1 ? (
                <div className="scrollbar-none mx-4 mt-3 flex max-w-full gap-2 overflow-x-auto overflow-y-visible scroll-smooth px-1 pt-2 pb-2 md:hidden">
                  {mobileGalleryItems.map((item, idx) => {
                    const active = heroSrc === item.src;
                    const showOverflowCount =
                      idx === mobileGalleryItems.length - 1 &&
                      mobileGalleryOverflowCount > 0;
                    return (
                      <button
                        key={`${item.key}-${idx}-mobile`}
                        type="button"
                        onClick={() => setHeroSrc(item.src)}
                        className={cn(
                          "relative flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-white border transition md:h-20 md:w-20",
                          active
                            ? "border-purple-500 ring-2 ring-purple-200"
                            : "border-gray-200"
                        )}
                        aria-label={
                          showOverflowCount
                            ? `View photo ${idx + 1}, plus ${mobileGalleryOverflowCount} more`
                            : `View photo ${idx + 1}`
                        }
                      >
                        <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-white p-1">
                          <SafeImage
                            src={item.src}
                            alt={`Listing photo ${idx + 1}`}
                            className="h-full w-full object-contain"
                            width={80}
                            height={80}
                            sizes="(max-width: 767px) 64px, 80px"
                            useNextImage
                            fallbackSrc={getListingCategoryPlaceholder(listing)}
                          />
                        </span>
                        {showOverflowCount ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-semibold text-white">
                            +{mobileGalleryOverflowCount}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="space-y-0 p-5 md:p-6">
                <div className="space-y-2.5">
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
                  <div className="pt-1 text-xs text-slate-500">
                    <span>{listingCategory}</span>
                    {seededListing ? (
                      <span className="ml-2 inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {getSeededListingBadgeLabel(listing)}
                      </span>
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
                {(displayListingId || listingCategory) ? (
                  <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    {listingCategory ? (
                      <span>
                        <span className="font-medium text-slate-600">Category:</span> {listingCategory}
                      </span>
                    ) : null}
                    {listingCategory && displayListingId ? (
                      <span className="text-slate-400">·</span>
                    ) : null}
                    {displayListingId ? (
                      <span>
                        <span className="font-medium text-slate-600">Ref:</span> {displayListingId}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div
              className="rounded-3xl p-5 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.18)]"
              style={{ background: "var(--surface)", border: "1px solid rgba(15,23,42,0.06)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="text-[2rem] font-semibold leading-none tracking-[-0.03em]">
                    {formattedPrice ? `$${formattedPrice}` : "Contact store"}
                  </div>
                  {formattedPrice ? (
                    <p className="text-xs opacity-65">Price before tax</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                    <span className={`inline-flex items-center gap-1.5 ${availabilityTextClassName}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${availabilityDotClassName}`} />
                      {availabilityText}
                    </span>
                    <span className="opacity-35" aria-hidden="true">
                      ·
                    </span>
                    {businessProfileHref ? (
                      <Link
                        href={businessProfileHref}
                        onClick={(event) => {
                          if (!gateBusinessProfileAccess(event, businessProfileHref)) {
                            return;
                          }
                        }}
                        className="font-medium text-neutral-500 transition hover:text-slate-700 hover:underline hover:underline-offset-4"
                      >
                        {storeName}
                      </Link>
                    ) : (
                      <span className="font-medium text-neutral-500">{storeName}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {showSaveControls ? (
                    <button
                      type="button"
                      onClick={handleToggleSave}
                      className="rounded-full p-2 text-slate-500 transition hover:bg-black/[0.03] hover:text-slate-700"
                      aria-pressed={isSaved}
                      aria-label={isSaved ? "Unsave listing" : "Save listing"}
                      disabled={saveLoading}
                    >
                      <Heart className={`h-5 w-5 ${isSaved ? "text-rose-400" : ""}`} fill={isSaved ? "currentColor" : "none"} />
                    </button>
                  ) : null}
                  <div className="relative" ref={listingMenuRef}>
                    <button
                      type="button"
                      onClick={() => setListingMenuOpen((open) => !open)}
                      className="rounded-full p-2 text-slate-500 transition hover:bg-black/[0.03] hover:text-slate-700"
                      aria-expanded={listingMenuOpen}
                      aria-label="Open listing actions menu"
                    >
                      <MoreHorizontal className="h-5 w-5" />
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
                        {showSaveControls ? (
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
                        ) : null}
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

              <div className="mt-4 border-t pt-4" style={{ borderColor: "rgba(15,23,42,0.04)" }}>
                <div>
                  {seededListing ? (
                    <div
                      className="rounded-2xl px-4 py-3 text-left"
                      style={{
                        background: "rgba(15,23,42,0.025)",
                        border: "1px solid rgba(15,23,42,0.08)",
                        color: "var(--text)",
                      }}
                    >
                      <div className="text-sm font-semibold text-slate-700">
                        {SEEDED_LISTING_PREVIEW_MESSAGE}
                      </div>
                    </div>
                  ) : pickupOnly ? (
                    <div
                      className="rounded-2xl px-4 py-3 text-left"
                      style={{
                        background: "rgba(15,23,42,0.025)",
                        border: "1px solid rgba(15,23,42,0.08)",
                        color: "var(--text)",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(15,23,42,0.05)] text-[var(--yb-focus)]">
                          <ShoppingBag className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">Pickup</div>
                          <div className="mt-1 truncate text-xs opacity-70">
                            {pickupAvailabilityLabel}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : deliveryOnly ? (
                    <div
                      className="rounded-2xl px-4 py-3 text-left"
                      style={{
                        background: "rgba(15,23,42,0.025)",
                        border: "1px solid rgba(15,23,42,0.08)",
                        color: "var(--text)",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(15,23,42,0.05)] text-[var(--yb-focus)]">
                          <Truck className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">Delivery</div>
                          <div className="mt-1 truncate text-xs opacity-70">
                            {deliveryOnlySubtitle}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : bothFulfillmentOptionsAvailable ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {[
                        {
                          id: PICKUP_FULFILLMENT_TYPE,
                          label: "Pickup",
                          meta: pickupAvailabilityLabel,
                          icon: ShoppingBag,
                          available: fulfillmentSummary.pickupAvailable,
                          hidden:
                            !fulfillmentSummary.pickupAvailable &&
                            !fulfillmentSummary.deliveryAvailable,
                        },
                        {
                          id: DELIVERY_FULFILLMENT_TYPE,
                          label: "Delivery",
                          meta:
                            Number(fulfillmentSummary.deliveryFeeCents || 0) > 0
                              ? `$${formatCents(fulfillmentSummary.deliveryFeeCents)}`
                              : "Delivery available",
                          icon: Truck,
                          available: fulfillmentSummary.deliveryAvailable,
                          hidden: false,
                        },
                      ]
                        .filter((option) => !option.hidden)
                        .map((option) => {
                          const Icon = option.icon;
                          const active = fulfillmentType === option.id;
                          const disabled =
                            purchaseRestricted ||
                            purchaseEligibilityPending ||
                            cartActionLoading ||
                            !option.available;

                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setFulfillmentType(option.id)}
                              disabled={disabled}
                              className={`rounded-2xl px-4 py-3 text-left transition ${
                                disabled && !active ? "cursor-not-allowed" : ""
                              }`}
                              style={{
                                background: active ? "rgba(124,58,237,0.08)" : "rgba(15,23,42,0.02)",
                                border: active
                                  ? "1px solid rgba(124,58,237,0.20)"
                                  : "1px solid rgba(15,23,42,0.08)",
                                color: "var(--text)",
                                opacity: option.available ? 1 : 0.55,
                              }}
                            >
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(15,23,42,0.05)] text-[var(--yb-focus)]">
                                  <Icon className="h-3.5 w-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold">{option.label}</div>
                                  <div className="mt-1 text-xs opacity-70">{option.meta}</div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  ) : null}
                  {fulfillmentType === DELIVERY_FULFILLMENT_TYPE &&
                    fulfillmentSummary.deliveryAvailable &&
                    fulfillmentSummary.deliveryNotes ? (
                    <p className="mt-3 text-xs leading-5 opacity-65">
                      {fulfillmentSummary.deliveryNotes}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 border-t pt-5" style={{ borderColor: "rgba(15,23,42,0.04)" }}>
                <div className="space-y-6">
                  {hasVariantOptions ? (
                    <ListingOptionSelectors
                      attributes={listingOptions?.attributes}
                      variants={activeVariants}
                      selectedOptions={selectedVariantOptions}
                      onChange={(attributeName, value) => {
                        setStatusMessage("");
                        setSelectedVariantOptions((current) => ({
                          ...current,
                          [attributeName]: value,
                        }));
                      }}
                    />
                  ) : null}

                  {!seededListing ? (
                    <div className="mt-7">
                      <label className="block text-xs font-medium tracking-[0.04em] opacity-70">
                        Quantity
                      </label>
                      <div className="mt-3">
                      <div
                        className="flex items-center overflow-hidden rounded-2xl"
                        style={{
                          background: "#ffffff",
                          border: "1px solid rgba(209,213,219,1)",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setQuantity((current) =>
                              clampListingQuantitySelection(current - 1, selectableQuantityCap)
                            )
                          }
                          disabled={!canDecreaseQuantity}
                          className="flex h-11 w-11 items-center justify-center text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <div
                          className="flex h-11 min-w-0 flex-1 items-center justify-center border-x text-sm font-medium"
                          style={{
                            borderColor: "rgba(209,213,219,1)",
                            color: "var(--text)",
                          }}
                        >
                          {quantity}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setQuantity((current) =>
                              clampListingQuantitySelection(current + 1, selectableQuantityCap)
                            )
                          }
                          disabled={!canIncreaseQuantity}
                          className="flex h-11 w-11 items-center justify-center text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      </div>
                    </div>
                  ) : null}

                  {purchaseEligibilityPending ? (
                    <div className="mt-3 space-y-2">
                      <button
                        type="button"
                        disabled
                        className="w-full rounded-2xl px-4 py-3.5 text-sm font-semibold opacity-70"
                        style={{ background: "rgba(15,23,42,0.08)", color: "var(--text)" }}
                      >
                        Checking account...
                      </button>
                      <p className="text-xs leading-5 opacity-75">
                        We’re confirming your account before enabling checkout.
                      </p>
                    </div>
                  ) : purchaseRestricted ? (
                    <div className="mt-3 space-y-2">
                      <button
                        type="button"
                        disabled
                        className="w-full rounded-2xl px-4 py-3.5 text-sm font-semibold opacity-70"
                        style={{ background: "rgba(15,23,42,0.08)", color: "var(--text)" }}
                      >
                        Customer accounts only
                      </button>
                      <p className="text-xs leading-5 opacity-75">
                        {getPurchaseRestrictionHelpText()}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-7 space-y-3">
                      <button
                        type="button"
                        onClick={handleAddToCart}
                        disabled={addToCartDisabled}
                        className="yb-auth-cta flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(111,52,255,0.24)] focus-visible:ring-offset-2 disabled:cursor-not-allowed"
                        style={{
                          background: addToCartDisabled
                            ? "rgba(124,58,237,0.14)"
                            : "var(--yb-focus)",
                          color: addToCartDisabled
                            ? "rgba(76,29,149,0.88)"
                            : "#ffffff",
                          boxShadow: addToCartDisabled
                            ? "0 8px 16px -16px rgba(124,58,237,0.28)"
                            : "0 12px 24px -20px rgba(110,52,255,0.38)",
                        }}
                      >
                        {seededListing ? "Coming soon" : cartActionLoading ? "Adding..." : "Add to cart"}
                      </button>
                    </div>
                  )}

                  {seededListing ? (
                    <div className="text-xs leading-5 opacity-75">
                      {SEEDED_LISTING_PREVIEW_MESSAGE}
                    </div>
                  ) : isOutOfStock ? (
                    <div className="mt-2 text-xs leading-5 opacity-75">
                      {hasVariantOptions && !selectedVariant?.id
                        ? allAvailableUnitsAlreadyInCart
                          ? "All available units are already in your cart."
                          : "Select each option to see availability."
                        : allAvailableUnitsAlreadyInCart
                          ? "All available units are already in your cart."
                        : serverAvailableQuantity === 0
                          ? "Currently unavailable."
                          : "This item is currently out of stock"}
                    </div>
                  ) : inlineStatusMessage ? (
                    <div
                      className="mt-2 rounded-xl px-3 py-2 text-xs"
                      style={{ background: "var(--overlay)", border: "1px solid rgba(15,23,42,0.08)" }}
                    >
                      {inlineStatusMessage}
                    </div>
                  ) : purchaseRestricted ? (
                    <div className="text-xs leading-5 opacity-75">
                      Browse listings with your business account, but switch to a customer account to place orders.
                    </div>
                  ) : null}
                </div>
              </div>

              {!seededListing && (fulfillmentSummary.deliveryAvailable || fulfillmentSummary.pickupAvailable) ? (
                <div className="mt-10 border-t pt-7" style={{ borderColor: "rgba(15,23,42,0.08)" }}>
                  <div className="text-sm font-semibold">
                    <span className="opacity-80">What to expect</span>
                  </div>
                  <ul className="mt-3 space-y-2 text-[13px] leading-6 opacity-68">
                    {fulfillmentSummary.deliveryAvailable ? (
                      <li>Delivery windows are shared after your order is confirmed.</li>
                    ) : null}
                    {fulfillmentSummary.pickupAvailable ? (
                      <li>Pickup instructions are sent after your order is confirmed.</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
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
