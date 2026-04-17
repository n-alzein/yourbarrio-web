"use client";

import Image from "next/image";
import { ENHANCEABLE_BACKGROUND_OPTIONS, getDraftDisplayUrl } from "@/lib/listingPhotoDrafts";

function BackgroundOption({ value, label, active, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-full px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "bg-white text-slate-900"
          : "border border-white/15 bg-white/5 text-white/70 hover:bg-white/10",
        disabled ? "cursor-not-allowed opacity-60" : "",
      ].join(" ")}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function PhotoPreview({
  src,
  alt,
  badge = null,
  label,
  containerClassName = "max-w-[460px]",
  frameClassName = "h-[22rem]",
}) {
  return (
    <div className={`mx-auto w-full ${containerClassName}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</p>
        {badge}
      </div>
      <div
        className={[
          "flex w-full items-center justify-center overflow-hidden rounded-[24px] border border-slate-200/70 bg-slate-50 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]",
          frameClassName,
        ].join(" ")}
      >
        <Image
          src={src}
          alt={alt}
          width={560}
          height={420}
          className="max-h-full max-w-full scale-[1.08] object-contain"
          unoptimized
        />
      </div>
    </div>
  );
}

function SinglePhotoPreview({ src, alt }) {
  return (
    <div className="mx-auto w-full max-w-[540px]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-white/45">Preview</p>
      </div>
      <div className="mx-auto w-full max-w-[480px]">
        <div className="flex min-h-[260px] max-h-[420px] w-full items-center justify-center rounded-[22px] border border-slate-200/70 bg-slate-50 p-3 md:p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
          <Image
            src={src}
            alt={alt}
            width={560}
            height={420}
            className="h-auto max-h-[388px] w-auto max-w-full object-contain"
            unoptimized
          />
        </div>
      </div>
    </div>
  );
}

export default function ListingPhotoManager({
  photos,
  maxPhotos,
  onAddFiles,
  onRemovePhoto,
  onEnhancePhoto,
  onChooseVariant,
  onBackgroundChange,
  error = "",
  helperText,
  canAddMore = true,
}) {
  const primaryInputId = "listing-photo-input";

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8 shadow-lg backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-white">Photos</h2>
          <p className="text-sm text-white/60">{helperText}</p>
        </div>
        <span className="text-xs text-white/60">
          {photos.length}/{maxPhotos} total
        </span>
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
        >
          {error}
        </div>
      ) : null}

      <div className="space-y-4">
        {photos.map((photo, index) => {
          const originalUrl = getDraftDisplayUrl(photo, "original");
          const enhancedUrl = getDraftDisplayUrl(photo, "enhanced");
          const canEnhance = photo.status === "new";
          const enhanceLabel = photo.enhanced ? "Enhance again" : "Enhance photo";
          const isComparisonView = Boolean(photo.enhanced);
          const isSinglePreview = !isComparisonView;

          return (
            <div
              key={photo.id}
              className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 md:p-5"
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Photo {index + 1}
                  </p>
                  <p className="text-xs text-white/50">
                    {index === 0 ? "Cover photo" : "Gallery photo"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemovePhoto(photo.id)}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                >
                  Remove
                </button>
              </div>

              {isComparisonView ? (
                <div className="grid gap-2 md:grid-cols-2">
                  <PhotoPreview
                    src={originalUrl}
                    alt={`Original listing photo ${index + 1}`}
                    label="Original"
                    containerClassName="max-w-[460px]"
                    frameClassName="h-[20rem] md:h-[21rem]"
                  />
                  <PhotoPreview
                    src={enhancedUrl}
                    alt={`Enhanced listing photo ${index + 1}`}
                    label="Enhanced"
                    containerClassName="max-w-[460px]"
                    frameClassName="h-[20rem] md:h-[21rem]"
                    badge={
                      <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">
                        {photo.enhanced.background === "soft_gray"
                          ? "Soft gray"
                          : photo.enhanced.background === "original"
                          ? "Original"
                          : "White"}
                      </span>
                    }
                  />
                </div>
              ) : isSinglePreview ? (
                <SinglePhotoPreview
                  src={originalUrl}
                  alt={`Listing photo ${index + 1}`}
                />
              ) : null}

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                    Background
                  </span>
                  {ENHANCEABLE_BACKGROUND_OPTIONS.map((option) => (
                    <BackgroundOption
                      key={option.value}
                      value={option.value}
                      label={option.label}
                      active={photo.enhancement.background === option.value}
                      disabled={!canEnhance || photo.enhancement.isProcessing}
                      onClick={() => onBackgroundChange(photo.id, option.value)}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/65">
                  <span className="rounded-full border border-white/10 px-3 py-1.5">
                    Lighting: Auto
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1.5">
                    Shadow: Subtle
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {canEnhance ? (
                    <button
                      type="button"
                      onClick={() => onEnhancePhoto(photo.id)}
                      disabled={photo.enhancement.isProcessing}
                      className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {photo.enhancement.isProcessing ? "Enhancing..." : enhanceLabel}
                    </button>
                  ) : (
                    <span className="text-xs text-white/45">
                      Enhancement is available for newly added photos before you save.
                    </span>
                  )}
                  {photo.enhanced ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onChooseVariant(photo.id, "enhanced")}
                        className={[
                          "rounded-full px-4 py-2 text-sm font-semibold transition",
                          photo.selectedVariant === "enhanced"
                            ? "bg-emerald-300 text-slate-950"
                            : "border border-white/15 bg-white/5 text-white hover:bg-white/10",
                        ].join(" ")}
                      >
                        Use enhanced photo
                      </button>
                      <button
                        type="button"
                        onClick={() => onChooseVariant(photo.id, "original")}
                        className={[
                          "rounded-full px-4 py-2 text-sm font-semibold transition",
                          photo.selectedVariant === "original"
                            ? "bg-white text-slate-900"
                            : "border border-white/15 bg-white/5 text-white hover:bg-white/10",
                        ].join(" ")}
                      >
                        Keep original
                      </button>
                    </>
                  ) : null}
                </div>
                {photo.enhancement.error ? (
                  <p className="mt-3 text-sm text-amber-200">{photo.enhancement.error}</p>
                ) : null}
              </div>
            </div>
          );
        })}

        {canAddMore ? (
          <label
            htmlFor={primaryInputId}
            className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-white/20 bg-white/[0.04] text-gray-200 transition hover:bg-white/10"
          >
            <span className="text-sm font-semibold">Add photo</span>
            <span className="mt-1 text-xs text-white/70">
              PNG, JPG, WEBP, or GIF. Take a photo or upload one.
            </span>
            <input
              id={primaryInputId}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                onAddFiles(event.target.files, {
                  inputControl: "listing-photo-primary",
                  captureAttributePresent: event.target.hasAttribute("capture"),
                });
                event.target.value = "";
              }}
            />
          </label>
        ) : null}
      </div>
    </section>
  );
}
