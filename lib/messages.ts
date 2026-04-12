import { normalizeAccountStatus } from "@/lib/accountDeletion/status";
import { resolveImageSrc } from "@/lib/safeImage";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { logMutation, requireSession } from "@/lib/auth/requireSession";

export const MESSAGE_PAGE_SIZE = 50;
export const CONVERSATION_PAGE_SIZE = 40;

export function getDisplayName(profile: {
  business_name?: string | null;
  full_name?: string | null;
  account_status?: string | null;
} | null) {
  if (normalizeAccountStatus(profile?.account_status) === "deleted") {
    return "Deleted user";
  }
  return profile?.business_name || profile?.full_name || "Unknown";
}

export function getAvatarUrl(profile: {
  profile_photo_url?: string | null;
  account_status?: string | null;
} | null) {
  if (normalizeAccountStatus(profile?.account_status) === "deleted") {
    return resolveImageSrc(null, "/business-placeholder.png");
  }
  return resolveImageSrc(
    profile?.profile_photo_url,
    "/business-placeholder.png"
  );
}

export function getUnreadCount(
  conversation: {
    customer_unread_count?: number | null;
    business_unread_count?: number | null;
  },
  role: "customer" | "business"
) {
  return role === "business"
    ? Number(conversation?.business_unread_count || 0)
    : Number(conversation?.customer_unread_count || 0);
}

export async function fetchConversations({
  supabase,
  userId,
  role,
  onTiming = null,
}: {
  supabase?: any;
  userId: string;
  role: "customer" | "business";
  onTiming?: ((payload: Record<string, unknown>) => void | Promise<void>) | null;
}) {
  const client = supabase ?? getSupabaseBrowserClient();
  if (!client) return [];

  const diagEnabled =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_MSG_DIAG === "1";
  const startTime = diagEnabled ? Date.now() : 0;

  const idField = role === "business" ? "business_id" : "customer_id";
  const queryStart = typeof performance !== "undefined" ? performance.now() : Date.now();
  const { data, error } = await client
    .from("conversations")
    .select(
      [
        "id",
        "customer_id",
        "business_id",
        "last_message_at",
        "last_message_preview",
        "customer_unread_count",
        "business_unread_count",
      ].join(",")
    )
    .eq(idField, userId)
    .order("last_message_at", { ascending: false })
    .limit(CONVERSATION_PAGE_SIZE);
  const queryMs =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
    queryStart;

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  const profileIds =
    role === "business"
      ? rows.map((row) => row.customer_id)
      : rows.map((row) => row.business_id);
  const profileStart = typeof performance !== "undefined" ? performance.now() : Date.now();
  const profiles = await fetchProfilesByIds({
    supabase: client,
    ids: profileIds,
  });
  const profileMs =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
    profileStart;

  const conversations = rows.map((row) => ({
    ...row,
    customer:
      role === "business" ? profiles[row.customer_id] ?? null : null,
    business:
      role === "customer" ? profiles[row.business_id] ?? null : null,
  }));

  if (diagEnabled && typeof window !== "undefined") {
    const durationMs = Date.now() - startTime;
    console.log("[MSG_DIAG]", {
      phase: "fetchConversations",
      role,
      userId,
      durationMs,
      count: conversations.length,
    });
  }

  if (typeof onTiming === "function") {
    await onTiming({
      role,
      conversationCount: conversations.length,
      queryMs: Math.round(queryMs),
      profileMs: Math.round(profileMs),
      totalMs: Math.round(queryMs + profileMs),
    });
  }

  return conversations;
}

export async function fetchConversationById({
  supabase,
  conversationId,
}: {
  supabase?: any;
  conversationId: string;
}) {
  const data = await fetchConversationBaseById({
    supabase,
    conversationId,
  });
  if (!data) return null;

  return hydrateConversationProfiles({
    supabase,
    conversation: data,
  });
}

export async function fetchConversationWithMessages({
  supabase,
  conversationId,
  limit = MESSAGE_PAGE_SIZE,
  profileRole = null,
  onTiming = null,
}: {
  supabase?: any;
  conversationId: string;
  limit?: number;
  profileRole?: "customer" | "business" | null;
  onTiming?: ((payload: Record<string, unknown>) => void | Promise<void>) | null;
}) {
  const client = supabase ?? getSupabaseBrowserClient();
  if (!client) return { conversation: null, messages: [] };

  const conversationStart = typeof performance !== "undefined" ? performance.now() : Date.now();
  const conversation = await fetchConversationBaseById({
    supabase: client,
    conversationId,
  });
  const conversationLookupMs =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
    conversationStart;

  if (!conversation) {
    if (typeof onTiming === "function") {
      await onTiming({
        outcome: "not_found",
        conversationLookupMs: Math.round(conversationLookupMs),
        totalMs: Math.round(conversationLookupMs),
      });
    }
    return { conversation: null, messages: [] };
  }

  const hydrateStart = typeof performance !== "undefined" ? performance.now() : Date.now();
  const messageStart = typeof performance !== "undefined" ? performance.now() : Date.now();
  const [hydratedConversation, messages] = await Promise.all([
    hydrateConversationProfiles({
      supabase: client,
      conversation,
      profileRole,
    }),
    fetchMessages({
      supabase: client,
      conversationId,
      limit,
    }),
  ]);
  const profileHydrationMs =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
    hydrateStart;
  const messagesQueryMs =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
    messageStart;

  if (typeof onTiming === "function") {
    await onTiming({
      profileRole,
      conversationLookupMs: Math.round(conversationLookupMs),
      profileHydrationMs: Math.round(profileHydrationMs),
      messagesQueryMs: Math.round(messagesQueryMs),
      messageCount: messages.length,
      totalMs: Math.round(
        conversationLookupMs + Math.max(profileHydrationMs, messagesQueryMs)
      ),
    });
  }

  return {
    conversation: hydratedConversation,
    messages,
  };
}

async function fetchConversationBaseById({
  supabase,
  conversationId,
}: {
  supabase?: any;
  conversationId: string;
}) {
  const client = supabase ?? getSupabaseBrowserClient();
  if (!client) return null;

  const { data, error } = await client
    .from("conversations")
    .select(
      [
        "id",
        "customer_id",
        "business_id",
        "last_message_at",
        "last_message_preview",
        "customer_unread_count",
        "business_unread_count",
      ].join(",")
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function hydrateConversationProfiles({
  supabase,
  conversation,
  profileRole = null,
}: {
  supabase?: any;
  conversation: any;
  profileRole?: "customer" | "business" | null;
}) {
  const client = supabase ?? getSupabaseBrowserClient();
  if (!client || !conversation) return conversation ?? null;
  const ids =
    profileRole === "business"
      ? [conversation.business_id]
      : profileRole === "customer"
        ? [conversation.customer_id]
        : [conversation.customer_id, conversation.business_id];

  const profiles = await fetchProfilesByIds({
    supabase: client,
    ids,
  });

  return {
    ...conversation,
    customer:
      profileRole && profileRole !== "customer"
        ? null
        : profiles[conversation.customer_id] ?? null,
    business:
      profileRole && profileRole !== "business"
        ? null
        : profiles[conversation.business_id] ?? null,
  };
}

export function getOtherConversationProfile({
  conversation,
  currentUserId,
}: {
  conversation?: any;
  currentUserId?: string | null;
}) {
  if (!conversation) return null;
  return conversation.customer_id === currentUserId
    ? conversation.business ?? null
    : conversation.customer ?? null;
}

export async function fetchMessages({
  supabase,
  conversationId,
  limit = MESSAGE_PAGE_SIZE,
  before,
}: {
  supabase?: any;
  conversationId: string;
  limit?: number;
  before?: string | null;
}) {
  const client = supabase ?? getSupabaseBrowserClient();
  if (!client) return [];

  let query = client
    .from("messages")
    .select("id, conversation_id, sender_id, recipient_id, body, created_at, read_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.reverse();
}

export async function sendMessage({
  supabase,
  conversationId,
  recipientId,
  body,
  session,
}: {
  supabase?: any;
  conversationId: string;
  recipientId: string;
  body: string;
  session?: any;
}) {
  const client = supabase ?? getSupabaseBrowserClient();
  if (!client) return null;

  const activeSession =
    session ?? (await requireSession(client, { label: "sendMessage" }));
  const sessionUserId = activeSession?.user?.id ?? null;

  logMutation("sendMessage", {
    stage: "start",
    conversationId,
    senderId: sessionUserId,
    recipientId,
    hasAccessToken: Boolean(activeSession?.access_token),
  });

  try {
    const { data, error } = await client
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: sessionUserId,
        recipient_id: recipientId,
        body,
      })
      .select("id, conversation_id, sender_id, recipient_id, body, created_at, read_at")
      .single();

    if (error) {
      logMutation("sendMessage", { stage: "error", error: error?.message || error });
      throw error;
    }
    logMutation("sendMessage", { stage: "success", messageId: data.id });
    return data;
  } catch (err) {
    logMutation("sendMessage", { stage: "exception", error: err?.message || String(err) });
    throw err;
  }
}

export async function getOrCreateConversation({
  supabase,
  businessId,
  session,
}: {
  supabase?: any;
  businessId: string;
  session?: any;
}) {
  const client = supabase ?? getSupabaseBrowserClient();
  if (!client) return null;

  const activeSession =
    session ?? (await requireSession(client, { label: "getOrCreateConversation" }));
  const resolvedCustomerId = activeSession?.user?.id ?? null;

  logMutation("getOrCreateConversation", {
    stage: "start",
    customerId: resolvedCustomerId,
    businessId,
    hasAccessToken: Boolean(activeSession?.access_token),
  });

  const { data, error } = await client.rpc("get_or_create_conversation", {
    customer_id: resolvedCustomerId,
    business_id: businessId,
  });

  if (!error) {
    logMutation("getOrCreateConversation", { stage: "success", conversationId: data });
    return data || null;
  }

  const message = (error?.message || "").toLowerCase();
  const missingRpc =
    error?.code === "PGRST202" ||
    message.includes("could not find the function") ||
    message.includes("function public.get_or_create_conversation");

  if (!missingRpc) {
    logMutation("getOrCreateConversation", {
      stage: "error",
      error: error?.message || error,
    });
    throw error;
  }

  const { data: existing, error: existingError } = await client
    .from("conversations")
    .select("id")
    .eq("customer_id", resolvedCustomerId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (existingError) {
    logMutation("getOrCreateConversation", {
      stage: "fallback_error",
      error: existingError?.message || existingError,
    });
    throw existingError;
  }
  if (existing?.id) {
    logMutation("getOrCreateConversation", {
      stage: "fallback_existing",
      conversationId: existing.id,
    });
    return existing.id;
  }

  const { data: upserted, error: upsertError } = await client
    .from("conversations")
    .upsert(
      { customer_id: resolvedCustomerId, business_id: businessId },
      { onConflict: "customer_id,business_id" }
    )
    .select("id")
    .single();

  if (upsertError) {
    logMutation("getOrCreateConversation", {
      stage: "fallback_error",
      error: upsertError?.message || upsertError,
    });
    throw upsertError;
  }
  logMutation("getOrCreateConversation", {
    stage: "fallback_success",
    conversationId: upserted?.id || null,
  });
  return upserted?.id || null;
}

export async function markConversationRead({
  supabase,
  conversationId,
}: {
  supabase?: any;
  conversationId: string;
}) {
  const client = supabase ?? getSupabaseBrowserClient();
  if (!client) return null;

  const activeSession = await requireSession(client, {
    label: "markConversationRead",
  });
  logMutation("markConversationRead", {
    stage: "start",
    conversationId,
    sessionUserId: activeSession?.user?.id ?? null,
  });

  const { error } = await client.rpc("mark_conversation_read", {
    conversation_id: conversationId,
  });

  if (error) {
    logMutation("markConversationRead", { stage: "error", error: error?.message || error });
    throw error;
  }
  logMutation("markConversationRead", { stage: "success" });
  return true;
}

export async function fetchUnreadTotal({
  supabase,
  userId,
  role,
}: {
  supabase?: any;
  userId: string;
  role: "customer" | "business";
}) {
  const client = supabase ?? getSupabaseBrowserClient();
  if (!client) return 0;
  if (!userId) return 0;

  const { data, error } = await client.rpc("unread_total", {
    p_role: role,
    p_uid: userId,
  });

  if (!error) return Number(data || 0);

  const message = (error?.message || "").toLowerCase();
  const missingRpc =
    error?.code === "PGRST202" ||
    message.includes("could not find the function") ||
    message.includes("function public.unread_total");

  if (!missingRpc) throw error;

  const field = role === "business" ? "business_id" : "customer_id";
  const { data: rowsData, error: rowError } = await client
    .from("conversations")
    .select("customer_unread_count, business_unread_count")
    .eq(field, userId);

  if (rowError) throw rowError;
  const rows = Array.isArray(rowsData) ? rowsData : [];
  return rows.reduce((sum, row) => sum + getUnreadCount(row, role), 0);
}

async function fetchProfilesByIds({
  supabase,
  ids,
}: {
  supabase?: any;
  ids: Array<string | null | undefined>;
}) {
  const client = supabase ?? getSupabaseBrowserClient();
  if (!client) return {};
  const uniqueIds = Array.from(
    new Set(ids.filter((id): id is string => Boolean(id)))
  );
  if (uniqueIds.length === 0) return {};

  const { data, error } = await client
    .from("users")
    .select("id, full_name, business_name, profile_photo_url, account_status")
    .in("id", uniqueIds);

  if (error) throw error;

  const profiles = Array.isArray(data) ? data : [];
  return profiles.reduce<Record<string, any>>((map, profile) => {
    if (profile?.id) map[profile.id] = profile;
    return map;
  }, {});
}
