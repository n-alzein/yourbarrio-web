import {
  BadgeCheck,
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
import BusinessHoursSummaryCard from "@/components/publicBusinessProfile/BusinessHoursSummaryCard";
import {
  ProfileEmptyState,
  ProfileSection,
} from "@/components/business/profile-system/ProfileSystem";
import { normalizeUrl, toObject } from "@/lib/business/profileUtils";
import { hasHoursData } from "@/lib/publicBusinessProfile/normalize";

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
    <div className="rounded-[16px] border border-slate-100 bg-white px-3.5 py-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-slate-50 p-2 text-[#6a3df0]">
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

export default function BusinessAbout({
  profile,
  className = "",
  headerAction = null,
  supplement = null,
}) {
  const address = [profile?.address, profile?.address_2, profile?.city, profile?.state]
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
      description="A quick overview, contact details, and practical information."
      action={headerAction}
      className={className}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="space-y-4">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#6a3df0]">
              Overview
            </p>
            <p className="mt-3 max-w-[44rem] text-[0.98rem] leading-7 text-slate-700">
              {profile?.description ||
                "This business has not added a full description yet."}
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
            {profile?.category ? (
              <EssentialsItem
                icon={BadgeCheck}
                label="Category"
                value={profile.category}
              />
            ) : null}
          </div>

          {hasHoursData(profile?.hours_json) ? (
            <BusinessHoursSummaryCard hoursJson={profile.hours_json} />
          ) : (
            <ProfileEmptyState
              title="Hours not listed"
              detail="Hours will appear here when available."
              className="px-4 py-4"
            />
          )}
        </div>
      </div>
      {supplement ? <div className="mt-4">{supplement}</div> : null}
    </ProfileSection>
  );
}
