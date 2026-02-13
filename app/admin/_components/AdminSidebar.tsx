import AdminNav from "@/app/admin/_components/AdminNav";

type AdminSidebarProps = {
  roles: string[];
  emailOrId: string;
  strictPermissionBypassUsed: boolean;
  collapsed?: boolean;
};

export default function AdminSidebar({
  roles,
  emailOrId,
  strictPermissionBypassUsed,
  collapsed = false,
}: AdminSidebarProps) {
  return (
    <div className="min-h-0 flex-1 p-2">
      {!collapsed ? (
        <div className="mb-3 space-y-1 rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-400">
          <p className="truncate">Signed in as {emailOrId}</p>
        </div>
      ) : null}

      <AdminNav
        roles={roles}
        strictPermissionBypassUsed={strictPermissionBypassUsed}
        variant="vertical"
        collapsed={collapsed}
      />
    </div>
  );
}
