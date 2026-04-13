"use client";

import { useEffect, useMemo, useState } from "react";
import FastImage from "@/components/FastImage";
import { Camera, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  ProfileEmptyState,
  ProfileSection,
} from "@/components/business/profile-system/ProfileSystem";

export default function BusinessGalleryGrid({
  photos,
  className = "",
  headerAction = null,
  renderTileActions = null,
}) {
  const [activeIndex, setActiveIndex] = useState(null);

  const activePhoto = useMemo(() => {
    if (activeIndex === null) return null;
    return photos?.[activeIndex] || null;
  }, [activeIndex, photos]);

  useEffect(() => {
    if (activeIndex === null) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") setActiveIndex(null);
      if (event.key === "ArrowRight") {
        setActiveIndex((prev) => (prev === null ? prev : Math.min(prev + 1, photos.length - 1)));
      }
      if (event.key === "ArrowLeft") {
        setActiveIndex((prev) => (prev === null ? prev : Math.max(prev - 1, 0)));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeIndex, photos?.length]);

  return (
    <ProfileSection
      id="gallery"
      title="Gallery"
      description="A visual snapshot of the business."
      action={headerAction}
      className={className}
    >
      {!photos?.length ? (
        <ProfileEmptyState
          title="Gallery coming soon"
          detail="Photos will appear here when available."
          icon={Camera}
          className="py-4"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {photos.map((photo, index) => (
            <div
              key={photo.id || index}
              className="group relative aspect-[4/3] overflow-hidden rounded-[16px] border border-slate-100 bg-slate-100 shadow-sm"
            >
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                className="absolute inset-0 z-10"
                aria-label={photo.caption || "Open gallery photo"}
              />
              <FastImage
                src={photo.photo_url || "/business-placeholder.png"}
                alt={photo.caption || "Gallery photo"}
                className="object-cover transition duration-300 group-hover:scale-[1.02]"
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
              {renderTileActions ? (
                <div
                  className="absolute inset-x-0 top-0 flex justify-end p-3"
                  onClick={(event) => event.stopPropagation()}
                >
                  {renderTileActions(photo)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {activePhoto ? (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
          onClick={() => setActiveIndex(null)}
          role="presentation"
        >
          <div
            className="relative w-full max-w-5xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActiveIndex(null)}
              className="absolute -top-12 right-0 rounded-full bg-white p-2 text-slate-900 shadow-lg"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="relative h-[68vh] overflow-hidden rounded-[28px] bg-black">
              <FastImage
                src={activePhoto.photo_url || "/business-placeholder.png"}
                alt={activePhoto.caption || "Gallery photo"}
                className="object-contain"
                fill
                sizes="100vw"
                priority
                decoding="async"
              />
            </div>
            {activePhoto.caption ? (
              <p className="mt-3 text-center text-sm text-white/80">
                {activePhoto.caption}
              </p>
            ) : null}
            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setActiveIndex((prev) => (prev === null ? prev : Math.max(prev - 1, 0)))
                  }
                  className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white p-2 text-slate-900 shadow-lg"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveIndex((prev) =>
                      prev === null ? prev : Math.min(prev + 1, photos.length - 1)
                    )
                  }
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white p-2 text-slate-900 shadow-lg"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </ProfileSection>
  );
}
