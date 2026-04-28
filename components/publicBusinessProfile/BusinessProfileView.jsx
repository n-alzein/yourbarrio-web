"use client";

import { useEffect, useState } from "react";
import PublicBusinessHero from "@/components/publicBusinessProfile/PublicBusinessHero";
import BusinessAbout from "@/components/publicBusinessProfile/BusinessAbout";
import BusinessAnnouncementsPreview from "@/components/publicBusinessProfile/BusinessAnnouncementsPreview";
import BusinessGalleryGrid from "@/components/publicBusinessProfile/BusinessGalleryGrid";
import BusinessListingsGrid from "@/components/publicBusinessProfile/BusinessListingsGrid";
import BusinessReviewsPanel from "@/components/publicBusinessProfile/BusinessReviewsPanel";
import ViewerContextEnhancer from "@/components/public/ViewerContextEnhancer";
import { ProfileSectionNav } from "@/components/business/profile-system/ProfileSystem";

const DEFAULT_NAV_ITEMS = [
  { id: "about", label: "About" },
  { id: "listings", label: "Listings" },
  { id: "reviews", label: "Reviews" },
  { id: "updates", label: "Updates" },
  { id: "gallery", label: "Gallery" },
];

export default function BusinessProfileView({
  mode = "public",
  profile,
  businessId,
  publicPath,
  shell = "public",
  ratingSummary,
  listings,
  reviews,
  announcements,
  gallery,
  loading = false,
  sectionClassName = "rounded-none",
  reviewsClassName = "rounded-none",
  heroProps = {},
  aboutHeaderAction = null,
  aboutSupplement = null,
  listingsHeaderAction = null,
  listingsItemHrefResolver,
  listingsPriceMode = "allIn",
  reviewsProps = {},
  updatesHeaderAction = null,
  updatesRenderItemActions = null,
  updatesSupplement = null,
  galleryHeaderAction = null,
  galleryTileActions = null,
  heroVariant = "default",
  navClassName = "",
}) {
  const [contentVisible, setContentVisible] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setContentVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [businessId, profile?.public_id, profile?.id]);

  return (
    <div
      className={[
        "transition-[opacity,transform] duration-200 ease-out",
        loading ? "opacity-75" : contentVisible ? "opacity-100" : "opacity-0",
      ].join(" ")}
      data-testid="public-business-profile-content"
    >
      <PublicBusinessHero
        profile={profile}
        ratingSummary={ratingSummary}
        publicPath={publicPath}
        shell={shell}
        mode={mode}
        variant={heroVariant}
        {...heroProps}
      />

      <ProfileSectionNav items={DEFAULT_NAV_ITEMS} className={navClassName} />

      <div className="space-y-10 md:space-y-12">
        <BusinessAbout
          profile={profile}
          className={sectionClassName}
          headerAction={aboutHeaderAction}
          supplement={aboutSupplement}
        />

        <BusinessListingsGrid
          listings={listings}
          className={sectionClassName}
          headerAction={listingsHeaderAction}
          itemHrefResolver={listingsItemHrefResolver}
          priceMode={listingsPriceMode}
        />

        <ViewerContextEnhancer>
          <BusinessReviewsPanel
            businessId={businessId}
            businessName={profile?.business_name || profile?.full_name || "business"}
            initialReviews={reviews}
            ratingSummary={ratingSummary}
            reviewCount={ratingSummary?.count || reviews?.length || 0}
            loading={loading}
            className={reviewsClassName}
            mode={mode}
            {...reviewsProps}
          />
        </ViewerContextEnhancer>

        <BusinessAnnouncementsPreview
          announcements={announcements}
          className={sectionClassName}
          headerAction={updatesHeaderAction}
          renderItemActions={updatesRenderItemActions}
        />
        {updatesSupplement ? <div>{updatesSupplement}</div> : null}

        <BusinessGalleryGrid
          photos={gallery}
          className={sectionClassName}
          headerAction={galleryHeaderAction}
          renderTileActions={galleryTileActions}
        />
      </div>
    </div>
  );
}
