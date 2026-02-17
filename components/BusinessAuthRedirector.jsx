"use client";

import { useEffect, useRef } from "react";

const DEFAULT_TARGET = "/go/dashboard";

export default function BusinessAuthRedirector() {
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const redirectTo = (target) => {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      window.location.replace(target || DEFAULT_TARGET);
    };

    const handleStorage = (event) => {
      if (event.key !== "business_auth_success") return;
      const target =
        localStorage.getItem("business_auth_redirect") || DEFAULT_TARGET;
      localStorage.removeItem("business_auth_redirect");
      redirectTo(target);
    };

    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== "YB_BUSINESS_AUTH_SUCCESS") return;
      redirectTo(data.target || DEFAULT_TARGET);
    };

    let channel = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("yb-business-auth");
      channel.onmessage = (event) => {
        const data = event?.data;
        if (!data || data.type !== "YB_BUSINESS_AUTH_SUCCESS") return;
        redirectTo(data.target || DEFAULT_TARGET);
      };
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("message", handleMessage);
      if (channel) channel.close();
    };
  }, []);

  return null;
}
