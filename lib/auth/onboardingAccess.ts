import type { SupabaseClient } from "@supabase/supabase-js";

type HeaderReader = {
  get(name: string): string | null;
};

export function isDocumentNavigationFromHeaders(headerList: HeaderReader): boolean {
  const mode = (headerList.get("sec-fetch-mode") || "").toLowerCase();
  const dest = (headerList.get("sec-fetch-dest") || "").toLowerCase();
  const fetchUser = headerList.get("sec-fetch-user");
  return mode === "navigate" || dest === "document" || fetchUser === "?1";
}

export async function getOnboardingAccess(
  supabase: SupabaseClient,
  userId: string
): Promise<{ hasBusinessRow: boolean }> {
  if (!userId) return { hasBusinessRow: false };
  const { data } = await supabase
    .from("businesses")
    .select("owner_user_id")
    .eq("owner_user_id", userId)
    .maybeSingle();
  return { hasBusinessRow: Boolean(data?.owner_user_id) };
}
