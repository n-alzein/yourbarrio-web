import AdminFlash from "@/app/admin/_components/AdminFlash";
import AdminPage from "@/app/admin/_components/AdminPage";
import AdminListingsClient from "@/app/admin/listings/AdminListingsClient";
import { canAdmin, requireAdminRole } from "@/lib/admin/permissions";

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminRole("admin_readonly");
  const params = (await searchParams) || {};
  const canModerate = admin.strictPermissionBypassUsed || canAdmin(admin.roles, "moderation");

  return (
    <AdminPage>
      <header>
        <h2 className="text-xl font-semibold">Listings</h2>
        <p className="text-sm text-neutral-400">
          Search and inspect listings, SKUs, and order-linked references.
        </p>
      </header>

      <AdminFlash searchParams={params} />

      <AdminListingsClient canModerate={canModerate} />
    </AdminPage>
  );
}
