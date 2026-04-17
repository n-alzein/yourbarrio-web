const HEIC_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

const HEIC_EXTENSION_PATTERN = /\.(heic|heif)$/i;
const NORMALIZATION_ERROR_MESSAGE =
  "We couldn’t process this iPhone photo automatically. Please try another photo, or set your iPhone camera format to Most Compatible.";

function logNormalization(details) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[image.normalize]", details);
}

export function isHeicLike(file) {
  if (!file) return false;
  const type = typeof file.type === "string" ? file.type.trim().toLowerCase() : "";
  const name = typeof file.name === "string" ? file.name.trim() : "";
  return HEIC_MIME_TYPES.has(type) || HEIC_EXTENSION_PATTERN.test(name);
}

export function toJpegFileName(name = "photo.jpg") {
  const baseName = String(name || "photo")
    .replace(HEIC_EXTENSION_PATTERN, "")
    .replace(/\.[^.]+$/, "");
  return `${baseName || "photo"}.jpg`;
}

async function convertHeicToJpeg(file) {
  const { heicTo } = await import("heic-to");
  return heicTo({
    blob: file,
    type: "image/jpeg",
    quality: 0.92,
  });
}

async function detectHeicFromFileSignature(file) {
  const { isHeic } = await import("heic-to");
  return isHeic(file);
}

export async function normalizeImageUpload(file, options = {}) {
  if (!(file instanceof File)) {
    throw new Error("Select an image to upload.");
  }

  const metadataMatched = isHeicLike(file);
  let heicMatched = metadataMatched;
  let detectionPath = metadataMatched ? "metadata" : "none";

  if (!heicMatched && (!file.type || !file.name)) {
    try {
      heicMatched = await detectHeicFromFileSignature(file);
      detectionPath = heicMatched ? "signature" : "signature-no-match";
    } catch (error) {
      detectionPath = "signature-error";
      logNormalization({
        originalName: file.name || null,
        originalType: file.type || null,
        originalSize: typeof file.size === "number" ? file.size : null,
        heicMatched: false,
        detectionPath,
        conversionErrorMessage: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const baseDetails = {
    originalName: file.name || null,
    originalType: file.type || null,
    originalSize: typeof file.size === "number" ? file.size : null,
    heicMatched,
    detectionPath,
    source: options?.source || "unknown",
    inputControl: options?.inputControl || "unknown",
    captureAttributePresent: Boolean(options?.captureAttributePresent),
  };

  if (!heicMatched) {
    logNormalization({
      ...baseDetails,
      converterPath: "passthrough",
      normalizedName: file.name || null,
      normalizedType: file.type || null,
      normalizedSize: typeof file.size === "number" ? file.size : null,
    });
    return file;
  }

  try {
    const convertedBlob = await convertHeicToJpeg(file);

    if (!(convertedBlob instanceof Blob)) {
      throw new Error("HEIC conversion returned no blob");
    }

    const normalizedFile = new File([convertedBlob], toJpegFileName(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    logNormalization({
      ...baseDetails,
      converterPath: "heic-to",
      normalizedName: normalizedFile.name,
      normalizedType: normalizedFile.type,
      normalizedSize: normalizedFile.size,
    });

    return normalizedFile;
  } catch (error) {
    logNormalization({
      ...baseDetails,
      converterPath: "heic-to",
      normalizedName: null,
      normalizedType: null,
      normalizedSize: null,
      conversionErrorMessage: error instanceof Error ? error.message : "unknown",
      conversionErrorStack: error instanceof Error ? error.stack || null : null,
    });
    throw new Error(NORMALIZATION_ERROR_MESSAGE);
  }
}
