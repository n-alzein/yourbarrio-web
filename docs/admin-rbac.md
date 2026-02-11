# Admin RBAC

## Findings
- Admin role source of truth is `public.admin_role_members.role_key` joined to `public.admin_roles`.
- Legacy admin fallback still exists via `public.users.role = 'admin'` or `public.users.is_internal = true` for basic admin detection.
- Broken action root causes:
  - Privileged writes (`update app role`, `toggle internal`) were using actor-scoped DB access in some environments and could fail under RLS/column drift.
  - `users.is_internal` was not guaranteed to exist in every schema state.
  - Role gating relied on hierarchy-only checks, which leaked permissions (for example `admin_ops` inheriting support-mode access).

## Role Definitions
- `admin_readonly`: read-only access to dashboard, lists, and audit.
- `admin_support`: readonly + support mode + internal notes + safe user role fixes.
- `admin_ops`: readonly + moderation + internal toggle.
- `admin_super`: full admin, including admin account management.

## Permission Matrix
- Routes
  - `/admin`, `/admin/accounts`, `/admin/customers`, `/admin/businesses`, `/admin/admins`, `/admin/audit`, `/admin/profile`: all admin roles.
  - `/admin/impersonation`: `admin_support`, `admin_super`.
  - `/admin/moderation`: `admin_ops`, `admin_super`.
  - `/admin/support`: disabled/redirected.
- Actions
  - `update app role`: `admin_support`, `admin_super` (safe values only; `admin` requires `admin_super`).
  - `toggle internal user`: `admin_ops`, `admin_super`.
  - `add internal note`: `admin_support`, `admin_super`.
  - `start/stop impersonation`: `admin_support`, `admin_super`.
  - `create/change/disable admin accounts`: `admin_super`.

## Role Storage
- Canonical membership: `public.admin_role_members`.
- Super-admin management actions keep a single canonical role per admin user.
- UI role badge shows highest role derived from `admin_role_members`.

## Audit Logging
- All privileged writes call `public.log_admin_action` via server-side `audit(...)`.
- Logged actions include:
  - `impersonation_start`, `impersonation_stop`
  - `user_role_updated`, `user_internal_toggled`, `user_internal_note_added`
  - `moderation_flag_created`, `moderation_flag_updated`
  - `admin_user_invited`, `admin_role_changed`, `admin_access_disabled`
- Audit shape:
  - `actor_user_id`
  - `action`
  - `target_type`
  - `target_id`
  - `meta` (JSON)
  - `created_at`
