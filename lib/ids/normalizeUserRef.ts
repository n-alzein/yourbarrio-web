import { isUuid } from "@/lib/ids/isUuid";

export function normalizeUserRef(ref: unknown): {
  id: string | null;
  public_id: string | null;
} {
  const value = typeof ref === "string" ? ref.trim() : "";
  if (!value) return { id: null, public_id: null };
  if (isUuid(value)) return { id: value, public_id: null };
  return { id: null, public_id: value };
}

