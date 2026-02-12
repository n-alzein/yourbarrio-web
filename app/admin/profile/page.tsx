import { stopImpersonationAction } from "@/app/admin/actions";
import { getEffectiveActorAndTarget } from "@/lib/admin/supportMode";
import { getHighestAdminRole, requireAdminRole } from "@/lib/admin/permissions";
import { formatAdminRoleLabel } from "@/lib/admin/roleLabels";
import { getAdminServiceRoleClient } from "@/lib/supabase/admin";

export default async function AdminProfilePage() {
  const admin = await requireAdminRole("admin_readonly");
  const currentRole = getHighestAdminRole(admin.roles) || "admin_readonly";
  const supportMode = await getEffectiveActorAndTarget(admin.user.id);

  let lastSignInAt: string | null = null;
  try {
    const serviceClient = getAdminServiceRoleClient();
    const authResult = await serviceClient.auth.admin.getUserById(admin.user.id);
    lastSignInAt = authResult.data?.user?.last_sign_in_at || null;
  } catch {
    // Best effort only.
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Admin profile</h2>
        <p className="text-sm text-neutral-400">Current admin identity, role, and support mode state.</p>
      </header>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <dl className="space-y-2 text-sm">
          <ProfileField label="Email" value={admin.user.email || "-"} />
          <ProfileField label="User ID" value={admin.user.id} />
          <ProfileField label="Admin role" value={formatAdminRoleLabel(currentRole)} />
          <ProfileField
            label="Profile created"
            value={admin.profile?.created_at ? new Date(admin.profile.created_at).toLocaleString() : "-"}
          />
          <ProfileField
            label="Last sign in"
            value={lastSignInAt ? new Date(lastSignInAt).toLocaleString() : "-"}
          />
        </dl>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="mb-2 font-medium">Support mode</h3>
        {supportMode.supportMode ? (
          <div className="space-y-2 text-sm">
            <p>
              Active for target <span className="font-mono">{supportMode.targetUserId}</span> ({supportMode.targetRole})
            </p>
            <p className="text-xs text-neutral-400">Session: {supportMode.sessionId}</p>
            <form action={stopImpersonationAction}>
              <input type="hidden" name="sessionId" value={supportMode.sessionId} />
              <input type="hidden" name="returnTo" value="/admin/profile" />
              <button type="submit" className="rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-black hover:bg-neutral-300">
                End support mode
              </button>
            </form>
          </div>
        ) : (
          <p className="text-sm text-neutral-400">No active support mode session.</p>
        )}
      </div>
    </section>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2">
      <dt className="text-neutral-400">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}
