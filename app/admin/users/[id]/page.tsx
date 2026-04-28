import Link from "next/link";
import type { ReactNode } from "react";
import {
  startImpersonationAction,
  toggleBusinessInternalAction,
  toggleUserInternalAction,
} from "@/app/admin/actions";
import AdminPage from "@/app/admin/_components/AdminPage";
import AdminFlash from "@/app/admin/_components/AdminFlash";
import BusinessVerificationActionsClient from "@/app/admin/verification/_components/BusinessVerificationActionsClient";
import AdminUserDetailLayout from "@/app/admin/users/[id]/_components/AdminUserDetailLayout";
import AdminUserHeaderBar from "@/app/admin/users/[id]/_components/AdminUserHeaderBar";
import AdminUserActivityPanel from "@/app/admin/users/[id]/_components/AdminUserActivityPanel";
import AdminBusinessListingsTab from "@/app/admin/users/[id]/_components/AdminBusinessListingsTab";
import AdminUserNotesPanel from "@/app/admin/users/[id]/_components/AdminUserNotesPanel";
import AdminUserProfileEditor from "@/app/admin/users/[id]/_components/AdminUserProfileEditor";
import AdminUserRoleEditor from "@/app/admin/users/[id]/_components/AdminUserRoleEditor";
import AdminUserSecurityActions from "@/app/admin/users/[id]/_components/AdminUserSecurityActions";
import AdminRestoreAccountButton from "@/app/admin/users/[id]/_components/AdminRestoreAccountButton";
import DeleteUserButton from "@/app/admin/users/[ref]/_components/DeleteUserButton";
import { getActorAdminRoleKeys } from "@/lib/admin/getActorAdminRoleKeys";
import {
  ADMIN_BUSINESS_LISTINGS_PAGE_SIZE,
  listAdminBusinessListings,
} from "@/lib/admin/listings";
import { getBusinessByUserId } from "@/lib/business/getBusinessByUserId";
import { canAdmin, requireAdminRole } from "@/lib/admin/permissions";
import { normalizeUserRef } from "@/lib/ids/normalizeUserRef";
import { getAdminDataClient } from "@/lib/supabase/admin";
import { getSupabaseServerAuthedClient } from "@/lib/supabaseServer";

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
  let mergedUser = user;

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
      <AdminPage>
        <h2 className="text-xl font-semibold">Unable to load account</h2>
        <p className="text-sm text-neutral-400">
          There was a problem loading this account. Try again in a moment.
        </p>
        <Link href="/admin/accounts" className="text-sm text-sky-300 hover:text-sky-200">
          Back to accounts
        </Link>
      </AdminPage>
    );
  }

  if (!user) {
    return (
      <AdminPage>
        <h2 className="text-xl font-semibold">Account not found</h2>
        <Link href="/admin/accounts" className="text-sm text-sky-300 hover:text-sky-200">
          Back to accounts
        </Link>
      </AdminPage>
    );
  }

  const { data: userDetail } = await client
    .from("users")
    .select(
      "id, public_id, email, full_name, phone, role, is_internal, business_name, business_type, category, website, address, address_2, city, state, postal_code, account_status, deletion_requested_at, scheduled_purge_at, deleted_at, restored_at, created_at, updated_at"
    )
    .eq("id", user.id)
    .maybeSingle();

  const viewedRole = String(userDetail?.role ?? user?.role ?? "").trim().toLowerCase();
  const isBusinessAccount = viewedRole === "business";
  const business = await getBusinessByUserId({
    client,
    userId: user.id,
  });
  const hasBusinessContext = isBusinessAccount || Boolean(business);

  mergedUser = {
    ...user,
    ...(userDetail || {}),
    ...(business
      ? {
          public_id: business.public_id ?? userDetail?.public_id ?? user.public_id ?? null,
          business_name: business.business_name ?? userDetail?.business_name ?? null,
          business_type: business.business_type ?? userDetail?.business_type ?? null,
          category: business.category ?? userDetail?.category ?? null,
          website: business.website ?? userDetail?.website ?? null,
          phone: business.phone ?? userDetail?.phone ?? null,
          address: business.address ?? userDetail?.address ?? null,
          address_2: business.address_2 ?? userDetail?.address_2 ?? null,
          city: business.city ?? userDetail?.city ?? null,
          state: business.state ?? userDetail?.state ?? null,
          postal_code: business.postal_code ?? userDetail?.postal_code ?? null,
          verification_status: business.verification_status,
          stripe_connected: business.stripe_connected,
        }
      : {}),
  };

  const canImpersonate = admin.strictPermissionBypassUsed || canAdmin(admin.roles, "impersonate");
  const canOps = admin.strictPermissionBypassUsed || canAdmin(admin.roles, "toggle_internal_user");
  const canRoleFixes = admin.strictPermissionBypassUsed || canAdmin(admin.roles, "update_app_role");
  const canSuper = actorRoleKeys.includes("admin_super");
  const canAddUserNotes = admin.strictPermissionBypassUsed || actorRoleKeys.some((role) =>
    role === "admin_support" || role === "admin_ops" || role === "admin_super"
  );
  const canDeleteAnyUserNotes = admin.strictPermissionBypassUsed || actorRoleKeys.includes("admin_super");
  const canSeePermissionsTab = actorRoleKeys.includes("admin_super") || actorRoleKeys.includes("admin_ops");
  const canVerificationManage = actorRoleKeys.includes("admin_super") || actorRoleKeys.includes("admin_ops");
  const { data: notesRows, error: notesError } = authedClient
    ? await authedClient.rpc("admin_list_user_notes", {
        p_target_user_id: user.id,
        p_limit: 50,
        p_offset: 0,
      })
    : { data: [], error: null };

  if (notesError && diagEnabled) {
    console.warn("[admin] admin_list_user_notes failed", {
      userId: user.id,
      message: notesError?.message,
      details: notesError?.details,
      hint: notesError?.hint,
      code: notesError?.code,
    });
  }

  const initialNotes = Array.isArray(notesRows) ? notesRows : [];
  const { data: activityRows, error: activityError } = authedClient
    ? await authedClient.rpc("admin_list_user_audit_activity", {
        p_user_id: user.id,
        p_include_actor: true,
        p_include_target: true,
        p_q: null,
        p_action: null,
        p_offset: 0,
        p_limit: 20,
      })
    : { data: [], error: null };

  if (activityError && diagEnabled) {
    console.warn("[admin] admin_list_user_audit_activity failed", {
      userId: user.id,
      message: activityError?.message,
      details: activityError?.details,
      hint: activityError?.hint,
      code: activityError?.code,
    });
  }

  const initialActivityRows = Array.isArray(activityRows) ? activityRows : [];
  const initialActivityTotal = initialActivityRows.length
    ? Number(initialActivityRows[0]?.total_count || 0)
    : 0;
  let initialListings = [];
  let initialListingsTotalCount = 0;
  let initialListingsPage = 1;
  let initialListingsPageSize = ADMIN_BUSINESS_LISTINGS_PAGE_SIZE;
  let listingsError = "";

  if (hasBusinessContext) {
    try {
      const initialListingsResult = await listAdminBusinessListings(user.id, {
        page: 1,
        pageSize: ADMIN_BUSINESS_LISTINGS_PAGE_SIZE,
      });
      initialListings = initialListingsResult.rows;
      initialListingsTotalCount = initialListingsResult.totalCount;
      initialListingsPage = initialListingsResult.page;
      initialListingsPageSize = initialListingsResult.pageSize;
    } catch (error: any) {
      listingsError = error?.message || "Failed to load listings.";
    }
  }

  return (
    <AdminUserDetailLayout
      header={<AdminUserHeaderBar user={mergedUser} />}
      flash={<AdminFlash searchParams={resolvedSearch} />}
      aside={
        <AdminUserAside
          user={{
            ...mergedUser,
            is_internal: isBusinessAccount && business ? business.is_internal : mergedUser.is_internal,
          }}
          internalLabel={isBusinessAccount && business ? "Internal/test business" : "Internal tester access"}
          canImpersonate={canImpersonate}
        />
      }
      canSeePermissionsTab={canSeePermissionsTab}
      canSeeSecurityTab={canSuper}
      canSeeListingsTab={hasBusinessContext}
    >
        <div className="space-y-3">
          {String(mergedUser.account_status || "") === "pending_deletion" ? (
            <AdminRestoreAccountButton
              targetUserId={user.id}
              scheduledPurgeAt={mergedUser.scheduled_purge_at || null}
              canRestore={canSuper}
            />
          ) : null}
          <SectionCard title="Key properties">
            <dl className="space-y-2 text-sm">
              <Field label="Email" value={mergedUser.email} />
              <Field label="Public ID" value={mergedUser.public_id || "-"} />
              <Field label="Full name" value={mergedUser.full_name} />
              <Field label="Phone" value={mergedUser.phone} />
              <Field label="Role" value={mergedUser.role} />
              <Field label="Business name" value={mergedUser.business_name} />
              <Field label="Business type" value={mergedUser.category} />
              <Field label="Website" value={mergedUser.website} />
              <Field label="Address" value={mergedUser.address} />
              <Field label="Address 2" value={mergedUser.address_2} />
              <Field label="City" value={mergedUser.city} />
              <Field label="State" value={mergedUser.state} />
              <Field label="Postal" value={mergedUser.postal_code} />
              <Field label="Account status" value={mergedUser.account_status || "-"} />
              <Field
                label="Deletion requested"
                value={
                  mergedUser.deletion_requested_at
                    ? new Date(mergedUser.deletion_requested_at).toLocaleString()
                    : "-"
                }
              />
              <Field
                label="Scheduled purge"
                value={
                  mergedUser.scheduled_purge_at
                    ? formatUsDateTime(mergedUser.scheduled_purge_at)
                    : "-"
                }
              />
              <Field
                label={isBusinessAccount && business ? "Internal/test business" : "Internal tester access"}
                value={String(
                  Boolean(
                    isBusinessAccount && business
                      ? business.is_internal
                      : (userDetail?.is_internal ?? mergedUser.is_internal)
                  )
                )}
              />
              <Field label="Verification" value={mergedUser.verification_status || "-"} />
              <Field label="Stripe connected" value={String(Boolean(mergedUser.stripe_connected))} />
              <Field label="Created" value={mergedUser.created_at ? new Date(mergedUser.created_at).toLocaleString() : "-"} />
              <Field label="Updated" value={mergedUser.updated_at ? new Date(mergedUser.updated_at).toLocaleString() : "-"} />
            </dl>
          </SectionCard>

          {isBusinessAccount && business ? (
            <div data-testid="business-verification-section">
              <SectionCard title="Business Verification">
              <div className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Business" value={business.business_name || "-"} />
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <dt className="text-neutral-400">Status</dt>
                    <dd>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${verificationBadgeClass(
                          business.verification_status
                        )}`}
                      >
                        {business.verification_status}
                      </span>
                    </dd>
                  </div>
                  <Field label="Verified at" value={business.verified_at ? new Date(business.verified_at).toLocaleString() : "-"} />
                  <Field label="Stripe connected" value={business.stripe_connected ? "Yes" : "No"} />
                  <Field label="Internal/test business" value={business.is_internal ? "Yes" : "No"} />
                </div>
                <BusinessVerificationActionsClient
                  ownerUserId={user.id}
                  currentStatus={business.verification_status}
                  canManage={canVerificationManage}
                />
              </div>
              </SectionCard>
            </div>
          ) : null}

          {canRoleFixes ? (
            <AdminUserProfileEditor
              userId={user.id}
              initialValues={{
                full_name: mergedUser.full_name || "",
                phone: mergedUser.phone || "",
                business_name: mergedUser.business_name || "",
                business_type: mergedUser.business_type || "",
                website: mergedUser.website || "",
                address: mergedUser.address || "",
                address2: mergedUser.address_2 || "",
                city: mergedUser.city || "",
                state: mergedUser.state || "",
                postal_code: mergedUser.postal_code || "",
              }}
            />
          ) : null}

          {canImpersonate ? (
            <form action={startImpersonationAction} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="mb-2 font-medium">Quick action: start support mode (view-as)</h3>
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
        </div>

        <div className="space-y-3">
          {canRoleFixes ? <AdminUserRoleEditor userId={user.id} initialRole={user.role || "customer"} /> : null}

          {canOps && !isBusinessAccount ? (
            <form action={toggleUserInternalAction} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="mb-2 font-medium">Toggle internal tester access</h3>
              <input type="hidden" name="userId" value={user.id} />
              <input
                type="hidden"
                name="isInternal"
                value={String(!(userDetail?.is_internal ?? mergedUser.is_internal))}
              />
              <button type="submit" className="yb-primary-button rounded px-3 py-2 text-sm text-white">
                Set Internal tester access = {String(!(userDetail?.is_internal ?? mergedUser.is_internal))}
              </button>
            </form>
          ) : !isBusinessAccount ? (
            <PlaceholderMessage message="You do not have permission to change internal-user flags." />
          ) : null}

          {canOps && isBusinessAccount && business ? (
            <form action={toggleBusinessInternalAction} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="mb-2 font-medium">Toggle internal/test business</h3>
              <p className="mb-3 text-sm text-neutral-400">
                Hidden from normal public users. Turning this on also grants the owner internal
                tester access so they can view internal/test content.
              </p>
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="isInternal" value={String(!business.is_internal)} />
              <button type="submit" className="rounded border border-neutral-700 px-3 py-2 text-sm hover:border-neutral-500">
                Set Internal/test business = {String(!business.is_internal)}
              </button>
            </form>
          ) : null}
        </div>

        <div className="space-y-3">
          <AdminUserSecurityActions
            targetUserId={user.id}
            currentEmail={mergedUser.email || null}
            canManageSecurity={canSuper}
          />

          {canImpersonate ? (
            <form action={startImpersonationAction} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="mb-2 font-medium">Support mode controls</h3>
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

          <div className="rounded-lg border border-rose-900/70 bg-rose-950/30 p-4">
            <h3 className="mb-2 font-medium text-rose-100">Danger zone</h3>
            <p className="mb-3 text-sm text-rose-200/80">Permanently deleting a user cannot be undone.</p>
            <DeleteUserButton targetUserId={user.id} actorRoleKeys={actorRoleKeys} />
          </div>
        </div>

        <div className="space-y-3">
          {hasBusinessContext ? (
            <AdminBusinessListingsTab
              businessOwnerUserId={user.id}
              initialRows={initialListings}
              initialTotalCount={initialListingsTotalCount}
              initialPage={initialListingsPage}
              initialPageSize={initialListingsPageSize}
              initialError={listingsError}
            />
          ) : (
            <PlaceholderMessage message="This account does not have a business listings workspace." />
          )}
        </div>

        <div className="space-y-3">
          {activityError ? (
            <PlaceholderMessage message="Activity is temporarily unavailable. Apply the latest database migrations and refresh." />
          ) : (
            <AdminUserActivityPanel
              userId={user.id}
              initialRows={initialActivityRows}
              initialTotalCount={initialActivityTotal}
            />
          )}
        </div>

        <div className="space-y-3">
          {notesError ? (
            <PlaceholderMessage message="Notes are temporarily unavailable. Apply the latest database migrations and refresh." />
          ) : (
            <AdminUserNotesPanel
              userId={user.id}
              canWriteNotes={canAddUserNotes}
              canDeleteAnyNote={canDeleteAnyUserNotes}
              currentAdminUserId={actorUser?.id || null}
              initialNotes={initialNotes}
            />
          )}
        </div>
    </AdminUserDetailLayout>
  );
}

function AdminUserAside({
  user,
  internalLabel = "Internal tester access",
  canImpersonate,
}: {
  user: {
    id: string;
    public_id: string | null;
    email: string | null;
    full_name: string | null;
    role: string | null;
    is_internal: boolean | null;
    created_at: string | null;
    updated_at: string | null;
  };
  internalLabel?: string;
  canImpersonate: boolean;
}) {
  return (
    <div className="space-y-3">
      <SectionCard title="Identity">
        <dl className="space-y-2 text-sm">
          <Field label="Name" value={user.full_name} compact />
          <Field label="Email" value={user.email} compact />
          <Field label="Public ID" value={user.public_id || "-"} compact />
        </dl>
      </SectionCard>

      <SectionCard title="Status">
        <dl className="space-y-2 text-sm">
          <Field label="Role" value={user.role} compact />
          <Field label={internalLabel} value={user.is_internal ? "true" : "false"} compact />
          <Field label="Created" value={user.created_at ? new Date(user.created_at).toLocaleDateString() : "-"} compact />
          <Field label="Updated" value={user.updated_at ? new Date(user.updated_at).toLocaleDateString() : "-"} compact />
        </dl>
      </SectionCard>

      <SectionCard title="Links">
        <div className="space-y-2 text-sm">
          <Link href="/admin/accounts" className="block text-sky-300 hover:text-sky-200">
            Back to accounts
          </Link>
          <Link href="/admin/audit" className="block text-sky-300 hover:text-sky-200">
            Open audit log
          </Link>
          {canImpersonate ? <p className="text-neutral-400">Use Security tab for view-as controls.</p> : null}
        </div>
      </SectionCard>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <h3 className="mb-2 font-medium">{title}</h3>
      {children}
    </section>
  );
}

function PlaceholderMessage({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">{message}</div>
  );
}

function verificationBadgeClass(status: string) {
  if (status === "manually_verified") {
    return "border-emerald-700/60 bg-emerald-950/70 text-emerald-200";
  }
  if (status === "auto_verified") {
    return "border-sky-700/60 bg-sky-950/70 text-sky-200";
  }
  if (status === "suspended") {
    return "border-rose-700/60 bg-rose-950/70 text-rose-200";
  }
  return "border-amber-700/60 bg-amber-950/70 text-amber-200";
}

function Field({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: any;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "grid grid-cols-[92px_1fr] gap-2" : "grid grid-cols-[120px_1fr] gap-2"}>
      <dt className="text-neutral-400">{label}</dt>
      <dd className="break-all">{value || "-"}</dd>
    </div>
  );
}

function formatUsDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
