"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

const STORAGE_KEY = "yb-theme";
const THEMES = ["light", "dark"];

const ThemeContext = createContext(null);

export function ThemeProvider({ children, forcedTheme = "light" }) {
  const hasForcedTheme = THEMES.includes(forcedTheme);
  const [theme, setTheme] = useState(() => {
    if (hasForcedTheme) return forcedTheme;
    if (typeof window === "undefined") return "light";
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && THEMES.includes(saved) ? saved : "light";
  });
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const resolvedTheme = hasForcedTheme ? forcedTheme : theme;

  useEffect(() => {
    const root = document.documentElement;
    const nextThemeClass = `theme-${resolvedTheme}`;
    const alreadyApplied =
      root.classList.contains(nextThemeClass) && root.dataset.theme === resolvedTheme;
    if (hasForcedTheme && alreadyApplied) return;
    THEMES.forEach((name) => root.classList.remove(`theme-${name}`));
    root.classList.add(nextThemeClass);
    root.dataset.theme = resolvedTheme;
    if (!hasForcedTheme) {
      localStorage.setItem(STORAGE_KEY, resolvedTheme);
    }
  }, [hasForcedTheme, resolvedTheme]);

  useEffect(() => {
    if (hasForcedTheme) return undefined;
    const handleStorage = (event) => {
      if (event.key !== STORAGE_KEY) return;
      if (event.newValue && THEMES.includes(event.newValue)) {
        setTheme(event.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [hasForcedTheme]);

  const setThemeSafe = useCallback((next) => {
    if (hasForcedTheme) return;
    setTheme(THEMES.includes(next) ? next : "light");
  }, [hasForcedTheme]);

  const value = useMemo(
    () => ({
      theme: resolvedTheme,
      hydrated,
      setTheme: setThemeSafe,
      themes: THEMES,
    }),
    [hydrated, resolvedTheme, setThemeSafe]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
