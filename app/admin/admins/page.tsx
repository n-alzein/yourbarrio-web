import AccountsList from "@/app/admin/_components/AccountsList";
import AdminPage from "@/app/admin/_components/AdminPage";
import {
  changeAdminRoleAction,
  disableAdminAccessAction,
  upsertAdminAccountAction,
} from "@/app/admin/actions";
import {
  ADMIN_ROLES,
  canAdmin,
  requireAdminRole,
} from "@/lib/admin/permissions";
import { formatAdminRoleLabel } from "@/lib/admin/roleLabels";
import { getAdminDataClient } from "@/lib/supabase/admin";

export default async function AdminAdminsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminRole("admin_readonly");
  const params = (await searchParams) || {};
  const canManageAdmins = admin.strictPermissionBypassUsed || canAdmin(admin.roles, "manage_admins");

  let adminRows: Array<{
    user_id: string;
    role_key: string;
    created_at: string | null;
    granted_by: string | null;
    email: string | null;
    full_name: string | null;
    is_internal: boolean;
  }> = [];

  if (canManageAdmins) {
    const { client } = await getAdminDataClient({ mode: "service" });
    const { data: members } = await client
      .from("admin_role_members")
      .select("user_id, role_key, created_at, granted_by")
      .order("created_at", { ascending: false });

    const userIds = Array.from(new Set((members || []).map((row: any) => String(row.user_id || "")).filter(Boolean)));
    const { data: users } = userIds.length
      ? await client
          .from("users")
          .select("id, email, full_name, is_internal")
          .in("id", userIds)
      : { data: [] as any[] };

    const usersById = new Map<
      string,
      { email: string | null; full_name: string | null; is_internal: boolean }
    >(
      (users || []).map((row: any) => [
        String(row.id),
        {
          email: row.email ?? null,
          full_name: row.full_name ?? null,
          is_internal: row.is_internal === true,
        },
      ])
    );

    adminRows = (members || []).map((row: any) => {
      const userId = String(row.user_id || "");
      const user = usersById.get(userId);
      return {
        user_id: userId,
        role_key: String(row.role_key || ""),
        created_at: row.created_at || null,
        granted_by: row.granted_by || null,
        email: user?.email || null,
        full_name: user?.full_name || null,
        is_internal: Boolean(user?.is_internal),
      };
    });
  }

  return (
    <AdminPage>
      <AccountsList
        title="Admins"
        description="Internal/admin staff accounts."
        basePath="/admin/admins"
        searchParams={params}
        presetRole="admin"
      />

      {canManageAdmins ? (
        <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <header>
            <h3 className="font-semibold">Admin management</h3>
            <p className="text-sm text-neutral-400">Create/invite admins, assign role, and disable access.</p>
          </header>

          <form action={upsertAdminAccountAction} className="grid gap-2 md:grid-cols-3">
            <input
              name="email"
              type="email"
              required
              placeholder="admin email"
              className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            />
            <select
              name="role"
              defaultValue="admin_support"
              className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            >
              {ADMIN_ROLES.map((role) => (
                <option key={role} value={role}>
                  {formatAdminRoleLabel(role)}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500">
              Invite or update admin
            </button>
          </form>

          <div className="overflow-x-auto rounded border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-400">
                  <th className="px-3 py-2">Admin</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Granted</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {adminRows.map((row) => {
                  const role = (ADMIN_ROLES.includes(row.role_key as any)
                    ? row.role_key
                    : "admin_support") as string;
                  return (
                    <tr key={`${row.user_id}-${row.role_key}`} className="border-t border-neutral-800">
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.full_name || row.email || row.user_id}</div>
                        <div className="font-mono text-xs text-neutral-500">{row.user_id}</div>
                      </td>
                      <td className="px-3 py-2">{formatAdminRoleLabel(row.role_key)}</td>
                      <td className="px-3 py-2 text-xs text-neutral-400">
                        {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <form action={changeAdminRoleAction} className="flex items-center gap-2">
                            <input type="hidden" name="userId" value={row.user_id} />
                            <select
                              name="role"
                              defaultValue={role}
                              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
                            >
                              {ADMIN_ROLES.map((adminRole) => (
                                <option key={adminRole} value={adminRole}>
                                  {formatAdminRoleLabel(adminRole)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
                            >
                              Change role
                            </button>
                          </form>
                          <form action={disableAdminAccessAction}>
                            <input type="hidden" name="userId" value={row.user_id} />
                            <button
                              type="submit"
                              className="rounded border border-rose-700 px-2 py-1 text-xs text-rose-200 hover:border-rose-500"
                            >
                              Disable admin
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!adminRows.length ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-neutral-400">
                      No admin role members found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </AdminPage>
  );
}
