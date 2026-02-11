import "server-only";

/**
 * Admin accounts data source notes:
 * - Role source of truth is `users.role`, with admin membership from `admin_role_members.role_key`.
 * - `is_internal` source of truth is `users.is_internal` (or false when missing in legacy envs).
 * - Internal users are NOT admins by role semantics; internal is a separate operational flag.
 * - Root cause of silent "No accounts found": errors from data queries were previously ignored by the UI,
 *   so schema/RLS failures looked like empty data.
 */

export type AdminUserRoleFilter = "all" | "customer" | "business" | "admin";

export type FetchAdminUsersParams = {
  client: any;
  usingServiceRole: boolean;
  role?: AdminUserRoleFilter;
  includeInternal?: boolean;
  q?: string;
  from?: number;
  to?: number;
};

export type AdminUserRow = {
  id: string;
  public_id: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  business_name: string | null;
  role: string | null;
  account_role: "customer" | "business" | "admin";
  city: string | null;
  created_at: string | null;
  is_internal: boolean;
  admin_role_keys: string[];
};

export type AdminUsersDiag = {
  path: "service-query" | "service-rpc-fallback" | "actor-rpc";
  usingServiceRole: boolean;
  rpcUsed?: boolean;
  serviceError?: { code?: string; message?: string; details?: string | null };
  rpcError?: { code?: string; message?: string; details?: string | null };
  probes?: {
    usersTotal: number;
    businessesTotal: number;
    internalTotal: number;
    adminRoleMembersTotal: number;
  };
};

type AdminUsersResult = {
  rows: AdminUserRow[];
  count: number;
  fallbackUsed: boolean;
  error?: any;
  diag: AdminUsersDiag;
};

const adminDiagEnabled =
  String(process.env.AUTH_GUARD_DIAG || "") === "1" ||
  String(process.env.NEXT_PUBLIC_AUTH_DIAG || "") === "1";

function sanitizeSearchTerm(term: string) {
  return term.replace(/[%(),]/g, " ").trim();
}

function buildSearchOr(q: string) {
  const safe = sanitizeSearchTerm(q);
  if (!safe) return "";
  return `full_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,business_name.ilike.%${safe}%`;
}

function normalizeRole(value: string | null | undefined) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "business") return "business" as const;
  if (role === "admin") return "admin" as const;
  return "customer" as const;
}

function normalizeRows(
  rows: any[] | null,
  adminRoleKeysByUserId: Map<string, string[]>
): AdminUserRow[] {
  return (rows || []).map((row) => {
    const id = String(row?.id || "");
    const role = normalizeRole(row?.role ?? null);
    const roleKeysFromRow = Array.isArray(row?.admin_role_keys)
      ? row.admin_role_keys
          .map((value: unknown) => String(value || "").trim())
          .filter(Boolean)
      : [];
    const roleKeys = adminRoleKeysByUserId.get(id) || roleKeysFromRow;
    const isInternal = row?.is_internal === true;
    const hasAdminAccess = role === "admin" || roleKeys.length > 0;
    return {
      id,
      public_id: row?.public_id ?? null,
      email: row?.email ?? null,
      full_name: row?.full_name ?? null,
      phone: row?.phone ?? null,
      business_name: row?.business_name ?? null,
      role: row?.role ?? null,
      account_role: hasAdminAccess ? "admin" : role === "business" ? "business" : "customer",
      city: row?.city ?? null,
      created_at: row?.created_at ?? null,
      is_internal: isInternal,
      admin_role_keys: roleKeys,
    };
  });
}

async function getAdminRoleMembers(client: any) {
  const roleKeysByUserId = new Map<string, string[]>();
  const { data, error } = await client
    .from("admin_role_members")
    .select("user_id, role_key");

  if (!error && Array.isArray(data)) {
    for (const row of data) {
      const userId = String(row?.user_id || "");
      const roleKey = String(row?.role_key || "").trim();
      if (!userId || !roleKey) continue;
      const existing = roleKeysByUserId.get(userId) || [];
      existing.push(roleKey);
      roleKeysByUserId.set(userId, existing);
    }
  }

  return {
    roleKeysByUserId,
    adminIds: Array.from(roleKeysByUserId.keys()),
    error,
  };
}

function applyRoleFilter(query: any, role: AdminUserRoleFilter, adminIds: string[]) {
  if (role === "business") {
    query = query.eq("role", "business");
    if (adminIds.length) {
      query = query.not("id", "in", `(${adminIds.join(",")})`);
    }
    return query;
  }
  if (role === "customer") {
    query = query.or("role.eq.customer,role.eq.user,role.is.null");
    if (adminIds.length) {
      query = query.not("id", "in", `(${adminIds.join(",")})`);
    }
    return query;
  }
  if (role === "admin") {
    const adminClauses = ["role.eq.admin"];
    if (adminIds.length) {
      adminClauses.push(`id.in.(${adminIds.join(",")})`);
    }
    return query.or(adminClauses.join(","));
  }
  return query;
}

async function runZeroRowProbes(client: any) {
  const [usersTotal, businessesTotal, internalTotal, adminRoleMembersTotal] =
    await Promise.all([
      client.from("users").select("id", { count: "exact", head: true }),
      client.from("users").select("id", { count: "exact", head: true }).eq("role", "business"),
      client.from("users").select("id", { count: "exact", head: true }).eq("is_internal", true),
      client.from("admin_role_members").select("user_id", { count: "exact", head: true }),
    ]);

  const probeResult = {
    usersTotal: usersTotal.count || 0,
    businessesTotal: businessesTotal.count || 0,
    internalTotal: internalTotal.count || 0,
    adminRoleMembersTotal: adminRoleMembersTotal.count || 0,
  };
  console.warn("[admin-accounts] zero-row probes", probeResult);
  return probeResult;
}

async function fetchViaRpc({
  client,
  role,
  includeInternal,
  q,
  from,
  to,
  usingServiceRole,
  path,
  serviceError,
}: {
  client: any;
  role: AdminUserRoleFilter;
  includeInternal: boolean | undefined;
  q: string;
  from: number;
  to: number;
  usingServiceRole: boolean;
  path: AdminUsersDiag["path"];
  serviceError?: { code?: string; message?: string; details?: string | null };
}): Promise<AdminUsersResult> {
  const { data, error } = await client.rpc("admin_list_accounts", {
    p_role: role,
    p_internal: includeInternal ?? null,
    p_q: q || null,
    p_from: from,
    p_to: to,
  });

  const diag: AdminUsersDiag = {
    path,
    usingServiceRole,
    rpcUsed: true,
    serviceError,
  };

  if (error) {
    diag.rpcError = {
      code: error.code,
      message: error.message,
      details: error.details,
    };
    return {
      rows: [],
      count: 0,
      fallbackUsed: true,
      error,
      diag,
    };
  }

  const rawRows = Array.isArray(data) ? data : [];
  const rows = normalizeRows(rawRows, new Map());
  const count =
    rawRows.length > 0
      ? Number(rawRows[0]?.total_count || rows.length)
      : 0;

  if (adminDiagEnabled && count === 0) {
    diag.probes = await runZeroRowProbes(client);
  }

  return {
    rows,
    count,
    fallbackUsed: true,
    diag,
  };
}

export async function fetchAdminUsers(params: FetchAdminUsersParams): Promise<AdminUsersResult> {
  const {
    client,
    usingServiceRole,
    role = "all",
    includeInternal,
    q = "",
    from = 0,
    to = 19,
  } = params;

  if (!usingServiceRole) {
    return fetchViaRpc({
      client,
      role,
      includeInternal,
      q,
      from,
      to,
      usingServiceRole: false,
      path: "actor-rpc",
    });
  }

  const { roleKeysByUserId, adminIds, error: adminRoleMembersError } =
    await getAdminRoleMembers(client);

  let query = client
    .from("users")
    .select("id, public_id, email, full_name, phone, business_name, role, is_internal, city, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false });

  query = applyRoleFilter(query, role, adminIds);

  if (includeInternal === true) {
    query = query.eq("is_internal", true);
  } else if (includeInternal === false) {
    query = query.not("is_internal", "is", true);
  }

  const searchOr = buildSearchOr(q);
  if (searchOr) {
    query = query.or(searchOr);
  }

  const { data, count, error } = await query.range(from, to);
  const diag: AdminUsersDiag = {
    path: "service-query",
    usingServiceRole: true,
  };

  if (adminRoleMembersError) {
    console.warn("[admin-accounts] admin_role_members read failed", {
      code: adminRoleMembersError.code,
      message: adminRoleMembersError.message,
      details: adminRoleMembersError.details,
    });
  }

  if (error) {
    const serviceError = {
      code: error.code,
      message: error.message,
      details: error.details,
    };
    return fetchViaRpc({
      client,
      role,
      includeInternal,
      q,
      from,
      to,
      usingServiceRole: true,
      path: "service-rpc-fallback",
      serviceError,
    });
  }

  if (adminDiagEnabled && (count || 0) === 0) {
    diag.probes = await runZeroRowProbes(client);
  }

  return {
    rows: normalizeRows(data, roleKeysByUserId),
    count: count || 0,
    fallbackUsed: false,
    diag,
  };
}
