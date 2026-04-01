"use client";

import { ProfileHero } from "@/components/business/profile-system/ProfileSystem";

export default function PublicBusinessHero({
  profile,
  ratingSummary,
  publicPath,
  shell = "public",
}) {
  const backHref = shell === "public" ? "/business/profile" : null;

  return (
    <ProfileHero
      profile={profile}
      ratingSummary={ratingSummary}
      publicPath={publicPath}
      backHref={backHref}
      mode="preview"
    />
  );
}
