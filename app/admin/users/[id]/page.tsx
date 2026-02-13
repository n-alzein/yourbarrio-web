import Link from "next/link";
import {
  addUserInternalNoteAction,
  startImpersonationAction,
  toggleUserInternalAction,
  updateUserProfileFieldsAction,
  updateUserRoleAction,
} from "@/app/admin/actions";
import AdminFlash from "@/app/admin/_components/AdminFlash";
import AdminUserSecurityActions from "@/app/admin/users/[id]/_components/AdminUserSecurityActions";
import DeleteUserButton from "@/app/admin/users/[ref]/_components/DeleteUserButton";
import { getActorAdminRoleKeys } from "@/lib/admin/getActorAdminRoleKeys";
import { canAdmin, requireAdminRole } from "@/lib/admin/permissions";
import { getAdminDataClient } from "@/lib/supabase/admin";
import { getSupabaseServerAuthedClient } from "@/lib/supabaseServer";
import { normalizeUserRef } from "@/lib/ids/normalizeUserRef";

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminRole("admin_readonly");
  const authedClient = await getSupabaseServerAuthedClient();
  const actorUser = authedClient
    ? (await authedClient.auth.getUser()).data?.user || null
    : null;
  const actorRoleKeys = await getActorAdminRoleKeys(actorUser?.id);
  const { id } = await params;
  const normalizedRef = normalizeUserRef(id);
  const resolvedSearch = (await searchParams) || {};
  const diagEnabled =
    String(process.env.NEXT_PUBLIC_AUTH_DIAG || "") === "1" ||
    String(process.env.AUTH_GUARD_DIAG || "") === "1";

  const { client, usingServiceRole } = await getAdminDataClient({ mode: "service" });
  const resolvedUserId = normalizedRef.id;
  const resolvedPublicId = normalizedRef.public_id;
  const { data: accountRows, error: userError } = resolvedUserId
    ? await client.rpc("admin_get_account", { p_user_id: resolvedUserId })
    : resolvedPublicId
      ? await client.rpc("admin_get_account_by_public_id", { p_public_id: resolvedPublicId })
      : { data: null, error: null };
  const user = Array.isArray(accountRows) ? accountRows[0] || null : null;

  if (userError) {
    console.error("[admin] admin_get_account failed", {
      accountId: resolvedUserId || null,
      accountPublicId: resolvedPublicId || null,
      message: userError?.message,
      details: userError?.details,
      hint: userError?.hint,
      code: userError?.code,
    });
  }

  if (diagEnabled) {
    console.warn("[admin-user-detail] load", {
      userRef: id,
      userId: resolvedUserId || null,
      userPublicId: resolvedPublicId || null,
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
  const canSuper = actorRoleKeys.includes("admin_super");

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Account detail</h2>
          <div className="mt-1 flex items-center gap-2">
            <code className="rounded border border-neutral-700 bg-neutral-950 px-2 py-0.5 text-xs text-neutral-300">
              usr_{user.public_id || user.id.slice(0, 8)}
            </code>
            <details className="text-xs text-neutral-500">
              <summary className="cursor-pointer">Internal ID</summary>
              <code className="mt-1 block break-all text-neutral-400">{user.id}</code>
            </details>
          </div>
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
            <Field label="Public ID" value={user.public_id || "-"} />
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
            <form
              action={updateUserProfileFieldsAction}
              className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"
            >
              <h3 className="mb-2 font-medium">Edit profile fields</h3>
              <input type="hidden" name="userId" value={user.id} />
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  name="full_name"
                  defaultValue={user.full_name || ""}
                  placeholder="Full name"
                  className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                />
                <input
                  name="phone"
                  defaultValue={user.phone || ""}
                  placeholder="Phone"
                  className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                />
                <input
                  name="business_name"
                  defaultValue={user.business_name || ""}
                  placeholder="Business name"
                  className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                />
                <input
                  name="category"
                  defaultValue={user.category || ""}
                  placeholder="Category"
                  className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                />
                <input
                  name="website"
                  defaultValue={user.website || ""}
                  placeholder="Website"
                  className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                />
                <input
                  name="address"
                  defaultValue={user.address || ""}
                  placeholder="Address"
                  className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                />
                <input
                  name="address2"
                  defaultValue={user.address_2 || ""}
                  placeholder="Address 2"
                  className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                />
                <input
                  name="city"
                  defaultValue={user.city || ""}
                  placeholder="City"
                  className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                />
                <input
                  name="state"
                  defaultValue={user.state || ""}
                  placeholder="State"
                  className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                />
                <input
                  name="postal_code"
                  defaultValue={user.postal_code || ""}
                  placeholder="Postal code"
                  className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                />
              </div>
              <button type="submit" className="mt-2 rounded bg-sky-600 px-3 py-2 text-sm hover:bg-sky-500">
                Save profile
              </button>
            </form>
          ) : null}

          {canRoleFixes ? (
            <form action={updateUserRoleAction} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="mb-2 font-medium">Update app role</h3>
              <input type="hidden" name="userId" value={user.id} />
              <input
                name="role"
                defaultValue={user.role || "customer"}
                className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
              />
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
              <textarea
                name="note"
                required
                rows={4}
                className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                placeholder="Internal note (saved in admin_audit_log.meta.note)"
              />
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
                <input
                  name="minutes"
                  type="number"
                  min={1}
                  max={480}
                  defaultValue={30}
                  className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                />
                <input
                  name="reason"
                  required
                  placeholder="Reason"
                  className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="mt-2 rounded bg-amber-500 px-3 py-2 text-sm font-medium text-black hover:bg-amber-400"
              >
                Start view-as session
              </button>
            </form>
          ) : null}

          <AdminUserSecurityActions
            targetUserId={user.id}
            currentEmail={user.email || null}
            canManageSecurity={canSuper}
          />

          <div className="rounded-lg border border-rose-900/70 bg-rose-950/30 p-4">
            <h3 className="mb-2 font-medium text-rose-100">Danger zone</h3>
            <p className="mb-3 text-sm text-rose-200/80">
              Permanently deleting a user cannot be undone.
            </p>
            <DeleteUserButton targetUserId={user.id} actorRoleKeys={actorRoleKeys} />
          </div>
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
