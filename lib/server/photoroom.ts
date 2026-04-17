import "server-only";

export type PhotoroomBackgroundMode = "original" | "white" | "soft_gray";

export type EnhancePhotoOptions = {
  image: File;
  background: PhotoroomBackgroundMode;
  timeoutMs?: number;
};

export type EnhancePhotoResult = {
  buffer: ArrayBuffer;
  contentType: string;
  extension: string;
  background: PhotoroomBackgroundMode;
  lighting: "auto";
  shadow: "subtle";
  transformed: boolean;
};

type PhotoroomRequestError = Error & {
  status?: number;
  requestId?: string | null;
  responseBody?: string;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_API_URL = "https://image-api.photoroom.com/v2/edit";
const DEFAULT_OUTPUT_SIZE = "originalImage";
const MAX_ASPECT_RATIO_DELTA = 0.01;

const BACKGROUND_COLOR_MAP: Record<
  Exclude<PhotoroomBackgroundMode, "original">,
  string
> = {
  white: "FFFFFF",
  soft_gray: "F3F4F6",
};

export function getPhotoroomApiUrl() {
  return process.env.PHOTOROOM_API_URL || DEFAULT_API_URL;
}

export function getPhotoroomApiKey() {
  return process.env.PHOTOROOM_API_KEY || "";
}

export function getPhotoroomOutputExtension(contentType: string) {
  const normalized = contentType.toLowerCase();

  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";

  return "png";
}

export function buildPhotoroomEditFormData({
  image,
  background,
}: EnhancePhotoOptions) {
  const formData = new FormData();

  formData.append("imageFile", image, image.name || "listing-photo.jpg");
  formData.append("padding", "0");
  formData.append("fit", "contain");
  formData.append("outputSize", DEFAULT_OUTPUT_SIZE);
  formData.append("lighting.mode", "ai.auto");

  if (background === "original") {
    formData.append("removeBackground", "false");
  } else {
    formData.append("removeBackground", "true");
    formData.append("background.color", BACKGROUND_COLOR_MAP[background]);
    formData.append("shadow.mode", "ai.soft");
  }

  return formData;
}

async function getImageAspectRatio(image: ArrayBuffer) {
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default;
  const metadata = await sharp(Buffer.from(image)).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (!width || !height) {
    throw new Error("Unable to read image dimensions");
  }

  return width / height;
}

function buildPhotoroomError(
  message: string,
  options?: {
    status?: number;
    requestId?: string | null;
    responseBody?: string;
  }
): PhotoroomRequestError {
  const error = new Error(message) as PhotoroomRequestError;
  error.status = options?.status;
  error.requestId = options?.requestId ?? null;
  error.responseBody = options?.responseBody;
  return error;
}

export async function enhancePhotoWithPhotoroom({
  image,
  background,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: EnhancePhotoOptions): Promise<EnhancePhotoResult> {
  const apiKey = getPhotoroomApiKey();

  if (!apiKey) {
    throw buildPhotoroomError("Photoroom API key is not configured", {
      status: 500,
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const originalBuffer = await image.arrayBuffer();

  try {
    const response = await fetch(getPhotoroomApiUrl(), {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
      },
      body: buildPhotoroomEditFormData({ image, background }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const requestId =
        response.headers.get("x-request-id") ||
        response.headers.get("request-id") ||
        null;

      const responseBody = await response.text().catch(() => "");

      console.error("Photoroom request failed", {
        status: response.status,
        requestId,
        url: getPhotoroomApiUrl(),
        responseBody: responseBody.slice(0, 500),
      });

      throw buildPhotoroomError("Photoroom request failed", {
        status: response.status,
        requestId,
        responseBody,
      });
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = await response.arrayBuffer();

    try {
      const [originalAspectRatio, enhancedAspectRatio] = await Promise.all([
        getImageAspectRatio(originalBuffer),
        getImageAspectRatio(buffer),
      ]);

      if (Math.abs(originalAspectRatio - enhancedAspectRatio) > MAX_ASPECT_RATIO_DELTA) {
        console.warn("Photoroom framing safeguard triggered; using original image", {
          originalAspectRatio,
          enhancedAspectRatio,
          background,
        });

        return {
          buffer: originalBuffer,
          contentType: image.type || "image/png",
          extension: getPhotoroomOutputExtension(image.type || "image/png"),
          background,
          lighting: "auto",
          shadow: "subtle",
          transformed: false,
        };
      }
    } catch (metadataError) {
      console.warn("Photoroom aspect-ratio check skipped", {
        message: metadataError instanceof Error ? metadataError.message : "Unknown metadata error",
      });
    }

    return {
      buffer,
      contentType,
      extension: getPhotoroomOutputExtension(contentType),
      background,
      lighting: "auto",
      shadow: "subtle",
      transformed: true,
    };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw buildPhotoroomError("Photoroom request timed out", {
        status: 504,
      });
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
