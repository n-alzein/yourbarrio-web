// app/layout.js
import "./globals.css";
import "./safari-layer-budget.css";
import GlobalSupportModeBanner from "@/components/admin/GlobalSupportModeBanner";
import AppShell from "@/components/AppShell";
import { getLocationFromCookies } from "@/lib/location/getLocationFromCookies";
import { getCurrentAccountContext } from "@/lib/auth/getCurrentAccountContext";
import { normalizeAuthUser } from "@/lib/auth/normalizeAuthUser";
import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { Analytics } from "@vercel/analytics/react";

export const metadata = {
  title: "YourBarrio - Shop Local",
  description: "YourBarrio neighborhood discovery landing page",
  other: {
    "yb-shell-root": "root",
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RootLayout({ children, auth, businessAuth }) {
  const initialLocation = await getLocationFromCookies();
  const initialAccountContext = await getCurrentAccountContext({
    source: "root-layout",
  });
  const initialAuth = initialAccountContext?.isAuthenticated
    ? {
        user: normalizeAuthUser(initialAccountContext.user),
        profile: initialAccountContext.profile,
        role:
          initialAccountContext.role ||
          initialAccountContext.profile?.role ||
          initialAccountContext.user?.app_metadata?.role ||
          null,
      }
    : null;
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.AUTH_DIAG_SERVER === "1" ||
    process.env.NEXT_PUBLIC_AUTH_DIAG === "1"
  ) {
    console.info("[AUTH_SERVER_RENDER]", {
      source: "root-layout",
      hasUser: Boolean(initialAuth?.user?.id),
      userId: initialAuth?.user?.id || null,
      role: initialAuth?.role || null,
      hasProfile: Boolean(initialAuth?.profile?.id),
    });
    if (initialAuth?.user?.id) {
      console.info("[AUTH_AVATAR_SEED]", {
        source: "root-layout",
        userId: initialAuth.user.id,
        hasUserMetadata: Boolean(initialAuth.user.user_metadata),
        hasMetadataAvatar: Boolean(resolveAvatarUrl(initialAuth.user.user_metadata)),
        hasProfileAvatar: Boolean(resolveAvatarUrl(initialAuth.profile?.profile_photo_url)),
      });
    }
  }
  const imageHosts = (() => {
    const hosts = new Set();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      try {
        hosts.add(new URL(supabaseUrl).origin);
      } catch {}
    }
    return Array.from(hosts);
  })();

  return (
    <html
      lang="en"
      className="theme-light"
      data-theme="light"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
        {imageHosts.map((host) => (
          <link key={`preconnect-${host}`} rel="preconnect" href={host} />
        ))}
        {imageHosts.map((host) => (
          <link key={`dns-${host}`} rel="dns-prefetch" href={host} />
        ))}
      </head>
      <body className="min-h-screen w-full overflow-x-hidden antialiased text-[var(--yb-text)]">
        <GlobalSupportModeBanner />
        <AppShell initialLocation={initialLocation} initialAuth={initialAuth}>
          {children}
          {auth}
          {businessAuth}
        </AppShell>
        {/* Vercel Web Analytics: global passive tracking; keep at root and avoid page-level duplicates. */}
        <Analytics />
      </body>
    </html>
  );
}
