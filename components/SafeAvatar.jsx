"use client";

import { useMemo, useState } from "react";
import { getAvatarInitials } from "@/lib/avatarInitials";
import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { markImageFailed, resolveImageSrc } from "@/lib/safeImage";

const EMPTY_AVATAR_CANDIDATES = [];

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
  const [lastValidAvatarUrl, setLastValidAvatarUrl] = useState(() => realAvatarUrl);
  const stableAvatarUrl = realAvatarUrl || lastValidAvatarUrl;
  const resolvedSrc = useMemo(
    () => resolveImageSrc(stableAvatarUrl, resolvedFallback),
    [stableAvatarUrl, resolvedFallback]
  );
  const initialFallback = !stableAvatarUrl || resolvedSrc === resolvedFallback;
  const label = fullName || displayName || name || businessName || email || "";
  const key = `${resolvedSrc}:${label}:${initialFallback ? "fallback" : "image"}`;

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
  imgProps,
}) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [showFallback, setShowFallback] = useState(showFallbackInitially);
  const [loadedSrc, setLoadedSrc] = useState(null);
  const { onError, onLoad, ...avatarImgProps } = imgProps || {};

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
        setShowFallback(true);
      }}
    />
  );
}
