# Supabase Security Audit Report

Generated: 2026-04-24T05:59:30.763Z

Audience: founder / product leadership

Scope: live read-only analysis of staging and production Supabase metadata for the current lint warnings plus the core tables and helper functions those warnings rely on.

## Executive Summary

This audit looked at two live Supabase projects. Staging is the project named `yourbarrio-staging` (`crskbfbleiubpkvyvvlf`). Production was inferred as the other live repo-linked project, `n-alzein's Project` (`nbzqnjanqkzuwyxnkjtr`), because the local app env currently points at staging (crskbfbleiubpkvyvvlf) while the local Supabase link points at nbzqnjanqkzuwyxnkjtr.

The main pattern behind the lint warnings is not an obvious full-system breach. It is that a few public-facing objects are relying on owner-privileged views or an internal table in the public schema without RLS. That can be acceptable temporarily, but it is fragile and deserves cleanup before more product surface area gets built on top of it.

High-level founder takeaways:

- `public.admin_account_deletions` should be treated as internal-only. Even if current grants are narrow, leaving RLS off in the public schema is avoidable risk.
- `public.public_listings_v` and `public.user_public_profiles` appear intentionally public, but they are implemented as owner-privileged views. That keeps the site working, yet it means safety depends on the view definition staying perfectly aligned with the intended rules.
- Staging and production are not perfectly aligned for the inspected objects based on live metadata comparison.

## Environment Discovery

- Projects discovered through the Supabase Management API: `nbzqnjanqkzuwyxnkjtr` (n-alzein's Project), `crskbfbleiubpkvyvvlf` (yourbarrio-staging)
- Local app env points to: `crskbfbleiubpkvyvvlf`
- Local Supabase CLI link points to: `nbzqnjanqkzuwyxnkjtr`

## Side-by-Side Comparison

| Object | Exists | Type | Owner | RLS | Definition | Grants | Policies | Security mode |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `public.admin_account_deletions` | Different | Different | Different | Different | Same | Same | Same | Same |
| `public.public_listings_v` | Same | Same | Same | Same | Different | Same | Same | Same |
| `public.user_public_profiles` | Same | Same | Same | Same | Same | Same | Same | Same |
| `public.users` | Same | Same | Same | Same | Same | Same | Same | Same |
| `public.listings` | Same | Same | Same | Same | Same | Same | Same | Same |
| `public.businesses` | Same | Same | Same | Same | Same | Same | Same | Same |

Drift note: differences were detected for `public.admin_account_deletions`, `public.public_listings_v`.

## Object Findings

## Staging

### `public.admin_account_deletions`

Purpose: Internal account-deletion audit and workflow table. It appears to track who requested deletion, when final cleanup should happen, and related admin handling.

Environment: Staging

- Type: Missing
- Exists: No
- Approximate live row count: Unknown
- Owner: Unknown
- In public schema / API-exposed schema: Yes
- RLS enabled: Unknown
- Grants summary: No explicit grants found in information_schema output
- Role access snapshot: anon read Unknown, authenticated read Unknown, service_role read Unknown
- Risk level: Medium
- Why this matters: Supabase flags this because the table lives in the public schema with RLS turned off. Even if current grants are narrow, one accidental future grant could expose internal deletion records.

Recommended fix: Enable RLS, revoke any browser-facing grants that are not truly needed, and keep this table service-role-only or admin-only. This is an internal audit/workflow table, not a public app surface.
Breakage risk if changed incorrectly: admin deletion dashboards, deletion review tools, or overdue-deletion jobs could stop seeing rows they need.

### `public.public_listings_v`

Purpose: Public-facing listing feed. It appears to be the safe surface for homepage and listing pages so the app can read only listings that should be visible to the public.

Environment: Staging

- Type: view
- Exists: Yes
- Approximate live row count: Unknown
- Owner: postgres
- In public schema / API-exposed schema: Yes
- RLS enabled: No
- View security mode: Security definer / default owner privileges
- Base tables: public.listings, public.businesses
- Grants summary: No explicit grants found in information_schema output
- Role access snapshot: anon read Yes, authenticated read Yes, service_role read Yes
- Risk level: Medium
- Why this matters: This view is intentionally public, but it runs with the owner’s privileges. That means it can bypass table protections if the definition drifts from the underlying RLS rules.

Recommended fix: Keep the view if public pages depend on it, but move toward `security_invoker` only after confirming the base-table RLS policies already express the exact same visibility rule: public users can see only published, verified, non-internal listings unless the viewer is internal.
Breakage risk if changed incorrectly: homepage listing blocks, `/listings`, business pages, and any internal preview flow could suddenly return too few rows or no rows at all.

### `public.user_public_profiles`

Purpose: Public profile card view. It exposes a small set of fields, mainly display name and avatar, for reviews, public profiles, and other customer-facing UI.

Environment: Staging

- Type: view
- Exists: Yes
- Approximate live row count: Unknown
- Owner: postgres
- In public schema / API-exposed schema: Yes
- RLS enabled: No
- View security mode: Security definer / default owner privileges
- Base tables: public.users
- Grants summary: No explicit grants found in information_schema output
- Role access snapshot: anon read Yes, authenticated read Yes, service_role read Yes
- Risk level: Medium
- Why this matters: The exposed columns are narrow, which helps, but the view still runs with owner privileges. If private fields are added later by mistake, this could widen the public profile surface.

Recommended fix: Keep the public-safe surface, but consider either a dedicated `public_profiles` table or a `security_invoker` view backed by narrowly scoped public policies on the source table. Also verify the display name logic cannot accidentally expose email-style names or deleted-user remnants.
Breakage risk if changed incorrectly: reviews, reviewer names, avatars, and public business/profile UI could lose names or images for legitimate public content.

### `public.users`

Purpose: Core user account table. This is likely the source of private customer and business profile data, so it should stay tightly protected.

Environment: Staging

- Type: table
- Exists: Yes
- Approximate live row count: 16
- Owner: postgres
- In public schema / API-exposed schema: Yes
- RLS enabled: Yes
- Grants summary: No explicit grants found in information_schema output
- Role access snapshot: anon read Yes, authenticated read Yes, service_role read Yes
- Policies: "Allow reading business profiles" (SELECT), "Participants can read user profiles" (SELECT), "Users can insert own row" (INSERT), "Users can read own data" (SELECT), "Users can update own data" (UPDATE)
- Risk level: Low
- Why this matters: No high-risk pattern stood out in the collected metadata for this object.

### `public.listings`

Purpose: Core listing table. This likely stores every listing, including drafts and internal/test entries, so visibility rules matter.

Environment: Staging

- Type: table
- Exists: Yes
- Approximate live row count: 4
- Owner: postgres
- In public schema / API-exposed schema: Yes
- RLS enabled: Yes
- Grants summary: No explicit grants found in information_schema output
- Role access snapshot: anon read Yes, authenticated read Yes, service_role read Yes
- Policies: "Business owners can delete own listings" (DELETE), "Businesses can insert listings" (INSERT), "Businesses can read own listings" (SELECT), "Businesses can update own listings" (UPDATE), "Public can read verified listings" (SELECT)
- Risk level: Low
- Why this matters: No high-risk pattern stood out in the collected metadata for this object.

### `public.businesses`

Purpose: Core business table. This likely controls whether a business is verified and whether it should appear publicly.

Environment: Staging

- Type: table
- Exists: Yes
- Approximate live row count: 12
- Owner: postgres
- In public schema / API-exposed schema: Yes
- RLS enabled: Yes
- Grants summary: No explicit grants found in information_schema output
- Role access snapshot: anon read Yes, authenticated read Yes, service_role read Yes
- Policies: "Businesses can insert own row" (INSERT), "Businesses can read own row" (SELECT), "Businesses can update own row" (UPDATE), "Public can read verified businesses" (SELECT)
- Risk level: Low
- Why this matters: No high-risk pattern stood out in the collected metadata for this object.

## Production

### `public.admin_account_deletions`

Purpose: Internal account-deletion audit and workflow table. It appears to track who requested deletion, when final cleanup should happen, and related admin handling.

Environment: Production

- Type: table
- Exists: Yes
- Approximate live row count: 0
- Owner: postgres
- In public schema / API-exposed schema: Yes
- RLS enabled: No
- Grants summary: No explicit grants found in information_schema output
- Role access snapshot: anon read Yes, authenticated read Yes, service_role read Yes
- Policies: None
- Risk level: High
- Why this matters: This table holds sensitive internal deletion records. RLS is off, so if browser-facing roles have read access, those rows could be exposed directly.

Recommended fix: Enable RLS, revoke any browser-facing grants that are not truly needed, and keep this table service-role-only or admin-only. This is an internal audit/workflow table, not a public app surface.
Breakage risk if changed incorrectly: admin deletion dashboards, deletion review tools, or overdue-deletion jobs could stop seeing rows they need.

### `public.public_listings_v`

Purpose: Public-facing listing feed. It appears to be the safe surface for homepage and listing pages so the app can read only listings that should be visible to the public.

Environment: Production

- Type: view
- Exists: Yes
- Approximate live row count: Unknown
- Owner: postgres
- In public schema / API-exposed schema: Yes
- RLS enabled: No
- View security mode: Security definer / default owner privileges
- Base tables: public.listings, public.businesses
- Grants summary: No explicit grants found in information_schema output
- Role access snapshot: anon read Yes, authenticated read Yes, service_role read Yes
- Risk level: Medium
- Why this matters: This view is intentionally public, but it runs with the owner’s privileges. That means it can bypass table protections if the definition drifts from the underlying RLS rules.

Recommended fix: Keep the view if public pages depend on it, but move toward `security_invoker` only after confirming the base-table RLS policies already express the exact same visibility rule: public users can see only published, verified, non-internal listings unless the viewer is internal.
Breakage risk if changed incorrectly: homepage listing blocks, `/listings`, business pages, and any internal preview flow could suddenly return too few rows or no rows at all.

### `public.user_public_profiles`

Purpose: Public profile card view. It exposes a small set of fields, mainly display name and avatar, for reviews, public profiles, and other customer-facing UI.

Environment: Production

- Type: view
- Exists: Yes
- Approximate live row count: Unknown
- Owner: postgres
- In public schema / API-exposed schema: Yes
- RLS enabled: No
- View security mode: Security definer / default owner privileges
- Base tables: public.users
- Grants summary: No explicit grants found in information_schema output
- Role access snapshot: anon read Yes, authenticated read Yes, service_role read Yes
- Risk level: Medium
- Why this matters: The exposed columns are narrow, which helps, but the view still runs with owner privileges. If private fields are added later by mistake, this could widen the public profile surface.

Recommended fix: Keep the public-safe surface, but consider either a dedicated `public_profiles` table or a `security_invoker` view backed by narrowly scoped public policies on the source table. Also verify the display name logic cannot accidentally expose email-style names or deleted-user remnants.
Breakage risk if changed incorrectly: reviews, reviewer names, avatars, and public business/profile UI could lose names or images for legitimate public content.

### `public.users`

Purpose: Core user account table. This is likely the source of private customer and business profile data, so it should stay tightly protected.

Environment: Production

- Type: table
- Exists: Yes
- Approximate live row count: 39
- Owner: postgres
- In public schema / API-exposed schema: Yes
- RLS enabled: Yes
- Grants summary: No explicit grants found in information_schema output
- Role access snapshot: anon read Yes, authenticated read Yes, service_role read Yes
- Policies: "Allow reading business profiles" (SELECT), "Participants can read user profiles" (SELECT), "Users can insert own row" (INSERT), "Users can read own data" (SELECT), "Users can update own data" (UPDATE)
- Risk level: Low
- Why this matters: No high-risk pattern stood out in the collected metadata for this object.

### `public.listings`

Purpose: Core listing table. This likely stores every listing, including drafts and internal/test entries, so visibility rules matter.

Environment: Production

- Type: table
- Exists: Yes
- Approximate live row count: 12
- Owner: postgres
- In public schema / API-exposed schema: Yes
- RLS enabled: Yes
- Grants summary: No explicit grants found in information_schema output
- Role access snapshot: anon read Yes, authenticated read Yes, service_role read Yes
- Policies: "Business owners can delete own listings" (DELETE), "Businesses can insert listings" (INSERT), "Businesses can read own listings" (SELECT), "Businesses can update own listings" (UPDATE), "Public can read verified listings" (SELECT)
- Risk level: Low
- Why this matters: No high-risk pattern stood out in the collected metadata for this object.

### `public.businesses`

Purpose: Core business table. This likely controls whether a business is verified and whether it should appear publicly.

Environment: Production

- Type: table
- Exists: Yes
- Approximate live row count: 8
- Owner: postgres
- In public schema / API-exposed schema: Yes
- RLS enabled: Yes
- Grants summary: No explicit grants found in information_schema output
- Role access snapshot: anon read Yes, authenticated read Yes, service_role read Yes
- Policies: "Businesses can insert own row" (INSERT), "Businesses can read own row" (SELECT), "Businesses can update own row" (UPDATE), "Public can read verified businesses" (SELECT)
- Risk level: Low
- Why this matters: No high-risk pattern stood out in the collected metadata for this object.

## Function Review

These helper functions matter because they decide whether someone counts as internal, whether someone counts as admin, and whether the deletion cleanup pipeline can run. Small helper functions can still create big access changes if many policies depend on them.

## Staging

### `public.viewer_can_see_internal_content()`

Environment: Staging

- Exists: Yes
- Returns: boolean
- Language: sql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Execute access: anon Yes, authenticated Yes, service_role Yes
- Plain-English behavior: checks whether the current signed-in user has `users.is_internal = true`. It does not appear to grant access by itself; it acts like a yes/no gate used by listing and business visibility logic.
- Risk note: because it is `SECURITY DEFINER`, it can read `public.users` even if that table is otherwise locked down. That is usually acceptable for a tiny boolean helper, as long as the function body stays simple and the search path remains pinned.

### `public.has_admin_role(text)`

Environment: Staging

- Exists: Yes
- Returns: boolean
- Language: plpgsql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Execute access: anon Yes, authenticated Yes, service_role Yes
- Plain-English behavior: admin helper used to decide whether a logged-in actor belongs to one or more admin groups. Other admin-only functions and policies rely on these answers.
- Risk note: if these helpers are too broadly executable or if their logic drifts, they can accidentally widen internal admin access across many features at once.

### `public.is_admin()`

Environment: Staging

- Exists: Yes
- Returns: boolean
- Language: sql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Execute access: anon Yes, authenticated Yes, service_role Yes
- Plain-English behavior: admin helper used to decide whether a logged-in actor belongs to one or more admin groups. Other admin-only functions and policies rely on these answers.
- Risk note: if these helpers are too broadly executable or if their logic drifts, they can accidentally widen internal admin access across many features at once.

### `public.is_admin_any_role(uuid, text[])`

Environment: Staging

- Exists: Yes
- Returns: boolean
- Language: sql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Execute access: anon Yes, authenticated Yes, service_role Yes
- Plain-English behavior: admin helper used to decide whether a logged-in actor belongs to one or more admin groups. Other admin-only functions and policies rely on these answers.
- Risk note: if these helpers are too broadly executable or if their logic drifts, they can accidentally widen internal admin access across many features at once.

### `public.invoke_finalize_overdue_deletions(text, integer)`

Environment: Staging

- Exists: Yes
- Returns: bigint
- Language: plpgsql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Plain-English behavior: part of the overdue account-deletion cleanup pipeline. These helpers appear to schedule or trigger the cleanup job rather than expose data publicly.
- Risk note: because these functions are `SECURITY DEFINER`, execution grants should stay narrow. They should not be callable by ordinary browser roles.

### `public.schedule_finalize_overdue_deletions_job(text)`

Environment: Staging

- Exists: Yes
- Returns: bigint
- Language: plpgsql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Plain-English behavior: part of the overdue account-deletion cleanup pipeline. These helpers appear to schedule or trigger the cleanup job rather than expose data publicly.
- Risk note: because these functions are `SECURITY DEFINER`, execution grants should stay narrow. They should not be callable by ordinary browser roles.

### `public.unschedule_finalize_overdue_deletions_job()`

Environment: Staging

- Exists: Yes
- Returns: integer
- Language: plpgsql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Plain-English behavior: part of the overdue account-deletion cleanup pipeline. These helpers appear to schedule or trigger the cleanup job rather than expose data publicly.
- Risk note: because these functions are `SECURITY DEFINER`, execution grants should stay narrow. They should not be callable by ordinary browser roles.

### `public.list_finalize_overdue_deletions_jobs()`

Environment: Staging

- Exists: Yes
- Returns: TABLE(jobid bigint, jobname text, schedule text, active boolean, command text)
- Language: sql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Plain-English behavior: part of the overdue account-deletion cleanup pipeline. These helpers appear to schedule or trigger the cleanup job rather than expose data publicly.
- Risk note: because these functions are `SECURITY DEFINER`, execution grants should stay narrow. They should not be callable by ordinary browser roles.

### `auth.uid()`

Environment: Staging

- Exists: Yes
- Returns: uuid
- Language: sql
- Security mode: SECURITY INVOKER / default
- Owner: supabase_auth_admin
- Search path: Not explicitly locked in function config
- Grants: No explicit grants found
- Execute access: anon Yes, authenticated Yes, service_role Yes

## Production

### `public.viewer_can_see_internal_content()`

Environment: Production

- Exists: Yes
- Returns: boolean
- Language: sql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Execute access: anon Yes, authenticated Yes, service_role Yes
- Plain-English behavior: checks whether the current signed-in user has `users.is_internal = true`. It does not appear to grant access by itself; it acts like a yes/no gate used by listing and business visibility logic.
- Risk note: because it is `SECURITY DEFINER`, it can read `public.users` even if that table is otherwise locked down. That is usually acceptable for a tiny boolean helper, as long as the function body stays simple and the search path remains pinned.

### `public.has_admin_role(text)`

Environment: Production

- Exists: Yes
- Returns: boolean
- Language: plpgsql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Execute access: anon Yes, authenticated Yes, service_role Yes
- Plain-English behavior: admin helper used to decide whether a logged-in actor belongs to one or more admin groups. Other admin-only functions and policies rely on these answers.
- Risk note: if these helpers are too broadly executable or if their logic drifts, they can accidentally widen internal admin access across many features at once.

### `public.is_admin()`

Environment: Production

- Exists: Yes
- Returns: boolean
- Language: sql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Execute access: anon Yes, authenticated Yes, service_role Yes
- Plain-English behavior: admin helper used to decide whether a logged-in actor belongs to one or more admin groups. Other admin-only functions and policies rely on these answers.
- Risk note: if these helpers are too broadly executable or if their logic drifts, they can accidentally widen internal admin access across many features at once.

### `public.is_admin_any_role(uuid, text[])`

Environment: Production

- Exists: Yes
- Returns: boolean
- Language: sql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Execute access: anon Yes, authenticated Yes, service_role Yes
- Plain-English behavior: admin helper used to decide whether a logged-in actor belongs to one or more admin groups. Other admin-only functions and policies rely on these answers.
- Risk note: if these helpers are too broadly executable or if their logic drifts, they can accidentally widen internal admin access across many features at once.

### `public.invoke_finalize_overdue_deletions(text, integer)`

Environment: Production

- Exists: Yes
- Returns: bigint
- Language: plpgsql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Plain-English behavior: part of the overdue account-deletion cleanup pipeline. These helpers appear to schedule or trigger the cleanup job rather than expose data publicly.
- Risk note: because these functions are `SECURITY DEFINER`, execution grants should stay narrow. They should not be callable by ordinary browser roles.

### `public.schedule_finalize_overdue_deletions_job(text)`

Environment: Production

- Exists: Yes
- Returns: bigint
- Language: plpgsql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Plain-English behavior: part of the overdue account-deletion cleanup pipeline. These helpers appear to schedule or trigger the cleanup job rather than expose data publicly.
- Risk note: because these functions are `SECURITY DEFINER`, execution grants should stay narrow. They should not be callable by ordinary browser roles.

### `public.unschedule_finalize_overdue_deletions_job()`

Environment: Production

- Exists: Yes
- Returns: integer
- Language: plpgsql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Plain-English behavior: part of the overdue account-deletion cleanup pipeline. These helpers appear to schedule or trigger the cleanup job rather than expose data publicly.
- Risk note: because these functions are `SECURITY DEFINER`, execution grants should stay narrow. They should not be callable by ordinary browser roles.

### `public.list_finalize_overdue_deletions_jobs()`

Environment: Production

- Exists: Yes
- Returns: TABLE(jobid bigint, jobname text, schedule text, active boolean, command text)
- Language: sql
- Security mode: SECURITY DEFINER
- Owner: postgres
- Search path: public
- Grants: No explicit grants found
- Plain-English behavior: part of the overdue account-deletion cleanup pipeline. These helpers appear to schedule or trigger the cleanup job rather than expose data publicly.
- Risk note: because these functions are `SECURITY DEFINER`, execution grants should stay narrow. They should not be callable by ordinary browser roles.

### `auth.uid()`

Environment: Production

- Exists: Yes
- Returns: uuid
- Language: sql
- Security mode: SECURITY INVOKER / default
- Owner: supabase_auth_admin
- Search path: Not explicitly locked in function config
- Grants: No explicit grants found
- Execute access: anon Yes, authenticated Yes, service_role Yes

## Recommended Fixes

1. `public.admin_account_deletions`
Enable RLS, remove any unnecessary `anon` or `authenticated` grants, and keep access limited to service-role or tightly scoped admin-only policies. This should behave like an internal operations table, not a public API table.

2. `public.public_listings_v`
Keep the view for now if public pages rely on it. Before switching to `security_invoker`, first confirm the base-table RLS rules on `public.listings` and `public.businesses` already produce the exact same result set for public users. Then test homepage, `/listings`, and any internal preview flow.

3. `public.user_public_profiles`
Keep the narrow public profile surface, but either move those fields into a dedicated public table or convert the view to `security_invoker` after adding carefully scoped public-read rules to the source table. Also check that display names never accidentally fall back to something that looks like an email address.

## Breakage Risk If Fixes Are Applied Incorrectly

- Homepage listing modules could go blank.
- `/listings` and public business pages could show too few results.
- Reviews could lose reviewer names or avatars.
- Internal/test listing previews could become public or disappear for internal staff.
- Admin account deletion workflows could lose access to audit rows or scheduled cleanup state.

## Verification Checklist For Future Migration

- Anonymous visitor can still load homepage listings and `/listings`.
- Anonymous visitor sees only verified, non-internal listings.
- Anonymous visitor cannot read private user fields from `public.users`.
- Authenticated customer can still see safe public profile names and avatars where intended.
- Business users do not gain access to `public.admin_account_deletions`.
- Admin users can still perform any intended deletion review or cleanup workflow.
- Internal/test content remains hidden from normal public traffic.
- Supabase lint warnings for these three items are cleared in staging first, then production.

## Technical Appendix: Staging

Project ref: `crskbfbleiubpkvyvvlf`
Project name: `yourbarrio-staging`
Latest applied migration version seen: `20260423110000`

### Object metadata: `public.admin_account_deletions`

```sql
{
  "object_name": "admin_account_deletions",
  "object_type": null,
  "exists": false,
  "owner": null,
  "rls_enabled": null,
  "force_rls": null,
  "reloptions": "",
  "definition": null
}
```

### Object metadata: `public.public_listings_v`

```sql
{
  "object_name": "public_listings_v",
  "object_type": "view",
  "exists": true,
  "owner": "postgres",
  "rls_enabled": false,
  "force_rls": false,
  "reloptions": "",
  "definition": " SELECT l.id,\n    l.business_id,\n    l.title,\n    l.description,\n    l.price,\n    l.category,\n    l.city,\n    l.photo_url,\n    l.created_at,\n    l.inventory_quantity,\n    l.inventory_status,\n    l.low_stock_threshold,\n    l.inventory_last_updated_at,\n    l.category_id,\n    l.public_id,\n    l.listing_category,\n    l.listing_subcategory,\n    l.pickup_enabled,\n    l.local_delivery_enabled,\n    l.delivery_fee_cents,\n    l.use_business_delivery_defaults,\n    l.photo_variants,\n    l.is_internal\n   FROM listings l\n     JOIN businesses b ON b.owner_user_id = l.business_id\n  WHERE (b.verification_status = ANY (ARRAY['auto_verified'::text, 'manually_verified'::text])) AND (COALESCE(l.is_internal, false) = false AND COALESCE(b.is_internal, false) = false OR viewer_can_see_internal_content());"
}
```

Definition:

```sql
SELECT l.id,
    l.business_id,
    l.title,
    l.description,
    l.price,
    l.category,
    l.city,
    l.photo_url,
    l.created_at,
    l.inventory_quantity,
    l.inventory_status,
    l.low_stock_threshold,
    l.inventory_last_updated_at,
    l.category_id,
    l.public_id,
    l.listing_category,
    l.listing_subcategory,
    l.pickup_enabled,
    l.local_delivery_enabled,
    l.delivery_fee_cents,
    l.use_business_delivery_defaults,
    l.photo_variants,
    l.is_internal
   FROM listings l
     JOIN businesses b ON b.owner_user_id = l.business_id
  WHERE (b.verification_status = ANY (ARRAY['auto_verified'::text, 'manually_verified'::text])) AND (COALESCE(l.is_internal, false) = false AND COALESCE(b.is_internal, false) = false OR viewer_can_see_internal_content());
```

### Object metadata: `public.user_public_profiles`

```sql
{
  "object_name": "user_public_profiles",
  "object_type": "view",
  "exists": true,
  "owner": "postgres",
  "rls_enabled": false,
  "force_rls": false,
  "reloptions": "security_invoker=false",
  "definition": " SELECT id AS user_id,\n        CASE\n            WHEN account_status = 'deleted'::text OR deleted_at IS NOT NULL OR anonymized_at IS NOT NULL THEN 'Deleted user'::text\n            ELSE COALESCE(NULLIF(btrim(full_name), ''::text), NULLIF(btrim(business_name), ''::text), 'User'::text)\n        END AS display_name,\n        CASE\n            WHEN account_status = 'deleted'::text OR deleted_at IS NOT NULL OR anonymized_at IS NOT NULL THEN NULL::text\n            ELSE NULLIF(btrim(profile_photo_url), ''::text)\n        END AS avatar_url\n   FROM users u;"
}
```

Definition:

```sql
SELECT id AS user_id,
        CASE
            WHEN account_status = 'deleted'::text OR deleted_at IS NOT NULL OR anonymized_at IS NOT NULL THEN 'Deleted user'::text
            ELSE COALESCE(NULLIF(btrim(full_name), ''::text), NULLIF(btrim(business_name), ''::text), 'User'::text)
        END AS display_name,
        CASE
            WHEN account_status = 'deleted'::text OR deleted_at IS NOT NULL OR anonymized_at IS NOT NULL THEN NULL::text
            ELSE NULLIF(btrim(profile_photo_url), ''::text)
        END AS avatar_url
   FROM users u;
```

### Object metadata: `public.users`

```sql
{
  "object_name": "users",
  "object_type": "table",
  "exists": true,
  "owner": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "reloptions": "",
  "definition": null
}
```

Policies:

```sql
{
  "schemaname": "public",
  "tablename": "users",
  "policyname": "Allow reading business profiles",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(role = 'business'::text)",
  "with_check": null
}
```

```sql
{
  "schemaname": "public",
  "tablename": "users",
  "policyname": "Participants can read user profiles",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(EXISTS ( SELECT 1\n   FROM conversations c\n  WHERE (((c.customer_id = users.id) AND (c.business_id = auth.uid())) OR ((c.business_id = users.id) AND (c.customer_id = auth.uid())))))",
  "with_check": null
}
```

```sql
{
  "schemaname": "public",
  "tablename": "users",
  "policyname": "Users can insert own row",
  "permissive": "PERMISSIVE",
  "roles": "{public}",
  "cmd": "INSERT",
  "qual": null,
  "with_check": "(auth.uid() = id)"
}
```

```sql
{
  "schemaname": "public",
  "tablename": "users",
  "policyname": "Users can read own data",
  "permissive": "PERMISSIVE",
  "roles": "{public}",
  "cmd": "SELECT",
  "qual": "(auth.uid() = id)",
  "with_check": null
}
```

```sql
{
  "schemaname": "public",
  "tablename": "users",
  "policyname": "Users can update own data",
  "permissive": "PERMISSIVE",
  "roles": "{public}",
  "cmd": "UPDATE",
  "qual": "(auth.uid() = id)",
  "with_check": "(auth.uid() = id)"
}
```

### Object metadata: `public.listings`

```sql
{
  "object_name": "listings",
  "object_type": "table",
  "exists": true,
  "owner": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "reloptions": "",
  "definition": null
}
```

Policies:

```sql
{
  "schemaname": "public",
  "tablename": "listings",
  "policyname": "Business owners can delete own listings",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "DELETE",
  "qual": "(auth.uid() = business_id)",
  "with_check": null
}
```

```sql
{
  "schemaname": "public",
  "tablename": "listings",
  "policyname": "Businesses can insert listings",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "INSERT",
  "qual": null,
  "with_check": "(auth.uid() = business_id)"
}
```

```sql
{
  "schemaname": "public",
  "tablename": "listings",
  "policyname": "Businesses can read own listings",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(auth.uid() = business_id)",
  "with_check": null
}
```

```sql
{
  "schemaname": "public",
  "tablename": "listings",
  "policyname": "Businesses can update own listings",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "UPDATE",
  "qual": "(auth.uid() = business_id)",
  "with_check": null
}
```

```sql
{
  "schemaname": "public",
  "tablename": "listings",
  "policyname": "Public can read verified listings",
  "permissive": "PERMISSIVE",
  "roles": "{anon,authenticated}",
  "cmd": "SELECT",
  "qual": "(EXISTS ( SELECT 1\n   FROM businesses b\n  WHERE ((b.owner_user_id = listings.business_id) AND (b.verification_status = ANY (ARRAY['auto_verified'::text, 'manually_verified'::text])) AND (((COALESCE(listings.is_internal, false) = false) AND (COALESCE(b.is_internal, false) = false)) OR viewer_can_see_internal_content()))))",
  "with_check": null
}
```

### Object metadata: `public.businesses`

```sql
{
  "object_name": "businesses",
  "object_type": "table",
  "exists": true,
  "owner": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "reloptions": "",
  "definition": null
}
```

Policies:

```sql
{
  "schemaname": "public",
  "tablename": "businesses",
  "policyname": "Businesses can insert own row",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "INSERT",
  "qual": null,
  "with_check": "(auth.uid() = owner_user_id)"
}
```

```sql
{
  "schemaname": "public",
  "tablename": "businesses",
  "policyname": "Businesses can read own row",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(auth.uid() = owner_user_id)",
  "with_check": null
}
```

```sql
{
  "schemaname": "public",
  "tablename": "businesses",
  "policyname": "Businesses can update own row",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "UPDATE",
  "qual": "(auth.uid() = owner_user_id)",
  "with_check": "(auth.uid() = owner_user_id)"
}
```

```sql
{
  "schemaname": "public",
  "tablename": "businesses",
  "policyname": "Public can read verified businesses",
  "permissive": "PERMISSIVE",
  "roles": "{anon,authenticated}",
  "cmd": "SELECT",
  "qual": "((verification_status = ANY (ARRAY['auto_verified'::text, 'manually_verified'::text])) AND ((COALESCE(is_internal, false) = false) OR viewer_can_see_internal_content()))",
  "with_check": null
}
```

### Function definitions

#### `auth.uid()`

```sql
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$
```

#### `public.has_admin_role(text)`

```sql
CREATE OR REPLACE FUNCTION public.has_admin_role(required_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id uuid;
  required_rank integer;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;

  required_rank := public.admin_role_rank(required_role);
  IF required_rank < 0 THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.admin_role_members arm
    JOIN public.admin_roles ar ON ar.role_key = arm.role_key
    WHERE arm.user_id = current_user_id
      AND ar.role_rank >= required_rank
  ) THEN
    RETURN true;
  END IF;

  IF required_role = 'admin_readonly' AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = current_user_id
      AND (u.role = 'admin' OR COALESCE(u.is_internal, false) = true)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$
```

#### `public.invoke_finalize_overdue_deletions(text, integer)`

```sql
CREATE OR REPLACE FUNCTION public.invoke_finalize_overdue_deletions(p_source text DEFAULT 'pg_cron'::text, p_limit integer DEFAULT 25)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_project_url text;
  v_bearer_token text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret
  INTO v_project_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url'
  LIMIT 1;

  SELECT decrypted_secret
  INTO v_bearer_token
  FROM vault.decrypted_secrets
  WHERE name = 'account_deletion_finalizer_token'
  LIMIT 1;

  IF v_project_url IS NULL OR btrim(v_project_url) = '' THEN
    RAISE EXCEPTION 'Missing Vault secret "project_url"';
  END IF;

  IF v_bearer_token IS NULL OR btrim(v_bearer_token) = '' THEN
    RAISE EXCEPTION 'Missing Vault secret "account_deletion_finalizer_token"';
  END IF;

  SELECT net.http_post(
    url := regexp_replace(v_project_url, '/+$', '') || '/functions/v1/finalize-overdue-deletions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_bearer_token
    ),
    body := jsonb_build_object(
      'source', COALESCE(NULLIF(btrim(p_source), ''), 'pg_cron'),
      'limit', GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
    )
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$function$
```

#### `public.is_admin()`

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_role_members arm
    WHERE arm.user_id = auth.uid()
      AND arm.role_key IN ('admin_readonly', 'admin_support', 'admin_ops', 'admin_super')
  );
$function$
```

#### `public.is_admin_any_role(uuid, text[])`

```sql
CREATE OR REPLACE FUNCTION public.is_admin_any_role(p_user_id uuid, p_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
        SELECT EXISTS (
          SELECT 1
          FROM public.admin_role_members m
          WHERE m.user_id = p_user_id
            AND m.role_key = ANY (p_roles)
        );
      $function$
```

#### `public.list_finalize_overdue_deletions_jobs()`

```sql
CREATE OR REPLACE FUNCTION public.list_finalize_overdue_deletions_jobs()
 RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean, command text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    jobid,
    jobname,
    schedule,
    active,
    command
  FROM cron.job
  WHERE jobname = 'finalize-overdue-deletions-daily'
  ORDER BY jobid DESC;
$function$
```

#### `public.schedule_finalize_overdue_deletions_job(text)`

```sql
CREATE OR REPLACE FUNCTION public.schedule_finalize_overdue_deletions_job(p_schedule text DEFAULT '0 3 * * *'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job_id bigint;
BEGIN
  PERFORM public.unschedule_finalize_overdue_deletions_job();

  SELECT cron.schedule(
    'finalize-overdue-deletions-daily',
    p_schedule,
    $cron$SELECT public.invoke_finalize_overdue_deletions('pg_cron', 25);$cron$
  )
  INTO v_job_id;

  RETURN v_job_id;
END;
$function$
```

#### `public.unschedule_finalize_overdue_deletions_job()`

```sql
CREATE OR REPLACE FUNCTION public.unschedule_finalize_overdue_deletions_job()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job record;
  v_removed integer := 0;
BEGIN
  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'finalize-overdue-deletions-daily'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
    v_removed := v_removed + 1;
  END LOOP;

  RETURN v_removed;
END;
$function$
```

#### `public.viewer_can_see_internal_content()`

```sql
CREATE OR REPLACE FUNCTION public.viewer_can_see_internal_content()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND COALESCE(u.is_internal, false) = true
  );
$function$
```

### Migration inventory

```sql
001 admin_platform_core
002 admin_platform_rls
003 admin_account_detail_rpc
20251205204210 init
20251206202000 create_businesses
20251207090000 add_messaging
20251208090000 add_inventory_quantity
20251208110000 add_inventory_status_fields
20251209090000 add_inventory_jobs_and_indexes
20260107120000 optimize_message_indexes
20260108120000 add_business_views
20260109120000 add_cart_and_orders
20260109140000 add_vendor_members_and_notifications
20260110100000 add_user_address_fields
20260131123000 business_categories
20260207143000 admin_audit_overloads
20260208153000 admin_list_users_rpc
20260208170000 impersonation_target_role_rpc
20260208182000 fix_impersonation_session_admin_gate
20260208190000 admin_dashboard_user_metrics
20260209103000 admin_list_accounts_rpc
20260209114000 fix_admin_list_accounts_internal_semantics
20260209115000 fix_admin_total_users_count_accounts
20260210101500 admin_rbac_cleanup
20260211110000 moderation_reporting_system
20260211123000 public_ids_and_refs
20260211130000 resolve_business_ref
20260211143000 moderation_action_hardening
20260212103000 admin_list_accounts_uuid_search
20260214045400 fix_businesses_upsert_conflict
20260214120000 create_businesses
20260214121000 backfill_businesses
20260214133000 public_verified_businesses_select_policy
20260214143000 listings_public_visibility_verified
20260215120000 create_business_from_onboarding_rpc
20260218120000 admin_user_notes
20260218150000 admin_user_notes_edit_delete
20260218153000 fix_admin_user_note_rpc_id_ambiguity
20260219110000 admin_list_audit_logs
20260219113000 admin_list_user_audit_activity
20260222110000 feature_flags_customer_nearby_public
20260222123000 order_status_events
20260224101000 fix_listings_public_id_generation
20260225110000 sync_business_photos_from_users
20260225120000 standardize_business_owner_user_id
20260225123000 add_set_my_role_business_rpc
20260307120000 account_soft_delete_lifecycle
20260313120000 add_password_set_to_users
20260327120000 normalize_state_codes
20260329120000 split_business_and_listing_taxonomy
20260405120000 add_stripe_marketplace_fields
20260405203000 enable_realtime_for_notifications
20260407103000 enable_realtime_for_messaging
20260410113000 launch_category_taxonomy_cleanup
20260410121500 archive_and_prune_inactive_business_categories
20260410130000 cleanup_fake_legacy_category_listings
20260410143000 normalize_listing_taxonomy
20260411153000 create_user_public_profiles_view
20260411170000 soft_delete_finalize_anonymization
20260411183000 schedule_finalize_overdue_deletions
20260413100000 add_order_notification_pipeline
20260414120000 add_twilio_provider_status_fields
20260415110000 add_listing_business_fulfillment
20260415143000 add_listing_photo_variants
20260419120000 atomic_listing_inventory_reservations
20260419123000 add_order_status_message_metadata
20260420100000 create_saved_businesses
20260420113000 block_business_saves
20260422120000 auth_user_profile_provisioning
20260423110000 internal_visibility_semantics
```

## Technical Appendix: Production

Project ref: `nbzqnjanqkzuwyxnkjtr`
Project name: `n-alzein's Project`
Latest applied migration version seen: `20260423110000`

### Object metadata: `public.admin_account_deletions`

```sql
{
  "object_name": "admin_account_deletions",
  "object_type": "table",
  "exists": true,
  "owner": "postgres",
  "rls_enabled": false,
  "force_rls": false,
  "reloptions": "",
  "definition": null
}
```

### Object metadata: `public.public_listings_v`

```sql
{
  "object_name": "public_listings_v",
  "object_type": "view",
  "exists": true,
  "owner": "postgres",
  "rls_enabled": false,
  "force_rls": false,
  "reloptions": "",
  "definition": " SELECT l.id,\n    l.business_id,\n    l.title,\n    l.description,\n    l.price,\n    l.category,\n    l.city,\n    l.photo_url,\n    l.created_at,\n    l.is_test,\n    l.inventory_quantity,\n    l.inventory_status,\n    l.low_stock_threshold,\n    l.inventory_last_updated_at,\n    l.category_id,\n    l.public_id,\n    l.listing_category,\n    l.listing_subcategory,\n    l.pickup_enabled,\n    l.local_delivery_enabled,\n    l.delivery_fee_cents,\n    l.use_business_delivery_defaults,\n    l.photo_variants,\n    l.is_internal\n   FROM listings l\n     JOIN businesses b ON b.owner_user_id = l.business_id\n  WHERE (b.verification_status = ANY (ARRAY['auto_verified'::text, 'manually_verified'::text])) AND (COALESCE(l.is_internal, false) = false AND COALESCE(b.is_internal, false) = false OR viewer_can_see_internal_content());"
}
```

Definition:

```sql
SELECT l.id,
    l.business_id,
    l.title,
    l.description,
    l.price,
    l.category,
    l.city,
    l.photo_url,
    l.created_at,
    l.is_test,
    l.inventory_quantity,
    l.inventory_status,
    l.low_stock_threshold,
    l.inventory_last_updated_at,
    l.category_id,
    l.public_id,
    l.listing_category,
    l.listing_subcategory,
    l.pickup_enabled,
    l.local_delivery_enabled,
    l.delivery_fee_cents,
    l.use_business_delivery_defaults,
    l.photo_variants,
    l.is_internal
   FROM listings l
     JOIN businesses b ON b.owner_user_id = l.business_id
  WHERE (b.verification_status = ANY (ARRAY['auto_verified'::text, 'manually_verified'::text])) AND (COALESCE(l.is_internal, false) = false AND COALESCE(b.is_internal, false) = false OR viewer_can_see_internal_content());
```

### Object metadata: `public.user_public_profiles`

```sql
{
  "object_name": "user_public_profiles",
  "object_type": "view",
  "exists": true,
  "owner": "postgres",
  "rls_enabled": false,
  "force_rls": false,
  "reloptions": "security_invoker=false",
  "definition": " SELECT id AS user_id,\n        CASE\n            WHEN account_status = 'deleted'::text OR deleted_at IS NOT NULL OR anonymized_at IS NOT NULL THEN 'Deleted user'::text\n            ELSE COALESCE(NULLIF(btrim(full_name), ''::text), NULLIF(btrim(business_name), ''::text), 'User'::text)\n        END AS display_name,\n        CASE\n            WHEN account_status = 'deleted'::text OR deleted_at IS NOT NULL OR anonymized_at IS NOT NULL THEN NULL::text\n            ELSE NULLIF(btrim(profile_photo_url), ''::text)\n        END AS avatar_url\n   FROM users u;"
}
```

Definition:

```sql
SELECT id AS user_id,
        CASE
            WHEN account_status = 'deleted'::text OR deleted_at IS NOT NULL OR anonymized_at IS NOT NULL THEN 'Deleted user'::text
            ELSE COALESCE(NULLIF(btrim(full_name), ''::text), NULLIF(btrim(business_name), ''::text), 'User'::text)
        END AS display_name,
        CASE
            WHEN account_status = 'deleted'::text OR deleted_at IS NOT NULL OR anonymized_at IS NOT NULL THEN NULL::text
            ELSE NULLIF(btrim(profile_photo_url), ''::text)
        END AS avatar_url
   FROM users u;
```

### Object metadata: `public.users`

```sql
{
  "object_name": "users",
  "object_type": "table",
  "exists": true,
  "owner": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "reloptions": "",
  "definition": null
}
```

Policies:

```sql
{
  "schemaname": "public",
  "tablename": "users",
  "policyname": "Allow reading business profiles",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(role = 'business'::text)",
  "with_check": null
}
```

```sql
{
  "schemaname": "public",
  "tablename": "users",
  "policyname": "Participants can read user profiles",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(EXISTS ( SELECT 1\n   FROM conversations c\n  WHERE (((c.customer_id = users.id) AND (c.business_id = auth.uid())) OR ((c.business_id = users.id) AND (c.customer_id = auth.uid())))))",
  "with_check": null
}
```

```sql
{
  "schemaname": "public",
  "tablename": "users",
  "policyname": "Users can insert own row",
  "permissive": "PERMISSIVE",
  "roles": "{public}",
  "cmd": "INSERT",
  "qual": null,
  "with_check": "(auth.uid() = id)"
}
```

```sql
{
  "schemaname": "public",
  "tablename": "users",
  "policyname": "Users can read own data",
  "permissive": "PERMISSIVE",
  "roles": "{public}",
  "cmd": "SELECT",
  "qual": "(auth.uid() = id)",
  "with_check": null
}
```

```sql
{
  "schemaname": "public",
  "tablename": "users",
  "policyname": "Users can update own data",
  "permissive": "PERMISSIVE",
  "roles": "{public}",
  "cmd": "UPDATE",
  "qual": "(auth.uid() = id)",
  "with_check": "(auth.uid() = id)"
}
```

### Object metadata: `public.listings`

```sql
{
  "object_name": "listings",
  "object_type": "table",
  "exists": true,
  "owner": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "reloptions": "",
  "definition": null
}
```

Policies:

```sql
{
  "schemaname": "public",
  "tablename": "listings",
  "policyname": "Business owners can delete own listings",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "DELETE",
  "qual": "(auth.uid() = business_id)",
  "with_check": null
}
```

```sql
{
  "schemaname": "public",
  "tablename": "listings",
  "policyname": "Businesses can insert listings",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "INSERT",
  "qual": null,
  "with_check": "(auth.uid() = business_id)"
}
```

```sql
{
  "schemaname": "public",
  "tablename": "listings",
  "policyname": "Businesses can read own listings",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(auth.uid() = business_id)",
  "with_check": null
}
```

```sql
{
  "schemaname": "public",
  "tablename": "listings",
  "policyname": "Businesses can update own listings",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "UPDATE",
  "qual": "(auth.uid() = business_id)",
  "with_check": null
}
```

```sql
{
  "schemaname": "public",
  "tablename": "listings",
  "policyname": "Public can read verified listings",
  "permissive": "PERMISSIVE",
  "roles": "{anon,authenticated}",
  "cmd": "SELECT",
  "qual": "(EXISTS ( SELECT 1\n   FROM businesses b\n  WHERE ((b.owner_user_id = listings.business_id) AND (b.verification_status = ANY (ARRAY['auto_verified'::text, 'manually_verified'::text])) AND (((COALESCE(listings.is_internal, false) = false) AND (COALESCE(b.is_internal, false) = false)) OR viewer_can_see_internal_content()))))",
  "with_check": null
}
```

### Object metadata: `public.businesses`

```sql
{
  "object_name": "businesses",
  "object_type": "table",
  "exists": true,
  "owner": "postgres",
  "rls_enabled": true,
  "force_rls": false,
  "reloptions": "",
  "definition": null
}
```

Policies:

```sql
{
  "schemaname": "public",
  "tablename": "businesses",
  "policyname": "Businesses can insert own row",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "INSERT",
  "qual": null,
  "with_check": "(auth.uid() = owner_user_id)"
}
```

```sql
{
  "schemaname": "public",
  "tablename": "businesses",
  "policyname": "Businesses can read own row",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "SELECT",
  "qual": "(auth.uid() = owner_user_id)",
  "with_check": null
}
```

```sql
{
  "schemaname": "public",
  "tablename": "businesses",
  "policyname": "Businesses can update own row",
  "permissive": "PERMISSIVE",
  "roles": "{authenticated}",
  "cmd": "UPDATE",
  "qual": "(auth.uid() = owner_user_id)",
  "with_check": "(auth.uid() = owner_user_id)"
}
```

```sql
{
  "schemaname": "public",
  "tablename": "businesses",
  "policyname": "Public can read verified businesses",
  "permissive": "PERMISSIVE",
  "roles": "{anon,authenticated}",
  "cmd": "SELECT",
  "qual": "((verification_status = ANY (ARRAY['auto_verified'::text, 'manually_verified'::text])) AND ((COALESCE(is_internal, false) = false) OR viewer_can_see_internal_content()))",
  "with_check": null
}
```

### Function definitions

#### `auth.uid()`

```sql
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$
```

#### `public.has_admin_role(text)`

```sql
CREATE OR REPLACE FUNCTION public.has_admin_role(required_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id uuid;
  required_rank integer;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;

  required_rank := public.admin_role_rank(required_role);
  IF required_rank < 0 THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.admin_role_members arm
    JOIN public.admin_roles ar ON ar.role_key = arm.role_key
    WHERE arm.user_id = current_user_id
      AND ar.role_rank >= required_rank
  ) THEN
    RETURN true;
  END IF;

  -- fallback: app-level admin markers get readonly
  IF required_role = 'admin_readonly' AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = current_user_id
      AND (u.role = 'admin' OR COALESCE(u.is_internal, false) = true)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$
```

#### `public.invoke_finalize_overdue_deletions(text, integer)`

```sql
CREATE OR REPLACE FUNCTION public.invoke_finalize_overdue_deletions(p_source text DEFAULT 'pg_cron'::text, p_limit integer DEFAULT 25)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_project_url text;
  v_bearer_token text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret
  INTO v_project_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url'
  LIMIT 1;

  SELECT decrypted_secret
  INTO v_bearer_token
  FROM vault.decrypted_secrets
  WHERE name = 'account_deletion_finalizer_token'
  LIMIT 1;

  IF v_project_url IS NULL OR btrim(v_project_url) = '' THEN
    RAISE EXCEPTION 'Missing Vault secret "project_url"';
  END IF;

  IF v_bearer_token IS NULL OR btrim(v_bearer_token) = '' THEN
    RAISE EXCEPTION 'Missing Vault secret "account_deletion_finalizer_token"';
  END IF;

  SELECT net.http_post(
    url := regexp_replace(v_project_url, '/+$', '') || '/functions/v1/finalize-overdue-deletions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_bearer_token
    ),
    body := jsonb_build_object(
      'source', COALESCE(NULLIF(btrim(p_source), ''), 'pg_cron'),
      'limit', GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
    )
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$function$
```

#### `public.is_admin()`

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_role_members arm
    WHERE arm.user_id = auth.uid()
      AND arm.role_key IN ('admin_readonly', 'admin_support', 'admin_ops', 'admin_super')
  );
$function$
```

#### `public.is_admin_any_role(uuid, text[])`

```sql
CREATE OR REPLACE FUNCTION public.is_admin_any_role(p_user_id uuid, p_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
        SELECT EXISTS (
          SELECT 1
          FROM public.admin_role_members m
          WHERE m.user_id = p_user_id
            AND m.role_key = ANY (p_roles)
        );
      $function$
```

#### `public.list_finalize_overdue_deletions_jobs()`

```sql
CREATE OR REPLACE FUNCTION public.list_finalize_overdue_deletions_jobs()
 RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean, command text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    jobid,
    jobname,
    schedule,
    active,
    command
  FROM cron.job
  WHERE jobname = 'finalize-overdue-deletions-daily'
  ORDER BY jobid DESC;
$function$
```

#### `public.schedule_finalize_overdue_deletions_job(text)`

```sql
CREATE OR REPLACE FUNCTION public.schedule_finalize_overdue_deletions_job(p_schedule text DEFAULT '0 3 * * *'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job_id bigint;
BEGIN
  PERFORM public.unschedule_finalize_overdue_deletions_job();

  SELECT cron.schedule(
    'finalize-overdue-deletions-daily',
    p_schedule,
    $cron$SELECT public.invoke_finalize_overdue_deletions('pg_cron', 25);$cron$
  )
  INTO v_job_id;

  RETURN v_job_id;
END;
$function$
```

#### `public.unschedule_finalize_overdue_deletions_job()`

```sql
CREATE OR REPLACE FUNCTION public.unschedule_finalize_overdue_deletions_job()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job record;
  v_removed integer := 0;
BEGIN
  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'finalize-overdue-deletions-daily'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
    v_removed := v_removed + 1;
  END LOOP;

  RETURN v_removed;
END;
$function$
```

#### `public.viewer_can_see_internal_content()`

```sql
CREATE OR REPLACE FUNCTION public.viewer_can_see_internal_content()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND COALESCE(u.is_internal, false) = true
  );
$function$
```

### Migration inventory

```sql
001 admin_platform_core
002 admin_platform_rls
003 admin_account_detail_rpc
20251205204210 init
20251206202000 create_businesses
20251207090000 add_messaging
20251208090000 add_inventory_quantity
20251208110000 add_inventory_status_fields
20251209090000 add_inventory_jobs_and_indexes
20260107120000 optimize_message_indexes
20260108120000 add_business_views
20260109120000 add_cart_and_orders
20260109140000 add_vendor_members_and_notifications
20260110100000 add_user_address_fields
20260131123000 business_categories
20260207143000 admin_audit_overloads
20260208153000 admin_list_users_rpc
20260208170000 impersonation_target_role_rpc
20260208182000 fix_impersonation_session_admin_gate
20260208190000 admin_dashboard_user_metrics
20260209103000 admin_list_accounts_rpc
20260209114000 fix_admin_list_accounts_internal_semantics
20260209115000 fix_admin_total_users_count_accounts
20260210101500 admin_rbac_cleanup
20260211110000 moderation_reporting_system
20260211123000 public_ids_and_refs
20260211130000 resolve_business_ref
20260211143000 moderation_action_hardening
20260212103000 admin_list_accounts_uuid_search
20260214045400 fix_businesses_upsert_conflict
20260214120000 create_businesses
20260214121000 backfill_businesses
20260214133000 public_verified_businesses_select_policy
20260214143000 listings_public_visibility_verified
20260215120000 create_business_from_onboarding_rpc
20260218120000 admin_user_notes
20260218150000 admin_user_notes_edit_delete
20260218153000 fix_admin_user_note_rpc_id_ambiguity
20260219110000 admin_list_audit_logs
20260219113000 admin_list_user_audit_activity
20260222110000 feature_flags_customer_nearby_public
20260222123000 order_status_events
20260224101000 fix_listings_public_id_generation
20260225110000 sync_business_photos_from_users
20260225120000 standardize_business_owner_user_id
20260225123000 add_set_my_role_business_rpc
20260307120000 account_soft_delete_lifecycle
20260313120000 add_password_set_to_users
20260327120000 normalize_state_codes
20260329120000 split_business_and_listing_taxonomy
20260405120000 add_stripe_marketplace_fields
20260405203000 enable_realtime_for_notifications
20260407103000 enable_realtime_for_messaging
20260410113000 launch_category_taxonomy_cleanup
20260410121500 archive_and_prune_inactive_business_categories
20260410130000 cleanup_fake_legacy_category_listings
20260410143000 normalize_listing_taxonomy
20260411153000 create_user_public_profiles_view
20260411170000 soft_delete_finalize_anonymization
20260411183000 schedule_finalize_overdue_deletions
20260413100000 add_order_notification_pipeline
20260414120000 add_twilio_provider_status_fields
20260415110000 add_listing_business_fulfillment
20260415143000 add_listing_photo_variants
20260419120000 atomic_listing_inventory_reservations
20260419123000 add_order_status_message_metadata
20260420100000 create_saved_businesses
20260420113000 block_business_saves
20260422120000 auth_user_profile_provisioning
20260423110000 internal_visibility_semantics
```
