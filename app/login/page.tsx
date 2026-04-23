import CustomerLoginForm from "@/components/auth/CustomerLoginForm";
import { redirect } from "next/navigation";
import { getCurrentAccountContext } from "@/lib/auth/getCurrentAccountContext";
import { getPostLoginRedirect } from "@/lib/auth/redirects";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getNonLoginNext(value: string | null) {
  if (!value) return null;
  if (value === "/login" || value.startsWith("/login?")) return null;
  if (value === "/signin" || value.startsWith("/signin?")) return null;
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) || {};
  const next =
    typeof resolvedSearchParams.next === "string"
      ? resolvedSearchParams.next
      : typeof resolvedSearchParams.returnUrl === "string"
        ? resolvedSearchParams.returnUrl
        : null;
  const accountContext = await getCurrentAccountContext({
    source: "login-page",
  });

  if (accountContext?.user?.id) {
    const destination = getPostLoginRedirect({
      role:
        accountContext.role ||
        accountContext.profile?.role ||
        accountContext.user?.app_metadata?.role ||
        accountContext.user?.user_metadata?.role ||
        "customer",
      requestedPath: getNonLoginNext(next),
    });
    if (process.env.NODE_ENV !== "production") {
      console.info("[AUTH_LOGIN_REDIRECT]", {
        source: "login-page",
        hasSession: true,
        userId: accountContext.user.id,
        hasProfile: Boolean(accountContext.profile?.id),
        role: accountContext.role || accountContext.profile?.role || null,
        requestedPath: next || null,
        destination,
      });
    }
    redirect(destination);
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[auth-next] login page next:", next || "/");
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-white px-4 py-10 text-slate-900">
      <div className="w-full max-w-md rounded-2xl border border-[var(--yb-border)] bg-white p-8 shadow-sm">
        <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-slate-900">
          Welcome back
        </h1>
        <p className="mb-6 text-slate-600">
          Sign in to your customer account to continue exploring nearby businesses.
        </p>
        <CustomerLoginForm next={next} />
      </div>
    </div>
  );
}
