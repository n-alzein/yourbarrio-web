"use client";

import { useEffect, useMemo, useState } from "react";
import { getAvatarInitials } from "@/lib/avatarInitials";
import { getValidAvatarUrls, resolveAvatarUrl } from "@/lib/avatarUrl";
import { markImageFailed, resolveImageSrc } from "@/lib/safeImage";

const EMPTY_AVATAR_CANDIDATES = [];

const authAvatarDiagEnabled =
  process.env.NEXT_PUBLIC_AUTH_DIAG === "1" ||
  process.env.NEXT_PUBLIC_AUTH_AVATAR_DIAG === "1";

export default function SafeAvatar({
  src,
  avatarUrl = undefined,
  authAvatarUrl = undefined,
  authMetadata = undefined,
  userMetadata = undefined,
  avatarCandidates = EMPTY_AVATAR_CANDIDATES,
  fullName = "",
  name = "",
  displayName = "",
  businessName = "",
  email = "",
  fallbackSrc = "/business-placeholder.png",
  alt,
  className = "",
  initialsClassName = "",
  iconClassName = "",
  shape = "circle",
  identityType = "person",
  style = undefined,
  ...imgProps
}) {
  void iconClassName;
  const resolvedFallback = useMemo(
    () => fallbackSrc || "/business-placeholder.png",
    [fallbackSrc]
  );
  const realAvatarUrl = useMemo(
    () =>
      resolveAvatarUrl(
        avatarUrl,
        src,
        authAvatarUrl,
        userMetadata,
        authMetadata,
        avatarCandidates
      ),
    [authAvatarUrl, authMetadata, avatarCandidates, avatarUrl, src, userMetadata]
  );
  const realAvatarUrls = useMemo(
    () =>
      getValidAvatarUrls(
        avatarUrl,
        src,
        authAvatarUrl,
        userMetadata,
        authMetadata,
        avatarCandidates
      ),
    [authAvatarUrl, authMetadata, avatarCandidates, avatarUrl, src, userMetadata]
  );
  const [failedAvatarSources, setFailedAvatarSources] = useState(() => new Set());
  const [lastValidAvatarUrl, setLastValidAvatarUrl] = useState(() => realAvatarUrl);
  const availableAvatarUrls = useMemo(
    () =>
      realAvatarUrls.filter((candidate) => {
        const resolvedCandidate = resolveImageSrc(candidate, resolvedFallback, {
          respectFailures: false,
        });
        return (
          resolvedCandidate !== resolvedFallback &&
          !failedAvatarSources.has(candidate) &&
          !failedAvatarSources.has(resolvedCandidate)
        );
      }),
    [failedAvatarSources, realAvatarUrls, resolvedFallback]
  );
  const stableAvatarUrl =
    availableAvatarUrls[0] ||
    (lastValidAvatarUrl && !failedAvatarSources.has(lastValidAvatarUrl)
      ? lastValidAvatarUrl
      : null);
  const resolvedSrc = useMemo(
    () =>
      resolveImageSrc(stableAvatarUrl, resolvedFallback, {
        respectFailures: false,
      }),
    [resolvedFallback, stableAvatarUrl]
  );
  const initialFallback = !stableAvatarUrl || resolvedSrc === resolvedFallback;
  const label = fullName || displayName || name || businessName || email || "";
  const key = `${resolvedSrc}:${label}:${initialFallback ? "fallback" : "image"}`;

  useEffect(() => {
    if (!authAvatarDiagEnabled) return;
    console.info("[AUTH_AVATAR_RESOLVE]", {
      label: label || alt || null,
      candidateCount: realAvatarUrls.length,
      availableCount: availableAvatarUrls.length,
      hasUserMetadata: Boolean(userMetadata),
      chosen: initialFallback ? null : stableAvatarUrl,
      fallback: initialFallback,
    });
  }, [
    alt,
    availableAvatarUrls.length,
    initialFallback,
    label,
    realAvatarUrls.length,
    stableAvatarUrl,
    userMetadata,
  ]);

  return (
    <SafeAvatarInner
      key={key}
      src={resolvedSrc}
      fullName={fullName}
      name={name}
      displayName={displayName}
      businessName={businessName}
      email={email}
      alt={alt}
      className={className}
      initialsClassName={initialsClassName}
      shape={shape}
      identityType={identityType}
      style={style}
      showFallbackInitially={initialFallback}
      onResolvedLoad={(loadedSrc) => {
        if (loadedSrc && loadedSrc !== resolvedFallback) {
          setLastValidAvatarUrl(loadedSrc);
        }
      }}
      onResolvedError={(failedSrc) => {
        setFailedAvatarSources((prev) => {
          const next = new Set(prev);
          if (stableAvatarUrl) next.add(stableAvatarUrl);
          if (failedSrc) next.add(failedSrc);
          return next;
        });
      }}
      hasNextAvatarCandidate={availableAvatarUrls.length > 1}
      imgProps={imgProps}
    />
  );
}

function SafeAvatarInner({
  src,
  fullName,
  name,
  displayName,
  businessName,
  email,
  alt,
  className,
  initialsClassName,
  shape,
  identityType,
  style,
  showFallbackInitially,
  onResolvedLoad,
  onResolvedError,
  hasNextAvatarCandidate,
  imgProps,
}) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [showFallback, setShowFallback] = useState(showFallbackInitially);
  const [loadedSrc, setLoadedSrc] = useState(null);
  const { onError, onLoad, ...avatarImgProps } = imgProps || {};
  const referrerPolicy =
    avatarImgProps.referrerPolicy ??
    (/^https?:\/\//i.test(currentSrc || "") ? "no-referrer" : undefined);

  const initials = useMemo(
    () =>
      getAvatarInitials(
        identityType === "business"
          ? {
              fullName: businessName,
              displayName: displayName || name,
              email,
            }
          : {
              fullName,
              displayName: displayName || name,
              businessName,
              email,
            }
      ) || "YB",
    [businessName, displayName, email, fullName, identityType, name]
  );
  const label = alt || fullName || displayName || name || businessName || email || "Avatar";
  const borderRadius = shape === "square" || shape === "rounded-square" ? "1rem" : "9999px";
  const avatarStyle = {
    ...style,
    borderRadius,
  };
  const fallbackStyle = {
    ...avatarStyle,
    borderColor: "#e5e7eb",
  };

  if (showFallback) {
    return (
      <div
        role="img"
        aria-label={label}
        data-avatar-fallback="initials"
        style={fallbackStyle}
        className={[
          "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-100 bg-gray-200 text-slate-800 shadow-sm ring-1 ring-gray-300",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {initials ? (
          <span
            aria-hidden="true"
            className={[
              "select-none text-sm font-semibold uppercase leading-none tracking-normal text-slate-800",
              initialsClassName,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {initials}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <img
      {...avatarImgProps}
      src={currentSrc}
      alt={label}
      referrerPolicy={referrerPolicy}
      className={className}
      style={avatarStyle}
      onLoad={(event) => {
        setLoadedSrc(currentSrc);
        onResolvedLoad?.(currentSrc);
        if (typeof onLoad === "function") {
          onLoad(event);
        }
      }}
      onError={(event) => {
        if (loadedSrc === currentSrc) {
          return;
        }
        markImageFailed(currentSrc);
        if (typeof onError === "function") {
          onError(event);
        }
        onResolvedError?.(currentSrc);
        if (hasNextAvatarCandidate) {
          return;
        }
        setShowFallback(true);
      }}
    />
  );
}
