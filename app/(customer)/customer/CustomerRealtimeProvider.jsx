"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRealtimeChannel } from "@/lib/realtime/useRealtimeChannel";

const UNREAD_REFRESH_EVENT = "yb-unread-refresh";

export default function CustomerRealtimeProvider({ children }) {
  const { supabase, user, profile, role, authStatus } = useAuth();
  const isCustomer = role === "customer";
  const unreadUserId = user?.id || profile?.id || null;

  const shouldEnable =
    authStatus === "authenticated" && isCustomer && Boolean(unreadUserId);
  const [debouncedEnabled, setDebouncedEnabled] = useState(false);

  useEffect(() => {
    const delay = shouldEnable ? 400 : 0;
    const timeoutId = setTimeout(() => {
      setDebouncedEnabled(shouldEnable);
    }, delay);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [shouldEnable]);

  const emitUnreadRefresh = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(UNREAD_REFRESH_EVENT));
  }, []);

  const buildUnreadChannel = useMemo(() => {
    if (!unreadUserId) return null;
    return (scopedClient) =>
      scopedClient
        .channel(`customer-unread-${unreadUserId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `customer_id=eq.${unreadUserId}`,
          },
          () => {
            emitUnreadRefresh();
          }
        );
  }, [emitUnreadRefresh, unreadUserId]);

  useRealtimeChannel({
    supabase,
    enabled: debouncedEnabled && typeof buildUnreadChannel === "function",
    buildChannel: buildUnreadChannel,
    diagLabel: "header-unread",
  });

  return children;
}
