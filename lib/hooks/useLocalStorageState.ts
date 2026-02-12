"use client";

import { useCallback, useSyncExternalStore } from "react";

export function useLocalStorageState<T>(key: string, initialValue: T) {
  const readSnapshot = useCallback((): T => {
    if (typeof window === "undefined") return initialValue;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  }, [initialValue, key]);

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    const handler = (event: Event) => {
      if (event instanceof StorageEvent) {
        if (event.key && event.key !== key) return;
      } else {
        const custom = event as CustomEvent<{ key?: string }>;
        if (custom.detail?.key && custom.detail.key !== key) return;
      }
      onStoreChange();
    };
    window.addEventListener("storage", handler);
    window.addEventListener("yb:local-storage", handler as EventListener);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("yb:local-storage", handler as EventListener);
    };
  }, [key]);

  const value = useSyncExternalStore(subscribe, readSnapshot, () => initialValue);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      if (typeof window === "undefined") return;
      try {
        const prev = readSnapshot();
        const resolved = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
        window.localStorage.setItem(key, JSON.stringify(resolved));
        window.dispatchEvent(new CustomEvent("yb:local-storage", { detail: { key } }));
      } catch {
        // Ignore write errors.
      }
    },
    [key, readSnapshot]
  );

  return [value, setValue] as const;
}
