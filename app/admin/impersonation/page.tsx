import { startImpersonationAction, stopImpersonationAction } from "@/app/admin/actions";
import AdminFlash from "@/app/admin/_components/AdminFlash";
import { requireAdminAnyRole } from "@/lib/admin/permissions";
import { getAdminDataClient } from "@/lib/supabase/admin";

export default async function AdminImpersonationPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminAnyRole(["admin_support", "admin_super"]);
  const params = (await searchParams) || {};

  const { client } = await getAdminDataClient();
  const { data: sessions } = await client
    .from("admin_impersonation_sessions")
    .select("id, actor_user_id, target_user_id, reason, started_at, expires_at, ended_at, active")
    .order("started_at", { ascending: false })
    .limit(50);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Support mode / view-as</h2>
        <p className="text-sm text-neutral-400">Creates a safe session cookie for admin-only view context.</p>
      </header>

      <AdminFlash searchParams={params} />

      <form action={startImpersonationAction} className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3 md:grid-cols-3">
        <input name="targetUserId" required placeholder="target_user_id" className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
        <input name="minutes" type="number" min={1} max={480} defaultValue={30} className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
        <input name="reason" required placeholder="Reason" className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
        <button type="submit" className="rounded bg-amber-500 px-3 py-2 text-sm font-medium text-black hover:bg-amber-400 md:col-span-3">
          Start support mode
        </button>
      </form>

      <form action={stopImpersonationAction} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
        <h3 className="mb-2 text-sm font-semibold text-neutral-300">Stop by session id (optional)</h3>
        <div className="flex flex-wrap gap-2">
          <input name="sessionId" placeholder="session_id (optional, defaults to cookie session)" className="min-w-80 rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
          <input type="hidden" name="returnTo" value="/admin/impersonation" />
          <button type="submit" className="rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-black hover:bg-neutral-300">
            Stop support mode
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="mb-2 font-medium">Recent sessions</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-400">
                <th className="py-2 pr-3">Session</th>
                <th className="py-2 pr-3">Actor</th>
                <th className="py-2 pr-3">Target</th>
                <th className="py-2 pr-3">Reason</th>
                <th className="py-2 pr-3">Window</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {(sessions || []).map((session: any) => {
                const isOwner = session.actor_user_id === admin.user.id;
                const isActive = Boolean(session.active) && !session.ended_at;
                return (
                  <tr key={session.id} className="border-t border-neutral-800">
                    <td className="py-2 pr-3 font-mono text-xs">{session.id}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{session.actor_user_id}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{session.target_user_id}</td>
                    <td className="py-2 pr-3">{session.reason || "-"}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-400">
                      {new Date(session.started_at).toLocaleString()}<br />
                      to {new Date(session.expires_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">{isActive ? "active" : "inactive"}</td>
                    <td className="py-2 pr-3">
                      {isOwner && isActive ? (
                        <form action={stopImpersonationAction}>
                          <input type="hidden" name="sessionId" value={session.id} />
                          <input type="hidden" name="returnTo" value="/admin/impersonation" />
                          <button type="submit" className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500">
                            Stop
                          </button>
                        </form>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
              {!sessions?.length ? (
                <tr>
                  <td colSpan={7} className="py-3 text-neutral-400">
                    No impersonation sessions found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
