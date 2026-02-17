import { headers } from "next/headers";
import { permanentRedirect } from "next/navigation";

function isDocumentNavigation(headerList) {
  const mode = (headerList.get("sec-fetch-mode") || "").toLowerCase();
  const dest = (headerList.get("sec-fetch-dest") || "").toLowerCase();
  const fetchUser = headerList.get("sec-fetch-user");
  return mode === "navigate" || dest === "document" || fetchUser === "?1";
}

export default async function LegacyBusinessOnboardingRedirectPage() {
  const headerList = await headers();

  if (isDocumentNavigation(headerList)) {
    permanentRedirect("/onboarding");
  }

  return null;
}
