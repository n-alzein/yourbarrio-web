"use client";

import { useEffect, useRef, useState } from "react";
import FastImage from "@/components/FastImage";
import { uploadPublicImage } from "@/lib/storageUpload";

export default function GalleryManager({
  photos,
  setPhotos,
  tone,
  businessId,
  supabase,
  onToast,
  addTrigger,
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!addTrigger) return;
    inputRef.current?.click();
  }, [addTrigger]);

  useEffect(() => {
    return () => {
      photos.forEach((photo) => {
        if (photo?._previewUrl) {
          URL.revokeObjectURL(photo._previewUrl);
        }
      });
    };
  }, [photos]);

  const handleAddPhotos = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    event.target.value = "";
    if (!supabase) {
      onToast?.("error", "Storage is not ready. Please refresh and try again.");
      return;
    }

    setUploading(true);
    try {
      for (const file of files) {
        const previewUrl = URL.createObjectURL(file);
        const optimisticId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const optimistic = {
          id: optimisticId,
          photo_url: previewUrl,
          caption: null,
          sort_order: 0,
          created_at: new Date().toISOString(),
          _previewUrl: previewUrl,
        };

        setPhotos((prev) => [optimistic, ...prev]);

        try {
          const { publicUrl } = await uploadPublicImage({
            supabase,
            bucket: "business-gallery",
            file,
            pathPrefix: `${businessId}/gallery`,
            maxSizeMB: 8,
          });

          if (!publicUrl) throw new Error("Upload failed to return a URL.");

          const { data, error } = await supabase
            .from("business_gallery_photos")
            .insert({
              business_id: businessId,
              photo_url: publicUrl,
              caption: null,
              sort_order: 0,
            })
            .select("*")
            .single();

          if (error) throw error;

          setPhotos((prev) =>
            prev.map((item) => (item.id === optimisticId ? data : item))
          );
        } catch (err) {
          setPhotos((prev) => prev.filter((item) => item.id !== optimisticId));
          onToast?.("error", err.message || "Failed to upload photo.");
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photoId) => {
    if (!confirm("Delete this photo?")) return;
    setDeletingId(photoId);
    const previous = photos;
    setPhotos((prev) => prev.filter((item) => item.id !== photoId));

    const { error } = await supabase
      .from("business_gallery_photos")
      .delete()
      .eq("id", photoId);

    if (error) {
      setPhotos(previous);
      onToast?.("error", error.message || "Failed to delete photo.");
    } else {
      onToast?.("success", "Photo removed.");
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-4">
      <label className="hidden">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleAddPhotos}
          disabled={uploading}
        />
      </label>

      {!photos.length ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/90 px-5 py-6">
          <p className={`text-sm font-medium ${tone.textStrong}`}>No gallery photos yet</p>
          <p className={`mt-1 text-sm ${tone.textMuted}`}>
            Use the add-photos control to build out the visual side of your profile.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="group relative aspect-[4/3] overflow-hidden rounded-[24px] bg-slate-100"
            >
              <FastImage
                src={photo.photo_url}
                alt={photo.caption || "Business photo"}
                className="object-cover"
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                decoding="async"
              />
              <button
                type="button"
                onClick={() => handleDelete(photo.id)}
                disabled={deletingId === photo.id}
                className="absolute right-3 top-3 rounded-full bg-white/92 px-3 py-1 text-xs font-semibold text-slate-900 opacity-0 shadow transition group-hover:opacity-100"
              >
                {deletingId === photo.id ? "Removing" : "Delete"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
