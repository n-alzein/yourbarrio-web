"use client";

export async function syncBusinessBrowserSessionToServer(session) {
  const accessToken = session?.access_token || null;
  const refreshToken = session?.refresh_token || null;

  if (!accessToken || !refreshToken) {
    return {
      ok: false,
      serverHasUser: false,
      reason: "missing_tokens",
    };
  }

  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
      cache: "no-store",
      credentials: "same-origin",
    });

    return {
      ok: response.ok,
      serverHasUser: response.headers.get("x-auth-refresh-user") === "1",
      reason: response.ok ? "refreshed" : "refresh_failed",
    };
  } catch {
    return {
      ok: false,
      serverHasUser: false,
      reason: "refresh_request_failed",
    };
  }
}
