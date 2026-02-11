import Link from "next/link";
import {
  addUserInternalNoteAction,
  startImpersonationAction,
  toggleUserInternalAction,
  updateUserRoleAction,
} from "@/app/admin/actions";
import AdminFlash from "@/app/admin/_components/AdminFlash";
import { canAdmin, requireAdminRole } from "@/lib/admin/permissions";
import { getAdminDataClient } from "@/lib/supabase/admin";

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminRole("admin_readonly");
  const { id } = await params;
  const resolvedSearch = (await searchParams) || {};
  const diagEnabled =
    String(process.env.NEXT_PUBLIC_AUTH_DIAG || "") === "1" ||
    String(process.env.AUTH_GUARD_DIAG || "") === "1";

  const { client, usingServiceRole } = await getAdminDataClient({ mode: "service" });
  const { data: user, error: userError } = await client.from("users").select("*").eq("id", id).maybeSingle();

  if (diagEnabled) {
    console.warn("[admin-user-detail] load", {
      userId: id,
      usingServiceRole,
      errorCode: userError?.code || null,
      errorMessage: userError?.message || null,
    });
  }

  if (userError) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Unable to load account</h2>
        <p className="text-sm text-neutral-400">
          There was a problem loading this account. Try again in a moment.
        </p>
        <Link href="/admin/accounts" className="text-sm text-sky-300 hover:text-sky-200">
          Back to accounts
        </Link>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Account not found</h2>
        <Link href="/admin/accounts" className="text-sm text-sky-300 hover:text-sky-200">
          Back to accounts
        </Link>
      </section>
    );
  }

  const canSupport = admin.strictPermissionBypassUsed || canAdmin(admin.roles, "add_internal_note");
  const canImpersonate = admin.strictPermissionBypassUsed || canAdmin(admin.roles, "impersonate");
  const canOps = admin.strictPermissionBypassUsed || canAdmin(admin.roles, "toggle_internal_user");
  const canRoleFixes = admin.strictPermissionBypassUsed || canAdmin(admin.roles, "update_app_role");

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Account detail</h2>
          <p className="text-sm text-neutral-400 font-mono">{user.id}</p>
        </div>
        <Link href="/admin/accounts" className="text-sm text-sky-300 hover:text-sky-200">
          Back to accounts
        </Link>
      </header>

      <AdminFlash searchParams={resolvedSearch} />

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <h3 className="mb-2 font-medium">Profile</h3>
          <dl className="space-y-2 text-sm">
            <Field label="Email" value={user.email} />
            <Field label="Full name" value={user.full_name} />
            <Field label="Phone" value={user.phone} />
            <Field label="Role" value={user.role} />
            <Field label="Business name" value={user.business_name} />
            <Field label="Category" value={user.category} />
            <Field label="Website" value={user.website} />
            <Field label="Address" value={user.address} />
            <Field label="Address 2" value={user.address_2} />
            <Field label="City" value={user.city} />
            <Field label="State" value={user.state} />
            <Field label="Postal" value={user.postal_code} />
            <Field label="Internal" value={String(Boolean(user.is_internal))} />
            <Field label="Created" value={user.created_at ? new Date(user.created_at).toLocaleString() : "-"} />
            <Field label="Updated" value={user.updated_at ? new Date(user.updated_at).toLocaleString() : "-"} />
          </dl>
        </div>

        <div className="space-y-3">
          {canRoleFixes ? (
            <form action={updateUserRoleAction} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="mb-2 font-medium">Update app role</h3>
              <input type="hidden" name="userId" value={user.id} />
              <input name="role" defaultValue={user.role || "customer"} className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
              <button type="submit" className="mt-2 rounded bg-sky-600 px-3 py-2 text-sm hover:bg-sky-500">
                Save role
              </button>
            </form>
          ) : null}

          {canOps ? (
            <form action={toggleUserInternalAction} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="mb-2 font-medium">Toggle internal user</h3>
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="isInternal" value={String(!user.is_internal)} />
              <button type="submit" className="rounded bg-sky-600 px-3 py-2 text-sm hover:bg-sky-500">
                Set is_internal = {String(!user.is_internal)}
              </button>
            </form>
          ) : null}

          {canSupport ? (
            <form action={addUserInternalNoteAction} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="mb-2 font-medium">Add internal note (audit log)</h3>
              <input type="hidden" name="userId" value={user.id} />
              <textarea name="note" required rows={4} className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" placeholder="Internal note (saved in admin_audit_log.meta.note)" />
              <button type="submit" className="mt-2 rounded bg-sky-600 px-3 py-2 text-sm hover:bg-sky-500">
                Log note
              </button>
            </form>
          ) : null}

          {canImpersonate ? (
            <form action={startImpersonationAction} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="mb-2 font-medium">Start support mode (view-as)</h3>
              <input type="hidden" name="targetUserId" value={user.id} />
              <div className="grid gap-2 sm:grid-cols-2">
                <input name="minutes" type="number" min={1} max={480} defaultValue={30} className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
                <input name="reason" required placeholder="Reason" className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
              </div>
              <button type="submit" className="mt-2 rounded bg-amber-500 px-3 py-2 text-sm font-medium text-black hover:bg-amber-400">
                Start view-as session
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <dt className="text-neutral-400">{label}</dt>
      <dd className="break-all">{value || "-"}</dd>
    </div>
  );
}
