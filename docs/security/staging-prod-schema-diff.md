# Staging vs Production Schema Diff

Generated: 2026-04-24

## Scope

- Production source of truth: `nbzqnjanqkzuwyxnkjtr`
- Staging compared project: `crskbfbleiubpkvyvvlf`
- Compared categories: public tables/views, public functions, indexes, triggers, RLS policies, grants, extensions, storage buckets.
- This report is for staging cleanup planning only. It does not authorize production changes.

## Backup status

- Staging latest backup: 2026-04-23T14:36:25.194Z
- Production latest backup: 2026-04-24T09:58:07.795Z

## Cleanup execution

Cleanup was executed on staging only on 2026-04-24 after:

- confirming the linked project ref was `crskbfbleiubpkvyvvlf`
- confirming staging backup availability through the Supabase Management API
- generating and reviewing `docs/security/staging-schema-cleanup.sql`

Objects removed from staging:

- `public.business_categories_legacy_archive`
- `public.listing_taxonomy_legacy_archive`
- `public.listings_legacy_cleanup_archive`
- `public.admin_list_users(text,text,text,integer,integer)`
- `public.admin_resolve_user_ref(text)`
- `public.admin_search_accounts(text,text)`

Post-cleanup result:

- staging-only public objects dropped from 13 to 7
- no additional auto-safe drop candidates remain in the current diff

## Objects only in staging

### `public.admin_take_moderation_case(uuid)`
- Type: function
- Row count in staging: 0
- Runtime code references: 1
- Historical migration/docs references: 14
- Suggested action: keep temporarily
- Foreign key dependencies: None
- View dependencies: None
- Table trigger dependencies: None
- Function used by triggers: None
- Function mentions: None found
- Runtime code references:
- `app/admin/actions.ts:510:    const { error } = await client.rpc("admin_take_moderation_case", {`
- Historical migration/docs references:
- `supabase/migrations/20260211143000_moderation_action_hardening.sql:12:CREATE OR REPLACE FUNCTION public.admin_take_moderation_case(`
- `supabase/migrations/20260211143000_moderation_action_hardening.sql:310:REVOKE ALL ON FUNCTION public.admin_take_moderation_case(uuid) FROM PUBLIC;`
- `supabase/migrations/20260211143000_moderation_action_hardening.sql:311:GRANT EXECUTE ON FUNCTION public.admin_take_moderation_case(uuid) TO authenticated;`
- `docs/security/staging-prod-schema-diff.md:154:### `public.admin_take_moderation_case(uuid)``
- `docs/security/staging-prod-schema-diff.md:166:- `app/admin/actions.ts:510:    const { error } = await client.rpc("admin_take_moderation_case", {``
- `docs/security/staging-prod-schema-diff.md:168:- `supabase/migrations/20260211143000_moderation_action_hardening.sql:12:CREATE OR REPLACE FUNCTION public.admin_take_moderation_case(``
- `docs/security/staging-prod-schema-diff.md:169:- `supabase/migrations/20260211143000_moderation_action_hardening.sql:310:REVOKE ALL ON FUNCTION public.admin_take_moderation_case(uuid) FROM PUBLIC;``
- `docs/security/staging-prod-schema-diff.md:170:- `supabase/migrations/20260211143000_moderation_action_hardening.sql:311:GRANT EXECUTE ON FUNCTION public.admin_take_moderation_case(uuid) TO authenticated;``
- ...and 6 more

### `public.has_any_exact_admin_role(text[])`
- Type: function
- Row count in staging: 0
- Runtime code references: 0
- Historical migration/docs references: 14
- Suggested action: investigate
- Foreign key dependencies: None
- View dependencies: None
- Table trigger dependencies: None
- Function used by triggers: None
- Function mentions: create_impersonation_session(uuid,integer,text,jsonb), get_impersonation_session(uuid)
- Runtime code references:
None found in repo.
- Historical migration/docs references:
- `docs/security/staging-prod-schema-diff.md:178:### `public.has_any_exact_admin_role(text[])``
- `docs/security/staging-prod-schema-diff.md:192:- `docs/security/staging-prod-schema-diff.md:121:### `has_any_exact_admin_role(text[])```
- `docs/security/staging-prod-schema-diff.md:193:- `docs/security/staging-prod-schema-diff.md:129:- Function mentions: create_impersonation_session(uuid,integer,text,jsonb), get_impersonation_session(uuid), has_any_exact_admin_role(text[])``
- `docs/security/staging-prod-schema-diff.md:194:- `docs/security/staging-prod-schema-diff.md:131:- `supabase/migrations/20260210101500_admin_rbac_cleanup.sql:15:CREATE OR REPLACE FUNCTION public.has_any_exact_admin_role(required_roles text[])```
- `docs/security/staging-prod-schema-diff.md:195:- `docs/security/staging-prod-schema-diff.md:132:- `supabase/migrations/20260210101500_admin_rbac_cleanup.sql:65:  IF NOT public.has_any_exact_admin_role(ARRAY['admin_support', 'admin_super']) THEN```
- `docs/security/staging-prod-schema-diff.md:196:- `docs/security/staging-prod-schema-diff.md:133:- `supabase/migrations/20260210101500_admin_rbac_cleanup.sql:146:  IF NOT public.has_any_exact_admin_role(ARRAY['admin_support', 'admin_super']) THEN```
- `docs/security/staging-prod-schema-diff.md:197:- `docs/security/staging-prod-schema-diff.md:134:- `supabase/migrations/20260210101500_admin_rbac_cleanup.sql:196:        public.has_any_exact_admin_role(ARRAY['admin_support', 'admin_super'])```
- `docs/security/staging-prod-schema-diff.md:198:- `docs/security/staging-prod-schema-diff.md:262:- function only in staging: `has_any_exact_admin_role(text[])```
- ...and 6 more

### `public.log_admin_action(text,text,text,jsonb,uuid)`
- Type: function
- Row count in staging: 0
- Runtime code references: 9
- Historical migration/docs references: 81
- Suggested action: keep temporarily
- Foreign key dependencies: None
- View dependencies: None
- Table trigger dependencies: None
- Function used by triggers: None
- Function mentions: admin_add_user_note(uuid,text), admin_add_user_note(uuid,text), admin_add_user_note(uuid,text), admin_delete_user_note(uuid), admin_delete_user_note(uuid), admin_delete_user_note(uuid), admin_hide_listing_and_resolve_flag(uuid,uuid,text), admin_hide_listing_and_resolve_flag(uuid,uuid,text), admin_hide_listing_and_resolve_flag(uuid,uuid,text), admin_hide_review_and_resolve_flag(uuid,uuid,text), admin_hide_review_and_resolve_flag(uuid,uuid,text), admin_hide_review_and_resolve_flag(uuid,uuid,text), admin_update_moderation_flag(uuid,text,text,jsonb), admin_update_moderation_flag(uuid,text,text,jsonb), admin_update_moderation_flag(uuid,text,text,jsonb), admin_update_user_note(uuid,text), admin_update_user_note(uuid,text), admin_update_user_note(uuid,text), create_impersonation_session(uuid,integer,text,jsonb), create_impersonation_session(uuid,integer,text,jsonb), create_impersonation_session(uuid,integer,text,jsonb), log_admin_action(text,text,text,jsonb), log_admin_action(text,text,text,jsonb), log_admin_action(text,text,text,jsonb), log_admin_action(text,uuid,jsonb,uuid,text), log_admin_action(text,uuid,jsonb,uuid,text), log_admin_action(text,uuid,jsonb,uuid,text), log_admin_action(text,uuid,text,uuid,jsonb), log_admin_action(text,uuid,text,uuid,jsonb), log_admin_action(text,uuid,text,uuid,jsonb)
- Runtime code references:
- `supabase/functions/_shared/finalize-overdue-deletions.ts:264:  const { error: auditError } = await adminClient.rpc("log_admin_action", {`
- `supabase/functions/_shared/finalize-overdue-deletions.ts:423:    await adminClient.rpc("log_admin_action", {`
- `lib/admin/audit.ts:66:    const { data, error } = await client.rpc("log_admin_action", payload);`
- `tests/account-deletion-request.route.unit.test.ts:102:      "log_admin_action",`
- `lib/accountDeletion/requestDeletion.ts:88:  await supabase.rpc("log_admin_action", {`
- `tests/account-deletion-restore.route.unit.test.ts:85:      "log_admin_action",`
- `app/api/internal/purge-pending-deleted-users/route.ts:63:      await adminClient.rpc("log_admin_action", {`
- `app/api/internal/purge-pending-deleted-users/route.ts:92:    await adminClient.rpc("log_admin_action", {`
- ...and 1 more
- Historical migration/docs references:
- `docs/moderation.md:113:- logs audit event via `public.log_admin_action('moderation_flag_update', ...)``
- `docs/moderation.md:127:Admin mutations emit `public.log_admin_action` entries with metadata:`
- `docs/admin-rbac.md:36:- All privileged writes call `public.log_admin_action` via server-side `audit(...)`.`
- `supabase/migrations/20260208170000_impersonation_target_role_rpc.sql:102:  PERFORM public.log_admin_action(`
- `supabase/migrations/20260210101500_admin_rbac_cleanup.sql:107:  PERFORM public.log_admin_action(`
- `supabase/migrations/20260218153000_fix_admin_user_note_rpc_id_ambiguity.sql:68:  PERFORM public.log_admin_action(`
- `supabase/migrations/20260218153000_fix_admin_user_note_rpc_id_ambiguity.sql:133:  PERFORM public.log_admin_action(`
- `supabase/migrations/20260218150000_admin_user_notes_edit_delete.sql:142:  PERFORM public.log_admin_action(`
- ...and 73 more

### `public.log_admin_action(text,uuid,jsonb,uuid,text)`
- Type: function
- Row count in staging: 0
- Runtime code references: 9
- Historical migration/docs references: 81
- Suggested action: keep temporarily
- Foreign key dependencies: None
- View dependencies: None
- Table trigger dependencies: None
- Function used by triggers: None
- Function mentions: admin_add_user_note(uuid,text), admin_add_user_note(uuid,text), admin_add_user_note(uuid,text), admin_delete_user_note(uuid), admin_delete_user_note(uuid), admin_delete_user_note(uuid), admin_hide_listing_and_resolve_flag(uuid,uuid,text), admin_hide_listing_and_resolve_flag(uuid,uuid,text), admin_hide_listing_and_resolve_flag(uuid,uuid,text), admin_hide_review_and_resolve_flag(uuid,uuid,text), admin_hide_review_and_resolve_flag(uuid,uuid,text), admin_hide_review_and_resolve_flag(uuid,uuid,text), admin_update_moderation_flag(uuid,text,text,jsonb), admin_update_moderation_flag(uuid,text,text,jsonb), admin_update_moderation_flag(uuid,text,text,jsonb), admin_update_user_note(uuid,text), admin_update_user_note(uuid,text), admin_update_user_note(uuid,text), create_impersonation_session(uuid,integer,text,jsonb), create_impersonation_session(uuid,integer,text,jsonb), create_impersonation_session(uuid,integer,text,jsonb), log_admin_action(text,text,text,jsonb,uuid), log_admin_action(text,text,text,jsonb,uuid), log_admin_action(text,text,text,jsonb,uuid), log_admin_action(text,text,text,jsonb), log_admin_action(text,text,text,jsonb), log_admin_action(text,text,text,jsonb), log_admin_action(text,uuid,text,uuid,jsonb), log_admin_action(text,uuid,text,uuid,jsonb), log_admin_action(text,uuid,text,uuid,jsonb)
- Runtime code references:
- `supabase/functions/_shared/finalize-overdue-deletions.ts:264:  const { error: auditError } = await adminClient.rpc("log_admin_action", {`
- `supabase/functions/_shared/finalize-overdue-deletions.ts:423:    await adminClient.rpc("log_admin_action", {`
- `tests/account-deletion-request.route.unit.test.ts:102:      "log_admin_action",`
- `tests/account-deletion-restore.route.unit.test.ts:85:      "log_admin_action",`
- `lib/admin/audit.ts:66:    const { data, error } = await client.rpc("log_admin_action", payload);`
- `lib/accountDeletion/requestDeletion.ts:88:  await supabase.rpc("log_admin_action", {`
- `app/api/admin/users/[id]/restore/route.ts:100:  await adminClient.rpc("log_admin_action", {`
- `app/api/internal/purge-pending-deleted-users/route.ts:63:      await adminClient.rpc("log_admin_action", {`
- ...and 1 more
- Historical migration/docs references:
- `docs/moderation.md:113:- logs audit event via `public.log_admin_action('moderation_flag_update', ...)``
- `docs/moderation.md:127:Admin mutations emit `public.log_admin_action` entries with metadata:`
- `docs/admin-rbac.md:36:- All privileged writes call `public.log_admin_action` via server-side `audit(...)`.`
- `supabase/migrations/20260208170000_impersonation_target_role_rpc.sql:102:  PERFORM public.log_admin_action(`
- `supabase/migrations/20260218150000_admin_user_notes_edit_delete.sql:142:  PERFORM public.log_admin_action(`
- `supabase/migrations/20260218150000_admin_user_notes_edit_delete.sql:207:  PERFORM public.log_admin_action(`
- `supabase/migrations/20260218153000_fix_admin_user_note_rpc_id_ambiguity.sql:68:  PERFORM public.log_admin_action(`
- `supabase/migrations/20260218153000_fix_admin_user_note_rpc_id_ambiguity.sql:133:  PERFORM public.log_admin_action(`
- ...and 73 more

### `public.log_admin_action(text,uuid,text,uuid,jsonb)`
- Type: function
- Row count in staging: 0
- Runtime code references: 9
- Historical migration/docs references: 81
- Suggested action: keep temporarily
- Foreign key dependencies: None
- View dependencies: None
- Table trigger dependencies: None
- Function used by triggers: None
- Function mentions: admin_add_user_note(uuid,text), admin_add_user_note(uuid,text), admin_add_user_note(uuid,text), admin_delete_user_note(uuid), admin_delete_user_note(uuid), admin_delete_user_note(uuid), admin_hide_listing_and_resolve_flag(uuid,uuid,text), admin_hide_listing_and_resolve_flag(uuid,uuid,text), admin_hide_listing_and_resolve_flag(uuid,uuid,text), admin_hide_review_and_resolve_flag(uuid,uuid,text), admin_hide_review_and_resolve_flag(uuid,uuid,text), admin_hide_review_and_resolve_flag(uuid,uuid,text), admin_update_moderation_flag(uuid,text,text,jsonb), admin_update_moderation_flag(uuid,text,text,jsonb), admin_update_moderation_flag(uuid,text,text,jsonb), admin_update_user_note(uuid,text), admin_update_user_note(uuid,text), admin_update_user_note(uuid,text), create_impersonation_session(uuid,integer,text,jsonb), create_impersonation_session(uuid,integer,text,jsonb), create_impersonation_session(uuid,integer,text,jsonb), log_admin_action(text,text,text,jsonb,uuid), log_admin_action(text,text,text,jsonb,uuid), log_admin_action(text,text,text,jsonb,uuid), log_admin_action(text,text,text,jsonb), log_admin_action(text,text,text,jsonb), log_admin_action(text,text,text,jsonb), log_admin_action(text,uuid,jsonb,uuid,text), log_admin_action(text,uuid,jsonb,uuid,text), log_admin_action(text,uuid,jsonb,uuid,text)
- Runtime code references:
- `supabase/functions/_shared/finalize-overdue-deletions.ts:264:  const { error: auditError } = await adminClient.rpc("log_admin_action", {`
- `supabase/functions/_shared/finalize-overdue-deletions.ts:423:    await adminClient.rpc("log_admin_action", {`
- `tests/account-deletion-request.route.unit.test.ts:102:      "log_admin_action",`
- `tests/account-deletion-restore.route.unit.test.ts:85:      "log_admin_action",`
- `lib/admin/audit.ts:66:    const { data, error } = await client.rpc("log_admin_action", payload);`
- `lib/accountDeletion/requestDeletion.ts:88:  await supabase.rpc("log_admin_action", {`
- `app/api/internal/purge-pending-deleted-users/route.ts:63:      await adminClient.rpc("log_admin_action", {`
- `app/api/internal/purge-pending-deleted-users/route.ts:92:    await adminClient.rpc("log_admin_action", {`
- ...and 1 more
- Historical migration/docs references:
- `docs/moderation.md:113:- logs audit event via `public.log_admin_action('moderation_flag_update', ...)``
- `docs/moderation.md:127:Admin mutations emit `public.log_admin_action` entries with metadata:`
- `docs/admin-rbac.md:36:- All privileged writes call `public.log_admin_action` via server-side `audit(...)`.`
- `supabase/migrations/20260211110000_moderation_reporting_system.sql:746:  PERFORM public.log_admin_action(`
- `supabase/migrations/20260211110000_moderation_reporting_system.sql:845:  PERFORM public.log_admin_action(`
- `supabase/migrations/20260211110000_moderation_reporting_system.sql:961:  PERFORM public.log_admin_action(`
- `supabase/migrations/20260218150000_admin_user_notes_edit_delete.sql:142:  PERFORM public.log_admin_action(`
- `supabase/migrations/20260218150000_admin_user_notes_edit_delete.sql:207:  PERFORM public.log_admin_action(`
- ...and 73 more

### `public.set_business_reviews_public_id()`
- Type: function
- Row count in staging: 0
- Runtime code references: 0
- Historical migration/docs references: 14
- Suggested action: investigate
- Foreign key dependencies: None
- View dependencies: None
- Table trigger dependencies: None
- Function used by triggers: business_reviews.trg_set_business_reviews_public_id
- Function mentions: None found
- Runtime code references:
None found in repo.
- Historical migration/docs references:
- `docs/security/staging-prod-schema-diff.md:298:### `public.set_business_reviews_public_id()``
- `docs/security/staging-prod-schema-diff.md:307:- Function used by triggers: business_reviews.trg_set_business_reviews_public_id`
- `docs/security/staging-prod-schema-diff.md:312:- `docs/security/staging-prod-schema-diff.md:196:### `set_business_reviews_public_id()```
- `docs/security/staging-prod-schema-diff.md:313:- `docs/security/staging-prod-schema-diff.md:204:- Function mentions: set_business_reviews_public_id()``
- `docs/security/staging-prod-schema-diff.md:314:- `docs/security/staging-prod-schema-diff.md:206:- `supabase/migrations/20260211123000_public_ids_and_refs.sql:94:CREATE OR REPLACE FUNCTION public.set_business_reviews_public_id()```
- `docs/security/staging-prod-schema-diff.md:315:- `docs/security/staging-prod-schema-diff.md:207:- `supabase/migrations/20260211123000_public_ids_and_refs.sql:109:    EXECUTE 'DROP TRIGGER IF EXISTS trg_set_business_reviews_public_id ON public.business_reviews';```
- `docs/security/staging-prod-schema-diff.md:316:- `docs/security/staging-prod-schema-diff.md:208:- `supabase/migrations/20260211123000_public_ids_and_refs.sql:110:    EXECUTE 'CREATE TRIGGER trg_set_business_reviews_public_id BEFORE INSERT ON public.business_reviews FOR EACH ROW EXECUTE FUNCTION public.set_business_reviews_public_id()';```
- `docs/security/staging-prod-schema-diff.md:317:- `docs/security/staging-prod-schema-diff.md:266:- function only in staging: `set_business_reviews_public_id()```
- ...and 6 more

### `public.set_users_public_id()`
- Type: function
- Row count in staging: 0
- Runtime code references: 0
- Historical migration/docs references: 15
- Suggested action: investigate
- Foreign key dependencies: None
- View dependencies: None
- Table trigger dependencies: None
- Function used by triggers: users.trg_set_users_public_id
- Function mentions: None found
- Runtime code references:
None found in repo.
- Historical migration/docs references:
- `supabase/migrations/20260211123000_public_ids_and_refs.sql:35:CREATE OR REPLACE FUNCTION public.set_users_public_id()`
- `supabase/migrations/20260211123000_public_ids_and_refs.sql:47:DROP TRIGGER IF EXISTS trg_set_users_public_id ON public.users;`
- `supabase/migrations/20260211123000_public_ids_and_refs.sql:48:CREATE TRIGGER trg_set_users_public_id`
- `supabase/migrations/20260211123000_public_ids_and_refs.sql:51:EXECUTE FUNCTION public.set_users_public_id();`
- `docs/security/staging-prod-schema-diff.md:322:### `public.set_users_public_id()``
- `docs/security/staging-prod-schema-diff.md:331:- Function used by triggers: users.trg_set_users_public_id`
- `docs/security/staging-prod-schema-diff.md:336:- `docs/security/staging-prod-schema-diff.md:210:### `set_users_public_id()```
- `docs/security/staging-prod-schema-diff.md:337:- `docs/security/staging-prod-schema-diff.md:218:- Function mentions: set_users_public_id()``
- ...and 7 more

## Objects only in production

- table: `rls_write_audit`
- table: `user_public_profiles_old`
- function: `audit_write()`
- function: `get_my_role()`
- function: `handle_auth_user_created()`
- function: `is_business_user()`
- function: `is_internal()`
- function: `jwt_role_claim()`
- function: `log_admin_action(text,uuid,text,text,jsonb)`
- function: `set_listing_public_id()`
- function: `tg_enforce_business_reviews_update()`
- function: `tg_force_public_profile_role()`
- function: `tg_set_updated_at()`
- function: `unread_total(text)`

## Objects in both but with different definitions

- view `public_listings_v`: staging and production differ in owner, RLS/security options, or definition

## RLS, policy, and grant differences

- policy only in staging: `admin_impersonation_sessions.Support and super can create impersonation sessions`
- policy only in production: `admin_impersonation_sessions.Support ops super can create impersonation sessions`
- policy only in production: `user_public_profiles_old.public_can_read_profiles`
- policy differs: `business_reviews.reviews_business_reply_update`
- policy differs: `business_reviews.reviews_customer_insert`
- policy differs: `business_reviews.reviews_owner_delete`
- policy differs: `business_reviews.reviews_owner_update`

## Function differences

- function only in staging: `admin_take_moderation_case(uuid)`
- function only in staging: `has_any_exact_admin_role(text[])`
- function only in staging: `log_admin_action(text,text,text,jsonb,uuid)`
- function only in staging: `log_admin_action(text,uuid,jsonb,uuid,text)`
- function only in staging: `log_admin_action(text,uuid,text,uuid,jsonb)`
- function only in staging: `set_business_reviews_public_id()`
- function only in staging: `set_users_public_id()`
- function only in production: `audit_write()`
- function only in production: `get_my_role()`
- function only in production: `handle_auth_user_created()`
- function only in production: `is_business_user()`
- function only in production: `is_internal()`
- function only in production: `jwt_role_claim()`
- function only in production: `log_admin_action(text,uuid,text,text,jsonb)`
- function only in production: `set_listing_public_id()`
- function only in production: `tg_enforce_business_reviews_update()`
- function only in production: `tg_force_public_profile_role()`
- function only in production: `tg_set_updated_at()`
- function only in production: `unread_total(text)`
- function differs: `admin_add_user_note(uuid,text)`
- function differs: `admin_delete_user_note(uuid)`
- function differs: `admin_hide_listing_and_resolve_flag(uuid,uuid,text)`
- function differs: `admin_hide_review_and_resolve_flag(uuid,uuid,text)`
- function differs: `admin_list_audit_logs(text,text,timestamp with time zone,timestamp with time zone,integer,integer)`
- function differs: `admin_update_moderation_flag(uuid,text,text,jsonb)`
- function differs: `admin_update_user_note(uuid,text)`
- function differs: `create_impersonation_session(uuid,integer,text,jsonb)`
- function differs: `generate_short_id()`
- function differs: `get_impersonation_session(uuid)`
- function differs: `get_or_create_conversation(uuid,uuid)`
- function differs: `handle_auth_user_profile_provisioning()`
- function differs: `handle_message_insert()`
- function differs: `has_admin_role(text)`
- function differs: `log_admin_action(text,text,text,jsonb)`
- function differs: `mark_conversation_read(uuid)`
- function differs: `resolve_listing_ref(text)`
- function differs: `sync_listing_category_fields()`
- function differs: `unread_total(text,uuid)`

## Storage and schema objects that should not be touched

- `auth`, `storage`, `realtime`, and Supabase-managed schemas are not drop targets in this cleanup pass.
- Storage bucket differences are documented only for awareness.
- Extension differences are documented only for awareness.

### Storage bucket differences
- No storage bucket differences found.

### Extension differences

## Proposed cleanup set

- No safe drop candidates were identified automatically after the 2026-04-24 staging cleanup.

## Remaining differences after cleanup

The main staging-only objects that remain are:

- `public.admin_take_moderation_case(uuid)`
  - kept because current app code still calls it from `app/admin/actions.ts`
- `public.has_any_exact_admin_role(text[])`
  - kept because staging-only admin impersonation functions still depend on it
- `public.log_admin_action(...)` staging-only overloads
  - kept because current server/admin code still uses `log_admin_action` RPC calls and several staging functions reference these overloads
- `public.set_business_reviews_public_id()`
  - kept because staging still has trigger `business_reviews.trg_set_business_reviews_public_id`
- `public.set_users_public_id()`
  - kept because staging still has trigger `users.trg_set_users_public_id`

Other remaining differences are still documented above and were intentionally not changed in this cleanup pass:

- production-only tables/functions that staging does not yet have
- policy differences on `business_reviews` and `admin_impersonation_sessions`
- public object definition differences such as `public.public_listings_v`

## Verification results

Post-cleanup schema verification:

- reran the staging-vs-production diff after cleanup
- confirmed the six removed staging-only objects no longer appear
- current post-cleanup diff shows `stagingOnlyCount = 7`

Post-cleanup staging app checks:

- local dev server already running against staging (`crskbfbleiubpkvyvvlf`) on `http://127.0.0.1:3000`
- homepage: `200`
- `/listings`: `200`
- public business page `/b/eaca122466`: `200`
- login page `/login`: `200`
- business dashboard route `/business/dashboard`: `200` response from the route shell while unauthenticated
- cart `/cart`: `200`
- admin route `/admin`: `200` response from the route shell while unauthenticated
- reviews/profile display API `/api/public-business-reviews?businessId=2b89dfb9-42e7-4101-a598-4dd966f22b88&limit=10`: `200`, with reviewer display name and avatar URL present

Notes on test-data fallout:

- no staging smoke-check failure was tied to the removed legacy objects
- one attempted local smoke wrapper failed earlier because another `next dev` process already held the shared `.next` lock; that was a local dev-process conflict, not a staging schema issue

## Remaining Difference Classification

This section classifies every remaining drift item after the 2026-04-24 staging cleanup.

### 1. Must align now

#### Impersonation access family
- Objects:
  - `public.create_impersonation_session(uuid,integer,text,jsonb)` (definition drift)
  - `public.get_impersonation_session(uuid)` (definition drift)
  - `public.has_any_exact_admin_role(text[])` (staging only)
  - `public.admin_impersonation_sessions` insert policy drift
- Staging state:
  - support/super gate uses `has_any_exact_admin_role(...)`
  - `admin_ops` is excluded from the insert policy and impersonation RPC checks
- Production state:
  - support/ops/super gate uses `has_admin_role(...)`
- Runtime references:
  - `app/admin/actions.ts`
  - `app/admin/impersonation/page.tsx`
  - `lib/admin/supportMode.ts`
- Risk if left different:
  - staging does not accurately model who can impersonate in production
  - admin support-mode testing can pass in one environment and fail in the other
- Risk if aligned:
  - medium, because changing admin-role checks can widen or narrow access if done incorrectly
- Recommended action:
  - align staging to the production role model, then decide whether production is actually the desired source of truth for this feature
- Migration should be created:
  - yes, but only after confirming the intended admin role matrix

#### Admin audit RPC family
- Objects:
  - staging only: `public.log_admin_action(text,text,text,jsonb,uuid)`
  - staging only: `public.log_admin_action(text,uuid,jsonb,uuid,text)`
  - staging only: `public.log_admin_action(text,uuid,text,uuid,jsonb)`
  - production only: `public.log_admin_action(text,uuid,text,text,jsonb)`
  - drifted wrapper: `public.log_admin_action(text,text,text,jsonb)`
  - dependent drifted RPCs:
    - `public.admin_add_user_note(uuid,text)`
    - `public.admin_delete_user_note(uuid)`
    - `public.admin_hide_listing_and_resolve_flag(uuid,uuid,text)`
    - `public.admin_hide_review_and_resolve_flag(uuid,uuid,text)`
    - `public.admin_list_audit_logs(text,text,timestamp with time zone,timestamp with time zone,integer,integer)`
    - `public.admin_update_moderation_flag(uuid,text,text,jsonb)`
    - `public.admin_update_user_note(uuid,text)`
- Staging state:
  - multiple overloads still exist and downstream admin functions compile against them
- Production state:
  - one canonical 5-arg implementation plus a wrapper overload
- Runtime references:
  - `lib/admin/audit.ts`
  - `lib/accountDeletion/requestDeletion.ts`
  - `supabase/functions/_shared/finalize-overdue-deletions.ts`
  - `app/api/admin/users/[id]/restore/route.ts`
  - `app/api/internal/purge-pending-deleted-users/route.ts`
- Risk if left different:
  - staging can hide signature/permission failures that only appear in production
  - admin audit logging is security-relevant, so drift is high-cost
- Risk if aligned:
  - medium, because removing old overloads can break still-compiled SQL functions if done in the wrong order
- Recommended action:
  - normalize both environments onto the canonical production signature set, then rebuild the dependent admin RPCs against that single contract
- Migration should be created:
  - yes

#### Messaging behavior family
- Objects:
  - `public.handle_message_insert()` (definition drift)
  - `public.mark_conversation_read(uuid)` (definition drift)
  - `public.unread_total(text,uuid)` (definition drift)
  - production only: `public.unread_total(text)`
  - `public.get_or_create_conversation(uuid,uuid)` (definition drift)
- Staging state:
  - `handle_message_insert()` is not `SECURITY DEFINER` and stores full message preview
  - `mark_conversation_read()` mutates messages before participant validation
  - `unread_total(text,uuid)` computes real counts
- Production state:
  - `handle_message_insert()` is `SECURITY DEFINER` with locked `search_path` and truncates preview
  - `mark_conversation_read()` validates the participant before mutating
  - `unread_total(text)` wrapper exists
  - `unread_total(text,uuid)` currently returns `0` as a safe fallback
- Runtime references:
  - `lib/messages.ts`
- Risk if left different:
  - staging messaging behavior does not mirror production
  - staging can miss participant-authorization bugs and unread-count regressions
- Risk if aligned:
  - medium, because copying the current production fallback will intentionally make unread counts less realistic in staging
- Recommended action:
  - align the authorization and trigger semantics now
  - decide separately whether production's `unread_total = 0` fallback should remain or be fixed in both environments
- Migration should be created:
  - yes for `handle_message_insert()` and `mark_conversation_read()`
  - yes, but with product signoff, for the `unread_total(...)` behavior choice

#### Listing-reference RPC family
- Objects:
  - `public.resolve_listing_ref(text)` (definition drift)
- Staging state:
  - not `SECURITY DEFINER`
  - stricter UUID-v4-only regex
- Production state:
  - `SECURITY DEFINER`
  - broader UUID matcher
- Runtime references:
  - `app/api/stripe/checkout/create-session/route.ts`
  - `app/api/customer/listings/route.js`
- Risk if left different:
  - staging can reject references that production accepts
  - staging can under-test permission behavior on public listing resolution
- Risk if aligned:
  - low to medium, because this is a narrow helper and production already uses the broader version
- Recommended action:
  - align staging to the production definition
- Migration should be created:
  - yes

#### Review-write security family
- Objects:
  - policy drift:
    - `business_reviews.reviews_business_reply_update`
    - `business_reviews.reviews_customer_insert`
    - `business_reviews.reviews_owner_delete`
    - `business_reviews.reviews_owner_update`
  - production only:
    - `public.tg_enforce_business_reviews_update()`
    - trigger `business_reviews.trg_enforce_business_reviews_update`
    - `public.audit_write()`
    - trigger `business_reviews.t_audit_business_reviews`
- Staging state:
  - review policies are granted to `{public}`
  - no enforcement trigger
  - no write-audit trigger
- Production state:
  - equivalent policies are granted to `{authenticated}`
  - update enforcement trigger and audit trigger are present
- Runtime references:
  - direct table usage in review UI and profile code:
    - `components/business/profile/ReviewsPanel.jsx`
    - `components/publicBusinessProfile/BusinessReviewsPanel.jsx`
    - `components/publicBusinessProfile/PublicBusinessPreviewClient.jsx`
    - `lib/publicBusinessProfile/reviews.js`
    - `app/(business)/business/profile/page.js`
    - `app/(business)/business/preview/page.js`
- Risk if left different:
  - staging is materially less strict than production around review writes
  - this can hide authorization bugs and review-edit edge cases
- Risk if aligned:
  - medium, because review update rules are user-facing and can break reply/edit flows if copied incorrectly
- Recommended action:
  - align the policy role grants and the enforcement trigger behavior
  - keep the audit trigger optional if the table is meant only for internal observability
- Migration should be created:
  - yes for policy and enforcement-trigger parity
  - optional later for write-audit parity

### 2. Safe to align later

#### Public listings view schema parity
- Objects:
  - `public.public_listings_v`
- Staging state:
  - view omits `l.is_test`
- Production state:
  - view includes `l.is_test`
- Runtime references:
  - guest-facing reads in `lib/home/getHomeListings.server.js`, `lib/browse/getHomeBrowseData.ts`, `lib/categoryListingsCached.ts`, `app/api/home-listings/route.js`, `app/api/search/route.js`, `app/(customer)/category/[slug]/page.js`
- Risk if left different:
  - low, because current app callers do not request `is_test` from this view
  - moderate schema-parity cost for future callers
- Risk if aligned:
  - low, assuming staging `public.listings` eventually gets the same column shape
- Recommended action:
  - keep this on the parity backlog, but it is not blocking current runtime behavior
- Migration should be created:
  - yes, when staging `public.listings.is_test` is intentionally introduced

#### Public-id trigger family
- Objects:
  - staging only: `public.set_users_public_id()`
  - staging only: trigger `users.trg_set_users_public_id`
  - staging only: `public.set_business_reviews_public_id()`
  - staging only: trigger `business_reviews.trg_set_business_reviews_public_id`
  - production only: `public.set_listing_public_id()`
  - `public.generate_short_id()` (definition drift)
  - `public.sync_listing_category_fields()` (definition drift)
- Staging state:
  - users and business reviews still auto-generate `public_id`
  - `generate_short_id()` is locked to `extensions, pg_catalog`
  - category syncing is simpler
- Production state:
  - listing public-id trigger exists instead
  - `generate_short_id()` uses explicit `extensions.gen_random_bytes(...)`
  - category syncing is more normalized
- Runtime references:
  - app code broadly relies on `public_id` fields for URLs and admin surfaces
  - no direct runtime calls to the trigger functions themselves
- Risk if left different:
  - moderate parity drift for inserts and test-data generation
  - low direct user-facing break risk today
- Risk if aligned:
  - medium, because trigger changes can affect new rows and test fixtures unexpectedly
- Recommended action:
  - align after deciding which public-id strategy is canonical across users, reviews, and listings
- Migration should be created:
  - yes, but as a dedicated public-id parity pass

#### Production observability helper
- Objects:
  - production only: `public.rls_write_audit`
  - production only: `public.audit_write()`
  - production only: trigger `business_reviews.t_audit_business_reviews`
- Staging state:
  - missing
- Production state:
  - captures row-level write observations for `business_reviews`
- Runtime references:
  - no direct app/runtime references found
- Risk if left different:
  - low application risk, but staging does not mirror production observability
- Risk if aligned:
  - low to medium, because it adds extra writes and noise to staging
- Recommended action:
  - align later if staging should exercise the same audit pipeline
- Migration should be created:
  - optional

### 3. Keep intentionally different

#### None currently qualify as intentionally different
- Current remaining drift all falls into either parity work or investigation.
- Recommendation:
  - do not treat any of the remaining database drift as a permanent feature of staging without an explicit written decision.

### 4. Needs investigation

#### Moderation take-case RPC
- Objects:
  - staging only: `public.admin_take_moderation_case(uuid)`
- Staging state:
  - exists and is callable by authenticated admins through current app code
- Production state:
  - missing
- Runtime references:
  - `app/admin/actions.ts`
- Risk if left different:
  - staging can exercise an admin moderation path that production may not support
- Risk if aligned:
  - medium, because adding it to production or removing it from staging changes a live admin workflow
- Recommended action:
  - verify whether this admin action is meant to be shipped
  - if yes, create a proper migration to add it to production
  - if no, remove the app call and drop it from staging
- Migration should be created:
  - not yet; investigate first

#### Auth/profile provisioning family
- Objects:
  - production only: `public.handle_auth_user_created()`
  - drifted: `public.handle_auth_user_profile_provisioning()`
  - production only: `public.user_public_profiles_old`
  - production only: `public.tg_force_public_profile_role()`
  - production only policy: `user_public_profiles_old.public_can_read_profiles`
  - production only: `public.get_my_role()`
  - production only: `public.is_business_user()`
  - production only: `public.is_internal()`
  - production only: `public.jwt_role_claim()`
  - production only: `public.tg_set_updated_at()`
- Staging state:
  - newer auth-profile provisioning function exists
  - older profile helper surface is absent
- Production state:
  - both old and new profile/user helper surfaces still exist
- Runtime references:
  - repo explicitly references `handle_auth_user_profile_provisioning()`
  - no direct app/runtime references were found for `user_public_profiles_old`, `get_my_role()`, `is_business_user()`, `is_internal()`, `jwt_role_claim()`, or `tg_force_public_profile_role()`
- Risk if left different:
  - new-user provisioning, role-claim, and public-profile behavior may not be exercised the same way in staging
- Risk if aligned:
  - medium to high, because auth triggers and public-profile helpers can affect signups and profile visibility
- Recommended action:
  - trace actual trigger attachments and live callers before deciding whether production needs cleanup or staging needs backfill
- Migration should be created:
  - not yet; investigate first

#### Unread-count contract choice
- Objects:
  - production only: `public.unread_total(text)`
  - drifted: `public.unread_total(text,uuid)`
- Staging state:
  - returns real unread counts
- Production state:
  - wrapper exists and underlying function returns `0`
- Runtime references:
  - `lib/messages.ts`
- Risk if left different:
  - staging does not reproduce current production unread-count behavior
- Risk if aligned:
  - high product risk if the wrong behavior is declared canonical
- Recommended action:
  - decide whether production's `0` is a temporary emergency fallback or the intended contract
- Migration should be created:
  - not yet; needs product and messaging-owner review

## Priority Summary

### Must align now
- impersonation access family
- admin audit RPC family
- messaging behavior family
- `resolve_listing_ref(text)`
- `business_reviews` policy and enforcement-trigger parity

### Safe to align later
- `public.public_listings_v` `is_test` parity
- public-id trigger family
- `rls_write_audit` observability family

### Keep intentionally different
- none

### Needs investigation
- `admin_take_moderation_case(uuid)`
- auth/profile provisioning family
- unread-count contract choice
