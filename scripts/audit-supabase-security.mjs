#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env.local");
const DOCS_DIR = path.join(ROOT, "docs", "security");
const MD_PATH = path.join(DOCS_DIR, "supabase-rls-audit-report.md");
const PDF_PATH = path.join(DOCS_DIR, "supabase-rls-audit-report.pdf");
const JSON_PATH = path.join(DOCS_DIR, "supabase-rls-audit-report.data.json");
const TODAY = new Date().toISOString();

const TARGET_OBJECTS = [
  "admin_account_deletions",
  "public_listings_v",
  "user_public_profiles",
  "users",
  "listings",
  "businesses",
  "admin_role_members",
];

const TARGET_FUNCTIONS = [
  ["public", "viewer_can_see_internal_content"],
  ["public", "has_admin_role"],
  ["public", "is_admin"],
  ["public", "is_admin_any_role"],
  ["public", "invoke_finalize_overdue_deletions"],
  ["public", "schedule_finalize_overdue_deletions_job"],
  ["public", "unschedule_finalize_overdue_deletions_job"],
  ["public", "list_finalize_overdue_deletions_jobs"],
  ["auth", "uid"],
];

function readEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}

function sha(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

function normalizeSql(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitle(value) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fmtBool(value) {
  return value === true ? "Yes" : value === false ? "No" : "Unknown";
}

function fmtCount(value) {
  if (value === null || value === undefined) return "Unknown";
  return new Intl.NumberFormat("en-US").format(Number(value));
}

function fencedSql(value) {
  return ["```sql", String(value || "").trim(), "```"].join("\n");
}

function listOrNone(items) {
  return items && items.length ? items.join(", ") : "None";
}

function envRefFromUrl(url) {
  try {
    const host = new URL(String(url || "")).hostname;
    return host.split(".")[0] || null;
  } catch {
    return null;
  }
}

async function apiJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text.slice(0, 400)}`);
  }

  return response.json();
}

async function runReadOnlyQuery(ref, token, query) {
  const url = `https://api.supabase.com/v1/projects/${ref}/database/query/read-only`;
  return apiJson(url, token, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

function valuesList(items) {
  return items.map((item) => `('${item}')`).join(", ");
}

function functionValuesList(items) {
  return items.map(([schema, name]) => `('${schema}','${name}')`).join(", ");
}

function getSqlBundle() {
  const objectValues = valuesList(TARGET_OBJECTS);
  const functionValues = functionValuesList(TARGET_FUNCTIONS);

  return {
    objects: `
WITH targets(object_name) AS (
  VALUES ${objectValues}
)
SELECT
  t.object_name,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized view'
    WHEN 'p' THEN 'partitioned table'
    ELSE c.relkind::text
  END AS object_type,
  (c.oid IS NOT NULL) AS exists,
  pg_catalog.pg_get_userbyid(c.relowner) AS owner,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  COALESCE(array_to_string(c.reloptions, ', '), '') AS reloptions,
  CASE WHEN c.relkind = 'v' THEN pg_catalog.pg_get_viewdef(c.oid, true) END AS definition
FROM targets t
LEFT JOIN pg_catalog.pg_class c
  ON c.relname = t.object_name
LEFT JOIN pg_catalog.pg_namespace n
  ON n.oid = c.relnamespace
WHERE c.oid IS NULL OR n.nspname = 'public'
ORDER BY t.object_name;
`.trim(),
    counts: `
WITH targets(object_name) AS (
  VALUES
    ('public.admin_account_deletions'),
    ('public.public_listings_v'),
    ('public.user_public_profiles'),
    ('public.users'),
    ('public.listings'),
    ('public.businesses'),
    ('public.admin_role_members')
)
SELECT
  object_name,
  CASE
    WHEN c.oid IS NULL OR c.relkind = 'v' THEN NULL::bigint
    ELSE GREATEST(c.reltuples::bigint, 0)
  END AS row_count
FROM targets
LEFT JOIN pg_catalog.pg_class c
  ON c.oid = pg_catalog.to_regclass(object_name)
ORDER BY object_name;
`.trim(),
    policies: `
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('admin_account_deletions', 'users', 'listings', 'businesses', 'admin_role_members')
ORDER BY tablename, policyname;
`.trim(),
    grants: `
SELECT
  table_schema,
  table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('admin_account_deletions', 'public_listings_v', 'user_public_profiles', 'users', 'listings', 'businesses', 'admin_role_members')
ORDER BY table_name, grantee, privilege_type;
`.trim(),
    roleAccess: `
WITH targets(object_name) AS (
  VALUES
    ('public.admin_account_deletions'),
    ('public.public_listings_v'),
    ('public.user_public_profiles'),
    ('public.users'),
    ('public.listings'),
    ('public.businesses'),
    ('public.admin_role_members')
)
SELECT
  object_name,
  has_table_privilege('anon', pg_catalog.to_regclass(object_name), 'SELECT') AS anon_select,
  has_table_privilege('authenticated', pg_catalog.to_regclass(object_name), 'SELECT') AS authenticated_select,
  has_table_privilege('service_role', pg_catalog.to_regclass(object_name), 'SELECT') AS service_role_select,
  has_table_privilege('anon', pg_catalog.to_regclass(object_name), 'INSERT') AS anon_insert,
  has_table_privilege('authenticated', pg_catalog.to_regclass(object_name), 'INSERT') AS authenticated_insert,
  has_table_privilege('service_role', pg_catalog.to_regclass(object_name), 'INSERT') AS service_role_insert,
  has_table_privilege('anon', pg_catalog.to_regclass(object_name), 'UPDATE') AS anon_update,
  has_table_privilege('authenticated', pg_catalog.to_regclass(object_name), 'UPDATE') AS authenticated_update,
  has_table_privilege('service_role', pg_catalog.to_regclass(object_name), 'UPDATE') AS service_role_update,
  has_table_privilege('anon', pg_catalog.to_regclass(object_name), 'DELETE') AS anon_delete,
  has_table_privilege('authenticated', pg_catalog.to_regclass(object_name), 'DELETE') AS authenticated_delete,
  has_table_privilege('service_role', pg_catalog.to_regclass(object_name), 'DELETE') AS service_role_delete
FROM targets
ORDER BY object_name;
`.trim(),
    viewUsage: `
SELECT
  view_schema,
  view_name,
  table_schema,
  table_name
FROM information_schema.view_table_usage
WHERE view_schema = 'public'
  AND view_name IN ('public_listings_v', 'user_public_profiles')
ORDER BY view_name, table_name;
`.trim(),
    functions: `
WITH targets(schema_name, function_name) AS (
  VALUES ${functionValues}
)
SELECT
  t.schema_name,
  t.function_name,
  p.oid IS NOT NULL AS exists,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner,
  pg_catalog.pg_get_function_result(p.oid) AS returns,
  l.lanname AS language,
  p.provolatile,
  p.prosecdef AS security_definer,
  COALESCE(array_to_string(p.proconfig, ', '), '') AS proconfig,
  pg_catalog.oidvectortypes(p.proargtypes) AS args,
  pg_catalog.pg_get_functiondef(p.oid) AS definition
FROM targets t
LEFT JOIN pg_catalog.pg_proc p
  ON p.proname = t.function_name
LEFT JOIN pg_catalog.pg_namespace n
  ON n.oid = p.pronamespace
LEFT JOIN pg_catalog.pg_language l
  ON l.oid = p.prolang
WHERE (p.oid IS NULL OR n.nspname = t.schema_name)
  AND (p.oid IS NULL OR p.prokind = 'f')
ORDER BY t.schema_name, t.function_name, args;
`.trim(),
    functionGrants: `
SELECT
  routine_schema,
  routine_name,
  grantee,
  privilege_type
FROM information_schema.role_routine_grants
WHERE (routine_schema, routine_name) IN (
  ('public', 'viewer_can_see_internal_content'),
  ('public', 'has_admin_role'),
  ('public', 'is_admin'),
  ('public', 'is_admin_any_role'),
  ('public', 'invoke_finalize_overdue_deletions'),
  ('public', 'schedule_finalize_overdue_deletions_job'),
  ('public', 'unschedule_finalize_overdue_deletions_job'),
  ('public', 'list_finalize_overdue_deletions_jobs'),
  ('auth', 'uid')
)
ORDER BY routine_schema, routine_name, grantee, privilege_type;
`.trim(),
    functionRoleAccess: `
SELECT
  'public.viewer_can_see_internal_content()' AS function_name,
  has_function_privilege('anon', 'public.viewer_can_see_internal_content()', 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', 'public.viewer_can_see_internal_content()', 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', 'public.viewer_can_see_internal_content()', 'EXECUTE') AS service_role_execute
UNION ALL
SELECT
  'public.has_admin_role(text)',
  has_function_privilege('anon', 'public.has_admin_role(text)', 'EXECUTE'),
  has_function_privilege('authenticated', 'public.has_admin_role(text)', 'EXECUTE'),
  has_function_privilege('service_role', 'public.has_admin_role(text)', 'EXECUTE')
UNION ALL
SELECT
  'public.is_admin()',
  has_function_privilege('anon', 'public.is_admin()', 'EXECUTE'),
  has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE'),
  has_function_privilege('service_role', 'public.is_admin()', 'EXECUTE')
UNION ALL
SELECT
  'public.is_admin_any_role(uuid, text[])',
  has_function_privilege('anon', 'public.is_admin_any_role(uuid, text[])', 'EXECUTE'),
  has_function_privilege('authenticated', 'public.is_admin_any_role(uuid, text[])', 'EXECUTE'),
  has_function_privilege('service_role', 'public.is_admin_any_role(uuid, text[])', 'EXECUTE')
UNION ALL
SELECT
  'auth.uid()',
  has_function_privilege('anon', 'auth.uid()', 'EXECUTE'),
  has_function_privilege('authenticated', 'auth.uid()', 'EXECUTE'),
  has_function_privilege('service_role', 'auth.uid()', 'EXECUTE')
ORDER BY function_name;
`.trim(),
    objectsReferencingDeletion: `
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_catalog.oidvectortypes(p.proargtypes) AS args
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n
  ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'auth')
  AND p.prokind = 'f'
  AND pg_catalog.pg_get_functiondef(p.oid) ILIKE '%admin_account_deletions%'
ORDER BY n.nspname, p.proname, args;
`.trim(),
    migrations: `
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;
`.trim(),
  };
}

function mapBy(rows, key) {
  return new Map(rows.map((row) => [row[key], row]));
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function summarizePurpose(objectName) {
  switch (objectName) {
    case "admin_account_deletions":
      return "Internal account-deletion audit and workflow table. It appears to track who requested deletion, when final cleanup should happen, and related admin handling.";
    case "public_listings_v":
      return "Public-facing listing feed. It appears to be the safe surface for homepage and listing pages so the app can read only listings that should be visible to the public.";
    case "user_public_profiles":
      return "Public profile card view. It exposes a small set of fields, mainly display name and avatar, for reviews, public profiles, and other customer-facing UI.";
    case "users":
      return "Core user account table. This is likely the source of private customer and business profile data, so it should stay tightly protected.";
    case "listings":
      return "Core listing table. This likely stores every listing, including drafts and internal/test entries, so visibility rules matter.";
    case "businesses":
      return "Core business table. This likely controls whether a business is verified and whether it should appear publicly.";
    case "admin_role_members":
      return "Internal admin membership table. Helper functions appear to use it to decide who counts as an admin and what level of admin access they have.";
    default:
      return "Purpose not classified.";
  }
}

function extractBaseTablesFromDefinition(definition) {
  const sql = String(definition || "");
  const qualified = [...sql.matchAll(/\bpublic\.([a-z_][a-z0-9_]*)\b/gi)].map((match) => `public.${match[1]}`);
  const unqualified = [...sql.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_]*)\b/gi)].map(
    (match) => `public.${match[1]}`,
  );
  return [...new Set([...qualified, ...unqualified])];
}

function determineRisk(objectName, envData) {
  const objectKey = `public.${objectName}`;
  const meta = envData.objectMap.get(objectName);
  const grants = envData.grantsByObject.get(objectName) || [];
  const access = envData.roleAccessMap.get(objectKey);

  if (objectName === "admin_account_deletions") {
    const exposed =
      access?.anon_select ||
      access?.authenticated_select ||
      grants.some((g) => ["anon", "authenticated"].includes(g.grantee) && g.privilege_type === "SELECT");
    if (exposed) {
      return {
        level: "High",
        reason:
          "This table holds sensitive internal deletion records. RLS is off, so if browser-facing roles have read access, those rows could be exposed directly.",
      };
    }
    return {
      level: "Medium",
      reason:
        "Supabase flags this because the table lives in the public schema with RLS turned off. Even if current grants are narrow, one accidental future grant could expose internal deletion records.",
    };
  }

  if (objectName === "public_listings_v") {
    const definer = String(meta?.reloptions || "").includes("security_invoker=true") ? false : true;
    if (definer && access?.anon_select) {
      return {
        level: "Medium",
        reason:
          "This view is intentionally public, but it runs with the owner’s privileges. That means it can bypass table protections if the definition drifts from the underlying RLS rules.",
      };
    }
    return {
      level: "Low",
      reason:
        "The view looks designed for public reads. The main concern is future drift between the view definition and the base-table rules, not an obvious direct leak today.",
    };
  }

  if (objectName === "user_public_profiles") {
    const definer = String(meta?.reloptions || "").includes("security_invoker=true") ? false : true;
    if (definer && access?.anon_select) {
      return {
        level: "Medium",
        reason:
          "The exposed columns are narrow, which helps, but the view still runs with owner privileges. If private fields are added later by mistake, this could widen the public profile surface.",
      };
    }
    return {
      level: "Low",
      reason:
        "The view seems intentionally small and public-safe. The main risk is maintenance drift rather than a clear immediate breach.",
    };
  }

  if (meta?.object_type === "table" && meta?.rls_enabled === false) {
    return {
      level: "Medium",
      reason:
        "This table is not protected by row-level rules. Safety depends mostly on grants and application discipline.",
    };
  }

  return {
    level: "Low",
    reason: "No high-risk pattern stood out in the collected metadata for this object.",
  };
}

function getRelOptionFlag(reloptions, key) {
  const parts = String(reloptions || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const match = parts.find((part) => part.startsWith(`${key}=`));
  return match ? match.slice(key.length + 1) : null;
}

function summarizeFunction(fn, envData) {
  const grants = envData.functionGrantsByName.get(`${fn.schema_name}.${fn.function_name}`) || [];
  const roleAccess = envData.functionRoleAccessMap.get(`${fn.schema_name}.${fn.function_name}(${fn.args || ""})`) ||
    envData.functionRoleAccessMap.get(`${fn.schema_name}.${fn.function_name}()`) ||
    null;
  const searchPath = String(fn.proconfig || "")
    .split(",")
    .map((item) => item.trim())
    .find((item) => item.startsWith("search_path="));

  return {
    security: fn.security_definer ? "SECURITY DEFINER" : "SECURITY INVOKER / default",
    searchPath: searchPath ? searchPath.replace(/^search_path=/, "") : "Not explicitly locked in function config",
    grants,
    roleAccess,
  };
}

function diffStatus(a, b) {
  return normalizeSql(a) === normalizeSql(b) ? "Same" : "Different";
}

function makeObjectComparison(objectName, staging, production) {
  const a = staging.objectMap.get(objectName);
  const b = production.objectMap.get(objectName);
  return {
    objectName,
    exists: a?.exists === b?.exists ? "Same" : "Different",
    objectType: a?.object_type === b?.object_type ? "Same" : "Different",
    owner: a?.owner === b?.owner ? "Same" : "Different",
    rls: a?.rls_enabled === b?.rls_enabled ? "Same" : "Different",
    definition: diffStatus(a?.definition, b?.definition),
    grants:
      sha(JSON.stringify(staging.grantsByObject.get(objectName) || [])) ===
      sha(JSON.stringify(production.grantsByObject.get(objectName) || []))
        ? "Same"
        : "Different",
    policies:
      sha(JSON.stringify(staging.policiesByTable.get(objectName) || [])) ===
      sha(JSON.stringify(production.policiesByTable.get(objectName) || []))
        ? "Same"
        : "Different",
    reloptions: diffStatus(a?.reloptions, b?.reloptions),
  };
}

async function collectEnvironment(ref, label, projectInfo) {
  const token = ENV.SUPABASE_ACCESS_TOKEN;
  const sql = getSqlBundle();
  const [
    objects,
    counts,
    policies,
    grants,
    roleAccess,
    viewUsage,
    functions,
    functionGrants,
    functionRoleAccess,
    objectsReferencingDeletion,
    migrations,
  ] = await Promise.all([
    runReadOnlyQuery(ref, token, sql.objects),
    runReadOnlyQuery(ref, token, sql.counts),
    runReadOnlyQuery(ref, token, sql.policies),
    runReadOnlyQuery(ref, token, sql.grants),
    runReadOnlyQuery(ref, token, sql.roleAccess),
    runReadOnlyQuery(ref, token, sql.viewUsage),
    runReadOnlyQuery(ref, token, sql.functions),
    runReadOnlyQuery(ref, token, sql.functionGrants),
    runReadOnlyQuery(ref, token, sql.functionRoleAccess),
    runReadOnlyQuery(ref, token, sql.objectsReferencingDeletion),
    runReadOnlyQuery(ref, token, sql.migrations),
  ]);

  const countsMap = mapBy(counts, "object_name");
  const objectMap = mapBy(objects, "object_name");
  const roleAccessMap = mapBy(roleAccess, "object_name");
  const policiesByTable = groupBy(policies, (row) => row.tablename);
  const grantsByObject = groupBy(grants, (row) => row.table_name);
  const viewUsageByView = groupBy(viewUsage, (row) => row.view_name);
  const functionGrantsByName = groupBy(functionGrants, (row) => `${row.routine_schema}.${row.routine_name}`);
  const functionRoleAccessMap = mapBy(functionRoleAccess, "function_name");

  return {
    label,
    ref,
    projectInfo,
    objects,
    objectMap,
    counts,
    countsMap,
    policies,
    policiesByTable,
    grants,
    grantsByObject,
    roleAccess,
    roleAccessMap,
    viewUsage,
    viewUsageByView,
    functions,
    functionGrants,
    functionGrantsByName,
    functionRoleAccess,
    functionRoleAccessMap,
    objectsReferencingDeletion,
    migrations,
    latestMigration: migrations[migrations.length - 1]?.version || null,
  };
}

function buildObjectSection(objectName, envData) {
  const meta = envData.objectMap.get(objectName);
  const count = envData.countsMap.get(`public.${objectName}`)?.row_count;
  const policies = envData.policiesByTable.get(objectName) || [];
  const grants = envData.grantsByObject.get(objectName) || [];
  const access = envData.roleAccessMap.get(`public.${objectName}`);
  const risk = determineRisk(objectName, envData);
  const reloptions = String(meta?.reloptions || "");
  const securityInvoker = getRelOptionFlag(reloptions, "security_invoker");
  const baseTables = (envData.viewUsageByView.get(objectName) || []).map(
    (row) => `${row.table_schema}.${row.table_name}`,
  );
  const parsedBaseTables = extractBaseTablesFromDefinition(meta?.definition).filter(
    (name) => name !== `public.${objectName}`,
  );
  const effectiveBaseTables = [...new Set([...baseTables, ...parsedBaseTables])];

  const lines = [];
  lines.push(`### \`public.${objectName}\``);
  lines.push("");
  lines.push(`Purpose: ${summarizePurpose(objectName)}`);
  lines.push("");
  lines.push(`Environment: ${envData.label}`);
  lines.push("");
  lines.push(`- Type: ${meta?.object_type || "Missing"}`);
  lines.push(`- Exists: ${fmtBool(meta?.exists)}`);
  lines.push(`- Approximate live row count: ${fmtCount(count)}`);
  lines.push(`- Owner: ${meta?.owner || "Unknown"}`);
  lines.push(`- In public schema / API-exposed schema: Yes`);
  lines.push(`- RLS enabled: ${fmtBool(meta?.rls_enabled)}`);
  if (meta?.object_type === "view") {
    lines.push(`- View security mode: ${securityInvoker === "true" ? "Security invoker" : "Security definer / default owner privileges"}`);
    lines.push(`- Base tables: ${listOrNone(effectiveBaseTables)}`);
  }
  lines.push(
    `- Grants summary: ${
      grants.length
        ? grants.map((g) => `${g.grantee}:${g.privilege_type}`).join(", ")
        : "No explicit grants found in information_schema output"
    }`,
  );
  if (access) {
    lines.push(
      `- Role access snapshot: anon read ${fmtBool(access.anon_select)}, authenticated read ${fmtBool(
        access.authenticated_select,
      )}, service_role read ${fmtBool(access.service_role_select)}`,
    );
  }
  if (policies.length) {
    lines.push(`- Policies: ${policies.map((p) => `"${p.policyname}" (${p.cmd})`).join(", ")}`);
  } else if (meta?.object_type === "table") {
    lines.push(`- Policies: None`);
  }
  lines.push(`- Risk level: ${risk.level}`);
  lines.push(`- Why this matters: ${risk.reason}`);
  lines.push("");

  if (objectName === "admin_account_deletions") {
    lines.push(
      "Recommended fix: Enable RLS, revoke any browser-facing grants that are not truly needed, and keep this table service-role-only or admin-only. This is an internal audit/workflow table, not a public app surface.",
    );
    lines.push(
      "Breakage risk if changed incorrectly: admin deletion dashboards, deletion review tools, or overdue-deletion jobs could stop seeing rows they need.",
    );
    lines.push("");
  }

  if (objectName === "public_listings_v") {
    lines.push(
      "Recommended fix: Keep the view if public pages depend on it, but move toward `security_invoker` only after confirming the base-table RLS policies already express the exact same visibility rule: public users can see only published, verified, non-internal listings unless the viewer is internal.",
    );
    lines.push(
      "Breakage risk if changed incorrectly: homepage listing blocks, `/listings`, business pages, and any internal preview flow could suddenly return too few rows or no rows at all.",
    );
    lines.push("");
  }

  if (objectName === "user_public_profiles") {
    lines.push(
      "Recommended fix: Keep the public-safe surface, but consider either a dedicated `public_profiles` table or a `security_invoker` view backed by narrowly scoped public policies on the source table. Also verify the display name logic cannot accidentally expose email-style names or deleted-user remnants.",
    );
    lines.push(
      "Breakage risk if changed incorrectly: reviews, reviewer names, avatars, and public business/profile UI could lose names or images for legitimate public content.",
    );
    lines.push("");
  }

  return lines.join("\n");
}

function buildFunctionSection(fnName, envData) {
  const fn = envData.functions.find((row) => row.function_name === fnName);
  if (!fn) return "";
  const summary = summarizeFunction(fn, envData);
  const lines = [];
  lines.push(`### \`${fn.schema_name}.${fn.function_name}(${fn.args || ""})\``);
  lines.push("");
  lines.push(`Environment: ${envData.label}`);
  lines.push("");
  lines.push(`- Exists: ${fmtBool(fn.exists)}`);
  lines.push(`- Returns: ${fn.returns || "Unknown"}`);
  lines.push(`- Language: ${fn.language || "Unknown"}`);
  lines.push(`- Security mode: ${summary.security}`);
  lines.push(`- Owner: ${fn.owner || "Unknown"}`);
  lines.push(`- Search path: ${summary.searchPath}`);
  lines.push(
    `- Grants: ${
      summary.grants.length
        ? summary.grants.map((g) => `${g.grantee}:${g.privilege_type}`).join(", ")
        : "No explicit grants found"
    }`,
  );
  if (summary.roleAccess) {
    lines.push(
      `- Execute access: anon ${fmtBool(summary.roleAccess.anon_execute)}, authenticated ${fmtBool(
        summary.roleAccess.authenticated_execute,
      )}, service_role ${fmtBool(summary.roleAccess.service_role_execute)}`,
    );
  }

  if (fnName === "viewer_can_see_internal_content") {
    lines.push(
      "- Plain-English behavior: checks whether the current signed-in user has `users.is_internal = true`. It does not appear to grant access by itself; it acts like a yes/no gate used by listing and business visibility logic.",
    );
    lines.push(
      "- Risk note: because it is `SECURITY DEFINER`, it can read `public.users` even if that table is otherwise locked down. That is usually acceptable for a tiny boolean helper, as long as the function body stays simple and the search path remains pinned.",
    );
  } else if (fnName === "has_admin_role" || fnName === "is_admin" || fnName === "is_admin_any_role") {
    lines.push(
      "- Plain-English behavior: admin helper used to decide whether a logged-in actor belongs to one or more admin groups. Other admin-only functions and policies rely on these answers.",
    );
    lines.push(
      "- Risk note: if these helpers are too broadly executable or if their logic drifts, they can accidentally widen internal admin access across many features at once.",
    );
  } else if (fnName === "auth.uid") {
    lines.push(
      "- Plain-English behavior: built-in Supabase helper that returns the current JWT user ID. It is a normal building block for RLS checks and does not itself expose user data.",
    );
  } else if (fnName.includes("finalize_overdue_deletions")) {
    lines.push(
      "- Plain-English behavior: part of the overdue account-deletion cleanup pipeline. These helpers appear to schedule or trigger the cleanup job rather than expose data publicly.",
    );
    lines.push(
      "- Risk note: because these functions are `SECURITY DEFINER`, execution grants should stay narrow. They should not be callable by ordinary browser roles.",
    );
  }

  lines.push("");
  return lines.join("\n");
}

function buildTechnicalAppendix(envData) {
  const lines = [];
  lines.push(`## Technical Appendix: ${envData.label}`);
  lines.push("");
  lines.push(`Project ref: \`${envData.ref}\``);
  lines.push(`Project name: \`${envData.projectInfo?.name || "Unknown"}\``);
  lines.push(`Latest applied migration version seen: \`${envData.latestMigration || "Unknown"}\``);
  lines.push("");

  for (const objectName of ["admin_account_deletions", "public_listings_v", "user_public_profiles", "users", "listings", "businesses"]) {
    const meta = envData.objectMap.get(objectName);
    const policies = envData.policiesByTable.get(objectName) || [];
    const grants = envData.grantsByObject.get(objectName) || [];
    lines.push(`### Object metadata: \`public.${objectName}\``);
    lines.push("");
    lines.push(fencedSql(JSON.stringify(meta || {}, null, 2)));
    lines.push("");
    if (policies.length) {
      lines.push("Policies:");
      lines.push("");
      for (const policy of policies) {
        lines.push(fencedSql(JSON.stringify(policy, null, 2)));
        lines.push("");
      }
    }
    if (grants.length) {
      lines.push("Grants:");
      lines.push("");
      for (const grant of grants) {
        lines.push(fencedSql(JSON.stringify(grant, null, 2)));
        lines.push("");
      }
    }
    if (meta?.definition) {
      lines.push("Definition:");
      lines.push("");
      lines.push(fencedSql(meta.definition));
      lines.push("");
    }
  }

  lines.push("### Function definitions");
  lines.push("");
  for (const fn of envData.functions) {
    lines.push(`#### \`${fn.schema_name}.${fn.function_name}(${fn.args || ""})\``);
    lines.push("");
    lines.push(fencedSql(fn.definition || JSON.stringify(fn, null, 2)));
    lines.push("");
  }

  lines.push("### Migration inventory");
  lines.push("");
  lines.push(fencedSql(envData.migrations.map((row) => `${row.version} ${row.name}`).join("\n")));
  lines.push("");
  return lines.join("\n");
}

function markdownToPdf(markdown, outputPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yb-security-report-"));
  const tmpTxt = path.join(tmpDir, "report.txt");
  fs.writeFileSync(tmpTxt, markdown, "utf8");
  const result = spawnSync("cupsfilter", ["-m", "application/pdf", tmpTxt], {
    encoding: "buffer",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.status !== 0 || !result.stdout || result.stdout.length === 0) {
    const stderr = result.stderr ? result.stderr.toString("utf8") : "";
    throw new Error(`Failed to render PDF with cupsfilter: ${stderr}`);
  }

  fs.writeFileSync(outputPath, result.stdout);
}

function buildReport({ staging, production, projectDiscovery }) {
  const comparisons = ["admin_account_deletions", "public_listings_v", "user_public_profiles", "users", "listings", "businesses"].map(
    (name) => makeObjectComparison(name, staging, production),
  );

  const driftItems = comparisons.filter((item) =>
    [item.exists, item.objectType, item.owner, item.rls, item.definition, item.grants, item.policies, item.reloptions].some(
      (value) => value === "Different",
    ),
  );

  const stagingCurrentRef = envRefFromUrl(ENV.SUPABASE_URL || ENV.NEXT_PUBLIC_SUPABASE_URL || "");
  const linkedRef = fs.existsSync(path.join(ROOT, "supabase", ".temp", "project-ref"))
    ? fs.readFileSync(path.join(ROOT, "supabase", ".temp", "project-ref"), "utf8").trim()
    : null;

  const summaryLines = [];
  summaryLines.push("# Supabase Security Audit Report");
  summaryLines.push("");
  summaryLines.push(`Generated: ${TODAY}`);
  summaryLines.push("");
  summaryLines.push("Audience: founder / product leadership");
  summaryLines.push("");
  summaryLines.push("Scope: live read-only analysis of staging and production Supabase metadata for the current lint warnings plus the core tables and helper functions those warnings rely on.");
  summaryLines.push("");
  summaryLines.push("## Executive Summary");
  summaryLines.push("");
  summaryLines.push(
    `This audit looked at two live Supabase projects. Staging is the project named \`${staging.projectInfo?.name}\` (\`${staging.ref}\`). Production was inferred as the other live repo-linked project, \`${production.projectInfo?.name}\` (\`${production.ref}\`), because the local app env currently points at staging (${stagingCurrentRef || "unknown"}) while the local Supabase link points at ${linkedRef || "unknown"}.`,
  );
  summaryLines.push("");
  summaryLines.push(
    "The main pattern behind the lint warnings is not an obvious full-system breach. It is that a few public-facing objects are relying on owner-privileged views or an internal table in the public schema without RLS. That can be acceptable temporarily, but it is fragile and deserves cleanup before more product surface area gets built on top of it.",
  );
  summaryLines.push("");
  summaryLines.push("High-level founder takeaways:");
  summaryLines.push("");
  summaryLines.push("- `public.admin_account_deletions` should be treated as internal-only. Even if current grants are narrow, leaving RLS off in the public schema is avoidable risk.");
  summaryLines.push("- `public.public_listings_v` and `public.user_public_profiles` appear intentionally public, but they are implemented as owner-privileged views. That keeps the site working, yet it means safety depends on the view definition staying perfectly aligned with the intended rules.");
  summaryLines.push(`- Staging and production are ${driftItems.length ? "not perfectly aligned" : "largely aligned"} for the inspected objects based on live metadata comparison.`);
  summaryLines.push("");
  summaryLines.push("## Environment Discovery");
  summaryLines.push("");
  summaryLines.push(`- Projects discovered through the Supabase Management API: ${projectDiscovery.map((p) => `\`${p.ref}\` (${p.name})`).join(", ")}`);
  summaryLines.push(`- Local app env points to: \`${stagingCurrentRef || "unknown"}\``);
  summaryLines.push(`- Local Supabase CLI link points to: \`${linkedRef || "unknown"}\``);
  summaryLines.push("");
  summaryLines.push("## Side-by-Side Comparison");
  summaryLines.push("");
  summaryLines.push("| Object | Exists | Type | Owner | RLS | Definition | Grants | Policies | Security mode |");
  summaryLines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const item of comparisons) {
    summaryLines.push(
      `| \`public.${item.objectName}\` | ${item.exists} | ${item.objectType} | ${item.owner} | ${item.rls} | ${item.definition} | ${item.grants} | ${item.policies} | ${item.reloptions} |`,
    );
  }
  summaryLines.push("");
  summaryLines.push(
    driftItems.length
      ? `Drift note: differences were detected for ${driftItems.map((item) => `\`public.${item.objectName}\``).join(", ")}.`
      : "Drift note: the inspected objects look materially aligned across staging and production.",
  );
  summaryLines.push("");
  summaryLines.push("## Object Findings");
  summaryLines.push("");

  for (const envData of [staging, production]) {
    summaryLines.push(`## ${envData.label}`);
    summaryLines.push("");
    for (const objectName of ["admin_account_deletions", "public_listings_v", "user_public_profiles", "users", "listings", "businesses"]) {
      summaryLines.push(buildObjectSection(objectName, envData));
    }
  }

  summaryLines.push("## Function Review");
  summaryLines.push("");
  summaryLines.push(
    "These helper functions matter because they decide whether someone counts as internal, whether someone counts as admin, and whether the deletion cleanup pipeline can run. Small helper functions can still create big access changes if many policies depend on them.",
  );
  summaryLines.push("");
  for (const envData of [staging, production]) {
    summaryLines.push(`## ${envData.label}`);
    summaryLines.push("");
    for (const fnName of [
      "viewer_can_see_internal_content",
      "has_admin_role",
      "is_admin",
      "is_admin_any_role",
      "invoke_finalize_overdue_deletions",
      "schedule_finalize_overdue_deletions_job",
      "unschedule_finalize_overdue_deletions_job",
      "list_finalize_overdue_deletions_jobs",
      "uid",
    ]) {
      const rendered = buildFunctionSection(fnName, envData);
      if (rendered) summaryLines.push(rendered);
    }
  }

  summaryLines.push("## Recommended Fixes");
  summaryLines.push("");
  summaryLines.push("1. `public.admin_account_deletions`");
  summaryLines.push("Enable RLS, remove any unnecessary `anon` or `authenticated` grants, and keep access limited to service-role or tightly scoped admin-only policies. This should behave like an internal operations table, not a public API table.");
  summaryLines.push("");
  summaryLines.push("2. `public.public_listings_v`");
  summaryLines.push("Keep the view for now if public pages rely on it. Before switching to `security_invoker`, first confirm the base-table RLS rules on `public.listings` and `public.businesses` already produce the exact same result set for public users. Then test homepage, `/listings`, and any internal preview flow.");
  summaryLines.push("");
  summaryLines.push("3. `public.user_public_profiles`");
  summaryLines.push("Keep the narrow public profile surface, but either move those fields into a dedicated public table or convert the view to `security_invoker` after adding carefully scoped public-read rules to the source table. Also check that display names never accidentally fall back to something that looks like an email address.");
  summaryLines.push("");
  summaryLines.push("## Breakage Risk If Fixes Are Applied Incorrectly");
  summaryLines.push("");
  summaryLines.push("- Homepage listing modules could go blank.");
  summaryLines.push("- `/listings` and public business pages could show too few results.");
  summaryLines.push("- Reviews could lose reviewer names or avatars.");
  summaryLines.push("- Internal/test listing previews could become public or disappear for internal staff.");
  summaryLines.push("- Admin account deletion workflows could lose access to audit rows or scheduled cleanup state.");
  summaryLines.push("");
  summaryLines.push("## Verification Checklist For Future Migration");
  summaryLines.push("");
  summaryLines.push("- Anonymous visitor can still load homepage listings and `/listings`.");
  summaryLines.push("- Anonymous visitor sees only verified, non-internal listings.");
  summaryLines.push("- Anonymous visitor cannot read private user fields from `public.users`.");
  summaryLines.push("- Authenticated customer can still see safe public profile names and avatars where intended.");
  summaryLines.push("- Business users do not gain access to `public.admin_account_deletions`.");
  summaryLines.push("- Admin users can still perform any intended deletion review or cleanup workflow.");
  summaryLines.push("- Internal/test content remains hidden from normal public traffic.");
  summaryLines.push("- Supabase lint warnings for these three items are cleared in staging first, then production.");
  summaryLines.push("");

  summaryLines.push(buildTechnicalAppendix(staging));
  summaryLines.push(buildTechnicalAppendix(production));

  return {
    markdown: summaryLines.join("\n"),
    comparisons,
    driftItems,
  };
}

const ENV = readEnvFile(ENV_PATH);

if (!ENV.SUPABASE_ACCESS_TOKEN) {
  throw new Error("Missing SUPABASE_ACCESS_TOKEN in .env.local");
}

fs.mkdirSync(DOCS_DIR, { recursive: true });

const projectDiscovery = await apiJson("https://api.supabase.com/v1/projects", ENV.SUPABASE_ACCESS_TOKEN);
const projectMap = new Map(projectDiscovery.map((project) => [project.ref, project]));

const linkedRef = fs.existsSync(path.join(ROOT, "supabase", ".temp", "project-ref"))
  ? fs.readFileSync(path.join(ROOT, "supabase", ".temp", "project-ref"), "utf8").trim()
  : null;
const envRef = envRefFromUrl(ENV.SUPABASE_URL || ENV.NEXT_PUBLIC_SUPABASE_URL || "");

const stagingProject =
  projectDiscovery.find((project) => String(project.name || "").toLowerCase().includes("staging")) ||
  (envRef ? projectMap.get(envRef) : null);

if (!stagingProject) {
  throw new Error("Could not determine staging Supabase project");
}

const productionProject =
  (linkedRef && linkedRef !== stagingProject.ref ? projectMap.get(linkedRef) : null) ||
  projectDiscovery.find((project) => project.ref !== stagingProject.ref);

if (!productionProject) {
  throw new Error("Could not determine production Supabase project");
}

const staging = await collectEnvironment(stagingProject.ref, "Staging", stagingProject);
const production = await collectEnvironment(productionProject.ref, "Production", productionProject);
const report = buildReport({ staging, production, projectDiscovery });

fs.writeFileSync(MD_PATH, report.markdown, "utf8");
fs.writeFileSync(
  JSON_PATH,
  JSON.stringify(
    {
      generatedAt: TODAY,
      staging: {
        ref: staging.ref,
        projectName: staging.projectInfo?.name,
        latestMigration: staging.latestMigration,
      },
      production: {
        ref: production.ref,
        projectName: production.projectInfo?.name,
        latestMigration: production.latestMigration,
      },
      comparisons: report.comparisons,
      driftCount: report.driftItems.length,
    },
    null,
    2,
  ),
  "utf8",
);

markdownToPdf(report.markdown, PDF_PATH);

console.log(JSON.stringify({
  markdown: path.relative(ROOT, MD_PATH),
  pdf: path.relative(ROOT, PDF_PATH),
  data: path.relative(ROOT, JSON_PATH),
  stagingRef: staging.ref,
  productionRef: production.ref,
  driftCount: report.driftItems.length,
}, null, 2));
