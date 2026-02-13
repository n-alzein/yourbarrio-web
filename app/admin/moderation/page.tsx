import Link from "next/link";
import {
  hideListingAndResolveModerationFlagAction,
  hideReviewAndResolveModerationFlagAction,
  takeModerationCaseAction,
  updateModerationFlagAction,
} from "@/app/admin/actions";
import ActionButtonClient from "@/app/admin/_components/ActionButtonClient";
import AdminFlash from "@/app/admin/_components/AdminFlash";
import CopyIdButtonClient from "@/app/admin/_components/CopyIdButtonClient";
import DangerConfirmClient from "@/app/admin/_components/DangerConfirmClient";
import { requireAdminAnyRole } from "@/lib/admin/permissions";
import { getAdminUserUrl, getCustomerBusinessUrl, getListingUrl } from "@/lib/ids/publicRefs";
import { getReasonLabel, getTargetLabel } from "@/lib/moderation/reasons";
import { getAdminDataClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 20;

type ModerationRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: "open" | "in_review" | "resolved" | "dismissed";
  reason: string;
  details: string | null;
  admin_notes: string | null;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  target_type: "user" | "business" | "listing" | "review";
  target_id: string;
  reporter_user_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  target_label: string | null;
  target_subtext: string | null;
  meta: Record<string, any> | null;
  total_count: number;
};

type UserSummary = {
  id: string;
  public_id: string | null;
  email: string | null;
  full_name: string | null;
  business_name: string | null;
  city: string | null;
};

type ListingSummary = {
  id: string;
  public_id: string | null;
  business_id: string;
  title: string | null;
  price: number | null;
  city: string | null;
  created_at: string | null;
  inventory_status: string | null;
};

type ReviewSummary = {
  id: string;
  title: string | null;
  body: string | null;
  business_id: string | null;
  customer_id: string | null;
  listing_id: string | null;
};

type SelectedTargetContext = {
  listing: ListingSummary | null;
  review: ReviewSummary | null;
  targetUser: UserSummary | null;
  businessUser: UserSummary | null;
  reviewerUser: UserSummary | null;
  reporterUser: UserSummary | null;
};

function asString(value: string | string[] | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function truncate(value: string | null | undefined, max = 100) {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function statusBadgeClass(status: string) {
  if (status === "open") return "border-amber-600/50 bg-amber-950/60 text-amber-100";
  if (status === "in_review") return "border-sky-600/50 bg-sky-950/60 text-sky-100";
  if (status === "resolved") return "border-emerald-600/50 bg-emerald-950/60 text-emerald-100";
  return "border-neutral-600/50 bg-neutral-900 text-neutral-100";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function userLabel(user: UserSummary | null) {
  if (!user) return "-";
  return user.business_name || user.full_name || user.email || user.id;
}

function parseUuidLike(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw || null;
}

async function fetchUserById(client: any, id: string | null): Promise<UserSummary | null> {
  if (!id) return null;
  const { data, error } = await client
    .from("users")
    .select("id, public_id, email, full_name, business_name, city")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as UserSummary;
}

async function fetchReviewField(client: any, reviewId: string, field: "title" | "body" | "business_id" | "customer_id") {
  const { data, error } = await client.rpc("get_business_review_field", {
    p_review_id: reviewId,
    p_field: field,
  });
  if (error) return null;
  return typeof data === "string" && data.trim() ? data.trim() : null;
}

async function loadSelectedTargetContext(client: any, row: ModerationRow): Promise<SelectedTargetContext> {
  const base: SelectedTargetContext = {
    listing: null,
    review: null,
    targetUser: null,
    businessUser: null,
    reviewerUser: null,
    reporterUser: null,
  };

  base.reporterUser = await fetchUserById(client, row.reporter_user_id || null);

  if (row.target_type === "listing") {
    const { data: listingData } = await client
      .from("listings")
      .select("id, public_id, business_id, title, price, city, created_at, inventory_status")
      .eq("id", row.target_id)
      .maybeSingle();

    if (listingData) {
      base.listing = listingData as ListingSummary;
      base.businessUser = await fetchUserById(client, listingData.business_id || null);
    }
    return base;
  }

  if (row.target_type === "review") {
    const meta = asRecord(row.meta);
    const [title, body, businessId, customerId] = await Promise.all([
      fetchReviewField(client, row.target_id, "title"),
      fetchReviewField(client, row.target_id, "body"),
      fetchReviewField(client, row.target_id, "business_id"),
      fetchReviewField(client, row.target_id, "customer_id"),
    ]);

    const listingId = parseUuidLike(meta.listing_id);

    base.review = {
      id: row.target_id,
      title,
      body,
      business_id: businessId,
      customer_id: customerId,
      listing_id: listingId,
    };

    const [businessUser, reviewerUser, listingData] = await Promise.all([
      fetchUserById(client, businessId),
      fetchUserById(client, customerId),
      listingId
        ? client
            .from("listings")
            .select("id, public_id, business_id, title, price, city, created_at, inventory_status")
            .eq("id", listingId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    base.businessUser = businessUser;
    base.reviewerUser = reviewerUser;
    base.listing = (listingData?.data || null) as ListingSummary | null;

    return base;
  }

  if (row.target_type === "business") {
    base.businessUser = await fetchUserById(client, row.target_id);
    return base;
  }

  base.targetUser = await fetchUserById(client, row.target_id);
  return base;
}

export default async function AdminModerationPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminAnyRole(["admin_ops", "admin_super"]);
  const params = (await searchParams) || {};

  const q = asString(params.q).trim();
  const status = asString(params.status).trim().toLowerCase();
  const type = asString(params.type, "all").trim().toLowerCase();
  const selectedId = asString(params.flag).trim();
  const page = Math.max(1, Number(asString(params.page, "1")) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { client } = await getAdminDataClient();
  const { data, error } = await client.rpc("admin_list_moderation_flags", {
    p_type: type || "all",
    p_status: status || null,
    p_q: q || null,
    p_from: from,
    p_to: to,
  });

  const rows = (Array.isArray(data) ? data : []) as ModerationRow[];
  const count = rows.length ? Number(rows[0]?.total_count || rows.length) : 0;
  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));

  const selectedRow = selectedId ? rows.find((row) => row.id === selectedId) || null : null;

  const pageParams = new URLSearchParams();
  if (q) pageParams.set("q", q);
  if (status) pageParams.set("status", status);
  if (type && type !== "all") pageParams.set("type", type);

  const buildModerationHref = (nextPage: number, flagId?: string) => {
    const p = new URLSearchParams(pageParams);
    p.set("page", String(nextPage));
    if (flagId) p.set("flag", flagId);
    return `/admin/moderation?${p.toString()}`;
  };

  const selectedReturnTo = buildModerationHref(page, selectedRow?.id || selectedId || undefined);

  const selectedContext = selectedRow ? await loadSelectedTargetContext(client, selectedRow) : null;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Moderation queue</h2>
        <p className="text-sm text-neutral-400">
          Review user reports across users, businesses, listings, and reviews.
        </p>
      </header>

      <AdminFlash searchParams={params} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
        <div className="space-y-4">
          <form className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3 md:grid-cols-4">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search reporter, target, reason"
              className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm md:col-span-2"
            />
            <select
              name="type"
              defaultValue={type}
              className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            >
              <option value="all">Type: all</option>
              <option value="user">Users</option>
              <option value="business">Businesses</option>
              <option value="listing">Listings</option>
              <option value="review">Reviews</option>
            </select>
            <select
              name="status"
              defaultValue={status}
              className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            >
              <option value="">Status: any</option>
              <option value="open">open</option>
              <option value="in_review">in_review</option>
              <option value="resolved">resolved</option>
              <option value="dismissed">dismissed</option>
            </select>
            <button
              type="submit"
              className="rounded bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500 md:col-span-4"
            >
              Apply filters
            </button>
          </form>

          {error ? (
            <div className="rounded-lg border border-rose-700 bg-rose-950/60 p-4 text-sm text-rose-100">
              Failed to load moderation queue: {error.message}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-400">
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Target</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">Reporter</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const rowHref = buildModerationHref(page, row.id);
                    const rowReturnTo = buildModerationHref(page, row.id);
                    return (
                      <tr key={row.id} className="border-t border-neutral-800 align-top">
                        <td className="px-3 py-2 text-neutral-300">{formatDate(row.created_at)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                              row.status
                            )}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-neutral-100">
                            {getTargetLabel(row.target_type)}: {row.target_label || "-"}
                          </div>
                          <div className="text-xs text-neutral-400">{truncate(row.target_subtext, 80)}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-neutral-100">{getReasonLabel(row.reason)}</div>
                          <div className="text-xs text-neutral-400">{truncate(row.details, 90)}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-neutral-100">{row.reporter_name || "User"}</div>
                          <div className="text-xs text-neutral-400">{row.reporter_email || "-"}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Link
                              href={rowHref}
                              className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
                            >
                              View
                            </Link>

                            {row.status === "open" ? (
                              <form action={takeModerationCaseAction}>
                                <input type="hidden" name="id" value={row.id} />
                                <input type="hidden" name="returnTo" value={rowReturnTo} />
                                <ActionButtonClient
                                  label="Take"
                                  pendingLabel="Taking..."
                                  className="rounded border border-sky-700/70 bg-sky-950/60 px-2 py-1 text-xs text-sky-100 hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60"
                                />
                              </form>
                            ) : null}

                            {row.status !== "resolved" ? (
                              <form action={updateModerationFlagAction}>
                                <input type="hidden" name="id" value={row.id} />
                                <input type="hidden" name="status" value="resolved" />
                                <input type="hidden" name="returnTo" value={rowReturnTo} />
                                <ActionButtonClient
                                  label="Resolve"
                                  pendingLabel="Saving..."
                                  className="rounded border border-emerald-700/70 bg-emerald-950/60 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
                                />
                              </form>
                            ) : null}

                            {row.status !== "dismissed" ? (
                              <form action={updateModerationFlagAction}>
                                <input type="hidden" name="id" value={row.id} />
                                <input type="hidden" name="status" value="dismissed" />
                                <input type="hidden" name="returnTo" value={rowReturnTo} />
                                <ActionButtonClient
                                  label="Dismiss"
                                  pendingLabel="Saving..."
                                  className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
                                />
                              </form>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-neutral-400">
                        No moderation flags found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-400">
              Page {page} of {totalPages} ({count || 0} flags)
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={buildModerationHref(page - 1, selectedRow?.id || selectedId || undefined)}
                  className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500"
                >
                  Previous
                </Link>
              ) : null}
              {page < totalPages ? (
                <Link
                  href={buildModerationHref(page + 1, selectedRow?.id || selectedId || undefined)}
                  className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>

          {selectedId && !selectedRow ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-300">
              Selected flag is not on this page. Use filters to locate it.
            </div>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {!selectedRow ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-300">
              Select a flag from the queue to review details and run admin actions.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold">Flag detail</h3>
                    <p className="mt-1 font-mono text-xs text-neutral-500">{selectedRow.id}</p>
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusBadgeClass(
                      selectedRow.status
                    )}`}
                  >
                    {selectedRow.status}
                  </span>
                </div>

                <div className="mt-3 space-y-2 text-sm">
                  <p>
                    <span className="text-neutral-400">Target:</span>{" "}
                    <span className="text-neutral-100">
                      {getTargetLabel(selectedRow.target_type)} - {selectedRow.target_label || "-"}
                    </span>
                  </p>
                  <p>
                    <span className="text-neutral-400">Reason:</span>{" "}
                    <span className="text-neutral-100">{getReasonLabel(selectedRow.reason)}</span>
                  </p>
                  <p>
                    <span className="text-neutral-400">Details:</span>{" "}
                    <span className="whitespace-pre-wrap text-neutral-100">{selectedRow.details || "-"}</span>
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">Target context</h4>
                  <CopyIdButtonClient
                    value={selectedRow.target_id}
                    className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
                  />
                </div>

                <div className="mt-3 space-y-2 text-sm">
                  {selectedRow.target_type === "listing" ? (
                    <>
                      <p>
                        <span className="text-neutral-400">Listing:</span>{" "}
                        <span className="text-neutral-100">
                          {selectedContext?.listing?.title || selectedRow.target_label || "Listing"}
                        </span>
                      </p>
                      <p>
                        <span className="text-neutral-400">Business:</span>{" "}
                        <span className="text-neutral-100">{userLabel(selectedContext?.businessUser || null)}</span>
                      </p>
                      <p>
                        <span className="text-neutral-400">Created:</span>{" "}
                        <span className="text-neutral-100">{formatDate(selectedContext?.listing?.created_at || null)}</span>
                      </p>
                      <p>
                        <span className="text-neutral-400">Inventory status:</span>{" "}
                        <span className="text-neutral-100">{selectedContext?.listing?.inventory_status || "-"}</span>
                      </p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {selectedContext?.listing ? (
                          <Link
                            href={getListingUrl(selectedContext.listing)}
                            className="rounded bg-sky-600 px-3 py-1 text-xs font-medium hover:bg-sky-500"
                          >
                            Open listing
                          </Link>
                        ) : null}
                        {selectedContext?.businessUser ? (
                          <Link
                            href={`/admin/businesses?q=${encodeURIComponent(
                              selectedContext.businessUser.public_id || selectedContext.businessUser.id
                            )}`}
                            className="rounded border border-neutral-700 px-3 py-1 text-xs hover:border-neutral-500"
                          >
                            Open business in admin
                          </Link>
                        ) : null}
                        {selectedContext?.businessUser ? (
                          <Link
                            href={getCustomerBusinessUrl(selectedContext.businessUser)}
                            className="rounded border border-neutral-700 px-3 py-1 text-xs hover:border-neutral-500"
                          >
                            Open business profile
                          </Link>
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  {selectedRow.target_type === "review" ? (
                    <>
                      <p>
                        <span className="text-neutral-400">Review title:</span>{" "}
                        <span className="text-neutral-100">{selectedContext?.review?.title || "-"}</span>
                      </p>
                      <p>
                        <span className="text-neutral-400">Review body:</span>{" "}
                        <span className="whitespace-pre-wrap text-neutral-100">
                          {truncate(selectedContext?.review?.body, 240)}
                        </span>
                      </p>
                      <p>
                        <span className="text-neutral-400">Reviewer:</span>{" "}
                        <span className="text-neutral-100">{userLabel(selectedContext?.reviewerUser || null)}</span>
                      </p>
                      <p>
                        <span className="text-neutral-400">Business:</span>{" "}
                        <span className="text-neutral-100">{userLabel(selectedContext?.businessUser || null)}</span>
                      </p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {selectedContext?.listing ? (
                          <Link
                            href={getListingUrl(selectedContext.listing)}
                            className="rounded bg-sky-600 px-3 py-1 text-xs font-medium hover:bg-sky-500"
                          >
                            Open listing
                          </Link>
                        ) : null}
                        {selectedContext?.reviewerUser ? (
                          <Link
                            href={getAdminUserUrl(selectedContext.reviewerUser)}
                            className="rounded border border-neutral-700 px-3 py-1 text-xs hover:border-neutral-500"
                          >
                            Open reviewer
                          </Link>
                        ) : null}
                        {selectedContext?.businessUser ? (
                          <Link
                            href={`/admin/businesses?q=${encodeURIComponent(
                              selectedContext.businessUser.public_id || selectedContext.businessUser.id
                            )}`}
                            className="rounded border border-neutral-700 px-3 py-1 text-xs hover:border-neutral-500"
                          >
                            Open business
                          </Link>
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  {selectedRow.target_type === "business" ? (
                    <>
                      <p>
                        <span className="text-neutral-400">Business account:</span>{" "}
                        <span className="text-neutral-100">{userLabel(selectedContext?.businessUser || null)}</span>
                      </p>
                      <p>
                        <span className="text-neutral-400">Email:</span>{" "}
                        <span className="text-neutral-100">{selectedContext?.businessUser?.email || "-"}</span>
                      </p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {selectedContext?.businessUser ? (
                          <Link
                            href={`/admin/businesses?q=${encodeURIComponent(
                              selectedContext.businessUser.public_id || selectedContext.businessUser.id
                            )}`}
                            className="rounded bg-sky-600 px-3 py-1 text-xs font-medium hover:bg-sky-500"
                          >
                            Open business
                          </Link>
                        ) : null}
                        {selectedContext?.businessUser ? (
                          <Link
                            href={getCustomerBusinessUrl(selectedContext.businessUser)}
                            className="rounded border border-neutral-700 px-3 py-1 text-xs hover:border-neutral-500"
                          >
                            Open public profile
                          </Link>
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  {selectedRow.target_type === "user" ? (
                    <>
                      <p>
                        <span className="text-neutral-400">User:</span>{" "}
                        <span className="text-neutral-100">{userLabel(selectedContext?.targetUser || null)}</span>
                      </p>
                      <p>
                        <span className="text-neutral-400">Email:</span>{" "}
                        <span className="text-neutral-100">{selectedContext?.targetUser?.email || "-"}</span>
                      </p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {selectedContext?.targetUser ? (
                          <Link
                            href={getAdminUserUrl(selectedContext.targetUser)}
                            className="rounded bg-sky-600 px-3 py-1 text-xs font-medium hover:bg-sky-500"
                          >
                            Open user
                          </Link>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <h4 className="text-sm font-semibold">Reporter</h4>
                <div className="mt-2 space-y-1 text-sm">
                  <p className="text-neutral-100">{selectedRow.reporter_name || "User"}</p>
                  <p className="text-neutral-400">{selectedRow.reporter_email || "-"}</p>
                  {selectedContext?.reporterUser ? (
                    <Link
                      href={getAdminUserUrl(selectedContext.reporterUser)}
                      className="inline-flex rounded border border-neutral-700 px-3 py-1 text-xs hover:border-neutral-500"
                    >
                      Open reporter
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <h4 className="text-sm font-semibold">Admin actions</h4>

                <div className="mt-3 grid gap-3">
                  <form action={takeModerationCaseAction} className="rounded border border-neutral-800 bg-neutral-950 p-3">
                    <input type="hidden" name="id" value={selectedRow.id} />
                    <input type="hidden" name="returnTo" value={selectedReturnTo} />
                    <ActionButtonClient
                      label="Take case"
                      pendingLabel="Taking case..."
                      className="w-full rounded bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </form>

                  <form action={updateModerationFlagAction} className="space-y-2 rounded border border-neutral-800 bg-neutral-950 p-3">
                    <input type="hidden" name="id" value={selectedRow.id} />
                    <input type="hidden" name="returnTo" value={selectedReturnTo} />
                    <select
                      name="status"
                      defaultValue={selectedRow.status}
                      className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                    >
                      <option value="open">open</option>
                      <option value="in_review">in_review</option>
                      <option value="resolved">resolved</option>
                      <option value="dismissed">dismissed</option>
                    </select>
                    <textarea
                      name="adminNotes"
                      rows={3}
                      placeholder="Admin notes (optional)"
                      defaultValue={selectedRow.admin_notes || ""}
                      className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                    />
                    <ActionButtonClient
                      label="Save status and notes"
                      pendingLabel="Saving..."
                      className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </form>

                  {selectedRow.target_type === "listing" ? (
                    <details className="rounded border border-amber-900/60 bg-amber-950/20 p-3">
                      <summary className="cursor-pointer text-xs font-medium text-amber-200">
                        Destructive: hide listing and resolve
                      </summary>
                      <form action={hideListingAndResolveModerationFlagAction} className="mt-3 space-y-2">
                        <input type="hidden" name="id" value={selectedRow.id} />
                        <input type="hidden" name="targetId" value={selectedRow.target_id} />
                        <input type="hidden" name="returnTo" value={selectedReturnTo} />
                        <textarea
                          name="adminNotes"
                          rows={3}
                          placeholder="Hide action notes (optional)"
                          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                        />
                        <DangerConfirmClient
                          warning="This action will hide the listing and resolve this flag."
                          buttonLabel="Hide listing and resolve"
                          pendingLabel="Hiding listing..."
                          warningClassName="text-xs text-amber-200"
                          inputClassName="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                          buttonClassName="w-full rounded bg-amber-600 px-3 py-2 text-sm font-medium hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </form>
                    </details>
                  ) : null}

                  {selectedRow.target_type === "review" ? (
                    <details className="rounded border border-amber-900/60 bg-amber-950/20 p-3">
                      <summary className="cursor-pointer text-xs font-medium text-amber-200">
                        Destructive: hide review and resolve
                      </summary>
                      <form action={hideReviewAndResolveModerationFlagAction} className="mt-3 space-y-2">
                        <input type="hidden" name="id" value={selectedRow.id} />
                        <input type="hidden" name="targetId" value={selectedRow.target_id} />
                        <input type="hidden" name="returnTo" value={selectedReturnTo} />
                        <textarea
                          name="adminNotes"
                          rows={3}
                          placeholder="Hide action notes (optional)"
                          className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                        />
                        <DangerConfirmClient
                          warning="This action will hide the review and resolve this flag."
                          buttonLabel="Hide review and resolve"
                          pendingLabel="Hiding review..."
                          warningClassName="text-xs text-amber-200"
                          inputClassName="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                          buttonClassName="w-full rounded bg-amber-600 px-3 py-2 text-sm font-medium hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </form>
                    </details>
                  ) : null}
                </div>

                <div className="mt-4 space-y-1 text-xs text-neutral-400">
                  <p>Created: {formatDate(selectedRow.created_at)}</p>
                  <p>Updated: {formatDate(selectedRow.updated_at)}</p>
                  <p>Reviewed by: {selectedRow.reviewed_by_user_id || "-"}</p>
                  <p>Reviewed at: {formatDate(selectedRow.reviewed_at)}</p>
                </div>

                <details className="mt-3 rounded border border-neutral-800 bg-neutral-950 p-3">
                  <summary className="cursor-pointer text-xs text-neutral-400">Meta context</summary>
                  <pre className="mt-2 overflow-x-auto text-xs text-neutral-300">
                    {JSON.stringify(selectedRow.meta || {}, null, 2)}
                  </pre>
                </details>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
