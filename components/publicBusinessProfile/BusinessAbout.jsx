import {
  Clock,
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  MapPin,
  Music2,
  Phone,
  Twitter,
  Youtube,
} from "lucide-react";
import {
  ProfileEmptyState,
  ProfileSection,
  normalizeUrl,
  parseHours,
  toObject,
} from "@/components/business/profile-system/ProfileSystem";

const SOCIAL_FIELDS = [
  { key: "instagram", label: "Instagram", icon: Instagram },
  { key: "facebook", label: "Facebook", icon: Facebook },
  { key: "tiktok", label: "TikTok", icon: Music2 },
  { key: "youtube", label: "YouTube", icon: Youtube },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin },
  { key: "x", label: "X", icon: Twitter },
];

function EssentialsItem({ icon: Icon, label, value, href }) {
  return (
    <div className="rounded-[20px] bg-slate-50/75 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-white p-2 text-[#6a3df0] shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
            {label}
          </p>
          {href ? (
            <a
              href={href}
              target={href.startsWith("tel:") ? undefined : "_blank"}
              rel={href.startsWith("tel:") ? undefined : "noreferrer"}
              className="mt-1 block break-words text-sm font-medium text-slate-900 hover:text-[#5b37d6]"
            >
              {value}
            </a>
          ) : (
            <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BusinessAbout({ profile, className = "" }) {
  const hours = parseHours(profile?.hours_json);
  const address = [profile?.address, profile?.city, profile?.state]
    .filter(Boolean)
    .join(", ");
  const website = profile?.website ? normalizeUrl(profile.website) : "";
  const socials = toObject(profile?.social_links_json);
  const socialLinks = SOCIAL_FIELDS.map((field) => ({
    ...field,
    href: normalizeUrl(socials?.[field.key] || ""),
  })).filter((entry) => entry.href);

  return (
    <ProfileSection
      id="about"
      title="About"
      description="Business story, contact details, and practical essentials."
      className={className}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <div className="space-y-4">
          <div className="max-w-[44rem]">
            <p className="text-[1rem] leading-7 text-slate-700">
              {profile?.description ||
                "This business has not shared a full description yet."}
            </p>
          </div>

          {socialLinks.length ? (
            <div className="flex flex-wrap gap-2">
              {socialLinks.map(({ key, label, icon: Icon, href }) => (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950"
                >
                  <Icon className="h-4 w-4 text-[#6a3df0]" />
                  {label}
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {address ? (
              <EssentialsItem icon={MapPin} label="Address" value={address} />
            ) : null}
            {profile?.phone ? (
              <EssentialsItem
                icon={Phone}
                label="Phone"
                value={profile.phone}
                href={`tel:${profile.phone}`}
              />
            ) : null}
            {profile?.website ? (
              <EssentialsItem
                icon={Globe}
                label="Website"
                value={profile.website}
                href={website}
              />
            ) : null}
          </div>

          <div className="rounded-[20px] bg-slate-50/75 px-4 py-3">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-xl bg-white p-2 text-[#6a3df0] shadow-sm">
                <Clock className="h-4 w-4" />
              </div>
              <p className="text-sm font-medium text-slate-900">Hours</p>
            </div>
            {hours.length ? (
              <div className="space-y-2">
                {hours.map((entry) => (
                  <div
                    key={entry.key}
                    className="flex items-center justify-between gap-4 rounded-2xl bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-slate-700">{entry.label}</span>
                    <span className="text-slate-500">{entry.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <ProfileEmptyState
                title="Hours not listed"
                detail="Business hours will appear here once they are added."
                className="border-0 bg-white px-4 py-3"
              />
            )}
          </div>
        </div>
      </div>
    </ProfileSection>
  );
}
