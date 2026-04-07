"use client";

import { useEffect, useRef } from "react";

export default function ProfileViewTracker({ businessId }) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (!businessId || sentRef.current) return;
    sentRef.current = true;
    const diagEnabled = process.env.NODE_ENV !== "production";

    if (diagEnabled) {
      console.warn("[profile-view-tracker] dispatch", { businessId });
    }

    fetch("/api/business/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId }),
      keepalive: true,
    }).catch((error) => {
      if (diagEnabled) {
        console.warn("[profile-view-tracker] request_failed", {
          businessId,
          message: error?.message || String(error),
        });
      }
    });
  }, [businessId]);

  return null;
}
