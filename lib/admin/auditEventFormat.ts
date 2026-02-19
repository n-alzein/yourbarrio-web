export type AuditDetail = {
  label: string;
  value: string;
};

export type AdminAuditRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string | null;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  target_email: string | null;
  target_label: string | null;
  meta: Record<string, unknown> | null;
  total_count?: number;
};

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function shortId(value: string | null | undefined) {
  const text = normalizeText(value);
  if (!text) return "-";
  if (text.length <= 12) return text;
  return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

function formatDisplayName(name: string | null, email: string | null, fallbackId: string | null) {
  const safeName = normalizeText(name);
  const safeEmail = normalizeText(email);

  if (safeName && safeEmail) return `${safeName} - ${safeEmail}`;
  if (safeEmail) return safeEmail;
  if (safeName) return safeName;
  return shortId(fallbackId);
}

function valueFromMeta(meta: Record<string, unknown> | null, key: string) {
  if (!meta || typeof meta !== "object") return null;
  return meta[key];
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value.trim() || "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function fallbackDetails(meta: Record<string, unknown> | null) {
  if (!meta || typeof meta !== "object") return [] as AuditDetail[];
  const keys = Object.keys(meta).slice(0, 6);
  return keys.map((key) => ({
    label: key.replace(/_/g, " "),
    value: stringifyValue(meta[key]),
  }));
}

export function formatAuditEvent(row: AdminAuditRow): {
  title: string;
  summary: string;
  details: AuditDetail[];
} {
  const action = normalizeText(row.action) || "unknown_action";
  const meta = row.meta && typeof row.meta === "object" ? row.meta : null;

  if (action === "user_internal_note_deleted") {
    return {
      title: "Internal note deleted",
      summary: "Deleted an internal note",
      details: [
        {
          label: "Deleted by super admin",
          value: stringifyValue(valueFromMeta(meta, "deleted_by_super")),
        },
        {
          label: "Note ID",
          value: stringifyValue(valueFromMeta(meta, "admin_user_note_id")),
        },
      ],
    };
  }

  if (action === "user_internal_note_added") {
    return {
      title: "Internal note added",
      summary: "Added an internal note",
      details: [
        {
          label: "Note ID",
          value: stringifyValue(valueFromMeta(meta, "admin_user_note_id")),
        },
        {
          label: "Note",
          value: stringifyValue(valueFromMeta(meta, "note")),
        },
      ],
    };
  }

  if (action === "user_internal_note_updated") {
    return {
      title: "Internal note updated",
      summary: "Updated an internal note",
      details: [
        {
          label: "Note ID",
          value: stringifyValue(valueFromMeta(meta, "admin_user_note_id")),
        },
      ],
    };
  }

  return {
    title: action,
    summary: action,
    details: fallbackDetails(meta),
  };
}

export function formatAuditActorDisplay(row: AdminAuditRow) {
  return formatDisplayName(row.actor_name, row.actor_email, row.actor_user_id);
}

export function formatAuditTargetDisplay(row: AdminAuditRow) {
  if (row.target_type === "user") {
    return formatDisplayName(row.target_name, row.target_email, row.target_id);
  }

  const safeLabel = normalizeText(row.target_label);
  if (safeLabel) return safeLabel;

  const safeType = normalizeText(row.target_type) || "target";
  const safeId = normalizeText(row.target_id) || "-";
  return `${safeType}:${safeId}`;
}

export function formatAuditTimestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
