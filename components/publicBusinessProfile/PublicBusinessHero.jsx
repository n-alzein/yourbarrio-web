"use client";

import { ProfileHero } from "@/components/business/profile-system/ProfileSystem";

export default function PublicBusinessHero({
  profile,
  ratingSummary,
  publicPath,
  shell = "public",
  mode = "public",
  ownerPrimaryAction,
  onAvatarUpload,
  onCoverUpload,
  uploading,
  editMode = false,
}) {
  const backHref = shell === "public" ? "/business/profile" : null;

  return (
    <ProfileHero
      profile={profile}
      ratingSummary={ratingSummary}
      publicPath={publicPath}
      backHref={backHref}
      mode="preview"
      viewerMode={mode}
      ownerPrimaryAction={ownerPrimaryAction}
      onAvatarUpload={onAvatarUpload}
      onCoverUpload={onCoverUpload}
      uploading={uploading}
      editMode={editMode}
    />
  );
}
