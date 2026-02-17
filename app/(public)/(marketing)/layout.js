export default function MarketingLayout({ children }) {
  return (
    <div
      className="min-h-screen bg-[var(--yb-bg)] text-[var(--yb-text)]"
      data-theme="light"
      data-route-theme="light"
    >
      {children}
    </div>
  );
}
