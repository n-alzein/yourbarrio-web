#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env.local");
const DOCS_DIR = path.join(ROOT, "docs", "security");
const REPORT_PATH = path.join(DOCS_DIR, "staging-prod-schema-diff.md");
const CLEANUP_SQL_PATH = path.join(DOCS_DIR, "staging-schema-cleanup.sql");
const DATA_PATH = path.join(DOCS_DIR, "staging-prod-schema-diff.data.json");

const STAGING = {
  ref: "crskbfbleiubpkvyvvlf",
  label: "staging",
};

const PRODUCTION = {
  ref: "nbzqnjanqkzuwyxnkjtr",
  label: "production",
};

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

function normalizeSql(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function relKindLabel(kind) {
  switch (kind) {
    case "r":
      return "table";
    case "p":
      return "partitioned table";
    case "v":
      return "view";
    case "m":
      return "materialized view";
    default:
      return kind;
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
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  return response.json();
}

async function runReadOnlyQuery(ref, token, query) {
  return apiJson(`https://api.supabase.com/v1/projects/${ref}/database/query/read-only`, token, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

async function fetchBackupMetadata(ref, token) {
  return apiJson(`https://api.supabase.com/v1/projects/${ref}/database/backups`, token);
}

function rgSearch(term, paths) {
  const result = spawnSync(
    "rg",
    ["-n", "--hidden", "--glob", "!node_modules", "--glob", "!.next", "--glob", "!docs/security/*.data.json", term, ...paths],
    { cwd: ROOT, encoding: "utf8" }
  );

  if (result.status !== 0 && !result.stdout) {
    return [];
  }

  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function valuesRows(items, mapper) {
  return items.map(mapper).join(",\n");
}

function formatList(items) {
  return items.length ? items.join(", ") : "None";
}

function formatCodeRefSummary(lines, max = 8) {
  if (!lines.length) return "None found in repo.";
  const shown = lines.slice(0, max).map((line) => `- \`${line}\``);
  if (lines.length > max) shown.push(`- ...and ${lines.length - max} more`);
  return shown.join("\n");
}

function cleanupSqlForCandidate(candidate) {
  if (candidate.object_type === "function") {
    return `drop function if exists ${candidate.schema_name}.${candidate.signature} cascade;`;
  }
  if (candidate.object_type === "view" || candidate.object_type === "materialized view") {
    return `drop view if exists ${candidate.qualified_name} cascade;`;
  }
  if (candidate.object_type === "table" || candidate.object_type === "partitioned table") {
    return `drop table if exists ${candidate.qualified_name} cascade;`;
  }
  return null;
}

function diffByKey(stagingItems, prodItems, keyFn, comparator) {
  const stagingMap = new Map(stagingItems.map((item) => [keyFn(item), item]));
  const prodMap = new Map(prodItems.map((item) => [keyFn(item), item]));

  const onlyStaging = [];
  const onlyProd = [];
  const different = [];

  for (const [key, item] of stagingMap) {
    if (!prodMap.has(key)) {
      onlyStaging.push(item);
      continue;
    }
    const prodItem = prodMap.get(key);
    if (!comparator(item, prodItem)) {
      different.push({ staging: item, production: prodItem });
    }
  }

  for (const [key, item] of prodMap) {
    if (!stagingMap.has(key)) {
      onlyProd.push(item);
    }
  }

  return { onlyStaging, onlyProd, different };
}

async function main() {
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  const env = readEnvFile(ENV_PATH);
  const token = env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    throw new Error("SUPABASE_ACCESS_TOKEN is missing from .env.local");
  }

  const queries = {
    relations: `
      select
        n.nspname as schema_name,
        c.relname as object_name,
        c.oid::regclass::text as qualified_name,
        c.relkind,
        pg_get_userbyid(c.relowner) as owner,
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as force_rls,
        coalesce(array_to_string(c.reloptions, ', '), '') as reloptions,
        case
          when c.relkind in ('v', 'm') then pg_get_viewdef(c.oid, true)
          else null
        end as definition
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm')
      order by n.nspname, c.relname;
    `,
    functions: `
      select
        n.nspname as schema_name,
        p.proname as function_name,
        p.oid::regprocedure::text as signature,
        pg_get_userbyid(p.proowner) as owner,
        p.prosecdef as security_definer,
        coalesce(array_to_string(p.proconfig, ', '), '') as proconfig,
        pg_get_functiondef(p.oid) as definition
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
      order by p.proname, p.oid::regprocedure::text;
    `,
    indexes: `
      select
        schemaname as schema_name,
        tablename as table_name,
        indexname as object_name,
        indexdef as definition
      from pg_indexes
      where schemaname = 'public'
      order by tablename, indexname;
    `,
    triggers: `
      select
        event_object_schema as schema_name,
        event_object_table as table_name,
        trigger_name as object_name,
        action_timing,
        event_manipulation,
        action_orientation,
        action_statement
      from information_schema.triggers
      where event_object_schema = 'public'
      order by event_object_table, trigger_name, event_manipulation;
    `,
    policies: `
      select
        schemaname as schema_name,
        tablename as table_name,
        policyname as object_name,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      from pg_policies
      where schemaname = 'public'
      order by tablename, policyname;
    `,
    tableGrants: `
      select
        table_schema as schema_name,
        table_name as object_name,
        grantee,
        privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
      order by table_name, grantee, privilege_type;
    `,
    routineGrants: `
      select
        routine_schema as schema_name,
        routine_name as object_name,
        specific_name,
        grantee,
        privilege_type
      from information_schema.role_routine_grants
      where routine_schema = 'public'
      order by routine_name, specific_name, grantee, privilege_type;
    `,
    extensions: `
      select
        e.extname,
        n.nspname as schema_name,
        e.extversion
      from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
      order by e.extname;
    `,
    buckets: `
      select
        id,
        name,
        public,
        file_size_limit,
        allowed_mime_types
      from storage.buckets
      order by id;
    `,
  };

  const [stagingBackup, prodBackup] = await Promise.all([
    fetchBackupMetadata(STAGING.ref, token),
    fetchBackupMetadata(PRODUCTION.ref, token),
  ]);

  const envData = {};
  for (const [name, query] of Object.entries(queries)) {
    const [stagingResult, prodResult] = await Promise.all([
      runReadOnlyQuery(STAGING.ref, token, query),
      runReadOnlyQuery(PRODUCTION.ref, token, query),
    ]);
    envData[name] = {
      staging: stagingResult,
      production: prodResult,
    };
  }

  const relationsDiff = diffByKey(
    envData.relations.staging.map((row) => ({ ...row, object_type: relKindLabel(row.relkind) })),
    envData.relations.production.map((row) => ({ ...row, object_type: relKindLabel(row.relkind) })),
    (row) => `${row.schema_name}.${row.object_name}`,
    (a, b) =>
      a.object_type === b.object_type &&
      a.owner === b.owner &&
      a.rls_enabled === b.rls_enabled &&
      a.force_rls === b.force_rls &&
      normalizeSql(a.reloptions) === normalizeSql(b.reloptions) &&
      normalizeSql(a.definition) === normalizeSql(b.definition)
  );

  const functionsDiff = diffByKey(
    envData.functions.staging,
    envData.functions.production,
    (row) => row.signature,
    (a, b) =>
      a.owner === b.owner &&
      a.security_definer === b.security_definer &&
      normalizeSql(a.proconfig) === normalizeSql(b.proconfig) &&
      normalizeSql(a.definition) === normalizeSql(b.definition)
  );

  const indexesDiff = diffByKey(
    envData.indexes.staging,
    envData.indexes.production,
    (row) => `${row.schema_name}.${row.object_name}`,
    (a, b) => normalizeSql(a.definition) === normalizeSql(b.definition)
  );

  const triggersDiff = diffByKey(
    envData.triggers.staging,
    envData.triggers.production,
    (row) => `${row.schema_name}.${row.table_name}.${row.object_name}.${row.event_manipulation}`,
    (a, b) =>
      a.action_timing === b.action_timing &&
      a.action_orientation === b.action_orientation &&
      normalizeSql(a.action_statement) === normalizeSql(b.action_statement)
  );

  const policiesDiff = diffByKey(
    envData.policies.staging,
    envData.policies.production,
    (row) => `${row.schema_name}.${row.table_name}.${row.object_name}`,
    (a, b) =>
      a.permissive === b.permissive &&
      JSON.stringify(a.roles) === JSON.stringify(b.roles) &&
      a.cmd === b.cmd &&
      normalizeSql(a.qual) === normalizeSql(b.qual) &&
      normalizeSql(a.with_check) === normalizeSql(b.with_check)
  );

  const tableGrantsDiff = diffByKey(
    envData.tableGrants.staging,
    envData.tableGrants.production,
    (row) => `${row.schema_name}.${row.object_name}.${row.grantee}.${row.privilege_type}`,
    () => true
  );

  const routineGrantsDiff = diffByKey(
    envData.routineGrants.staging,
    envData.routineGrants.production,
    (row) => `${row.schema_name}.${row.specific_name}.${row.grantee}.${row.privilege_type}`,
    () => true
  );

  const extensionsDiff = diffByKey(
    envData.extensions.staging,
    envData.extensions.production,
    (row) => row.extname,
    (a, b) => a.schema_name === b.schema_name && a.extversion === b.extversion
  );

  const bucketsDiff = diffByKey(
    envData.buckets.staging,
    envData.buckets.production,
    (row) => row.id,
    (a, b) =>
      a.name === b.name &&
      a.public === b.public &&
      String(a.file_size_limit || "") === String(b.file_size_limit || "") &&
      JSON.stringify(a.allowed_mime_types || []) === JSON.stringify(b.allowed_mime_types || [])
  );

  const stagingOnlyPublicObjects = [
    ...relationsDiff.onlyStaging.map((row) => ({
      kind: "relation",
      schema_name: row.schema_name,
      object_name: row.object_name,
      qualified_name: `${row.schema_name}.${row.object_name}`,
      object_type: row.object_type,
    })),
    ...functionsDiff.onlyStaging.map((row) => ({
      kind: "function",
      schema_name: row.schema_name,
      object_name: row.function_name,
      signature: row.signature,
      qualified_name: `${row.schema_name}.${row.signature}`,
      object_type: "function",
    })),
  ];

  const stagingOnlyRelations = stagingOnlyPublicObjects.filter((item) => item.kind === "relation");
  const stagingOnlyFunctions = stagingOnlyPublicObjects.filter((item) => item.kind === "function");

  const rowCountQuery =
    stagingOnlyRelations.length > 0
      ? `
        ${stagingOnlyRelations
          .map((item) => {
            const countExpr =
              item.object_type === "view" || item.object_type === "materialized view"
                ? `select count(*)::bigint as row_count from ${item.qualified_name}`
                : `select count(*)::bigint as row_count from ${item.qualified_name}`;
            return `select ${sqlString(item.qualified_name)} as qualified_name, (${countExpr}) as row_count`;
          })
          .join("\nunion all\n")}
      `
      : `select null::text as qualified_name, null::bigint as row_count limit 0`;

  const fkQuery =
    stagingOnlyRelations.length > 0
      ? `
        select
          c.conname,
          c.conrelid::regclass::text as source_table,
          c.confrelid::regclass::text as referenced_table,
          pg_get_constraintdef(c.oid, true) as definition
        from pg_constraint c
        where c.contype = 'f'
          and (
            c.conrelid::regclass::text in (${stagingOnlyRelations.map((item) => sqlString(item.qualified_name)).join(", ")})
            or c.confrelid::regclass::text in (${stagingOnlyRelations.map((item) => sqlString(item.qualified_name)).join(", ")})
          )
        order by source_table, referenced_table, conname;
      `
      : `select null::text as conname, null::text as source_table, null::text as referenced_table, null::text as definition limit 0`;

  const viewDepsQuery =
    stagingOnlyRelations.length > 0
      ? `
        select
          table_schema,
          table_name,
          view_schema,
          view_name
        from information_schema.view_table_usage
        where table_schema = 'public'
          and (table_schema || '.' || table_name) in (${stagingOnlyRelations.map((item) => sqlString(item.qualified_name)).join(", ")})
        order by table_name, view_name;
      `
      : `select null::text as table_schema, null::text as table_name, null::text as view_schema, null::text as view_name limit 0`;

  const triggerDepsQuery =
    stagingOnlyRelations.length > 0
      ? `
        select
          event_object_schema as schema_name,
          event_object_table as table_name,
          trigger_name,
          event_manipulation
        from information_schema.triggers
        where event_object_schema = 'public'
          and (event_object_schema || '.' || event_object_table) in (${stagingOnlyRelations.map((item) => sqlString(item.qualified_name)).join(", ")})
        order by table_name, trigger_name, event_manipulation;
      `
      : `select null::text as schema_name, null::text as table_name, null::text as trigger_name, null::text as event_manipulation limit 0`;

  const functionMentionsQuery =
    stagingOnlyPublicObjects.length > 0
      ? `
        with targets(name) as (
          values
          ${valuesRows(
            stagingOnlyPublicObjects,
            (item) => `(${sqlString(item.object_name)})`
          )}
        )
        select
          t.name as target_name,
          p.oid::regprocedure::text as signature
        from targets t
        join pg_proc p on pg_get_functiondef(p.oid) ilike '%' || t.name || '%'
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
        order by t.name, signature;
      `
      : `select null::text as target_name, null::text as signature limit 0`;

  const triggerFunctionQuery =
    stagingOnlyFunctions.length > 0
      ? `
        select
          p.oid::regprocedure::text as signature,
          c.oid::regclass::text as table_name,
          t.tgname as trigger_name
        from pg_trigger t
        join pg_proc p on p.oid = t.tgfoid
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = p.pronamespace
        where not t.tgisinternal
          and n.nspname = 'public'
          and p.oid::regprocedure::text in (${stagingOnlyFunctions.map((item) => sqlString(item.signature)).join(", ")})
        order by signature, table_name, trigger_name;
      `
      : `select null::text as signature, null::text as table_name, null::text as trigger_name limit 0`;

  const [rowCounts, fks, viewDeps, triggerDeps, functionMentions, triggerFunctionDeps] = await Promise.all([
    runReadOnlyQuery(STAGING.ref, token, rowCountQuery),
    runReadOnlyQuery(STAGING.ref, token, fkQuery),
    runReadOnlyQuery(STAGING.ref, token, viewDepsQuery),
    runReadOnlyQuery(STAGING.ref, token, triggerDepsQuery),
    runReadOnlyQuery(STAGING.ref, token, functionMentionsQuery),
    runReadOnlyQuery(STAGING.ref, token, triggerFunctionQuery),
  ]);

  const rowCountByName = new Map(rowCounts.map((row) => [row.qualified_name, Number(row.row_count || 0)]));
  const fkRows = Array.isArray(fks) ? fks : [];
  const viewDepRows = Array.isArray(viewDeps) ? viewDeps : [];
  const triggerRows = Array.isArray(triggerDeps) ? triggerDeps : [];
  const functionMentionRows = Array.isArray(functionMentions) ? functionMentions : [];
  const triggerFunctionRows = Array.isArray(triggerFunctionDeps) ? triggerFunctionDeps : [];

  const candidates = stagingOnlyPublicObjects.map((item) => {
    const runtimeRefs = rgSearch(item.object_name, ["app", "lib", "tests", "scripts", "supabase/functions"]);
    const historicalRefs = rgSearch(item.object_name, ["supabase/migrations", "docs"]);
    const fkDeps = fkRows.filter(
      (row) => row.source_table === item.qualified_name || row.referenced_table === item.qualified_name
    );
    const viewDepsForItem = viewDepRows.filter(
      (row) => `${row.table_schema}.${row.table_name}` === item.qualified_name
    );
    const triggerDepsForItem = triggerRows.filter(
      (row) => `${row.schema_name}.${row.table_name}` === item.qualified_name
    );
    const functionDepsForItem = functionMentionRows
      .filter((row) => row.target_name === item.object_name)
      .map((row) => row.signature)
      .filter((signature) => signature !== item.signature);

    const triggerFunctionDepsForItem = triggerFunctionRows
      .filter((row) => row.signature === item.signature)
      .map((row) => `${row.table_name}.${row.trigger_name}`);

    let suggested_action = "investigate";
    if (
      runtimeRefs.length === 0 &&
      viewDepsForItem.length === 0 &&
      fkDeps.length === 0 &&
      triggerFunctionDepsForItem.length === 0 &&
      functionDepsForItem.length === 0
    ) {
      suggested_action = "drop";
    } else if (runtimeRefs.length > 0) {
      suggested_action = "keep temporarily";
    }

    return {
      ...item,
      row_count: rowCountByName.get(item.qualified_name) ?? 0,
      runtime_refs: runtimeRefs,
      historical_refs: historicalRefs,
      fk_dependencies: fkDeps,
      view_dependencies: viewDepsForItem,
      trigger_dependencies: triggerDepsForItem,
      function_dependencies: functionDepsForItem,
      trigger_function_dependencies: triggerFunctionDepsForItem,
      suggested_action,
    };
  });

  const dropCandidates = candidates.filter((item) => item.suggested_action === "drop");

  const cleanupStatements = dropCandidates
    .map(cleanupSqlForCandidate)
    .filter(Boolean);

  const cleanupSql = [
    "-- Staging-only schema cleanup",
    `-- Intended target: ${STAGING.label} (${STAGING.ref})`,
    "-- Production must not be modified with this file.",
    "-- Review the object list below before executing.",
    "",
    "-- Objects selected for drop",
    ...dropCandidates.map((item) => {
      const deps = [
        ...item.fk_dependencies.map((row) => `${row.source_table} -> ${row.referenced_table}`),
        ...item.view_dependencies.map((row) => `${row.view_schema}.${row.view_name}`),
        ...item.function_dependencies,
        ...item.trigger_function_dependencies,
      ];
      return `-- ${item.object_type} ${item.qualified_name} | rows=${item.row_count} | deps=${deps.length ? deps.join("; ") : "none"}`;
    }),
    "",
    "begin;",
    ...cleanupStatements,
    "commit;",
    "",
  ].join("\n");

  const onlyStagingLines = [];
  for (const item of candidates) {
    onlyStagingLines.push(`### \`${item.qualified_name}\``);
    onlyStagingLines.push(`- Type: ${item.object_type}`);
    onlyStagingLines.push(`- Row count in staging: ${item.row_count}`);
    onlyStagingLines.push(`- Runtime code references: ${item.runtime_refs.length}`);
    onlyStagingLines.push(`- Historical migration/docs references: ${item.historical_refs.length}`);
    onlyStagingLines.push(`- Suggested action: ${item.suggested_action}`);
    onlyStagingLines.push(`- Foreign key dependencies: ${item.fk_dependencies.length ? item.fk_dependencies.map((row) => row.definition).join("; ") : "None"}`);
    onlyStagingLines.push(`- View dependencies: ${item.view_dependencies.length ? item.view_dependencies.map((row) => `${row.view_schema}.${row.view_name}`).join(", ") : "None"}`);
    onlyStagingLines.push(`- Table trigger dependencies: ${item.trigger_dependencies.length ? item.trigger_dependencies.map((row) => `${row.trigger_name} (${row.event_manipulation})`).join(", ") : "None"}`);
    onlyStagingLines.push(`- Function used by triggers: ${item.trigger_function_dependencies.length ? item.trigger_function_dependencies.join(", ") : "None"}`);
    onlyStagingLines.push(`- Function mentions: ${item.function_dependencies.length ? item.function_dependencies.join(", ") : "None found"}`);
    onlyStagingLines.push("- Runtime code references:");
    onlyStagingLines.push(formatCodeRefSummary(item.runtime_refs));
    onlyStagingLines.push("- Historical migration/docs references:");
    onlyStagingLines.push(formatCodeRefSummary(item.historical_refs));
    onlyStagingLines.push("");
  }

  const report = [
    "# Staging vs Production Schema Diff",
    "",
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "## Scope",
    "",
    `- Production source of truth: \`${PRODUCTION.ref}\``,
    `- Staging compared project: \`${STAGING.ref}\``,
    "- Compared categories: public tables/views, public functions, indexes, triggers, RLS policies, grants, extensions, storage buckets.",
    "- This report is for staging cleanup planning only. It does not authorize production changes.",
    "",
    "## Backup status",
    "",
    `- Staging latest backup: ${stagingBackup.backups?.[0]?.inserted_at || "Unknown"}`,
    `- Production latest backup: ${prodBackup.backups?.[0]?.inserted_at || "Unknown"}`,
    "",
    "## Objects only in staging",
    "",
    ...(candidates.length
      ? onlyStagingLines
      : ["No public relations or public functions were found only in staging.", ""]),
    "## Objects only in production",
    "",
    ...(
      [
        ...relationsDiff.onlyProd.map((row) => `- ${row.object_type}: \`${row.qualified_name}\``),
        ...functionsDiff.onlyProd.map((row) => `- function: \`${row.signature}\``),
      ].length
        ? [
            ...relationsDiff.onlyProd.map((row) => `- ${row.object_type}: \`${row.qualified_name}\``),
            ...functionsDiff.onlyProd.map((row) => `- function: \`${row.signature}\``),
            "",
          ]
        : ["None found in the compared public schema objects.", ""]
    ),
    "## Objects in both but with different definitions",
    "",
    ...(
      [
        ...relationsDiff.different.map(
          ({ staging, production }) =>
            `- ${staging.object_type} \`${staging.qualified_name}\`: staging and production differ in owner, RLS/security options, or definition`
        ),
        ...indexesDiff.different.map(
          ({ staging }) => `- index \`${staging.object_name}\` on \`${staging.table_name}\` differs`
        ),
        ...triggersDiff.different.map(
          ({ staging }) => `- trigger \`${staging.object_name}\` on \`${staging.table_name}\` differs`
        ),
      ].length
        ? [
            ...relationsDiff.different.map(
              ({ staging, production }) =>
                `- ${staging.object_type} \`${staging.qualified_name}\`: staging and production differ in owner, RLS/security options, or definition`
            ),
            ...indexesDiff.different.map(
              ({ staging }) => `- index \`${staging.object_name}\` on \`${staging.table_name}\` differs`
            ),
            ...triggersDiff.different.map(
              ({ staging }) => `- trigger \`${staging.object_name}\` on \`${staging.table_name}\` differs`
            ),
            "",
          ]
        : ["No definition differences found in the compared public relations, indexes, or triggers.", ""]
    ),
    "## RLS, policy, and grant differences",
    "",
    ...(
      [
        ...policiesDiff.onlyStaging.map((row) => `- policy only in staging: \`${row.table_name}.${row.object_name}\``),
        ...policiesDiff.onlyProd.map((row) => `- policy only in production: \`${row.table_name}.${row.object_name}\``),
        ...policiesDiff.different.map(({ staging }) => `- policy differs: \`${staging.table_name}.${staging.object_name}\``),
        ...tableGrantsDiff.onlyStaging.map((row) => `- table grant only in staging: \`${row.object_name}\` ${row.grantee} ${row.privilege_type}`),
        ...tableGrantsDiff.onlyProd.map((row) => `- table grant only in production: \`${row.object_name}\` ${row.grantee} ${row.privilege_type}`),
        ...routineGrantsDiff.onlyStaging.map((row) => `- routine grant only in staging: \`${row.object_name}\` ${row.grantee} ${row.privilege_type}`),
        ...routineGrantsDiff.onlyProd.map((row) => `- routine grant only in production: \`${row.object_name}\` ${row.grantee} ${row.privilege_type}`),
      ].length
        ? [
            ...policiesDiff.onlyStaging.map((row) => `- policy only in staging: \`${row.table_name}.${row.object_name}\``),
            ...policiesDiff.onlyProd.map((row) => `- policy only in production: \`${row.table_name}.${row.object_name}\``),
            ...policiesDiff.different.map(({ staging }) => `- policy differs: \`${staging.table_name}.${staging.object_name}\``),
            ...tableGrantsDiff.onlyStaging.map((row) => `- table grant only in staging: \`${row.object_name}\` ${row.grantee} ${row.privilege_type}`),
            ...tableGrantsDiff.onlyProd.map((row) => `- table grant only in production: \`${row.object_name}\` ${row.grantee} ${row.privilege_type}`),
            ...routineGrantsDiff.onlyStaging.map((row) => `- routine grant only in staging: \`${row.object_name}\` ${row.grantee} ${row.privilege_type}`),
            ...routineGrantsDiff.onlyProd.map((row) => `- routine grant only in production: \`${row.object_name}\` ${row.grantee} ${row.privilege_type}`),
            "",
          ]
        : ["No policy or grant differences found in the compared public objects.", ""]
    ),
    "## Function differences",
    "",
    ...(
      [
        ...functionsDiff.onlyStaging.map((row) => `- function only in staging: \`${row.signature}\``),
        ...functionsDiff.onlyProd.map((row) => `- function only in production: \`${row.signature}\``),
        ...functionsDiff.different.map(({ staging }) => `- function differs: \`${staging.signature}\``),
      ].length
        ? [
            ...functionsDiff.onlyStaging.map((row) => `- function only in staging: \`${row.signature}\``),
            ...functionsDiff.onlyProd.map((row) => `- function only in production: \`${row.signature}\``),
            ...functionsDiff.different.map(({ staging }) => `- function differs: \`${staging.signature}\``),
            "",
          ]
        : ["No public-function differences found.", ""]
    ),
    "## Storage and schema objects that should not be touched",
    "",
    "- `auth`, `storage`, `realtime`, and Supabase-managed schemas are not drop targets in this cleanup pass.",
    "- Storage bucket differences are documented only for awareness.",
    "- Extension differences are documented only for awareness.",
    "",
    "### Storage bucket differences",
    ...(
      [
        ...bucketsDiff.onlyStaging.map((row) => `- bucket only in staging: \`${row.id}\``),
        ...bucketsDiff.onlyProd.map((row) => `- bucket only in production: \`${row.id}\``),
        ...bucketsDiff.different.map(({ staging }) => `- bucket differs: \`${staging.id}\``),
      ].length
        ? [
            ...bucketsDiff.onlyStaging.map((row) => `- bucket only in staging: \`${row.id}\``),
            ...bucketsDiff.onlyProd.map((row) => `- bucket only in production: \`${row.id}\``),
            ...bucketsDiff.different.map(({ staging }) => `- bucket differs: \`${staging.id}\``),
            "",
          ]
        : ["- No storage bucket differences found.", ""]
    ),
    "### Extension differences",
    ...(
      [
        ...extensionsDiff.onlyStaging.map((row) => `- extension only in staging: \`${row.extname}\` in schema \`${row.schema_name}\``),
        ...extensionsDiff.onlyProd.map((row) => `- extension only in production: \`${row.extname}\` in schema \`${row.schema_name}\``),
        ...extensionsDiff.different.map(({ staging, production }) => `- extension differs: \`${staging.extname}\` staging=\`${staging.extversion}/${staging.schema_name}\` production=\`${production.extversion}/${production.schema_name}\``),
        "",
      ]
    ),
    "## Proposed cleanup set",
    "",
    ...(dropCandidates.length
      ? dropCandidates.map((item) => `- Drop candidate: \`${item.qualified_name}\` (${item.object_type}, rows=${item.row_count})`)
      : ["- No safe drop candidates were identified automatically."]),
    "",
  ].join("\n");

  const output = {
    generatedAt: new Date().toISOString(),
    refs: {
      staging: STAGING.ref,
      production: PRODUCTION.ref,
    },
    backups: {
      staging: stagingBackup.backups?.[0] || null,
      production: prodBackup.backups?.[0] || null,
    },
    diffs: {
      relations: relationsDiff,
      functions: functionsDiff,
      indexes: indexesDiff,
      triggers: triggersDiff,
      policies: policiesDiff,
      tableGrants: tableGrantsDiff,
      routineGrants: routineGrantsDiff,
      extensions: extensionsDiff,
      buckets: bucketsDiff,
    },
    candidates,
    dropCandidates,
  };

  fs.writeFileSync(REPORT_PATH, report);
  fs.writeFileSync(CLEANUP_SQL_PATH, cleanupSql);
  fs.writeFileSync(DATA_PATH, JSON.stringify(output, null, 2));

  console.log(JSON.stringify({
    report: REPORT_PATH,
    cleanupSql: CLEANUP_SQL_PATH,
    data: DATA_PATH,
    stagingOnlyCount: candidates.length,
    dropCandidateCount: dropCandidates.length,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
