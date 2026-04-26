"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { markImageFailed, resolveImageSrc } from "@/lib/safeImage";

export default function SafeImage({
  src,
  alt = "",
  fallbackSrc = "/business-placeholder.png",
  onError = undefined,
  onLoad = undefined,
  useNextImage = false,
  ...rest
}) {
  const { fill, ...imgRest } = rest;
  const resolvedFallback = useMemo(
    () => fallbackSrc || "/business-placeholder.png",
    [fallbackSrc]
  );
  const [currentSrc, setCurrentSrc] = useState(() =>
    resolveImageSrc(src, resolvedFallback)
  );

  useEffect(() => {
    setCurrentSrc(resolveImageSrc(src, resolvedFallback));
  }, [src, resolvedFallback]);

  const handleError = (event) => {
    if (currentSrc === resolvedFallback) {
      return;
    }
    markImageFailed(currentSrc);
    if (process.env.NODE_ENV !== "production") {
      console.warn("[SafeImage] Falling back after image load failure", {
        src: currentSrc,
        fallbackSrc: resolvedFallback,
        alt,
      });
    }
    if (typeof onError === "function") {
      onError(event);
    }
    setCurrentSrc(resolvedFallback);
  };

  const handleLoad = (event) => {
    if (typeof onLoad === "function") {
      onLoad(event);
    }
  };

  const isPlaceholder = currentSrc === resolvedFallback;
  const canUseNextImage = useNextImage && (fill || (rest.width && rest.height));

  if (canUseNextImage) {
    return (
      <Image
        {...rest}
        fill={fill}
        src={currentSrc}
        alt={alt}
        data-placeholder={isPlaceholder ? "true" : undefined}
        onError={handleError}
        onLoad={handleLoad}
      />
    );
  }

  return (
    <img
      {...imgRest}
      src={currentSrc}
      alt={alt}
      data-placeholder={isPlaceholder ? "true" : undefined}
      onError={handleError}
      onLoad={handleLoad}
    />
  );
}
