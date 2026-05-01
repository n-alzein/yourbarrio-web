"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useCurrentAccountContext } from "@/lib/auth/useCurrentAccountContext";
import { getPurchaseRestrictionMessage } from "@/lib/auth/purchaseAccess";
import { groupCartItemsByBusiness } from "@/lib/cart/groupCartItemsByBusiness";
import {
  clearGuestCart,
  getGuestCart,
  getGuestCartCount,
  getGuestCartSessionId,
  GUEST_CART_STORAGE_KEY,
  GUEST_CART_UPDATED_EVENT,
  setGuestCart,
  setGuestCartFulfillment,
} from "@/lib/cart/guestCart";

/** @typedef {import("@/lib/types/cart").CartResponse} CartResponse */

const CartContext = createContext({
  cart: null,
  vendor: null,
  carts: [],
  vendors: {},
  vendorGroups: [],
  items: [],
  itemCount: 0,
  loading: false,
  error: null,
  refreshCart: async (_options = {}) => {},
  addItem: async (_input = {}) => ({}),
  updateItem: async (_input = {}) => ({}),
  removeItem: async (_itemId = null) => ({}),
  setFulfillmentType: async (_fulfillmentType = null, _options = {}) => ({}),
  clearCart: async () => ({}),
});

/**
 * @param {Response} response
 * @returns {Promise<CartResponse>}
 */
async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

const REFRESH_COOLDOWN_MS = 3000;
const CACHE_TTL_MS = 5000;
const FAILURE_WINDOW_MS = 10000;
const FAILURE_MAX_ATTEMPTS = 2;
const FAILURE_BLOCK_MS = 30000;

let globalRefreshInFlight = null;
let globalLastSuccessAt = 0;
let globalLastAttemptAt = 0;
let globalRefreshCalls = 0;
let globalMountCount = 0;
let globalUnmountCount = 0;
let globalStackHintEvery = 10;
let globalCache = { ts: 0, payload: null };
let globalFailureTimestamps = [];
let globalRefreshBlockedUntil = 0;

const getPerfDebug = () => {
  if (typeof window === "undefined") return false;
  try {
    if (process.env.NEXT_PUBLIC_PERF_DEBUG === "1") return true;
  } catch {}
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("perf") === "1") return true;
  } catch {}
  try {
    return window.localStorage.getItem("PERF_DEBUG") === "1";
  } catch {
    return false;
  }
};

export function CartProvider({ children }) {
  const { user, authStatus } = useAuth();
  const accountContext = useCurrentAccountContext();
  const [cart, setCart] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [carts, setCarts] = useState([]);
  const [vendors, setVendors] = useState({});
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const lastRefreshKeyRef = useRef(null);
  const didRunMountRefreshRef = useRef(false);
  const perfDebug = getPerfDebug();
  const mountStartedAtRef = useRef(0);
  const purchaseRestricted = accountContext.purchaseRestricted;
  const purchaseEligibilityPending = accountContext.rolePending;
  const mergeInFlightRef = useRef(false);
  const mergeStateRef = useRef({
    purchaseEligibilityPending: false,
    purchaseRestricted: false,
    userId: null,
  });

  const syncCart = useCallback((payload) => {
    const nextCarts = Array.isArray(payload?.carts)
      ? payload.carts
      : payload?.cart
        ? [payload.cart]
        : [];
    const nextVendors = payload?.vendors || {};
    const nextPrimaryCart = payload?.cart || nextCarts[0] || null;
    const nextPrimaryVendor =
      payload?.vendor ||
      (nextPrimaryCart?.vendor_id ? nextVendors[nextPrimaryCart.vendor_id] || null : null);

    setCarts(nextCarts);
    setVendors(nextVendors);
    setCart(nextPrimaryCart);
    setVendor(nextPrimaryVendor);
    setItems(nextCarts.flatMap((cartRow) => cartRow?.cart_items || []));
  }, []);

  const syncGuestCart = useCallback((guestCart = getGuestCart()) => {
    const nextCarts = Array.isArray(guestCart?.carts) ? guestCart.carts : [];
    const nextVendors = guestCart?.vendors || {};
    const nextPrimaryCart = nextCarts[0] || null;
    const nextPrimaryVendor =
      nextPrimaryCart?.vendor_id ? nextVendors[nextPrimaryCart.vendor_id] || null : null;

    setCarts(nextCarts);
    setVendors(nextVendors);
    setCart(nextPrimaryCart);
    setVendor(nextPrimaryVendor);
    setItems(nextCarts.flatMap((cartRow) => cartRow?.cart_items || []));
    setLoading(false);
    setError(null);
  }, []);

  const syncGuestCartPayload = useCallback(
    (payload) => {
      const nextGuestCart = setGuestCart(payload || getGuestCart());
      syncGuestCart(nextGuestCart);
      return nextGuestCart;
    },
    [syncGuestCart]
  );

  const refreshCart = useCallback(
    async ({ reason } = {}) => {
      if (
        !user?.id ||
        authStatus !== "authenticated" ||
        purchaseRestricted ||
        purchaseEligibilityPending
      ) {
        if (!user?.id && !purchaseRestricted && !purchaseEligibilityPending) {
          const guestCart = getGuestCart();
          if (!guestCart?.guest_id) {
            syncGuestCart(guestCart);
            return { cart: null, guest: true };
          }
          setLoading(true);
          setError(null);
          try {
            const response = await fetch(
              `/api/cart?guest_id=${encodeURIComponent(guestCart.guest_id)}`,
              {
                method: "GET",
                credentials: "same-origin",
              }
            );
            const payload = await parseResponse(response);
            if (!response.ok) {
              throw new Error(payload?.error || "Failed to load cart");
            }
            syncGuestCartPayload(payload);
            return payload;
          } catch (err) {
            syncGuestCart(guestCart);
            setError(err?.message || "Failed to load cart");
            return { error: err?.message || "Failed to load cart" };
          } finally {
            setLoading(false);
          }
        } else {
          setCart(null);
          setVendor(null);
          setCarts([]);
          setVendors({});
          setItems([]);
        }
        setLoading(false);
        setError(purchaseRestricted ? getPurchaseRestrictionMessage() : null);
        return { cart: null };
      }

      globalRefreshCalls += 1;
      if (typeof globalThis !== "undefined") {
        globalThis.__cartRefreshCalls = globalRefreshCalls;
      }

      const now = Date.now();
      const lastSuccessAgoMs = globalLastSuccessAt ? now - globalLastSuccessAt : null;
      const lastAttemptAgoMs = globalLastAttemptAt ? now - globalLastAttemptAt : null;
      const cacheSource =
        typeof window !== "undefined" && window.__YB_CART_CACHE__
          ? window.__YB_CART_CACHE__
          : globalCache;
      const cacheFresh =
        cacheSource?.payload && now - cacheSource.ts < CACHE_TTL_MS;
      if (perfDebug) {
        const shouldLogStack = globalRefreshCalls % globalStackHintEvery === 0;
        console.log("[cart] refresh:attempt", {
          reason,
          mountCount: globalMountCount,
          refreshCalls: globalRefreshCalls,
          inFlight: Boolean(globalRefreshInFlight),
          lastSuccessAgoMs,
          lastAttemptAgoMs,
          stackHint: shouldLogStack ? new Error().stack : undefined,
        });
      }

      if (reason === "mount" && cacheFresh) {
        syncCart(cacheSource.payload);
        if (perfDebug) {
          console.log("[cart] refresh:skip", {
            reason,
            skip: "cache",
            cacheAgeMs: now - cacheSource.ts,
          });
        }
        return { skipped: true, skip: "cache", payload: cacheSource.payload };
      }

      if (globalRefreshInFlight) {
        if (perfDebug) {
          console.log("[cart] refresh:skip", {
            reason,
            skip: "in_flight",
            lastAttemptAgoMs,
          });
        }
        return { skipped: true, skip: "in_flight" };
      }
      if (reason === "mount" && now < globalRefreshBlockedUntil) {
        if (perfDebug) {
          console.log("[cart] refresh:skip", {
            reason,
            skip: "failure_cooldown",
            blockedMsRemaining: globalRefreshBlockedUntil - now,
          });
        }
        return {
          skipped: true,
          skip: "failure_cooldown",
          blockedMsRemaining: globalRefreshBlockedUntil - now,
        };
      }
      if (
        reason === "mount" &&
        lastAttemptAgoMs != null &&
        lastAttemptAgoMs < REFRESH_COOLDOWN_MS
      ) {
        if (perfDebug) {
          console.log("[cart] refresh:skip", {
            reason,
            skip: "cooldown",
            lastAttemptAgoMs,
          });
        }
        return { skipped: true, skip: "cooldown" };
      }
      globalLastAttemptAt = now;

      if (abortRef.current?.abort) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      const runFetch = async () => {
        if (process.env.NEXT_PUBLIC_DEBUG_NAV_PERF === "1") {
          console.log("[cart] refresh:start", { reason });
        }
        setLoading(true);
        setError(null);
        try {
          const response = await fetch("/api/cart", {
            method: "GET",
            credentials: "same-origin",
            signal: controller.signal,
          });
          const payload = await parseResponse(response);
          if (!response.ok) {
            throw new Error(payload?.error || "Failed to load cart");
          }
          syncCart(payload);
          if (typeof window !== "undefined") {
            window.__YB_CART_CACHE__ = {
              ts: Date.now(),
              payload,
            };
          }
          globalCache = { ts: Date.now(), payload };
          globalLastSuccessAt = Date.now();
          return payload;
        } catch (err) {
          const message = err?.message || String(err);
          if (err?.name === "AbortError" || /aborted/i.test(message)) {
            return { aborted: true };
          }
          const nowFail = Date.now();
          globalFailureTimestamps = globalFailureTimestamps.filter(
            (ts) => nowFail - ts < FAILURE_WINDOW_MS
          );
          globalFailureTimestamps.push(nowFail);
          if (globalFailureTimestamps.length >= FAILURE_MAX_ATTEMPTS) {
            globalRefreshBlockedUntil = nowFail + FAILURE_BLOCK_MS;
          }
          if (process.env.NEXT_PUBLIC_DEBUG_NAV_PERF === "1") {
            console.log("[cart] refresh:error", { message });
          }
          setError(message || "Failed to load cart");
          return { error: message || "Failed to load cart" };
        } finally {
          setLoading(false);
        }
      };

      globalRefreshInFlight = new Promise((resolve) => {
        if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
          window.requestIdleCallback(
            () => {
              runFetch().then(resolve);
            },
            { timeout: 1200 }
          );
        } else {
          setTimeout(() => {
            runFetch().then(resolve);
          }, 0);
        }
      }).finally(() => {
        globalRefreshInFlight = null;
      });

      return globalRefreshInFlight;
    },
    [
      authStatus,
      perfDebug,
      purchaseEligibilityPending,
      purchaseRestricted,
      syncCart,
      syncGuestCart,
      syncGuestCartPayload,
      user?.id,
    ]
  );

  useEffect(() => {
    if (user?.id || authStatus === "authenticated") return undefined;
    syncGuestCart();
    const handleGuestCartUpdated = (event) => {
      syncGuestCart(event?.detail || getGuestCart());
    };
    const handleStorage = (event) => {
      if (event.key === GUEST_CART_STORAGE_KEY) syncGuestCart();
    };
    window.addEventListener(GUEST_CART_UPDATED_EVENT, handleGuestCartUpdated);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(GUEST_CART_UPDATED_EVENT, handleGuestCartUpdated);
      window.removeEventListener("storage", handleStorage);
    };
  }, [authStatus, syncGuestCart, user?.id]);

  useEffect(() => {
    if (
      !user?.id ||
      authStatus !== "authenticated" ||
      purchaseRestricted ||
      purchaseEligibilityPending
    ) {
      return undefined;
    }
    if (perfDebug) {
      if (typeof window !== "undefined") {
        globalMountCount += 1;
        window.__YB_CART_MOUNT_COUNT__ = globalMountCount;
        console.log("[cart] mount_count", window.__YB_CART_MOUNT_COUNT__);
        console.log("[cart] mount_path", window.location?.pathname);
      }
    }
    mountStartedAtRef.current = Date.now();
    if (didRunMountRefreshRef.current) return undefined;
    didRunMountRefreshRef.current = true;
    const key = `${user.id}:${authStatus}`;
    if (lastRefreshKeyRef.current === key) return undefined;
    lastRefreshKeyRef.current = key;
    const run = () => refreshCart({ reason: "mount" });
    let idleId = null;
    let timeoutId = null;
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(run, { timeout: 1200 });
    } else {
      timeoutId = setTimeout(run, 0);
    }
    return () => {
      if (idleId && typeof window !== "undefined" && window.cancelIdleCallback) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (abortRef.current?.abort) {
        abortRef.current.abort();
      }
      if (perfDebug && typeof window !== "undefined") {
        globalUnmountCount += 1;
        const mountedForMs = mountStartedAtRef.current
          ? Date.now() - mountStartedAtRef.current
          : null;
        console.log("[cart] unmount_count", globalUnmountCount);
        console.log("[cart] unmount_path", window.location?.pathname);
        console.log("[cart] mounted_for_ms", mountedForMs);
      }
    };
  }, [authStatus, purchaseEligibilityPending, purchaseRestricted, refreshCart, syncCart, user?.id, perfDebug]);

  useEffect(() => {
    didRunMountRefreshRef.current = false;
    lastRefreshKeyRef.current = null;
  }, [user?.id, authStatus]);

  mergeStateRef.current = {
    purchaseEligibilityPending,
    purchaseRestricted,
    userId: user?.id || null,
  };

  useEffect(() => {
    const mergeState = mergeStateRef.current;
    if (!mergeState.userId || authStatus !== "authenticated" || mergeInFlightRef.current) return;
    if (mergeState.purchaseEligibilityPending || mergeState.purchaseRestricted) return;
    const guestCart = getGuestCart();
    if (getGuestCartCount(guestCart) <= 0) return;
    const mergeId = `${mergeState.userId}:${guestCart.updatedAt || Date.now()}`;
    let storage = null;
    try {
      storage = window.sessionStorage;
      if (storage.getItem("yb:guestCartMergeId") === mergeId) return;
    } catch {}

    mergeInFlightRef.current = true;
    setLoading(true);
    (async () => {
      try {
        for (const cartRow of guestCart.carts || []) {
          for (const item of cartRow.cart_items || []) {
            const response = await fetch("/api/cart", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                guest_id: guestCart.guest_id,
                guest_item_id: item.id,
                listing_id: item.listing_id,
                variant_id: item.variant_id,
                variant_label: item.variant_label,
                selected_options: item.selected_options,
                quantity: item.quantity,
              }),
            });
            if (!response.ok) {
              const payload = await parseResponse(response);
              throw new Error(payload?.error || "Failed to merge guest cart");
            }
          }
          if (cartRow.fulfillment_type) {
            await fetch("/api/cart", {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                business_id: cartRow.vendor_id,
                fulfillment_type: cartRow.fulfillment_type,
              }),
            });
          }
        }
        clearGuestCart();
        storage?.setItem("yb:guestCartMergeId", mergeId);
        await refreshCart({ reason: "guest-merge" });
      } catch (err) {
        setError(err?.message || "Failed to merge guest cart");
      } finally {
        mergeInFlightRef.current = false;
        setLoading(false);
      }
    })();
  }, [authStatus, refreshCart]);

  useEffect(() => {
    if (!purchaseRestricted) return;
    setCart(null);
    setVendor(null);
    setCarts([]);
    setVendors({});
    setItems([]);
  }, [purchaseRestricted]);

  const addItem = useCallback(
    async ({
      listingId,
      variantId = null,
      variantLabel = null,
      selectedOptions = null,
      quantity = 1,
      clearExisting,
      fulfillmentType = null,
    }) => {
      if (!user?.id) {
        const response = await fetch("/api/cart", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guest_id: getGuestCartSessionId(),
            listing_id: listingId,
            variant_id: variantId,
            variant_label: variantLabel,
            selected_options: selectedOptions,
            quantity,
            clear_existing: clearExisting,
            fulfillment_type: fulfillmentType,
          }),
        });

        const payload = await parseResponse(response);
        if (!response.ok) {
          return {
            error: payload?.error || "Failed to add to cart",
            code: payload?.code || null,
            maxQuantity: payload?.maxQuantity ?? null,
          };
        }

        const guestCart = syncGuestCartPayload(payload);
        return { cart: guestCart?.carts?.[0] || null, guest: true };
      }
      if (purchaseEligibilityPending) {
        return { error: "We’re still confirming your account. Try again." };
      }
      if (purchaseRestricted) {
        return { error: getPurchaseRestrictionMessage() };
      }

      setError(null);
      const response = await fetch("/api/cart", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_id: listingId,
          variant_id: variantId,
          variant_label: variantLabel,
          selected_options: selectedOptions,
          quantity,
          clear_existing: clearExisting,
        }),
      });

      const payload = await parseResponse(response);
      if (!response.ok) {
        return {
          error: payload?.error || "Failed to add to cart",
          code: payload?.code || null,
          maxQuantity: payload?.maxQuantity ?? null,
        };
      }

      syncCart(payload);
      return { cart: payload?.cart || null, vendor: payload?.vendor || null };
    },
    [purchaseEligibilityPending, purchaseRestricted, syncCart, syncGuestCartPayload, user?.id]
  );

  const updateItem = useCallback(
    async ({ itemId, quantity }) => {
      if (!user?.id) {
        const guestCart = getGuestCart();
        const response = await fetch("/api/cart", {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guest_id: guestCart.guest_id || getGuestCartSessionId(),
            item_id: itemId,
            quantity,
          }),
        });

        const payload = await parseResponse(response);
        if (!response.ok) {
          return { error: payload?.error || "Failed to update cart" };
        }

        const nextGuestCart = syncGuestCartPayload(payload);
        return { cart: nextGuestCart?.carts?.[0] || null, guest: true };
      }
      if (purchaseEligibilityPending) {
        return { error: "We’re still confirming your account. Try again." };
      }
      if (purchaseRestricted) {
        return { error: getPurchaseRestrictionMessage() };
      }

      const response = await fetch("/api/cart", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, quantity }),
      });

      const payload = await parseResponse(response);
      if (!response.ok) {
        return { error: payload?.error || "Failed to update cart" };
      }

      syncCart(payload);
      return payload;
    },
    [purchaseEligibilityPending, purchaseRestricted, syncCart, syncGuestCartPayload, user?.id]
  );

  const removeItem = useCallback(
    async (itemId) => {
      return updateItem({ itemId, quantity: 0 });
    },
    [updateItem]
  );

  const setFulfillmentType = useCallback(
    async (fulfillmentType, { cartId = null, businessId = null } = {}) => {
      if (!user?.id) {
        const guestBusinessId =
          businessId || carts.find((cartRow) => cartRow?.id === cartId)?.vendor_id || null;
        const guestCart = setGuestCartFulfillment(guestBusinessId, fulfillmentType);
        syncGuestCartPayload(guestCart);
        return {
          cart: guestCart?.carts?.find((cartRow) => cartRow.vendor_id === guestBusinessId) || null,
          guest: true,
        };
      }
      if (purchaseEligibilityPending) {
        return { error: "We’re still confirming your account. Try again." };
      }
      if (purchaseRestricted) {
        return { error: getPurchaseRestrictionMessage() };
      }

      const body = { fulfillment_type: fulfillmentType };
      if (cartId) body.cart_id = cartId;
      if (businessId) body.business_id = businessId;

      const response = await fetch("/api/cart", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await parseResponse(response);
      if (!response.ok) {
        return { error: payload?.error || "Failed to update fulfillment" };
      }

      syncCart(payload);
      return payload;
    },
    [carts, purchaseEligibilityPending, purchaseRestricted, syncCart, syncGuestCartPayload, user?.id]
  );

  const clearCart = useCallback(async () => {
    if (!user?.id) {
      const guestCart = getGuestCart();
      if (!guestCart?.guest_id) {
        clearGuestCart();
        syncGuestCart();
        return { cart: null, guest: true };
      }

      const response = await fetch(`/api/cart?guest_id=${encodeURIComponent(guestCart.guest_id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });

      const payload = await parseResponse(response);
      if (!response.ok) {
        return { error: payload?.error || "Failed to clear cart" };
      }

      clearGuestCart();
      syncGuestCart(payload);
      return { cart: null, guest: true };
    }
    if (purchaseEligibilityPending) {
      return { error: "We’re still confirming your account. Try again." };
    }
    if (purchaseRestricted) {
      return { error: getPurchaseRestrictionMessage() };
    }

    const response = await fetch("/api/cart", {
      method: "DELETE",
      credentials: "include",
    });

    const payload = await parseResponse(response);
    if (!response.ok) {
      return { error: payload?.error || "Failed to clear cart" };
    }

    syncCart(payload);
    return payload;
  }, [purchaseEligibilityPending, purchaseRestricted, syncCart, syncGuestCart, user?.id]);

  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [items]
  );

  const vendorGroups = useMemo(() => {
    const cartsByVendorId = carts.reduce((acc, cartRow) => {
      if (cartRow?.vendor_id) {
        acc[cartRow.vendor_id] = cartRow;
      }
      return acc;
    }, {});

    return groupCartItemsByBusiness(items, {
      vendorsById: vendors,
      cartsByVendorId,
    });
  }, [carts, items, vendors]);

  const value = useMemo(
    () => ({
      cart,
      vendor,
      carts,
      vendors,
      vendorGroups,
      items,
      itemCount,
      loading,
      error,
      refreshCart,
      addItem,
      updateItem,
      removeItem,
      setFulfillmentType,
      clearCart,
    }),
    [
      cart,
      vendor,
      carts,
      vendors,
      vendorGroups,
      items,
      itemCount,
      loading,
      error,
      refreshCart,
      addItem,
      updateItem,
      removeItem,
      setFulfillmentType,
      clearCart,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
