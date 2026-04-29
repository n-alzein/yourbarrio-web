export default function CustomerRouteShell({ children = null, className = "" }) {
  const lightThemeVars = {
    "--bg-solid": "#ffffff",
    "--bg-gradient-start": "#f7f7f8",
    "--bg-gradient-end": "#eef2ff",
    "--glow-1": "rgba(79, 70, 229, 0.1)",
    "--glow-2": "rgba(14, 165, 233, 0.08)",
  };

  return (
    <div
      className={`customer-shell-content pt-0 min-h-screen bg-[var(--yb-bg)] text-[var(--yb-text)]${className ? ` ${className}` : ""}`}
      data-testid="customer-shell-content"
      data-theme="light"
      data-route-theme="light"
      style={lightThemeVars}
    >
      {children}
    </div>
  );
}
