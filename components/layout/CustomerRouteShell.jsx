export default function CustomerRouteShell({
  children = null,
  className = "",
  gap = "none",
}) {
  const offsetGap =
    gap === "none"
      ? "0px"
      : gap === "compact"
      ? "clamp(8px, 1.5vw, 12px)"
      : "clamp(16px, 2vw, 24px)";
  const lightThemeVars = {
    "--yb-bg": "#f6f7fb",
    "--color-bg": "#f6f7fb",
    "--background": "#f6f7fb",
    "--bg-solid": "#f6f7fb",
    "--bg-gradient-start": "#f6f7fb",
    "--bg-gradient-end": "#f6f7fb",
    "--glow-1": "transparent",
    "--glow-2": "transparent",
    "--customer-nav-offset": "max(81px, var(--yb-nav-content-offset, 81px))",
    "--customer-shell-gap": offsetGap,
  };

  return (
    <div
      className={`customer-shell-content min-h-screen bg-[#f6f7fb] text-[var(--yb-text)]${className ? ` ${className}` : ""}`}
      data-testid="customer-shell-content"
      data-theme="light"
      data-route-theme="light"
      data-shell-gap={gap}
      style={{
        ...lightThemeVars,
        paddingTop: "calc(var(--customer-nav-offset) + var(--customer-shell-gap))",
      }}
    >
      {children}
    </div>
  );
}
