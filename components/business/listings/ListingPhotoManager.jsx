"use client";

import { useId, useMemo, useState } from "react";
import { ImagePlus, Sparkles, Trash2 } from "lucide-react";
import {
  ENHANCEABLE_BACKGROUND_OPTIONS,
  getDraftDisplayUrl,
} from "@/lib/listingPhotoDrafts";

function PhotoSurface({ src, alt, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-slate-100 bg-slate-50 p-3 ${className}`}
      style={{ backgroundColor: "#F9FAFB", borderColor: "#F1F5F9" }}
    >
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[18px] bg-white">
        {src ? (
          <img src={src} alt={alt} className="h-full w-full bg-white object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white text-sm text-slate-400">
            No preview
          </div>
        )}
      </div>
    </div>
  );
}

export default function ListingPhotoManager({
  photos,
  coverImageId,
  maxPhotos,
  helperText,
  error,
  onAddFiles,
  onRemovePhoto,
  onEnhancePhoto,
  onChooseVariant,
  onBackgroundChange,
  onSetCoverPhoto,
  canAddMore,
}) {
  const inputId = useId();
  const [selectedPhotoId, setSelectedPhotoId] = useState(null);
  const [enhancementOptionsPhotoId, setEnhancementOptionsPhotoId] = useState(null);

  const selectedPhoto = useMemo(() => {
    if (!photos?.length) return null;
    return photos.find((photo) => photo.id === selectedPhotoId) || photos[0];
  }, [photos, selectedPhotoId]);
  const isUnsavedSelectedPhoto =
    selectedPhoto?.status === "new" && Boolean(selectedPhoto?.original?.file);
  const isSessionAddedDraftPhoto =
    Boolean(selectedPhoto?.source) &&
    selectedPhoto?.status === "existing" &&
    !selectedPhoto?.original?.file;
  const hasUnsavedEnhancedPhoto =
    (isUnsavedSelectedPhoto || isSessionAddedDraftPhoto) &&
    Boolean(selectedPhoto?.enhanced?.publicUrl);
  // Keep enhancement available for photos added in the current editor session even after draft autosave
  // converts them into persisted draft rows. Hydrated pre-existing photos do not carry `source`.
  const canConfigureEnhancement =
    (isUnsavedSelectedPhoto || isSessionAddedDraftPhoto) && !hasUnsavedEnhancedPhoto;
  const resolvedCoverImageId =
    (typeof coverImageId === "string" && photos?.some((photo) => photo?.id === coverImageId)
      ? coverImageId
      : photos?.[0]?.id) || null;
  const shouldShowHelperText = Boolean(helperText) && !resolvedCoverImageId;
  const shouldShowEnhancementOptions =
    Boolean(selectedPhoto) &&
    (hasUnsavedEnhancedPhoto ||
      (canConfigureEnhancement && enhancementOptionsPhotoId === selectedPhoto?.id));

  const handleFileChange = (event) => {
    const files = event.target.files;
    if (files?.length) {
      onAddFiles?.(files, {
        captureAttributePresent: event.target.hasAttribute("capture"),
        inputControl: "listing-photo-primary",
      });
    }
    event.target.value = "";
  };

  return (
    <section className="space-y-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Photos</h2>
          {shouldShowHelperText ? (
            <p className="text-sm leading-6 text-slate-600">{helperText}</p>
          ) : null}
        </div>

        {canAddMore ? (
          <label
            htmlFor={inputId}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-violet-400 hover:text-slate-900"
          >
            <ImagePlus className="h-4 w-4" />
            Upload photos
          </label>
        ) : (
          <div className="text-sm text-slate-500">
            {photos.length} / {maxPhotos}
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {selectedPhoto ? (
          <div className="space-y-6">
          <div
            className="mb-6 overflow-hidden rounded-[18px] ring-1"
            style={{ backgroundColor: "#F9FAFB", boxShadow: "inset 0 0 0 1px #F1F5F9" }}
          >
            <div className="relative">
              {resolvedCoverImageId === selectedPhoto.id ? (
                <div className="absolute left-3 top-3 z-10 rounded-md border border-violet-200 bg-white/95 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-violet-700 shadow-sm">
                  COVER
                </div>
              ) : null}
              <PhotoSurface
                src={getDraftDisplayUrl(selectedPhoto)}
                alt="Selected listing photo"
                className="aspect-[4/3]"
              />
            </div>
          </div>

          <div className="mt-6 mb-6 space-y-4 border-t border-slate-100 pt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Selected photo</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onRemovePhoto?.(selectedPhoto.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
                {canConfigureEnhancement ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEnhancementOptionsPhotoId(selectedPhoto.id);
                      onEnhancePhoto?.(selectedPhoto.id);
                    }}
                    disabled={selectedPhoto?.enhancement?.isProcessing}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    <Sparkles className="h-4 w-4" />
                    {selectedPhoto?.enhancement?.isProcessing ? "Enhancing..." : "Enhance photo"}
                  </button>
                ) : null}
              </div>
            </div>

            {shouldShowEnhancementOptions ? (
              <div className="space-y-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">Enhance options</p>
                  <div className="inline-flex flex-wrap overflow-hidden rounded-md border border-slate-200 bg-white">
                    {ENHANCEABLE_BACKGROUND_OPTIONS.map((option) => {
                      const isSelected = selectedPhoto?.enhancement?.background === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onBackgroundChange?.(selectedPhoto.id, option.value)}
                          className={`border-r border-slate-200 px-3 py-1.5 text-xs font-medium transition last:border-r-0 ${
                            isSelected
                              ? "bg-violet-100 text-violet-700"
                              : "bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {hasUnsavedEnhancedPhoto ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Sparkles className="h-4 w-4 text-violet-600" />
                    <span className="font-medium text-slate-700">Enhanced photo</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onChooseVariant?.(
                        selectedPhoto.id,
                        selectedPhoto.selectedVariant === "enhanced" ? "original" : "enhanced"
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    {selectedPhoto.selectedVariant === "enhanced" ? "Use original" : "Use enhanced"}
                  </button>
                </div>
              </div>
            ) : null}

            {selectedPhoto?.enhancement?.error ? (
              <p className="text-sm text-rose-600">{selectedPhoto.enhancement.error}</p>
            ) : null}
          </div>

          <div className="mb-6 space-y-4 border-t border-slate-100 pt-6">
            <div className="flex items-center justify-end gap-3">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">
                {photos.length} / {maxPhotos}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 px-1 sm:grid-cols-4">
              {photos.map((photo, index) => {
                const isSelected = selectedPhoto?.id === photo.id;
                const isCover = photo.id === resolvedCoverImageId;
                return (
                  <div key={photo.id} className="group relative">
                    {!isCover ? (
                      <button
                        type="button"
                        onClick={() => onSetCoverPhoto?.(photo.id)}
                        className="absolute left-2 top-2 z-10 rounded-md border border-violet-200/90 bg-white/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-700 shadow-sm transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                        aria-label={`Set cover for photo ${index + 1}`}
                      >
                        Set cover
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelectedPhotoId(photo.id)}
                      aria-label={isCover ? "Select cover photo" : `Select photo ${index + 1}`}
                      className={`block w-full overflow-hidden rounded-xl transition ${
                        isSelected
                          ? "scale-[1.01] shadow-sm ring-2 ring-violet-300 ring-offset-1 ring-offset-white"
                          : "hover:scale-[1.01]"
                      }`}
                    >
                      <div
                        className="relative overflow-hidden rounded-xl ring-1"
                        style={{ backgroundColor: "#F9FAFB", boxShadow: "inset 0 0 0 1px #F1F5F9" }}
                      >
                        {isCover ? (
                          <div className="absolute left-2 top-2 z-10 rounded-md border border-violet-200 bg-white/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-700 shadow-sm">
                            COVER
                          </div>
                        ) : null}
                        <PhotoSurface
                          src={getDraftDisplayUrl(photo)}
                          alt={`Listing photo ${index + 1}`}
                          className="aspect-square rounded-none"
                        />
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-slate-300 bg-white px-6 py-10 text-center transition hover:border-violet-400"
        >
          <div className="rounded-full bg-slate-100 p-3">
            <ImagePlus className="h-6 w-6 text-slate-700" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-slate-900">Add your first photo</p>
            <p className="text-sm text-slate-600">
              Upload product photos, then choose which one shoppers should see first.
            </p>
          </div>
        </label>
      )}

      <input
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={handleFileChange}
      />
    </section>
  );
}
