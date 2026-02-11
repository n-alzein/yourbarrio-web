import "server-only";

import { cookies } from "next/headers";
import {
  decodeLocation,
  LEGACY_LOCATION_COOKIE_NAME,
  LOCATION_COOKIE_NAME,
  type LocationState,
} from "@/lib/location/locationCookie";

export async function getLocationFromCookies(): Promise<LocationState | null> {
  try {
    const jar = await cookies();
    const primary = decodeLocation(jar.get(LOCATION_COOKIE_NAME)?.value || "");
    if (primary) return primary;
    return decodeLocation(jar.get(LEGACY_LOCATION_COOKIE_NAME)?.value || "");
  } catch {
    return null;
  }
}
