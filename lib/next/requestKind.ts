import { headers } from "next/headers";

function hasTruthyHeader(headerList, name) {
  const value = headerList.get(name);
  return typeof value === "string" && value.trim().length > 0;
}

function hasRscSearchParamFromPath(pathLike) {
  if (!pathLike || typeof pathLike !== "string") return false;
  try {
    const parsed = new URL(pathLike, "http://localhost");
    return parsed.searchParams.has("_rsc");
  } catch {
    return false;
  }
}

function hasRscSearchParamFromHeaders(headerList) {
  const candidatePaths = [
    headerList.get("x-url"),
    headerList.get("x-invoke-path"),
    headerList.get("next-url"),
    headerList.get("x-pathname"),
  ];
  return candidatePaths.some((value) => hasRscSearchParamFromPath(value));
}

export async function isRscFlightRequest() {
  const headerList = await headers();
  const accept = headerList.get("accept") || "";
  return (
    headerList.get("x-yb-rsc-flight") === "1" ||
    headerList.get("rsc") === "1" ||
    hasTruthyHeader(headerList, "next-router-prefetch") ||
    hasTruthyHeader(headerList, "next-router-segment-prefetch") ||
    hasTruthyHeader(headerList, "next-router-state-tree") ||
    accept.includes("text/x-component") ||
    hasRscSearchParamFromHeaders(headerList)
  );
}

export async function isNavigationRequest() {
  const headerList = await headers();
  const accept = headerList.get("accept") || "";
  const mode = (headerList.get("sec-fetch-mode") || "").toLowerCase();
  const dest = (headerList.get("sec-fetch-dest") || "").toLowerCase();
  return (
    accept.includes("text/html") ||
    mode === "navigate" ||
    dest === "document"
  );
}

export async function canUseServerRedirect() {
  const isRsc = await isRscFlightRequest();
  const isNavigation = await isNavigationRequest();
  return isNavigation && !isRsc;
}
