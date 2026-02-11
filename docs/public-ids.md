# Public IDs

## Purpose

YourBarrio keeps UUID primary keys for internal joins, RLS, and support mode, and adds a separate `public_id` for URL/display use.

- Internal key: `id` (`uuid`)
- External key: `public_id` (`text`, URL-safe 12-char hex)

## Findings (Phase 0)

Current UUID exposure discovered before this change:

- Admin user detail URLs were UUID-based: `/admin/users/[id]`
- Public/customer listing detail URLs were UUID-based: `/listings/[id]`, `/customer/listings/[id]`
- Category and saved/search listing links emitted UUID listing IDs
- Admin account list data source (`public.admin_list_accounts`) returned UUID only

Admin listing/review list RPCs:

- Found `public.admin_list_accounts`
- Found `public.admin_list_moderation_flags`
- No dedicated `admin_list_listings` / `admin_list_reviews` RPC detected

## Database Rules

- Keep UUID PKs unchanged.
- Add `public_id` with unique constraints and insert triggers.
- `public.generate_short_id()` generates URL-safe hex IDs only.
- Backfill existing rows where `public_id` is null/blank.

Tables covered:

- `public.users` (required)
- `public.listings` (required for listing URLs)
- `public.business_reviews` (optional/additive if table exists)

## Routing Rules

- Outbound links now prefer `public_id`.
- Backward compatibility remains: UUID URLs still resolve.
- Resolution behavior:
  - If route token matches UUID v4-like format, resolve by `id`
  - Otherwise resolve by `public_id`

Resolver RPCs:

- `public.admin_resolve_user_ref(p_ref text)` for admin pages
- `public.resolve_listing_ref(p_ref text)` for listing pages/API

## Admin and Support Mode

- Admin UI displays `public_id` as the primary visible identifier.
- UUID is still available as secondary internal ID.
- Support mode/impersonation continues to use UUID inputs and server flows unchanged.

## Compatibility Plan

1. Emit only `public_id` in newly generated URLs.
2. Keep UUID route support during transition.
3. After adoption and analytics confirmation, remove UUID URL generation entirely (optional future cleanup).

