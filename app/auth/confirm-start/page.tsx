import Link from "next/link";
import { redirect } from "next/navigation";
import { getSafeRedirectPath } from "@/lib/auth/redirects";

const OTP_TYPES = new Set(["recovery", "invite", "email", "email_change"]);

export default async function ConfirmStartPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const typeRaw = typeof params.type === "string" ? params.type : "";
  const type = OTP_TYPES.has(typeRaw) ? typeRaw : "";
  const nextRaw = typeof params.next === "string" ? params.next : "/set-password";
  const next = getSafeRedirectPath(nextRaw) || "/set-password";

  if (tokenHash && type) {
    const target = new URLSearchParams();
    target.set("token_hash", tokenHash);
    target.set("type", type);
    if (next && next !== "/set-password") {
      target.set("next", next);
    }
    redirect(`/set-password?${target.toString()}`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4 py-12">
      <section className="w-full max-w-xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Invalid reset link</h1>
        <p className="mt-2 text-sm text-slate-700">
          This verification link is missing or invalid. Request a new password reset email.
        </p>
        <div className="mt-6">
          <Link
            href="/auth/forgot-password"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-black px-5 text-sm font-semibold text-white hover:bg-black/90"
          >
            Request a new link
          </Link>
        </div>
      </section>
    </main>
  );
}
