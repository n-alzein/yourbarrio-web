export default function CustomerLoading() {
  return (
    <div className="min-h-screen px-6 md:px-10 pt-24 text-[var(--yb-text)] bg-[var(--yb-bg)]">
      <div className="max-w-5xl mx-auto rounded-2xl border border-[var(--yb-border)] bg-white p-8 animate-pulse">
        <div className="h-6 w-40 rounded bg-slate-200" />
        <div className="mt-4 h-4 w-64 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-52 rounded bg-slate-100" />
      </div>
    </div>
  );
}
