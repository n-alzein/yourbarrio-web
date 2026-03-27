import { decodeHumanLocationString } from "@/lib/location/decodeHumanLocation";
import { buildLocationLabel, normalizeStateCode } from "@/lib/location/filter";

export const LOCATION_COOKIE_NAME = "yb_location";
export const LEGACY_LOCATION_COOKIE_NAME = "yb-location";
export const LEGACY_LOCATION_COOKIE_NAME_ALT = "yb-location";
export const LOCATION_STORAGE_KEY = "yb-location";
export const LEGACY_CITY_KEY = "yb-city";

export type LocationState = {
  source?: "ip" | "gps" | "manual";
  city?: string;
  region?: string;
  country?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  label?: string;
  kind?: "place" | "postcode";
  updatedAt: number;
};

const compactSpaces = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizeHuman = (value: unknown) => decodeHumanLocationString(value) || undefined;

const normalizeNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const parseObject = (input: unknown): Record<string, unknown> | null => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
};

export const normalizeLocationState = (input: unknown): LocationState | null => {
  const obj = parseObject(input);
  if (!obj) return null;

  const source =
    obj.source === "ip" || obj.source === "gps" || obj.source === "manual"
      ? obj.source
      : undefined;
  const city = normalizeHuman(obj.city);
  const region = normalizeStateCode(normalizeHuman(obj.region));
  const country = normalizeHuman(obj.country);
  const zip = compactSpaces(obj.zip) || undefined;
  const label = buildLocationLabel(normalizeHuman(obj.city), region, normalizeHuman(obj.label));
  const kind = obj.kind === "postcode" || obj.kind === "place" ? obj.kind : undefined;
  const placeId = compactSpaces(obj.placeId ?? obj.place_id) || undefined;
  const lat = normalizeNumber(obj.lat);
  const lng = normalizeNumber(obj.lng);

  const parsedUpdatedAt = Number(obj.updatedAt);
  const updatedAt = Number.isFinite(parsedUpdatedAt)
    ? parsedUpdatedAt
    : Date.now();

  if (
    !city &&
    !region &&
    !country &&
    !zip &&
    !placeId &&
    typeof lat !== "number" &&
    typeof lng !== "number"
  ) {
    return null;
  }

  return {
    source,
    city,
    region,
    country,
    zip,
    lat,
    lng,
    placeId,
    label,
    kind,
    updatedAt,
  };
};

const toBase64Url = (input: string) => {
  const maybeBuffer = (globalThis as { Buffer?: any }).Buffer;
  if (maybeBuffer?.from) {
    return maybeBuffer.from(input, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (input: string) => {
  const maybeBuffer = (globalThis as { Buffer?: any }).Buffer;
  if (maybeBuffer?.from) {
    return maybeBuffer.from(input, "base64url").toString("utf8");
  }
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
};

export const encodeLocation = (input: unknown): string => {
  const normalized = normalizeLocationState(input);
  if (!normalized) return "";
  return toBase64Url(JSON.stringify(normalized));
};

export const decodeLocation = (raw: string | null | undefined): LocationState | null => {
  const value = String(raw || "").trim();
  if (!value) return null;

  const candidates = [
    value,
    (() => {
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    })(),
    (() => {
      try {
        return fromBase64Url(value);
      } catch {
        return null;
      }
    })(),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const normalized = normalizeLocationState(parsed);
      if (normalized) return normalized;
    } catch {
      // Continue to next candidate.
    }
  }

  return null;
};
