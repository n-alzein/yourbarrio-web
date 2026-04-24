# Supabase RLS Production Rollout

Generated: 2026-04-24

## Scope

This runbook prepares the production rollout for the staging-verified Supabase security hardening work. It does **not** authorize production writes by itself.

## Pre-rollout

- Confirm the latest staging smoke checks still pass:
  - guest homepage listings
  - guest `/listings`
  - guest public business page
- Confirm a production backup or snapshot is available before any write.
- Confirm the current production migration list and verify the production project ref before running any command.
- Confirm no unrelated pending migrations are mixed into the rollout unless intentionally included.
- Confirm the CLI is linked to production before any production `db push`.
- Confirm no secrets, service-role keys, or bearer tokens are printed to the terminal, logs, or shared notes.

## Migration order

Apply these migrations in order:

1. `20260424101000_restore_admin_account_deletions_parity.sql`
2. `20260424102000_harden_admin_account_deletions_and_maintenance_functions.sql`
3. `20260424103000_public_listings_view_security_invoker.sql`
4. `20260424104000_harden_user_public_profiles_display_name.sql`
5. `20260424105000_revoke_browser_execute_on_maintenance_functions.sql`

Rollout note for migration `#3`:

- `20260424103000_public_listings_view_security_invoker.sql` is cleared for production from a code-dependency standpoint.
- The app does not currently read `public.public_listings_v.is_test`.
- The migration preserves `is_test` automatically in environments where `public.listings.is_test` exists.
- Do **not** remove `is_test` from production in this pass.

## Commands

Use the repo's existing Supabase CLI flow. Example production sequence:

```bash
# confirm available projects
SUPABASE_ACCESS_TOKEN="***" supabase --dns-resolver https projects list

# link the CLI to production
SUPABASE_ACCESS_TOKEN="***" supabase --dns-resolver https link --project-ref <PROD_PROJECT_REF> --yes

# inspect migration state before rollout
SUPABASE_ACCESS_TOKEN="***" supabase --dns-resolver https migration list --linked

# optional: preview pending push if your CLI version supports it
SUPABASE_ACCESS_TOKEN="***" supabase --dns-resolver https db push --linked --dry-run

# apply the pending migrations to production
SUPABASE_ACCESS_TOKEN="***" supabase --dns-resolver https db push --linked

# verify after rollout using a production database URL or linked session
psql "$PROD_DATABASE_URL" -f docs/security/supabase-rls-remediation-verification.sql
```

Operational notes:

- Replace `<PROD_PROJECT_REF>` with the production Supabase project ref used by this repo.
- Use an already-loaded environment variable for `SUPABASE_ACCESS_TOKEN`; do not paste the raw token into notes or screenshots.
- If your production flow uses a different verified internal wrapper around `supabase db push`, use that wrapper instead, but keep the migration order above.

## Post-rollout verification

- Run `docs/security/supabase-rls-remediation-verification.sql` against production.
- Re-run Supabase database lint checks and confirm the resolved warnings stay cleared.
- Confirm guest homepage loads listings.
- Confirm guest `/listings` loads.
- Confirm guest public business pages load.
- Confirm reviews still show safe names and avatar fallbacks.
- Confirm anonymous users cannot read `public.admin_account_deletions`.
- Confirm normal authenticated customers cannot read `public.admin_account_deletions`.
- Confirm business users cannot read `public.admin_account_deletions`.
- Confirm the four maintenance functions are not executable by `anon` or `authenticated`.
- Confirm `public.public_listings_v` still returns a non-collapsed public row count.
- Confirm internal/test content remains hidden from public users.
- Confirm internal/admin preview behavior still works if applicable.

## Rollback plan

### `20260424101000_restore_admin_account_deletions_parity.sql`

- Do not drop `public.admin_account_deletions` in production as part of normal rollback, because production already had the table before this remediation.
- If the parity migration introduces an unexpected schema mismatch, leave the table in place and correct the structure with a follow-up migration.

### `20260424102000_harden_admin_account_deletions_and_maintenance_functions.sql`

- Preferred rollback is targeted:
  - add a narrow admin-only policy if an internal workflow needs access
  - restore only the minimum execute privilege required for maintenance code
- Avoid disabling RLS or reopening browser-wide access unless there is a true incident.
- Emergency rollback only:
  - temporarily re-grant the minimum needed privilege
  - document the exception
  - time-box the exposure and follow up immediately with a safer fix

### `20260424103000_public_listings_view_security_invoker.sql`

- If public listings regress, recreate the previous view definition and set `security_invoker = false`.
- Keep the same column surface, including `is_test` where production currently has it.
- Verify homepage, search, category pages, and public business pages immediately after rollback.

### `20260424104000_harden_user_public_profiles_display_name.sql`

- This is low risk.
- Roll back only if legitimate public names unexpectedly disappear or review attribution breaks.
- If rollback is needed, restore the prior display-name expression, but keep the change documented because the email-exposure risk will return.

### `20260424105000_revoke_browser_execute_on_maintenance_functions.sql`

- Restore execute only to the minimum role that actually needs it.
- Do not re-grant execution to `anon` or `authenticated` broadly unless a verified dependency requires it and a follow-up hardening plan is already scheduled.

## Remaining intentionally open item

- `public.user_public_profiles` still triggers a Supabase security-definer lint warning by design.
- It remains owner-privileged for now because converting it to `security_invoker` without a dedicated public-profile surface would risk breaking review names and avatars.
- The long-term fix is a dedicated public profile table or a carefully redesigned public-safe policy layer on the underlying user data.
