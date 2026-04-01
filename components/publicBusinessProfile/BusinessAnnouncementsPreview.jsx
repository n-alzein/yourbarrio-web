import { Megaphone } from "lucide-react";
import {
  ProfileEmptyState,
  ProfileSection,
  cx,
} from "@/components/business/profile-system/ProfileSystem";

export default function BusinessAnnouncementsPreview({
  announcements,
  className = "",
  headerAction = null,
  renderItemActions = null,
}) {
  return (
    <ProfileSection
      id="updates"
      title="Updates"
      description="Announcements, promos, and timely business notes."
      action={headerAction}
      className={className}
    >
      {!announcements?.length ? (
        <ProfileEmptyState
          title="No updates yet"
          detail="New announcements will show up here when this business shares them."
        />
      ) : (
        <div className="grid gap-3">
          {announcements.map((item, index) => (
            <article
              key={item.id}
              className="rounded-[24px] border border-slate-200/80 bg-slate-50/85 px-5 py-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-white p-2 text-[#6a3df0] shadow-sm">
                      <Megaphone className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-950">
                        {item.title || "Announcement"}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {item.created_at
                          ? new Date(item.created_at).toLocaleDateString()
                          : ""}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {index === 0 ? (
                    <span className="rounded-full bg-[#efe8ff] px-2.5 py-1 text-[11px] font-medium text-[#5b37d6]">
                      Latest
                    </span>
                  ) : null}
                  {renderItemActions ? renderItemActions(item) : null}
                </div>
              </div>

              <p className={cx("mt-3 text-sm leading-7 text-slate-600", renderItemActions ? "" : "line-clamp-3")}>
                {item.body || "Details coming soon."}
              </p>
            </article>
          ))}
        </div>
      )}
    </ProfileSection>
  );
}
