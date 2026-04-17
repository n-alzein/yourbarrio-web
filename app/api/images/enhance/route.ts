import { NextResponse } from "next/server";
import rateLimit from "@/lib/rateLimit";
import { getBusinessDataClientForRequest } from "@/lib/business/getBusinessDataClientForRequest";
import { validateImageFile } from "@/lib/storageUpload";
import {
  enhancePhotoWithPhotoroom,
  type PhotoroomBackgroundMode,
} from "@/lib/server/photoroom";

const routeLimiter = rateLimit({ interval: 10 * 60_000, uniqueTokenPerInterval: 200 });
const ALLOWED_BACKGROUNDS = new Set<PhotoroomBackgroundMode>(["original", "white", "soft_gray"]);

function buildAssetPath({
  userId,
  extension,
}: {
  userId: string;
  extension: string;
}) {
  const token =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `enhanced/${userId}/${Date.now()}-${token}.${extension}`;
}

export async function POST(request: Request) {
  const access = await getBusinessDataClientForRequest({
    timingLabel: "images-enhance",
  });
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: access.error } }, {
      status: access.status,
    });
  }

  const forwardedFor = request.headers.get("x-forwarded-for") || "unknown";
  const rateToken = `${access.effectiveUserId}:${forwardedFor.split(",")[0]?.trim() || "unknown"}`;

  try {
    routeLimiter.check(6, rateToken);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many enhancement attempts right now. Try again in a few minutes.",
        },
      },
      { status: 429 }
    );
  }

  try {
    const formData = await request.formData();
    const image = formData.get("image");
    const imageSource = String(formData.get("imageSource") || "unknown").trim() || "unknown";
    const requestedBackground = String(formData.get("background") || "white").trim() as PhotoroomBackgroundMode;
    const background = ALLOWED_BACKGROUNDS.has(requestedBackground)
      ? requestedBackground
      : "white";

    if (!(image instanceof File)) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INVALID_FILE", message: "Upload a supported image before enhancing it." },
        },
        { status: 400 }
      );
    }

    const validation = validateImageFile(image, { maxSizeMB: 8 });
    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INVALID_FILE", message: validation.error },
        },
        { status: 400 }
      );
    }

    const enhanced = await enhancePhotoWithPhotoroom({
      image,
      background,
      timeoutMs: 20_000,
    });

    if (process.env.NODE_ENV !== "production") {
      console.info("[images.enhance] request_metadata", {
        userId: access.effectiveUserId,
        source: imageSource,
        rawFileName: image.name || null,
        rawFileType: image.type || null,
        rawFileSize: typeof image.size === "number" ? image.size : null,
      });
    }

    if (!enhanced.transformed) {
      console.warn("[images.enhance] transformed_output_missing", {
        userId: access.effectiveUserId,
        source: imageSource,
        rawFileName: image.name || null,
      });
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "ENHANCEMENT_UNUSABLE",
            message: "We couldn't enhance this photo right now. You can keep the original and continue.",
          },
        },
        { status: 422 }
      );
    }

    const path = buildAssetPath({
      userId: access.effectiveUserId,
      extension: enhanced.extension,
    });

    if (process.env.NODE_ENV !== "production") {
      console.info("[images.enhance] upload_metadata", {
        userId: access.effectiveUserId,
        source: imageSource,
        enhancedBytesLength: enhanced.buffer.byteLength,
        enhancedContentType: enhanced.contentType,
        targetEnhancedPath: path,
        uploadSource: "transformed_buffer",
      });
    }

    const { error: uploadError } = await access.client.storage
      .from("listing-photos")
      .upload(path, new Uint8Array(enhanced.buffer), {
        contentType: enhanced.contentType,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("[images.enhance] storage_upload_failed", {
        userId: access.effectiveUserId,
        code: uploadError.code || null,
        message: uploadError.message || null,
      });
      throw new Error("Failed to store enhanced image");
    }

    const { data } = access.client.storage.from("listing-photos").getPublicUrl(path);

    return NextResponse.json(
      {
        ok: true,
        image: {
          publicUrl: data?.publicUrl || null,
          path,
          contentType: enhanced.contentType,
          isFallbackOriginal: false,
        },
        enhancement: {
          background,
          lighting: enhanced.lighting,
          shadow: enhanced.shadow,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const typedError = error as Error & { status?: number; requestId?: string | null };
    console.error("[images.enhance] request_failed", {
      userId: access.effectiveUserId,
      status: typedError?.status || null,
      requestId: typedError?.requestId || null,
      message: typedError?.message || "Unknown enhancement failure",
    });

    const status = typedError?.status === 504 ? 504 : 502;
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: status === 504 ? "UPSTREAM_TIMEOUT" : "ENHANCEMENT_FAILED",
          message: "We couldn't enhance this photo right now. You can keep the original and continue.",
        },
      },
      { status }
    );
  }
}
