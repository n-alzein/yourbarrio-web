export type EntityIdType = "order" | "listing" | "sku" | "business" | "unit";

type ParsedEntityDisplayId = {
  type: EntityIdType | null;
  value: string;
  normalizedValue: string;
  displayId: string | null;
  hasKnownPrefix: boolean;
  isLegacyYbFormat: boolean;
};

const ENTITY_PREFIXES: Record<EntityIdType, string> = {
  order: "ORD",
  listing: "LST",
  sku: "SKU",
  business: "BIZ",
  unit: "UNT",
};

const PREFIX_TO_TYPE = Object.entries(ENTITY_PREFIXES).reduce(
  (acc, [type, prefix]) => {
    acc[prefix] = type as EntityIdType;
    return acc;
  },
  {} as Record<string, EntityIdType>
);

function coerceInput(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value).trim();
  return "";
}

export function stripKnownEntityPrefix(input: unknown) {
  let next = coerceInput(input);
  if (!next) return "";

  let previous = "";
  while (next && next !== previous) {
    previous = next;
    next = next
      .replace(/^yb-(ord|lst|sku|biz|unt)-/i, "")
      .replace(/^yb-/i, "")
      .trim();
  }

  return next.replace(/^-+|-+$/g, "").trim();
}

export function normalizeIdValue(value: unknown) {
  return stripKnownEntityPrefix(value);
}

export function formatEntityId(type: EntityIdType, value: unknown) {
  const normalized = normalizeIdValue(value);
  if (!normalized) return "";
  return `YB-${ENTITY_PREFIXES[type]}-${normalized.toUpperCase()}`;
}

export function parseEntityDisplayId(input: unknown): ParsedEntityDisplayId | null {
  const raw = coerceInput(input);
  if (!raw) return null;

  const canonicalMatch = raw.match(/^yb-(ord|lst|sku|biz|unt)-(.+)$/i);
  const legacyMatch = !canonicalMatch ? raw.match(/^yb-(.+)$/i) : null;
  const normalizedValue = normalizeIdValue(raw);

  if (!normalizedValue) return null;

  const type = canonicalMatch ? PREFIX_TO_TYPE[canonicalMatch[1].toUpperCase()] : null;

  return {
    type,
    value: normalizedValue,
    normalizedValue,
    displayId: type ? formatEntityId(type, normalizedValue) : null,
    hasKnownPrefix: Boolean(canonicalMatch || legacyMatch),
    isLegacyYbFormat: Boolean(legacyMatch),
  };
}

export function getEntityIdSearchVariants(type: EntityIdType, value: unknown) {
  const raw = coerceInput(value);
  const parsed = parseEntityDisplayId(raw);
  if (parsed?.type && parsed.type !== type) {
    return raw ? [raw] : [];
  }
  const normalized = normalizeIdValue(value);
  const variants = new Set<string>();

  if (raw) variants.add(raw);
  if (normalized) {
    variants.add(normalized);
    variants.add(normalized.toUpperCase());
    variants.add(formatEntityId(type, normalized));

    if (type === "order") {
      variants.add(`YB-${normalized.toUpperCase()}`);
    }
  }

  return Array.from(variants).filter(Boolean);
}

export function entityIdsMatch(type: EntityIdType, left: unknown, right: unknown) {
  const leftParsed = parseEntityDisplayId(left);
  const rightParsed = parseEntityDisplayId(right);

  if (
    (leftParsed?.type && leftParsed.type !== type) ||
    (rightParsed?.type && rightParsed.type !== type)
  ) {
    return false;
  }

  const leftVariants = getEntityIdSearchVariants(type, left).map((value) =>
    value.toUpperCase()
  );
  const rightVariants = getEntityIdSearchVariants(type, right).map((value) =>
    value.toUpperCase()
  );

  if (leftVariants.length === 0 || rightVariants.length === 0) return false;

  const rightSet = new Set(rightVariants);
  return leftVariants.some((value) => rightSet.has(value));
}
