import AdminNav from "@/app/admin/_components/AdminNav";
import type { AdminRole } from "@/lib/admin/permissions";
import { formatAdminRoleLabel } from "@/lib/admin/roleLabels";

type AdminTopBarProps = {
  roles: AdminRole[];
  strictPermissionBypassUsed: boolean;
  currentRole: string;
  emailOrId: string;
  title?: string;
};

export default function AdminTopBar({
  roles,
  strictPermissionBypassUsed,
  currentRole,
  emailOrId,
  title = "YourBarrio Admin",
}: AdminTopBarProps) {
  return (
    <div className="border-b border-neutral-800 bg-neutral-900/80">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-lg font-semibold">{title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
            <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-200">
              Signed in as {emailOrId}
            </span>
            <span className="rounded-full border border-indigo-700/70 bg-indigo-950/70 px-2 py-1 text-indigo-100">
              Role: {formatAdminRoleLabel(currentRole)}
            </span>
          </div>
        </div>
        <AdminNav
          roles={roles}
          strictPermissionBypassUsed={strictPermissionBypassUsed}
          variant="horizontal"
        />
      </div>
    </div>
  );
}
