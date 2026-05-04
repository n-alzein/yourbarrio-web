"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { retry } from "@/lib/retry";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { createFetchSafe } from "@/lib/fetchSafe";
import { memoizeRequest } from "@/lib/requestMemo";
import CustomerAccountShell from "@/components/customer/CustomerAccountShell";
import InboxList from "@/components/messages/InboxList";
import { useRealtimeChannel } from "@/lib/realtime/useRealtimeChannel";

const customerConversationsCache = new Map();

export default function CustomerMessagesPage() {
  const { user, supabase, loadingUser, authStatus } = useAuth();
  const userId = user?.id || null;
  const cachedConversations = userId
    ? customerConversationsCache.get(userId)
    : undefined;
  const hasCachedConversations = Array.isArray(cachedConversations);

  const [hydrated, setHydrated] = useState(false);
  const [conversations, setConversations] = useState(() =>
    hasCachedConversations ? cachedConversations : []
  );
  const [hasLoaded, setHasLoaded] = useState(hasCachedConversations);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const hasLoadedRef = useRef(hasCachedConversations);
  const inflightRef = useRef(null);
  const [isVisible, setIsVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden
  );
  const applyLocalRead = useCallback((rows = []) => {
    if (typeof window === "undefined") return rows;
    const lastOpenedId = window.sessionStorage.getItem(
      "yb-last-opened-conversation"
    );
    if (!lastOpenedId) return rows;
    const nextRows = rows.map((row) =>
      row?.id === lastOpenedId
        ? { ...row, customer_unread_count: 0 }
        : row
    );
    window.sessionStorage.removeItem("yb-last-opened-conversation");
    return nextRows;
  }, []);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!userId) {
      hasLoadedRef.current = false;
      setHasLoaded(false);
      setConversations([]);
      return;
    }

    const cachedRows = customerConversationsCache.get(userId);
    if (Array.isArray(cachedRows)) {
      const nextRows = applyLocalRead(cachedRows);
      customerConversationsCache.set(userId, nextRows);
      hasLoadedRef.current = true;
      setHasLoaded(true);
      setConversations(nextRows);
      return;
    }

    hasLoadedRef.current = false;
    setHasLoaded(false);
    setConversations([]);
  }, [applyLocalRead, userId]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => setIsVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const loadConversations = useCallback(async () => {
    if (!userId || authStatus !== "authenticated") return;
    const requestId = ++requestIdRef.current;
    inflightRef.current?.abort?.();
    const hasUsableData = hasLoadedRef.current;
    setLoading(!hasUsableData);
    setRefreshing(hasUsableData);
    setError(null);
    const safeRequest = createFetchSafe(
      async ({ signal }) => {
        const response = await retry(
          () =>
            fetchWithTimeout("/api/customer/conversations", {
              method: "GET",
              credentials: "include",
              timeoutMs: 12000,
              signal,
            }),
          { retries: 1, delayMs: 600 }
        );
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to load conversations");
        }
        const payload = await response.json();
        return Array.isArray(payload?.conversations)
          ? payload.conversations
          : [];
      },
      { label: "customer-conversations" }
    );
    inflightRef.current = safeRequest;
    try {
      const result = await memoizeRequest(
        `customer-conversations:${userId}`,
        safeRequest.run
      );
      if (!result || result.aborted) return;
      if (requestId !== requestIdRef.current) return;
      if (!result.ok) {
        throw result.error || new Error("Failed to load conversations");
      }
      const nextRows = applyLocalRead(result.result || []);
      customerConversationsCache.set(userId, nextRows);
      setConversations(nextRows);
      hasLoadedRef.current = true;
      setHasLoaded(true);
    } catch (err) {
      console.error("Failed to load conversations", err);
      if (requestId === requestIdRef.current) {
        setError("We couldn’t load your messages. Please try again.");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [applyLocalRead, authStatus, userId]);

  useEffect(() => {
    return () => {
      inflightRef.current?.abort?.();
    };
  }, []);

  useEffect(() => {
    if (!hydrated || loadingUser || !userId) return;
    if (authStatus !== "authenticated") return;
    if (!isVisible && hasLoadedRef.current) return;
    loadConversations();
  }, [authStatus, hydrated, loadingUser, userId, loadConversations, isVisible]);

  const buildConversationsChannel = useCallback(
    (activeClient) =>
      activeClient
        .channel(`conversations-customer-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `customer_id=eq.${userId}`,
          },
          () => {
            loadConversations();
          }
        ),
    [userId, loadConversations]
  );

  useRealtimeChannel({
    supabase,
    enabled:
      hydrated && !loadingUser && authStatus === "authenticated" && Boolean(userId),
    buildChannel: buildConversationsChannel,
    diagLabel: "customer-conversations",
  });

  const intro = useMemo(
    () =>
      "Message local businesses, confirm details, and keep everything organized in one inbox.",
    []
  );

  const conversationCount = conversations.length;
  const isInitialLoading = loading && !hasLoaded && conversations.length === 0;
  const isRefreshing = refreshing && hasLoaded;

  return (
    <section className="w-full min-h-screen bg-[#f6f7fb] pb-10 text-slate-950 md:pb-14">
      <CustomerAccountShell className="!bg-transparent">
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/80 pb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                Inbox
              </p>
              <div className="mt-2">
                <h1 className="text-2xl font-semibold tracking-normal text-slate-950 md:text-3xl">
                  Messages
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">{intro}</p>
              </div>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm">
              {conversationCount} chats
              {isRefreshing ? (
                <span className="ml-2 text-slate-400">Updating...</span>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <span>{error}</span>
              <button
                type="button"
                onClick={loadConversations}
                className="rounded-full border border-rose-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700 hover:text-rose-900"
              >
                Try again
              </button>
            </div>
          ) : null}

          <div className="mt-2 md:mt-3">
            <InboxList
              conversations={conversations}
              role="customer"
              basePath="/customer/messages"
              loading={isInitialLoading}
              variant="customer-flat"
            />
          </div>
        </div>
      </CustomerAccountShell>
    </section>
  );
}
