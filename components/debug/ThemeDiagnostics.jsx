"use client";

import { useEffect } from "react";

const TOKEN_KEYS = [
  "--bg-solid",
  "--bg-gradient-start",
  "--bg-gradient-end",
  "--glow-1",
  "--glow-2",
];

function readThemeTokens() {
  if (typeof window === "undefined") return {};
  const styles = window.getComputedStyle(document.documentElement);
  return TOKEN_KEYS.reduce((acc, key) => {
    acc[key] = styles.getPropertyValue(key).trim();
    return acc;
  }, {});
}

function readRootBackgroundColor() {
  if (typeof window === "undefined") return null;
  const pageRoot =
    document.querySelector("[data-theme-root='1']") ||
    document.querySelector(".app-shell-root") ||
    document.body;
  if (!pageRoot) return null;
  return window.getComputedStyle(pageRoot).backgroundColor;
}

export default function ThemeDiagnostics() {
  useEffect(() => {
    const enabled =
      process.env.NEXT_PUBLIC_THEME_DIAG === "1" &&
      process.env.NODE_ENV !== "production";
    if (!enabled || typeof window === "undefined") return undefined;

    const root = document.documentElement;
    let lastTokens = readThemeTokens();

    const logSnapshot = (reason) => {
      const nextTokens = readThemeTokens();
      const changedTokens = TOKEN_KEYS.filter((key) => nextTokens[key] !== lastTokens[key]);
      console.log("[THEME_DIAG]", {
        reason,
        htmlClassName: root.className,
        htmlDataTheme: root.dataset.theme || null,
        appRootBackgroundColor: readRootBackgroundColor(),
        sidebarOpen: root.dataset.sidebarOpen || "0",
        navMenuOpen: root.dataset.navMenuOpen || "0",
        changedThemeTokens: changedTokens.length > 0 ? changedTokens : ["none"],
      });
      lastTokens = nextTokens;
    };

    logSnapshot("mount");

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type !== "attributes") continue;
        const name = record.attributeName || "";
        if (name === "data-sidebar-open") {
          logSnapshot(`sidebar-toggle:${root.dataset.sidebarOpen || "0"}`);
          continue;
        }
        if (name === "data-nav-menu-open") {
          logSnapshot(`nav-menu-toggle:${root.dataset.navMenuOpen || "0"}`);
          continue;
        }
        if (name === "class" || name === "data-theme") {
          logSnapshot(`theme-attr:${name}`);
        }
      }
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-sidebar-open", "data-nav-menu-open"],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
