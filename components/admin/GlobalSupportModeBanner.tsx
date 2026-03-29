import {
  goToImpersonatedHomeAction,
  stopImpersonationAction,
} from "@/app/admin/actions";
import { getServerAuth } from "@/lib/auth/server";
import {
  getEffectiveActorAndTarget,
  readSupportModeCookies,
  validateSupportModeSession,
} from "@/lib/admin/supportMode";
import { getAdminDataClient } from "@/lib/supabase/admin";

export default async function GlobalSupportModeBanner() {
  try {
    const { user } = await getServerAuth();
    if (!user?.id) return null;

    const cookieState = await readSupportModeCookies();
    if (!cookieState.hasCookies) return null;

    const sessionValidation = await validateSupportModeSession(user.id);
    const resolved = sessionValidation.ok
      ? await getEffectiveActorAndTarget(user.id)
      : null;

    let targetLabel = resolved?.targetUserId || cookieState.targetUserId || "unknown user";
    try {
      const { client } = await getAdminDataClient({ mode: "service" });
      const { data: targetUser } = await client
        .from("users")
        .select("id, full_name, email")
        .eq("id", resolved?.targetUserId || cookieState.targetUserId || "")
        .maybeSingle();
      targetLabel =
        targetUser?.full_name ||
        targetUser?.email ||
        resolved?.targetUserId ||
        cookieState.targetUserId ||
        "unknown user";
    } catch {
      targetLabel = resolved?.targetUserId || cookieState.targetUserId || "unknown user";
    }

    const isValid = Boolean(sessionValidation.ok && resolved?.supportMode);

    return (
      <>
        <style>{`:root { --yb-support-mode-offset: 3rem; }`}</style>
        <div
          className="fixed inset-x-0 top-0 z-[6000] h-12 border-b border-amber-500 bg-amber-300/95 px-4 text-sm text-amber-950 backdrop-blur"
          data-support-mode-banner="1"
        >
          <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between gap-3">
          {isValid ? (
            <p className="truncate text-amber-950">
              Support mode active: viewing as <span className="font-semibold">{targetLabel}</span>
            </p>
          ) : (
            <p className="truncate text-amber-950">
              {sessionValidation.reason === "wrong-target"
                ? "Support mode target mismatch detected. Exit and restart support mode."
                : "Support mode cookies detected but session is invalid/expired."}
            </p>
          )}
          <div className="flex items-center gap-2">
            {isValid ? (
              <form action={goToImpersonatedHomeAction}>
                <button
                  type="submit"
                  className="rounded bg-sky-200 px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-sky-100"
                >
                  Go to user home
                </button>
              </form>
            ) : null}
            <form action={stopImpersonationAction}>
              <input type="hidden" name="sessionId" value={resolved?.sessionId || cookieState.sessionId || ""} />
              <input type="hidden" name="returnTo" value="/admin" />
              <button
                type="submit"
                className="rounded bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-50"
              >
                Exit support mode
              </button>
            </form>
          </div>
        </div>
        </div>
      </>
    );
  } catch {
    return null;
  }
}
