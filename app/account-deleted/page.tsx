export default function AccountDeletedPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-white/15 bg-white/5 p-8 text-white shadow-xl backdrop-blur">
        <h1 className="text-2xl font-semibold">Account unavailable</h1>
        <p className="mt-3 text-sm text-white/80">
          This account is pending deletion or has already been deleted.
        </p>
      </section>
    </main>
  );
}
