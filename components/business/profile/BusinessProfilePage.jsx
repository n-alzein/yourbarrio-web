"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, Megaphone, Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { uploadPublicImage } from "@/lib/storageUpload";
import {
  ProfileHero,
  ProfilePageShell,
  ProfileSection,
  ProfileSectionNav,
} from "@/components/business/profile-system/ProfileSystem";
import OverviewEditor from "@/components/business/profile/OverviewEditor";
import GalleryManager from "@/components/business/profile/GalleryManager";
import ReviewsPanel from "@/components/business/profile/ReviewsPanel";
import AnnouncementsManager from "@/components/business/profile/AnnouncementsManager";
import BusinessListingsGrid from "@/components/publicBusinessProfile/BusinessListingsGrid";

const SECTIONS = [
  { id: "about", label: "About" },
  { id: "gallery", label: "Gallery" },
  { id: "listings", label: "Listings" },
  { id: "reviews", label: "Reviews" },
  { id: "updates", label: "Updates" },
];

const PRIORITY_UPDATE_LOOKBACK_DAYS = 30;

function parseTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isAnnouncementActive(item, now = new Date()) {
  if (!item?.is_published) return false;
  const startsAt = parseTimestamp(item.starts_at);
  const endsAt = parseTimestamp(item.ends_at);
  return (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);
}

function isAnnouncementRecent(item, now = new Date()) {
  const startsAt = parseTimestamp(item?.starts_at);
  const createdAt = parseTimestamp(item?.created_at);
  const latestRelevantAt = startsAt || createdAt;
  if (!latestRelevantAt) return true;
  const lookbackMs = PRIORITY_UPDATE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - latestRelevantAt.getTime() <= lookbackMs;
}

function selectPriorityAnnouncement(items = []) {
  const now = new Date();
  const eligible = items.filter(
    (item) => isAnnouncementActive(item, now) && isAnnouncementRecent(item, now)
  );

  return eligible.sort((a, b) => {
    const aDate =
      parseTimestamp(a.starts_at) ||
      parseTimestamp(a.created_at) ||
      new Date(0);
    const bDate =
      parseTimestamp(b.starts_at) ||
      parseTimestamp(b.created_at) ||
      new Date(0);
    return bDate.getTime() - aDate.getTime();
  })[0] || null;
}

function formatPriorityUpdateMeta(item) {
  const startsAt = parseTimestamp(item?.starts_at);
  const endsAt = parseTimestamp(item?.ends_at);
  if (startsAt && endsAt) {
    return `Active ${startsAt.toLocaleDateString()} to ${endsAt.toLocaleDateString()}`;
  }
  if (endsAt) {
    return `Active now · Ends ${endsAt.toLocaleDateString()}`;
  }
  if (startsAt) {
    return `Started ${startsAt.toLocaleDateString()}`;
  }
  return "Published now";
}

function PriorityUpdateBanner({ item, onViewUpdates }) {
  if (!item) return null;

  return (
    <section className="mb-7">
      <div className="rounded-[24px] border border-[#d9cdfd] bg-white/92 px-4 py-4 shadow-[0_20px_48px_-42px_rgba(15,23,42,0.34)] backdrop-blur sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-[#efe8ff] px-2.5 py-1 text-[11px] font-medium text-[#5b37d6]">
                Latest update
              </span>
              <span className="text-xs text-slate-500">{formatPriorityUpdateMeta(item)}</span>
            </div>
            <h2 className="mt-2 text-base font-semibold tracking-[-0.02em] text-slate-950 sm:text-[1.05rem]">
              {item.title}
            </h2>
            <p className="mt-1 line-clamp-2 max-w-3xl text-sm leading-6 text-slate-600">
              {item.body}
            </p>
          </div>
          <button
            type="button"
            onClick={onViewUpdates}
            className="inline-flex shrink-0 items-center rounded-full border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            View updates
          </button>
        </div>
      </div>
    </section>
  );
}

function filterPayloadByProfile(payload, profile) {
  if (!profile) return {};
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) =>
      Object.prototype.hasOwnProperty.call(profile, key)
    )
  );
}

export default function BusinessProfilePage({
  initialProfile,
  initialGallery,
  initialReviews,
  initialReviewCount,
  initialListings,
  initialAnnouncements,
  ratingSummary,
}) {
  const { supabase, user, profile: authProfile, refreshProfile } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState(initialProfile);
  const [gallery, setGallery] = useState(initialGallery);
  const [reviews, setReviews] = useState(initialReviews);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [listings] = useState(initialListings);
  const [editMode, setEditMode] = useState(false);
  const [galleryTrigger, setGalleryTrigger] = useState(0);
  const [announcementTrigger, setAnnouncementTrigger] = useState(0);
  const [toast, setToast] = useState(null);
  const [uploading, setUploading] = useState({ avatar: false, cover: false });
  const previewChannelRef = useRef(null);
  const previewSigRef = useRef("");
  const previewSkipRef = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (previewChannelRef.current || typeof BroadcastChannel === "undefined") return;
    previewChannelRef.current = new BroadcastChannel("yb-business-preview");
    return () => previewChannelRef.current?.close();
  }, []);

  const client = supabase ?? getSupabaseBrowserClient();
  const businessId = profile?.id || user?.id || "";
  const reviewCount = ratingSummary?.count ?? initialReviewCount ?? 0;
  const priorityAnnouncement = useMemo(
    () => selectPriorityAnnouncement(announcements),
    [announcements]
  );

  const emitPreviewUpdate = useCallback(
    (reason = "profile_update") => {
      if (!businessId || typeof window === "undefined") return;
      const payload = { type: "update", businessId, reason, ts: Date.now() };
      try {
        if (!previewChannelRef.current && typeof BroadcastChannel !== "undefined") {
          previewChannelRef.current = new BroadcastChannel("yb-business-preview");
        }
        previewChannelRef.current?.postMessage(payload);
      } catch {}

      try {
        localStorage.setItem("yb_preview_update", JSON.stringify(payload));
      } catch {}
    },
    [businessId]
  );

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!authProfile || !profile || authProfile.id !== profile.id) return;
    if (!profile.profile_photo_url && authProfile.profile_photo_url) {
      setProfile((prev) => ({
        ...prev,
        profile_photo_url: authProfile.profile_photo_url,
      }));
    }
    if (!profile.cover_photo_url && authProfile.cover_photo_url) {
      setProfile((prev) => ({
        ...prev,
        cover_photo_url: authProfile.cover_photo_url,
      }));
    }
  }, [authProfile, profile]);

  useEffect(() => {
    if (!businessId) return;
    if (previewSkipRef.current) {
      previewSkipRef.current = false;
      return;
    }
    const signature = JSON.stringify({
      profile,
      galleryCount: gallery?.length ?? 0,
      announcementCount: announcements?.length ?? 0,
      reviewCount: reviews?.length ?? 0,
    });
    if (signature === previewSigRef.current) return;
    previewSigRef.current = signature;
    const timer = setTimeout(() => emitPreviewUpdate("content_change"), 300);
    return () => clearTimeout(timer);
  }, [businessId, profile, gallery, announcements, reviews, emitPreviewUpdate]);

  const tone = useMemo(
    () => ({
      textBase: "text-slate-900",
      textStrong: "text-slate-900",
      textMuted: "text-slate-600",
      textSoft: "text-slate-400",
      cardSurface: "bg-white",
      cardSoft: "bg-slate-50",
      cardBorder: "border-slate-200",
      headerSurface: "bg-white",
      headerBorder: "border-slate-200/70",
      buttonPrimary: "bg-slate-900 text-white border border-slate-900 hover:bg-slate-800",
      buttonSecondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50",
      input: "bg-white border-slate-200 text-slate-900 focus:ring-slate-200",
      errorText: "mt-1 text-xs text-rose-600",
      progressTrack: "bg-slate-200",
      progressFill: "bg-[#6a3df0]",
    }),
    []
  );

  const showToast = (type, message) => {
    setToast({ type, message });
  };

  const publicProfileHref = businessId ? "/business/profile" : null;

  const handlePublicPreview = () => {
    if (!businessId || typeof window === "undefined") return;
    const payload = {
      ts: Date.now(),
      businessId,
      profile,
      gallery,
      announcements,
      listings,
      reviews,
      ratingSummary,
    };
    try {
      sessionStorage.setItem(
        `yb_public_preview_${businessId}`,
        JSON.stringify(payload)
      );
    } catch {}
  };

  useEffect(() => {
    if (!publicProfileHref) return;
    router.prefetch(publicProfileHref);
  }, [publicProfileHref, router]);

  const handleHeaderUpload = async (type, file) => {
    if (!file) {
      showToast("error", "No file selected.");
      return;
    }
    if (!businessId) {
      showToast("error", "Business profile not ready. Refresh and try again.");
      return;
    }
    const bucket = "business-photos";
    setUploading((prev) => ({ ...prev, [type]: true }));

    try {
      const { publicUrl } = await uploadPublicImage({
        supabase: client,
        bucket,
        file,
        pathPrefix: `${businessId}/${type}`,
        maxSizeMB: 8,
      });

      if (!publicUrl) throw new Error("Upload failed to return a URL.");

      const payload =
        type === "avatar"
          ? { profile_photo_url: publicUrl }
          : { cover_photo_url: publicUrl };
      const filteredPayload = filterPayloadByProfile(payload, profile);
      if (!Object.keys(filteredPayload).length) {
        showToast("error", "Photo fields are not available in your profile schema.");
        return;
      }

      setProfile((prev) => ({ ...prev, ...filteredPayload }));
      if (!client?.storage) {
        showToast("error", "Storage client is not ready. Please refresh.");
        return;
      }
      const { error } = await client
        .from("users")
        .update(filteredPayload)
        .eq("id", businessId);

      if (error) {
        showToast("error", error.message || "Failed to save photo.");
        return;
      }

      const { error: businessPhotoError } = await client
        .from("businesses")
        .update(filteredPayload)
        .eq("owner_user_id", businessId);

      if (businessPhotoError) {
        showToast(
          "error",
          businessPhotoError.message || "Photo uploaded, but business sync failed."
        );
        return;
      }

      refreshProfile?.();
      showToast("success", "Photo uploaded.");
    } catch (err) {
      showToast("error", err.message || "Failed to upload photo.");
    } finally {
      setUploading((prev) => ({ ...prev, [type]: false }));
    }
  };

  const scrollToId = (id) => {
    if (typeof window === "undefined") return;
    const node = document.getElementById(id);
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.scrollY - 152;
    window.scrollTo({ top, behavior: "smooth" });
  };

  if (!profile) {
    return <div className="min-h-screen" />;
  }

  return (
    <ProfilePageShell className={tone.textBase}>
      <ProfileHero
        profile={profile}
        ratingSummary={ratingSummary}
        mode="profile"
        primaryAction={{
          label: editMode ? "Close editor" : "Edit profile",
          onClick: () => {
            setEditMode((prev) => !prev);
            scrollToId("about");
          },
        }}
        editMode={editMode}
        uploading={uploading}
        onAvatarUpload={(file) => handleHeaderUpload("avatar", file)}
        onCoverUpload={(file) => handleHeaderUpload("cover", file)}
      />

      <PriorityUpdateBanner
        item={priorityAnnouncement}
        onViewUpdates={() => scrollToId("updates")}
      />

      <ProfileSectionNav items={SECTIONS} />

      <div className="space-y-14">
        <ProfileSection
          id="about"
          title="About"
          description={
            editMode
              ? "Update the core identity, contact details, and hours customers see first."
              : "Business story, contact details, and practical essentials."
          }
        >
          <OverviewEditor
            profile={profile}
            tone={tone}
            editMode={editMode}
            setEditMode={setEditMode}
            onProfileUpdate={setProfile}
            onToast={showToast}
          />
        </ProfileSection>

        <ProfileSection
          id="gallery"
          title="Gallery"
          description="Visuals that help customers understand the business at a glance."
          action={
            <button
              type="button"
              onClick={() => setGalleryTrigger((prev) => prev + 1)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            >
              <ImagePlus className="h-4 w-4 text-[#6a3df0]" />
              Add photos
            </button>
          }
        >
          <GalleryManager
            photos={gallery}
            setPhotos={setGallery}
            tone={tone}
            businessId={businessId}
            supabase={client}
            addTrigger={galleryTrigger}
            onToast={showToast}
          />
        </ProfileSection>

        <BusinessListingsGrid
          listings={listings}
          title="Listings"
          description="Inventory and featured offers presented in the same storefront language as your preview."
          headerAction={
            <Link
              href="/business/listings/new"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4 text-[#6a3df0]" />
              Create listing
            </Link>
          }
          itemHrefResolver={(item) => `/business/listings/${item.id}/edit`}
        />

        <div id="reviews" className="scroll-mt-40">
          <ReviewsPanel
            reviews={reviews}
            setReviews={setReviews}
            reviewCount={reviewCount}
            ratingSummary={ratingSummary}
            tone={tone}
            businessId={businessId}
            supabase={client}
          />
        </div>

        <ProfileSection
          id="updates"
          title="Updates"
          description="Share short announcements, promos, and timely changes without cluttering the profile."
          action={
            <button
              type="button"
              onClick={() => setAnnouncementTrigger((prev) => prev + 1)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            >
              <Megaphone className="h-4 w-4 text-[#6a3df0]" />
              New update
            </button>
          }
        >
          <AnnouncementsManager
            announcements={announcements}
            setAnnouncements={setAnnouncements}
            tone={tone}
            businessId={businessId}
            supabase={client}
            onToast={showToast}
            createTrigger={announcementTrigger}
          />
        </ProfileSection>
      </div>

      {toast ? (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
              toast.type === "success"
                ? "bg-emerald-500 text-white"
                : "bg-rose-500 text-white"
            }`}
          >
            {toast.message}
          </div>
        </div>
      ) : null}
    </ProfilePageShell>
  );
}
