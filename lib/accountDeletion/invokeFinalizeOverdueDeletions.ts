import "server-only";

type InvokeFinalizeOverdueDeletionsOptions = {
  dryRun?: boolean;
  limit?: number;
  source?: string;
  userId?: string | null;
};

export async function invokeFinalizeOverdueDeletions(
  options: InvokeFinalizeOverdueDeletionsOptions = {},
) {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const token = String(process.env.ACCOUNT_DELETION_FINALIZER_TOKEN || "").trim();

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  }
  if (!token) {
    throw new Error("ACCOUNT_DELETION_FINALIZER_TOKEN is missing.");
  }

  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/finalize-overdue-deletions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        dryRun: options.dryRun === true,
        limit: options.limit,
        source: options.source || "admin_api",
        userId: options.userId || null,
      }),
      cache: "no-store",
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(String(payload?.error || "Failed to invoke finalize-overdue-deletions."));
  }

  return payload;
}
