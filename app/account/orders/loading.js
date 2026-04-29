export default function AccountOrdersLoading() {
  return (
    <div
      className="min-h-screen -mt-16 px-4 pb-12 md:-mt-10 md:px-8 lg:px-12"
      style={{ background: "var(--background)", color: "var(--text)" }}
    >
      <div className="mx-auto max-w-5xl space-y-7">
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-black/10" />
          <div className="h-8 w-40 rounded bg-black/10" />
          <div className="h-4 w-64 rounded bg-black/10" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-24 rounded-full bg-black/10" />
          <div className="h-10 w-24 rounded-full bg-black/10" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="animate-pulse rounded-[28px] border bg-white/95 px-4 py-4 sm:px-5"
              style={{ borderColor: "rgba(15, 23, 42, 0.08)" }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="h-5 w-40 rounded bg-black/10" />
                  <div className="h-3 w-48 rounded bg-black/10" />
                  <div className="h-3 w-64 rounded bg-black/10" />
                  <div className="h-3 w-32 rounded bg-black/10" />
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-[rgba(15,23,42,0.08)] pt-3 sm:min-w-[140px] sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
                  <div className="h-5 w-20 rounded bg-black/10" />
                  <div className="h-4 w-24 rounded bg-black/10" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
