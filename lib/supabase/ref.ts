import "server-only";

export function getSupabaseRefFromUrl(url: string): string {
  try {
    const hostname = new URL(String(url || "")).hostname.toLowerCase();
    const suffix = ".supabase.co";
    if (!hostname.endsWith(suffix)) return "unknown";
    const ref = hostname.slice(0, -suffix.length).trim();
    return ref || "unknown";
  } catch {
    return "unknown";
  }
}
