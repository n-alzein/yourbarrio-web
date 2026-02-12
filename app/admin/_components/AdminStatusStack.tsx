import ImpersonationBanner from "@/app/admin/_components/ImpersonationBanner";
import StatusStack from "@/app/admin/_components/StatusStack";

type ActiveImpersonation = {
  sessionId: string;
  targetUserId: string;
  targetUserName?: string | null;
  targetUserEmail?: string | null;
} | null;

type AdminStatusStackProps = {
  activeImpersonation: ActiveImpersonation;
  showAllowlistBanner: boolean;
  showBypassBanner: boolean;
};

export default function AdminStatusStack({
  activeImpersonation,
  showAllowlistBanner,
  showBypassBanner,
}: AdminStatusStackProps) {
  return (
    <StatusStack>
      {activeImpersonation ? (
        <ImpersonationBanner
          targetLabel={
            activeImpersonation.targetUserName ||
            activeImpersonation.targetUserEmail ||
            activeImpersonation.targetUserId
          }
          sessionId={activeImpersonation.sessionId}
        />
      ) : null}
      {showAllowlistBanner ? (
        <div className="rounded-md border border-yellow-700 bg-yellow-950/70 px-3 py-2 text-sm text-yellow-100">
          Dev allowlist is active for this admin session. Do not use in production.
        </div>
      ) : null}
      {showBypassBanner ? (
        <div className="rounded-md border border-orange-700 bg-orange-950/70 px-3 py-2 text-sm text-orange-100">
          ADMIN_BYPASS_RLS is enabled. Admin reads/writes are using service role in development only.
        </div>
      ) : null}
    </StatusStack>
  );
}
