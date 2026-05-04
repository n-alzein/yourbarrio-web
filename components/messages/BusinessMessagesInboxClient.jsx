"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import InboxList from "@/components/messages/InboxList";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { useRealtimeChannel } from "@/lib/realtime/useRealtimeChannel";
import { retry } from "@/lib/retry";
import { memoizeRequest } from "@/lib/requestMemo";

const businessConversationsCache = new Map();

function useDelayedFlag(active, delayMs = 200) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(active);
    }, active ? delayMs : 0);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return visible;
}

export default function BusinessMessagesInboxClient({
  initialConversations = [],
  initialError = null,
  initialUserId = null,
  intro = "",
}) {
  const { user, supabase, authStatus, loadingUser } = useAuth();
  const userId = user?.id || initialUserId || null;
  const cachedConversations = userId
    ? businessConversationsCache.get(userId)
    : undefined;
  const [conversations, setConversations] = useState(() =>
    Array.isArray(cachedConversations)
      ? cachedConversations
      : initialConversations
  );
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const hasLoadedRef = useRef(
    initialError == null &&
      (Array.isArray(cachedConversations) || Array.isArray(initialConversations))
  );
  const [hasLoaded, setHasLoaded] = useState(hasLoadedRef.current);
  const requestIdRef = useRef(0);
  const [isVisible, setIsVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden
  );
  const showLoading = useDelayedFlag(
    loading && !hasLoaded && conversations.length === 0
  );

  const applyLocalRead = useCallback((rows = []) => {
    if (typeof window === "undefined") return rows;
    const lastOpenedId = window.sessionStorage.getItem(
      "yb-last-opened-conversation"
    );
    if (!lastOpenedId) return rows;
    const nextRows = rows.map((row) =>
      row?.id === lastOpenedId
        ? { ...row, business_unread_count: 0 }
        : row
    );
    window.sessionStorage.removeItem("yb-last-opened-conversation");
    return nextRows;
  }, []);

  const loadConversations = useCallback(async () => {
    if (!userId || authStatus !== "authenticated") return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const nextConversations = await memoizeRequest(
        `business-conversations:${userId}`,
        async () => {
          const response = await retry(
            () =>
              fetchWithTimeout("/api/business/conversations", {
                method: "GET",
                credentials: "include",
                timeoutMs: 12000,
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
        }
      );

      if (requestId !== requestIdRef.current) return;
      const nextRows = applyLocalRead(nextConversations);
      businessConversationsCache.set(userId, nextRows);
      setConversations(nextRows);
      hasLoadedRef.current = true;
      setHasLoaded(true);
    } catch (err) {
      console.error("Failed to load conversations", err);
      if (requestId !== requestIdRef.current) return;
      setError("We couldn't load your messages. Please try again.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [applyLocalRead, authStatus, userId]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const handleVisibility = () => setIsVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (!userId || authStatus !== "authenticated") return;
    if (!isVisible && hasLoadedRef.current) return;
    void loadConversations();
  }, [authStatus, isVisible, loadConversations, userId]);

  const buildConversationsChannel = useCallback(
    (activeClient) =>
      activeClient
        .channel(`conversations-business-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `business_id=eq.${userId}`,
          },
          () => {
            void loadConversations();
          }
        ),
    [loadConversations, userId]
  );

  useRealtimeChannel({
    supabase,
    enabled:
      !loadingUser &&
      authStatus === "authenticated" &&
      Boolean(userId),
    buildChannel: buildConversationsChannel,
    diagLabel: "business-conversations",
  });

  return (
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
          {conversations.length} chats
          {loading && hasLoaded ? (
            <span className="ml-2 text-slate-400" aria-live="polite">
              Updating...
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              void loadConversations();
            }}
            className="rounded-full border border-rose-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700 hover:text-rose-900"
          >
            Try again
          </button>
        </div>
      ) : null}

      <div className="mt-2 md:mt-3">
        <InboxList
          conversations={conversations}
          role="business"
          basePath="/business/messages"
          loading={showLoading}
          variant="business-flat"
        />
      </div>
    </div>
  );
}
