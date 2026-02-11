# Moderation System

## Scope
This implementation supports reports against:
- `user`
- `business`
- `listing`
- `review` (`public.business_reviews`)

All reports are stored in `public.moderation_flags`.

## Schema
`public.moderation_flags` includes:
- existing columns (`created_by_user_id`, `target_user_id`, `target_business_id`, `reason`, `details`, `status`, `admin_notes`, `reviewed_by_user_id`, `reviewed_at`, `meta`, timestamps)
- added columns:
  - `target_listing_id uuid`
  - `target_review_id uuid`

Constraint:
- `moderation_flags_exactly_one_target` (`NOT VALID`):
  - `num_nonnulls(target_user_id, target_business_id, target_listing_id, target_review_id) = 1`

Indexes:
- `idx_moderation_flags_status_created_at` on `(status, created_at desc)`
- per-target indexes on each `target_*` column
- `idx_moderation_flags_created_by_user_id`

Timestamps:
- trigger `moderation_flags_set_updated_at` uses `public.set_row_updated_at()` to maintain `updated_at` on every update.

## Statuses
Supported moderation statuses:
- `open`
- `in_review`
- `resolved`
- `dismissed`

Legacy `triaged` rows are migrated to `in_review`.

## Reason Codes
Stored in `moderation_flags.reason` as normalized codes.

Listing:
- `scam_or_fraud`
- `prohibited_item`
- `misleading_or_inaccurate`
- `spam`
- `other`

Review:
- `spam`
- `offensive_or_hate`
- `harassment`
- `fake_or_manipulated`
- `other`

User/Business:
- `harassment`
- `scam_or_fraud`
- `impersonation`
- `spam`
- `other`

UI label mapping lives in `lib/moderation/reasons.ts`.

## RBAC + RLS
RLS on `public.moderation_flags`:
- `SELECT`
  - reporter can read own flags (`created_by_user_id = auth.uid()`)
  - admins can read all (`public.has_admin_role('admin_readonly')`)
- `INSERT`
  - authenticated reporters only
  - `created_by_user_id = auth.uid()`
  - `status='open'`, no reviewer fields
  - exactly one target required
- `UPDATE`
  - `admin_ops` and above (`public.has_admin_role('admin_ops')`)
- `DELETE`
  - no policy (denied)

## RPCs
### `public.create_moderation_flag(...) -> uuid`
Security:
- `SECURITY DEFINER`
- requires authenticated user

Behavior:
- validates target type and reason code set
- validates target existence
- blocks self-reporting for applicable targets
- deduplicates by same reporter + same target + same reason within 24h when status in (`open`, `in_review`)
- inserts standardized report metadata

### `public.admin_list_moderation_flags(...)`
Security:
- `SECURITY DEFINER`
- requires `admin_ops` (or `service_role`)

Returns queue rows with:
- flag fields
- inferred `target_type`/`target_id`
- reporter summary
- target summary
- `total_count` window for pagination

### `public.admin_update_moderation_flag(...)`
Security:
- `SECURITY DEFINER`
- requires `admin_ops`

Behavior:
- sets status/notes/reviewer fields
- logs audit event via `public.log_admin_action('moderation_flag_update', ...)`

### `public.admin_hide_listing_and_resolve_flag(...)`
### `public.admin_hide_review_and_resolve_flag(...)`
Security:
- `SECURITY DEFINER`
- requires `admin_ops`

Behavior:
- attempts safe hide action using whichever hide-compatible columns exist
- resolves the moderation flag
- logs both resolution and hide action audit events

## Audit Events
Admin mutations emit `public.log_admin_action` entries with metadata:
- `moderation_flag_update`
- `moderation_hide_listing`
- `moderation_hide_review`

Metadata includes `flag_id`, previous/new status, target type/id, notes, and hide action result.

## UI Surfaces
User-facing:
- listing detail page: `Report listing` opens modal and submits via RPC
- business reviews panel: per-review `Report` action opens modal and submits via RPC

Admin:
- `/admin/moderation` queue (ops/super only)
  - filters by `type`, `status`, search text
  - row summaries for target + reporter + reason
  - detail panel with full context and moderation actions
