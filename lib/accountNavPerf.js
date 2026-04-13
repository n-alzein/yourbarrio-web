"use client";

const PERF_ENV_FLAG = "NEXT_PUBLIC_PERF_DEBUG";
const PERF_QUERY_KEY = "perf";
const PERF_LS_KEY = "PERF_DEBUG";
const PERF_TARGET_ATTR = "data-perf";
const PERF_TARGET_VALUE = "account-nav";
const PERF_ID_ATTR = "data-perf-id";
const MAX_LOGS = 60;
const LONGTASK_THRESHOLD_MS = 50;
const ROLLING_WINDOW_MS = 5000;
const EVENT_LOOP_INTERVAL_MS = 50;

let installed = false;
let cachedEnabled = null;
let activeInteraction = null;
let interactionSeq = 0;
let longTaskObserver = null;
let eventObserver = null;
let eventLoopTimer = null;
let rafMonitorActive = false;
let navInProgress = false;
let rafSamples = [];
let lagSamples = [];
let fetchWrapped = false;
let resourceObserver = null;

const now = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const getTimeOrigin = () => {
  if (typeof performance === "undefined") return Date.now();
  if (typeof performance.timeOrigin === "number") return performance.timeOrigin;
  return Date.now() - now();
};

const normalizeTimeStamp = (ts) => {
  if (typeof ts !== "number") return null;
  const origin = getTimeOrigin();
  let t = ts;
  if (ts > 1e12) {
    t = ts - origin;
  }
  if (!Number.isFinite(t)) return null;
  return t;
};

const safeParseSearch = () => {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
};

export const isAccountNavPerfEnabled = () => {
  if (typeof window === "undefined") return false;
  if (cachedEnabled !== null) return cachedEnabled;
  try {
    if (process.env?.[PERF_ENV_FLAG] === "1") {
      cachedEnabled = true;
      return true;
    }
  } catch {}
  try {
    const params = safeParseSearch();
    if (params.get(PERF_QUERY_KEY) === "1") {
      cachedEnabled = true;
      return true;
    }
  } catch {}
  try {
    cachedEnabled = window.localStorage.getItem(PERF_LS_KEY) === "1";
    return cachedEnabled;
  } catch {
    cachedEnabled = false;
    return false;
  }
};

const ensureLogStore = () => {
  if (typeof window === "undefined") return [];
  if (!window.__PERF_NAV_LOGS__) {
    window.__PERF_NAV_LOGS__ = [];
  }
  return window.__PERF_NAV_LOGS__;
};

const logPerf = (payload) => {
  const logs = ensureLogStore();
  logs.push(payload);
  while (logs.length > MAX_LOGS) logs.shift();
  window.__PERF_NAV_LAST__ = payload;
  try {
    console.log("PERF_NAV", payload);
  } catch {
    /* ignore */
  }
};

const logOriginContext = () => {
  try {
    console.log("[PERF_ORIGIN]", {
      href: window.location.href,
      origin: window.location.origin,
      baseURI: document.baseURI,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
        NEXT_PUBLIC_PERF_DEBUG: process.env.NEXT_PUBLIC_PERF_DEBUG || null,
      },
    });
  } catch {
    /* ignore */
  }
};

const isSafariWebKit = () => {
  if (typeof window === "undefined") return false;
  const hasWebkit = typeof window.webkit !== "undefined";
  const ua = navigator.userAgent || "";
  const isChromeLike = /chrome|android/i.test(ua);
  return hasWebkit && !isChromeLike;
};

const startResourceObserverFallback = () => {
  if (resourceObserver) return;
  if (typeof PerformanceObserver !== "function") return;
  const supported = PerformanceObserver.supportedEntryTypes || [];
  if (!supported.includes("resource")) return;
  try {
    resourceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        const name = entry?.name || "";
        if (!name) continue;
        const isRsc = name.includes("_rsc=");
        const isLocalhost = name.startsWith("http://localhost:3000");
        if (!isRsc && !isLocalhost) continue;
        console.log("[PERF_FETCH_RESOURCE]", {
          name,
          initiatorType: entry.initiatorType || null,
          duration: Math.round(entry.duration || 0),
        });
      }
    });
    resourceObserver.observe({ entryTypes: ["resource"] });
  } catch {
    resourceObserver = null;
  }
};

const wrapFetchForDebug = () => {
  if (fetchWrapped) return;
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  const isWebKit = isSafariWebKit();
  if (isWebKit) {
    startResourceObserverFallback();
    fetchWrapped = true;
    return;
  }
  const desc =
    Object.getOwnPropertyDescriptor(window, "fetch") ||
    Object.getOwnPropertyDescriptor(Window.prototype, "fetch");
  const patchable =
    Boolean(desc) &&
    (desc.writable === true || typeof desc.set === "function" || desc.configurable === true);
  if (!patchable) {
    console.warn("[PERF_FETCH] fetch not patchable (readonly); using fallback");
    startResourceObserverFallback();
    fetchWrapped = true;
    return;
  }
  try {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      try {
        const url = typeof input === "string" ? input : input?.url || "";
        const isRsc = typeof url === "string" && url.includes("_rsc=");
        const isLocalhost = typeof url === "string" && url.startsWith("http://localhost:3000");
        if (isRsc || isLocalhost) {
          let requestedOrigin = null;
          try {
            requestedOrigin = new URL(url, window.location.href).origin;
          } catch {
            requestedOrigin = null;
          }
          console.log("[PERF_FETCH]", {
            requestedUrl: url,
            requestedOrigin,
            locationOrigin: window.location.origin,
            sameOrigin: requestedOrigin ? requestedOrigin === window.location.origin : null,
            isRsc,
            isLocalhost,
            stack: new Error().stack,
          });
        }
      } catch {
        /* ignore */
      }
      return originalFetch(input, init);
    };
    fetchWrapped = true;
  } catch {
    console.warn("[PERF_FETCH] fetch not patchable (readonly); using fallback");
    startResourceObserverFallback();
    fetchWrapped = true;
  }
};

const shouldSample = () => {
  if (typeof document === "undefined") return false;
  if (document.visibilityState !== "visible") return false;
  if (navInProgress) return false;
  return true;
};

const pruneSamples = (samples, stamp) => {
  while (samples.length && stamp - samples[0].ts > ROLLING_WINDOW_MS) {
    samples.shift();
  }
};

const getRecentMax = (samples, stamp) => {
  if (!samples.length) return 0;
  pruneSamples(samples, stamp);
  let max = 0;
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    const entry = samples[i];
    if (stamp - entry.ts > ROLLING_WINDOW_MS) break;
    if (entry.value > max) max = entry.value;
  }
  return Math.round(max);
};

const recordSample = (samples, value) => {
  const stamp = now();
  samples.push({ ts: stamp, value });
  pruneSamples(samples, stamp);
};

const findPerfTarget = (event) => {
  const path =
    typeof event?.composedPath === "function" ? event.composedPath() : [];
  for (const node of path) {
    if (!node || node.nodeType !== 1) continue;
    const el = node;
    if (el.getAttribute?.(PERF_TARGET_ATTR) === PERF_TARGET_VALUE) return el;
  }
  const fallback = event?.target?.closest?.(
    `[${PERF_TARGET_ATTR}='${PERF_TARGET_VALUE}']`
  );
  return fallback || null;
};

const readTargetMeta = (target) => {
  if (!target) return { id: "unknown", href: null };
  const id =
    target.getAttribute?.(PERF_ID_ATTR) ||
    target.dataset?.perfId ||
    target.getAttribute?.("href") ||
    "unknown";
  const href = target.getAttribute?.("href") || null;
  return { id, href };
};

const startFrameMonitor = (interaction) => {
  if (typeof window === "undefined" || typeof requestAnimationFrame !== "function") {
    return null;
  }
  const monitor = {
    active: true,
    lastTs: now(),
    maxGap: 0,
    gaps: [],
  };

  const loop = (ts) => {
    if (!monitor.active) return;
    const delta = ts - monitor.lastTs;
    if (monitor.lastTs && delta > LONGTASK_THRESHOLD_MS && shouldSample()) {
      monitor.gaps.push(Math.round(delta));
      monitor.maxGap = Math.max(monitor.maxGap, delta);
    }
    monitor.lastTs = ts;
    const elapsed = ts - (interaction.t_pointerdown || ts);
    if (interaction.t_navStart || elapsed > 2500) {
      monitor.active = false;
      return;
    }
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
  return monitor;
};

const startRafMonitor = () => {
  if (rafMonitorActive) return;
  if (typeof requestAnimationFrame !== "function") return;
  rafMonitorActive = true;
  let last = now();
  const loop = (ts) => {
    if (!rafMonitorActive) return;
    if (shouldSample()) {
      const delta = ts - last;
      if (delta > LONGTASK_THRESHOLD_MS) {
        recordSample(rafSamples, delta);
      }
    }
    last = ts;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

const stopRafMonitor = () => {
  rafMonitorActive = false;
  rafSamples = [];
};

const startEventLoopMonitor = () => {
  if (eventLoopTimer) return;
  let expected = now() + EVENT_LOOP_INTERVAL_MS;
  eventLoopTimer = setInterval(() => {
    const stamp = now();
    const lag = Math.max(0, stamp - expected);
    if (shouldSample()) {
      recordSample(lagSamples, lag);
    }
    expected = stamp + EVENT_LOOP_INTERVAL_MS;
  }, EVENT_LOOP_INTERVAL_MS);
};

const stopEventLoopMonitor = () => {
  if (!eventLoopTimer) return;
  clearInterval(eventLoopTimer);
  eventLoopTimer = null;
  lagSamples = [];
};

const attachObservers = () => {
  if (typeof PerformanceObserver !== "function") return;

  const supported = PerformanceObserver.supportedEntryTypes || [];

  if (supported.includes("longtask")) {
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        if (!activeInteraction) return;
        const entries = list.getEntries();
        if (!entries?.length) return;
        const targets = entries.map((entry) => ({
          startTime: entry.startTime,
          duration: entry.duration,
          name: entry.name,
        }));
        activeInteraction.longtasks = activeInteraction.longtasks || [];
        activeInteraction.longtasks.push(...targets);
      });
      longTaskObserver.observe({ entryTypes: ["longtask"] });
    } catch {
      longTaskObserver = null;
    }
  }

  if (supported.includes("event")) {
    try {
      eventObserver = new PerformanceObserver((list) => {
        if (!activeInteraction) return;
        const entries = list
          .getEntries()
          .filter((entry) => entry.name === "click" || entry.name === "pointerdown");
        if (!entries.length) return;
        activeInteraction.eventTiming = entries.map((entry) => ({
          name: entry.name,
          startTime: entry.startTime,
          processingStart: entry.processingStart,
          duration: entry.duration,
        }));
      });
      eventObserver.observe({ entryTypes: ["event"] });
    } catch {
      eventObserver = null;
    }
  }
};

const stopObservers = () => {
  try {
    longTaskObserver?.disconnect?.();
  } catch {}
  try {
    eventObserver?.disconnect?.();
  } catch {}
  longTaskObserver = null;
  eventObserver = null;
};

const finalizeInteraction = (reason) => {
  if (!activeInteraction || activeInteraction.logged) return;
  const stamp = now();
  const payload = {
    ...activeInteraction,
    reason,
    recentMaxEventLoopLagMs: getRecentMax(lagSamples, stamp),
    recentMaxRafGapMs: getRecentMax(rafSamples, stamp),
  };
  const tPointer = payload.t_pointerdown;
  const tClick = payload.t_click;
  const tHandler = payload.t_handlerStart;
  const tNav = payload.t_navStart;
  payload.deltas = {
    pointerToClick: tPointer != null && tClick != null ? tClick - tPointer : null,
    clickToHandler: tClick != null && tHandler != null ? tHandler - tClick : null,
    inputToHandler:
      tPointer != null && tHandler != null ? tHandler - tPointer : null,
    handlerToNav:
      tHandler != null && tNav != null ? tNav - tHandler : null,
    inputToNav: tPointer != null && tNav != null ? tNav - tPointer : null,
  };
  payload.handlerStartMarkMs = tHandler ?? null;
  payload.routerPushMarkMs = tNav ?? null;
  if (payload.frameMonitor) {
    payload.frameGaps = {
      maxGap: Math.round(payload.frameMonitor.maxGap || 0),
      count: payload.frameMonitor.gaps?.length || 0,
      sample: (payload.frameMonitor.gaps || []).slice(0, 6),
    };
  }
  if (payload.longtasks?.length) {
    const durations = payload.longtasks.map((entry) => entry.duration || 0);
    payload.longtaskSummary = {
      count: payload.longtasks.length,
      max: Math.max(...durations),
      total: durations.reduce((sum, val) => sum + val, 0),
    };
  }
  payload.logged = true;
  logPerf(payload);
};

const markNavStart = (source) => {
  if (!activeInteraction) return;
  if (activeInteraction.t_navStart != null) return;
  const stamp = now();
  activeInteraction.t_navStart = stamp;
  activeInteraction.navSource = source;
  try {
    performance.mark(`nav:start:${activeInteraction.id}`);
  } catch {}
  finalizeInteraction("nav");
};

const startInteraction = (event, target) => {
  const { id, href } = readTargetMeta(target);
  const handlerNow = now();
  const eventTs = normalizeTimeStamp(event?.timeStamp);
  const dispatchDelay =
    typeof eventTs === "number" ? Math.max(0, handlerNow - eventTs) : null;
  activeInteraction = {
    seq: ++interactionSeq,
    id,
    href,
    targetTag: target?.tagName?.toLowerCase?.() || "unknown",
    type: event?.type || "pointerdown",
    t_pointerdown: handlerNow,
    pointerdownDispatchDelayMs: dispatchDelay,
    pointerType: event?.pointerType || null,
    button: typeof event?.button === "number" ? event.button : null,
  };
  try {
    performance.mark(`nav:pointerdown:${id}`);
  } catch {}
  activeInteraction.frameMonitor = startFrameMonitor(activeInteraction);
  if (dispatchDelay != null) {
    try {
      console.log("[perf] pointerdown_dispatch_delay(ms)", Math.round(dispatchDelay));
    } catch {}
  }
};

export const markAccountNavHandlerStart = (id, meta = {}) => {
  if (!isAccountNavPerfEnabled()) return;
  if (!id) return;
  const stamp = now();
  if (!activeInteraction || activeInteraction.id !== id) {
    activeInteraction = {
      seq: ++interactionSeq,
      id,
      href: meta?.href || null,
      t_pointerdown: null,
      pointerType: null,
      button: null,
    };
  }
  if (activeInteraction.t_handlerStart == null) {
    activeInteraction.t_handlerStart = stamp;
    try {
      performance.mark(`nav:handlerStart:${id}`);
    } catch {}
  }
};

export function installAccountNavPerf() {
  if (installed) return;
  if (!isAccountNavPerfEnabled()) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  installed = true;

  attachObservers();
  startRafMonitor();
  startEventLoopMonitor();
  logOriginContext();
  wrapFetchForDebug();

  const handlePointerDown = (event) => {
    const target = findPerfTarget(event);
    if (!target) return;
    startInteraction(event, target);
  };

  const handlePointerUp = (event) => {
    if (!activeInteraction) return;
    const target = findPerfTarget(event);
    if (!target) return;
    if (activeInteraction.t_pointerup == null) {
      activeInteraction.t_pointerup = now();
      try {
        performance.mark(`nav:pointerup:${activeInteraction.id}`);
      } catch {}
    }
  };

  const handleClick = (event) => {
    if (!activeInteraction) return;
    const target = findPerfTarget(event);
    if (!target) return;
    if (activeInteraction.t_click == null) {
      const handlerNow = now();
      const eventTs = normalizeTimeStamp(event?.timeStamp);
      const dispatchDelay =
        typeof eventTs === "number" ? Math.max(0, handlerNow - eventTs) : null;
      activeInteraction.t_click = handlerNow;
      activeInteraction.clickDispatchDelayMs = dispatchDelay;
      try {
        performance.mark(`nav:click:${activeInteraction.id}`);
      } catch {}
      if (dispatchDelay != null) {
        try {
          console.log("[perf] click_dispatch_delay(ms)", Math.round(dispatchDelay));
        } catch {}
      }
    }
  };

  document.addEventListener("pointerdown", handlePointerDown, {
    capture: true,
    passive: true,
  });
  document.addEventListener("pointerup", handlePointerUp, {
    capture: true,
    passive: true,
  });
  document.addEventListener("click", handleClick, {
    capture: true,
    passive: true,
  });

  window.addEventListener(
    "pagehide",
    () => {
      navInProgress = true;
      if (activeInteraction && !activeInteraction.t_navStart) {
        finalizeInteraction("pagehide");
      }
    },
    { passive: true }
  );

  window.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") {
        navInProgress = true;
        if (activeInteraction && !activeInteraction.t_navStart) {
          finalizeInteraction("hidden");
        }
      } else if (document.visibilityState === "visible") {
        navInProgress = false;
      }
    },
    { passive: true }
  );

  window.addEventListener(
    "beforeunload",
    () => {
      navInProgress = true;
      if (activeInteraction && !activeInteraction.t_navStart) {
        finalizeInteraction("beforeunload");
      }
    },
    { passive: true }
  );

  window.__PERF_NAV_ENABLED__ = true;

  window.__PERF_NAV_CLEANUP__ = () => {
    document.removeEventListener("pointerdown", handlePointerDown, {
      capture: true,
      passive: true,
    });
    document.removeEventListener("pointerup", handlePointerUp, {
      capture: true,
      passive: true,
    });
    document.removeEventListener("click", handleClick, {
      capture: true,
      passive: true,
    });
    stopObservers();
    stopRafMonitor();
    stopEventLoopMonitor();
    if (resourceObserver) {
      try {
        resourceObserver.disconnect();
      } catch {}
      resourceObserver = null;
    }
  };
}
