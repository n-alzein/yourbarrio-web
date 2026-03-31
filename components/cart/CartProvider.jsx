"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useCurrentAccountContext } from "@/lib/auth/useCurrentAccountContext";
import { getPurchaseRestrictionMessage } from "@/lib/auth/purchaseAccess";
import { groupCartItemsByBusiness } from "@/lib/cart/groupCartItemsByBusiness";

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
  refreshCart: async () => {},
  addItem: async () => ({}),
  updateItem: async () => ({}),
  removeItem: async () => ({}),
  setFulfillmentType: async () => ({}),
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

  const refreshCart = useCallback(
    async ({ reason } = {}) => {
      if (
        !user?.id ||
        authStatus !== "authenticated" ||
        purchaseRestricted ||
        purchaseEligibilityPending
      ) {
        setCart(null);
        setVendor(null);
        setCarts([]);
        setVendors({});
        setItems([]);
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
    [authStatus, perfDebug, purchaseEligibilityPending, purchaseRestricted, syncCart, user?.id]
  );

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

  useEffect(() => {
    if (!purchaseRestricted) return;
    setCart(null);
    setVendor(null);
    setCarts([]);
    setVendors({});
    setItems([]);
  }, [purchaseRestricted]);

  const addItem = useCallback(
    async ({ listingId, quantity = 1, clearExisting }) => {
      if (!user?.id) {
        return { error: "Please log in to add items." };
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
          quantity,
          clear_existing: clearExisting,
        }),
      });

      const payload = await parseResponse(response);
      if (!response.ok) {
        return { error: payload?.error || "Failed to add to cart" };
      }

      syncCart(payload);
      return { cart: payload?.cart || null, vendor: payload?.vendor || null };
    },
    [purchaseEligibilityPending, purchaseRestricted, syncCart, user?.id]
  );

  const updateItem = useCallback(
    async ({ itemId, quantity }) => {
      if (!user?.id) {
        return { error: "Please log in." };
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
    [purchaseEligibilityPending, purchaseRestricted, syncCart, user?.id]
  );

  const removeItem = useCallback(
    async (itemId) => updateItem({ itemId, quantity: 0 }),
    [updateItem]
  );

  const setFulfillmentType = useCallback(
    async (fulfillmentType, { cartId = null, businessId = null } = {}) => {
      if (!user?.id) {
        return { error: "Please log in." };
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
    [purchaseEligibilityPending, purchaseRestricted, syncCart, user?.id]
  );

  const clearCart = useCallback(async () => {
    if (!user?.id) {
      return { error: "Please log in." };
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
  }, [purchaseEligibilityPending, purchaseRestricted, syncCart, user?.id]);

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
