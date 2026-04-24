# Supabase RLS Remediation Plan

Generated: 2026-04-24

## Goal

Resolve the clearly safe Supabase security findings in staging first, without breaking public pages, and prepare the remaining higher-risk items for a deliberate production rollout.

## Current state

### Confirmed from the audit and migration review

- `public.admin_account_deletions` exists in production but not in staging.
- The repo migration history does **not** create `public.admin_account_deletions`.
- Both staging and production show the same applied migration versions through `20260423110000`, which means the table drift is not explained by a missing repo migration.
- The most likely explanation is a production-only manual change or an out-of-band SQL change that never made it into the repo.
- `public.admin_account_deletions` is not referenced by app code in this repo. That makes it a good first hardening target because there is low public-page breakage risk.
- `public.public_listings_v` is heavily used by guest-facing homepage/listing flows.
- `public.user_public_profiles` is used by review rendering for reviewer display names and avatars.

### Implication

The repo has three different categories of work:

1. Safe internal-object cleanup now:
`public.admin_account_deletions` and the maintenance functions.

2. Public view hardening that can be staged and tested:
`public.public_listings_v`.

3. Public view lint that should **not** be “fixed” by widening table access:
`public.user_public_profiles`.

## Phase decisions

### Phase 1: parity restore for `public.admin_account_deletions`

Decision:
Create a migration that recreates the production table shape in staging only if it is missing.

Why:

- The table is real in production.
- It is not represented in repo migrations.
- Recreating the production shape in an idempotent migration is the lowest-risk way to remove drift.

Production table shape used as source of truth:

- `id uuid not null default gen_random_uuid()`
- `user_id uuid null`
- `deleted_at timestamptz null default now()`
- `source text null`
- primary key on `id`

### Phase 2: lock down `public.admin_account_deletions`

Decision:
Enable RLS and remove browser-role access.

Why:

- This is an internal audit/workflow table.
- No app code currently appears to query it directly.
- Default browser access is unnecessary risk.

Staged behavior:

- RLS enabled
- `anon` revoked
- `authenticated` revoked
- `service_role` explicitly retained
- no admin read/write policy added for now because current code does not show a direct usage path

Rollback note:

- If an internal admin flow unexpectedly fails in staging, temporarily grant a narrow admin-only `SELECT` policy rather than reopening browser-wide access.

### Phase 3: `public.public_listings_v`

Decision:
Test `security_invoker = true` in staging only.

Why:

- This view is intentionally public.
- The underlying `public.listings` and `public.businesses` tables already have public-read RLS policies that closely mirror the view filter.
- This is the lint item most likely to be safely removable without widening data exposure.

Important schema note:

- Production `public.listings` has `is_test`.
- Staging `public.listings` does not.
- The migration therefore uses conditional view SQL so staging keeps its current column surface while production would preserve `is_test` when eventually promoted.

Expected risk:

- Medium. This view powers homepage/listings behavior, so it must be tested after the staging migration.

Rollback note:

- Recreate the same view definition with `ALTER VIEW ... SET (security_invoker = false)` if guest-facing queries regress.

### Phase 4: `public.user_public_profiles`

Decision:
Do **not** convert this view to `security_invoker` yet.

Why:

- The app depends on it for review author names/avatars.
- `public.users` is not a fully public-safe table.
- Flipping the view to invoker mode without a dedicated public profile table or carefully scoped table policies is more likely to break reviews than to improve safety.

Chosen interim action:

- Keep the view owner-privileged for now.
- Harden the display-name logic so email-looking names are downgraded to `User`.
- Leave a documented follow-up to consider a dedicated `public_profiles` table.

### Phase 5: function grant hardening

Decision:
Revoke browser execution from the four deletion-maintenance functions only.

Safe revokes:

- `public.invoke_finalize_overdue_deletions(text, integer)`
- `public.schedule_finalize_overdue_deletions_job(text)`
- `public.unschedule_finalize_overdue_deletions_job()`
- `public.list_finalize_overdue_deletions_jobs()`

Not changed yet:

- `public.has_admin_role(text)`
- `public.is_admin()`
- `public.is_admin_any_role(uuid, text[])`
- `public.viewer_can_see_internal_content()`

Why:

- These helpers are used by existing policies and public-view logic.
- Revoking them needs a more careful dependency review than this staging hardening pass.

## Staging execution order

1. Apply parity migration for `public.admin_account_deletions`.
2. Apply hardening migration for that table and the maintenance-function execute revokes.
3. Apply the `public_listings_v` security-invoker migration in staging.
4. Apply `user_public_profiles` display-name hardening.
5. Apply a follow-up ACL migration if explicit browser-role execute grants still exist on the maintenance functions.
6. Run verification SQL and guest-facing smoke checks against staging.

## Verification targets

- `public.admin_account_deletions` exists in staging and matches the intended production shape.
- `public.admin_account_deletions` has RLS enabled.
- `anon` cannot read `public.admin_account_deletions`.
- `authenticated` cannot read `public.admin_account_deletions`.
- `service_role` can still access `public.admin_account_deletions`.
- Browser roles can no longer execute the four deletion-maintenance functions.
- Guest reads from `public_listings_v` still work in staging after `security_invoker = true`.
- Homepage/listing API paths still return public data in staging.
- `user_public_profiles` still returns safe reviewer names and avatars, with email-looking names suppressed.

## Production rollout posture

No production writes were performed in this pass.

Production should only be updated after:

- staging migration application succeeds
- guest smoke checks pass
- `public_listings_v` behavior matches expectations
- no internal admin/deletion regression is observed in staging

## Expected outcome after staging pass

- The high-confidence internal exposure risk is addressed.
- The public listings lint is either resolved in staging or rolled back quickly if it regresses.
- The public profile lint remains intentionally open, but with a safer display-name rule and a documented path forward.

## Staging execution results

Completed in staging on 2026-04-24:

- Applied `20260424101000_restore_admin_account_deletions_parity.sql`
- Applied `20260424102000_harden_admin_account_deletions_and_maintenance_functions.sql`
- Applied `20260424103000_public_listings_view_security_invoker.sql`
- Applied `20260424104000_harden_user_public_profiles_display_name.sql`
- Applied follow-up ACL fix `20260424105000_revoke_browser_execute_on_maintenance_functions.sql`

Observed staging outcomes:

- `public.admin_account_deletions` now exists in staging with the expected four-column production shape.
- `public.admin_account_deletions` now has RLS enabled.
- Anonymous reads to `public.admin_account_deletions` now fail with `401 / permission denied`.
- `public.public_listings_v` now shows `security_invoker=true` in staging metadata.
- Guest access to `public.public_listings_v` still works in staging, and the anonymous exact-count baseline stayed at 4 rows before and after the change.
- `public.user_public_profiles` remains `security_invoker=false` intentionally.
- Email-looking display names in `public.user_public_profiles` verified as `0` rows after hardening.
- The four maintenance functions now have ACLs reduced to `postgres` and `service_role` only.

Guest-facing smoke checks run against the staging-backed local app:

- `GET /api/home-listings?city=Long%20Beach&state=CA&limit=5` returned `200` with `x-home-listings-count: 4`
- `GET /listings` returned `200`
- `GET /b/eaca122466` returned `200`

Outstanding production follow-up:

- Production still has not received these migrations.
- `public.user_public_profiles` still has an open lint warning by design until a dedicated public-profile table or a more deliberate policy redesign is implemented.
- Production/staging schema parity for `listings.is_test` remains an intentional separate decision from this security pass.

## Final pre-production verification: public_listings_v and is_test

### Code usage review

Direct reads from `public.public_listings_v` were found in these guest-facing paths:

- `lib/home/getHomeListings.server.js` in `getHomeListings`
- `lib/browse/getHomeBrowseData.ts` in `getHomeBrowseData`
- `lib/categoryListingsCached.ts` in `getCategoryListingsCached`
- `app/api/home-listings/route.js` in `GET`
- `app/api/search/route.js` in `GET`
- `app/(customer)/category/[slug]/page.js` in the category page loader

What those callers do:

- They read public listing fields such as `id`, `title`, `price`, `category`, `city`, `photo_url`, `business_id`, `created_at`, `inventory_status`, `inventory_quantity`, `low_stock_threshold`, `inventory_last_updated_at`, `category_id`, `public_id`, `listing_category`, `listing_subcategory`, `pickup_enabled`, `local_delivery_enabled`, `delivery_fee_cents`, `use_business_delivery_defaults`, and `photo_variants`.
- They do **not** request `is_test` from `public.public_listings_v`.
- They do **not** serialize `is_test` into public API responses from this view today.
- Public homepage, `/listings`, category browsing, and search all rely on this view continuing to return public listings.

Separate `is_test` usage was found, but not through `public.public_listings_v`:

- `app/(public)/(marketing)/b/[id]/page.jsx` reads from the base `listings` table and conditionally filters `is_test`.
- `app/(business)/business/preview/page.js` reads from the base `listings` table and conditionally filters `is_test`.

Decision:

- Current application behavior does **not** depend on `public.public_listings_v.is_test`.
- Production should still preserve `is_test` on the view when the underlying `public.listings` table has that column, to avoid unnecessary schema drift and to keep future callers safe.
- This security pass should **not** remove `is_test` from production.

### Migration review for `20260424103000_public_listings_view_security_invoker.sql`

Verified:

- The migration checks whether `public.listings.is_published` exists.
- The migration checks whether `public.listings.is_test` exists.
- When `is_test` exists, the recreated `public.public_listings_v` includes `l.is_test`.
- When `is_test` does not exist, the migration omits that column instead of failing.
- The public visibility filter stays narrow:
  - verified businesses only
  - `is_published = true` where that column exists
  - internal/test content remains hidden unless `public.viewer_can_see_internal_content()` returns true
- The migration then sets `security_invoker = true` and keeps explicit `SELECT` grants for `anon` and `authenticated`.

Production readiness decision:

- Migration `20260424103000_public_listings_view_security_invoker.sql` is safe to include in the production rollout.
- It preserves production `is_test` where present and does not weaken the public filter logic.

## Final pre-production verification: admin_account_deletions usage

### Code usage review

Search results found **no** direct app, frontend, or admin UI reads from `public.admin_account_deletions`.

No direct browser-facing table usage was found in:

- `app/`
- `lib/`
- `tests/`
- `scripts/`
- `supabase/functions/`

What was found instead:

- `app/api/admin/finalize-overdue-deletions/route.ts` is an admin-only API route gated by `requireAdminApiRole("admin_super")`.
- `lib/accountDeletion/invokeFinalizeOverdueDeletions.ts` calls the Edge Function at `/functions/v1/finalize-overdue-deletions` using `ACCOUNT_DELETION_FINALIZER_TOKEN`.
- `supabase/functions/finalize-overdue-deletions/index.ts` and `supabase/functions/_shared/finalize-overdue-deletions.ts` implement the actual deletion finalizer logic using a server-side admin client.
- Repo migrations define the supporting maintenance functions:
  - `public.invoke_finalize_overdue_deletions(text, integer)`
  - `public.schedule_finalize_overdue_deletions_job(text)`
  - `public.unschedule_finalize_overdue_deletions_job()`
  - `public.list_finalize_overdue_deletions_jobs()`

Decision:

- Current evidence shows `public.admin_account_deletions` is an internal audit/workflow table, not a browser-read table.
- Revoking `anon` and `authenticated` access remains the correct production posture.
- The deletion finalizer flow uses an admin API plus server-side token/service-role execution, so it does not need direct browser access to `public.admin_account_deletions`.
- If a future admin UI needs to inspect this table directly, the safe fix is a narrow admin-only policy, not reopening broad browser access.

## Final pre-production verification: deferred helper functions

Reviewed helper functions:

- `public.has_admin_role(text)`
- `public.is_admin()`
- `public.is_admin_any_role(uuid, text[])`
- `public.viewer_can_see_internal_content()`

Why they were not changed in this pass:

- `public.viewer_can_see_internal_content()` is used by public visibility logic, including `public.public_listings_v` and internal-content RLS policies.
- `public.is_admin()` and `public.has_admin_role(text)` are used by many admin RPCs and RLS policies.
- `public.is_admin_any_role(uuid, text[])` is used by admin note workflows and related policy checks.
- Revoking browser-role execute access without a full dependency audit could break public listing visibility, admin API authorization, or policy evaluation.

Current recommendation:

- Leave these helper functions callable as they are for now.
- Treat them as policy infrastructure rather than as broad data-access surfaces.
- Revisit function-execute tightening later only after a dedicated dependency review confirms that public RLS, views, and admin RPCs will still behave correctly.

Intentionally deferred item:

- `public.user_public_profiles` remains an owner-privileged view for now. The current display-name hardening is in place, but the Supabase lint warning stays intentionally open until a dedicated public-profile table or a more deliberate base-table policy redesign is implemented.
