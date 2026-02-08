import Link from "next/link";
import { getSafeRedirectPath } from "@/lib/auth/redirects";

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const nextParamRaw = typeof params.next === "string" ? params.next : "/";
  const nextParam = getSafeRedirectPath(nextParamRaw) || "/";

  return (
    <section className="mx-auto max-w-2xl px-6 py-16 text-center text-white">
      <h1 className="text-3xl font-bold">Sign in required</h1>
      <p className="mt-3 text-white/80">
        Opened the customer sign-in modal. After login you will return to <span className="font-mono">{nextParam}</span>.
      </p>
      <div className="mt-6">
        <Link href="/" className="rounded border border-white/25 px-4 py-2 text-sm hover:border-white/50">
          Back home
        </Link>
      </div>
    </section>
  );
}
