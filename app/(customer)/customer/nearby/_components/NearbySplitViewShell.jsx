"use client";

export default function NearbySplitViewShell({
  mobileView,
  onMobileViewChange,
  controls,
  resultsPane,
  mapPane,
}) {
  return (
    <section
      className="relative flex min-h-[calc(100dvh-96px)] flex-col md:min-h-[calc(100dvh-108px)]"
      data-testid="nearby-splitview"
    >
      <div className="sticky top-[72px] z-30 mb-2 md:hidden">
        <div className="inline-flex rounded-xl border border-white/15 bg-black/40 p-1 backdrop-blur-xl">
          {[
            { key: "list", label: "List" },
            { key: "map", label: "Map" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onMobileViewChange(item.key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                mobileView === item.key
                  ? "bg-violet-500/70 text-white shadow"
                  : "text-white/75 hover:text-white"
              }`}
              aria-pressed={mobileView === item.key}
              data-testid={`nearby-toggle-${item.key}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {controls ? <div className="mb-3 shrink-0" data-testid="nearby-header">{controls}</div> : null}

      <div className="hidden min-h-0 flex-1 md:grid md:grid-cols-[minmax(340px,400px)_minmax(0,1fr)] md:gap-4" data-testid="nearby-split-desktop">
        <div className="min-h-0 rounded-2xl border border-white/10 bg-white/[0.02] p-3 shadow-2xl shadow-black/20">
          <div className="h-full overflow-y-auto pr-1" data-testid="nearby-results-scroll-pane">
            {resultsPane}
          </div>
        </div>

        <div
          className="relative min-h-0 rounded-2xl border border-white/15 bg-white/[0.03] p-2.5 shadow-2xl shadow-black/20"
          data-testid="nearby-map-pane"
        >
          <div className="h-full overflow-hidden rounded-xl border border-white/10">{mapPane}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 md:hidden">
        {mobileView === "list" ? (
          <div className="h-full min-h-0 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
            <div className="h-full overflow-y-auto pr-1">{resultsPane}</div>
          </div>
        ) : (
          <div className="h-full min-h-0 rounded-2xl border border-white/10 bg-white/[0.02] p-2" data-testid="nearby-map-mobile-pane">
            <div className="h-full overflow-hidden rounded-xl border border-white/10">{mapPane}</div>
          </div>
        )}
      </div>
    </section>
  );
}
