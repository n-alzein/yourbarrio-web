import AdminFlash from "@/app/admin/_components/AdminFlash";
import AdminUserSignupsChart from "@/app/admin/_components/AdminUserSignupsChart";
import RecentAuditActivity from "@/app/admin/_components/RecentAuditActivity";
import { requireAdminRole } from "@/lib/admin/permissions";
import { getAdminDataClient } from "@/lib/supabase/admin";

/**
 * Dashboard metrics source notes:
 * - "Total accounts" should come from unique rows in `public.users` (primary key `id`).
 * - Prior overcount came from `admin_total_users_count()` reading `auth.users`, which can include auth-only users
 *   that are not platform accounts in `public.users`, inflating the dashboard total.
 */

async function getCount(client: any, table: string, apply?: (query: any) => any) {
  let query = client.from(table).select("id", { count: "exact", head: true });
  if (apply) query = apply(query);
  const { count } = await query;
  return count || 0;
}

const AUDIT_PAGE_SIZE = 10;

function formatBucketLabel(bucketStart: string) {
  const [year, month, day] = bucketStart.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminRole("admin_readonly");
  const { client } = await getAdminDataClient();
  const diagEnabled =
    String(process.env.AUTH_GUARD_DIAG || "") === "1" ||
    String(process.env.NEXT_PUBLIC_AUTH_DIAG || "") === "1";

  const [newUsers7dResult, totalUsersCountResult, signupsSeriesResult] = await Promise.all([
    client.rpc("count_new_users_last_days", { p_days: 7 }),
    client.rpc("admin_total_users_count"),
    client.rpc("admin_user_signups_timeseries", {
      p_days: 30,
    }),
  ]);
  const newUsers7dCount = newUsers7dResult.data;
  const totalUsersCount = totalUsersCountResult.data;
  const signupsSeriesData = signupsSeriesResult.data;

  const [totalAccountsDistinct, totalBusinesses, newUsers7d, openModeration, openSupport, recentAudit] =
    await Promise.all([
      getCount(client, "users"),
      getCount(client, "users", (q) => q.eq("role", "business")),
      Promise.resolve(Number(newUsers7dCount || 0)),
      getCount(client, "moderation_flags", (q) => q.eq("status", "open")),
      getCount(client, "support_tickets", (q) => q.in("status", ["open", "pending"])),
      client
        .from("admin_audit_log")
        .select("id, action, target_type, target_id, actor_user_id, created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(AUDIT_PAGE_SIZE + 1),
  ]);

  const totalUsers = Number(totalAccountsDistinct || 0);
  const allAuditRows = recentAudit.data || [];
  const initialAuditRows = allAuditRows.slice(0, AUDIT_PAGE_SIZE);
  const initialAuditHasMore = allAuditRows.length > AUDIT_PAGE_SIZE;
  const signupRows = Array.isArray(signupsSeriesData) ? signupsSeriesData : [];
  const signupChartData = signupRows.map((row: any) => ({
    bucketStart: String(row.bucket_start),
    label: formatBucketLabel(String(row.bucket_start)),
    customerCount: Number(row.customer_count || 0),
    businessCount: Number(row.business_count || 0),
  }));

  if (diagEnabled) {
    console.warn("[admin-dashboard] totals diagnostics", {
      totalUsersFromPublicUsers: totalAccountsDistinct,
      totalUsersFromLegacyRpcAuthUsers: Number(totalUsersCount || 0),
      signupsSeriesRows: signupRows.length,
      joinUsedForTotal: false,
      distinctApplied: true,
      totalUsersDisplayed: totalUsers,
    });
  }

  return (
    <section className="space-y-4">
      <AdminFlash searchParams={searchParams} />
      <header>
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <p className="text-sm text-neutral-400">Admin platform summary and latest activity.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total users" value={totalUsers} />
        <StatCard label="Total businesses" value={totalBusinesses} />
        <StatCard label="New users (7d)" value={newUsers7d} />
        <StatCard label="Open moderation flags" value={openModeration} />
        <StatCard label="Open support tickets" value={openSupport} />
      </div>

      <AdminUserSignupsChart data={signupChartData} />

      <RecentAuditActivity
        initialRows={initialAuditRows}
        initialHasMore={initialAuditHasMore}
        pageSize={AUDIT_PAGE_SIZE}
      />
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-sm text-neutral-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}
