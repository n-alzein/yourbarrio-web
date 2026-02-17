"use client";

import { useEffect } from "react";

const enabled =
  process.env.NEXT_PUBLIC_RSC_LOOP_DIAG === "1" &&
  process.env.NODE_ENV !== "production";

function stack() {
  try {
    return new Error().stack;
  } catch {
    return null;
  }
}

export default function RscLoopDiagClient() {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const log = (event, payload = {}) => {
      console.warn("[RSC_LOOP_DIAG]", {
        event,
        href: window.location.href,
        ts: Date.now(),
        ...payload,
      });
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const input = args[0];
      const url = typeof input === "string" ? input : input?.url || "";
      try {
        return await originalFetch(...args);
      } catch (err) {
        const message = String(err?.message || err || "");
        if (/load failed/i.test(message) || /failed to fetch/i.test(message)) {
          log("fetch_error", {
            url,
            message,
            stack: stack(),
          });
        }
        throw err;
      }
    };

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);
    window.history.pushState = (...args) => {
      log("history.pushState", { stack: stack() });
      return originalPushState(...args);
    };
    window.history.replaceState = (...args) => {
      log("history.replaceState", { stack: stack() });
      return originalReplaceState(...args);
    };

    const locProto = Object.getPrototypeOf(window.location);
    const originalReload = locProto.reload?.bind(window.location);
    const originalAssign = locProto.assign?.bind(window.location);
    const originalReplace = locProto.replace?.bind(window.location);

    if (originalReload) {
      locProto.reload = (...args) => {
        log("location.reload", { stack: stack() });
        return originalReload(...args);
      };
    }
    if (originalAssign) {
      locProto.assign = (...args) => {
        log("location.assign", { target: args?.[0], stack: stack() });
        return originalAssign(...args);
      };
    }
    if (originalReplace) {
      locProto.replace = (...args) => {
        log("location.replace", { target: args?.[0], stack: stack() });
        return originalReplace(...args);
      };
    }

    return () => {
      window.fetch = originalFetch;
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      if (originalReload) locProto.reload = originalReload;
      if (originalAssign) locProto.assign = originalAssign;
      if (originalReplace) locProto.replace = originalReplace;
    };
  }, []);

  return null;
}
