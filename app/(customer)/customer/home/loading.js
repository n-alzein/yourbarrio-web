"use client";

export default function CustomerHomeLoading() {
  return (
    <div className="min-h-screen text-[var(--yb-text)] bg-[var(--yb-bg)] relative px-6 pt-10">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[var(--yb-bg)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-gradient-start)] to-[var(--bg-gradient-end)]" />
        <div className="pointer-events-none absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-[var(--glow-1)] blur-[120px]" />
        <div className="pointer-events-none absolute top-40 -right-24 h-[480px] w-[480px] rounded-full bg-[var(--glow-2)] blur-[120px]" />
      </div>
      <div className="w-full max-w-5xl mx-auto space-y-4">
        <div className="h-10 w-64 rounded-full bg-slate-200 border border-[var(--yb-border)]" />
        <div className="rounded-2xl border border-[var(--yb-border)] bg-white shadow-xl p-4 space-y-3">
          <div className="h-4 w-48 rounded bg-slate-200" />
          <div className="h-4 w-64 rounded bg-slate-200" />
          <div className="h-4 w-40 rounded bg-slate-200" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 rounded-2xl border border-[var(--yb-border)] bg-white shadow-xl h-[240px]" />
          <div className="lg:col-span-2 rounded-2xl border border-[var(--yb-border)] bg-white shadow-xl h-[240px]" />
        </div>
      </div>
    </div>
  );
}
