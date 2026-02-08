import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getCookieBaseOptions } from "@/lib/authCookies";
import { resolveCurrentUserRoleFromClient } from "@/lib/auth/getCurrentUserRole";

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;
  const response = NextResponse.next();
  const isPublicBusinessRoute =
    pathname === "/business" ||
    pathname === "/business/" ||
    pathname.startsWith("/business/about") ||
    pathname.startsWith("/business/pricing") ||
    pathname.startsWith("/business/faq") ||
    pathname.startsWith("/business/how-it-works") ||
    pathname.startsWith("/business/retailers") ||
    pathname.startsWith("/business/login");
  const isProd = process.env.NODE_ENV === "production";
  const cookieBaseOptions = getCookieBaseOptions({
    host: request.headers.get("host"),
    isProd,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              ...cookieBaseOptions,
            });
          });
        },
      },
    }
  );

  const shouldLogRole =
    process.env.NODE_ENV !== "production" &&
    (process.env.AUTH_GUARD_DIAG === "1" || process.env.NEXT_PUBLIC_AUTH_DIAG === "1");
  const { user, role } = await resolveCurrentUserRoleFromClient(supabase, {
    log: shouldLogRole,
  });
  const withSupabaseCookies = (targetResponse = response) => {
    const cookies = response.cookies.getAll();
    cookies.forEach(({ name, value }) => {
      targetResponse.cookies.set(name, value);
    });
    return targetResponse;
  };

  if (pathname.startsWith("/admin")) {
    // Deny by default and return 404 to avoid leaking admin route existence.
    if (!user || role !== "admin") {
      return withSupabaseCookies(new NextResponse("Not Found", { status: 404 }));
    }
    return response;
  }

  if (pathname.startsWith("/customer")) {
    if (!user) {
      const signinUrl = new URL("/signin", request.url);
      signinUrl.searchParams.set("modal", "signin");
      signinUrl.searchParams.set("next", pathname);
      return withSupabaseCookies(NextResponse.redirect(signinUrl));
    }
    if (role !== "customer") {
      if (role === "business") {
        return withSupabaseCookies(
          NextResponse.redirect(new URL("/business/dashboard", request.url))
        );
      }
      if (role === "admin") {
        return withSupabaseCookies(NextResponse.redirect(new URL("/admin", request.url)));
      }
      return withSupabaseCookies(new NextResponse("Forbidden", { status: 403 }));
    }
    return response;
  }

  if (pathname.startsWith("/business")) {
    if (isPublicBusinessRoute) {
      return withSupabaseCookies(response);
    }
    if (!user) {
      const signinUrl = new URL("/signin", request.url);
      signinUrl.searchParams.set("modal", "signin");
      signinUrl.searchParams.set("next", pathname);
      return withSupabaseCookies(NextResponse.redirect(signinUrl));
    }
    if (role !== "business") {
      if (role === "customer") {
        return withSupabaseCookies(
          NextResponse.redirect(new URL("/customer/home", request.url))
        );
      }
      if (role === "admin") {
        return withSupabaseCookies(NextResponse.redirect(new URL("/admin", request.url)));
      }
      return withSupabaseCookies(new NextResponse("Forbidden", { status: 403 }));
    }
    return response;
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/customer/:path*",
    "/business/:path*",
  ],
};
