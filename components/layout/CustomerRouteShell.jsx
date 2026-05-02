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
    "--bg-solid": "#ffffff",
    "--bg-gradient-start": "#f7f7f8",
    "--bg-gradient-end": "#eef2ff",
    "--glow-1": "rgba(79, 70, 229, 0.1)",
    "--glow-2": "rgba(14, 165, 233, 0.08)",
    "--customer-nav-offset": "max(81px, var(--yb-nav-content-offset, 81px))",
    "--customer-shell-gap": offsetGap,
  };

  return (
    <div
      className={`customer-shell-content min-h-screen bg-[var(--yb-bg)] text-[var(--yb-text)]${className ? ` ${className}` : ""}`}
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
