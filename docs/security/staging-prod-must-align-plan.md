# Staging vs Production Must-Align Plan

Generated: 2026-04-24

## Scope

This plan covers only the remaining "Must align now" areas from [staging-prod-schema-diff.md](/Users/nour/Documents/YourBarrio/yourbarrio-landing/docs/security/staging-prod-schema-diff.md):

1. `resolve_listing_ref(text)`
2. `business_reviews` write-policy and enforcement-trigger parity
3. messaging behavior family
4. impersonation access family
5. admin audit RPC family

This is a staging-first planning artifact only.

- No migrations were applied.
- No staging writes were performed.
- No production writes were performed.

## Default rule

Use production as the source of truth unless the repo or the drift review points to a likely production bug.

Two areas do look like likely production bugs or contract gaps:

- impersonation role matrix
- admin audit overload consolidation

Those are called out explicitly below and are not drafted as executable migrations yet.

## Recommended migration order

1. `20260424110000_align_resolve_listing_ref_staging.sql`
2. `20260424111000_align_business_reviews_write_parity_staging.sql`
3. `20260424112000_align_messaging_security_parity_staging.sql`
4. impersonation access family: hold until role matrix confirmed
5. admin audit RPC family: hold until overload-consolidation contract is approved

## 1. `resolve_listing_ref(text)`

### Current state

- Staging:
  - `STABLE`
  - not `SECURITY DEFINER`
  - UUID matcher only accepts v4 UUIDs
- Production:
  - `STABLE SECURITY DEFINER`
  - locked `search_path = public`
  - UUID matcher accepts any standard UUID format

### Runtime references

- [route.ts](/Users/nour/Documents/YourBarrio/yourbarrio-landing/app/api/stripe/checkout/create-session/route.ts)
- [route.js](/Users/nour/Documents/YourBarrio/yourbarrio-landing/app/api/customer/listings/route.js)

### Copy production?

Yes.

This is the safest first alignment item in the batch. The production behavior is narrower than the business-review and audit items and there is no sign that the production definition is wrong.

### Likely production bug?

No.

### Draft migration

Draft file:

- [20260424110000_align_resolve_listing_ref_staging.sql](/Users/nour/Documents/YourBarrio/yourbarrio-landing/supabase/migrations/20260424110000_align_resolve_listing_ref_staging.sql)

### Expected risk

- Low
- Main risk is public listing ref resolution regressing for UUID or `public_id` paths if the function body is mistyped

### Rollback plan

- Recreate the previous staging definition from `20260211123000_public_ids_and_refs.sql`
- Keep execute grants unchanged for `anon` and `authenticated`

### Verification checks

- `rpc("resolve_listing_ref", { p_ref: <uuid> })` still resolves a known listing UUID
- `rpc("resolve_listing_ref", { p_ref: <public_id> })` still resolves a known listing public id
- guest listing routes still load:
  - `/api/customer/listings`
  - Stripe checkout listing resolution path

## 2. `business_reviews` write-policy and enforcement-trigger parity

### Current state

- Staging:
  - write policies use `TO public`
  - no `trg_enforce_business_reviews_update`
- Production:
  - equivalent write policies use `TO authenticated`
  - `trg_enforce_business_reviews_update` is present
  - optional write-audit trigger is also present, but that is not required for the first parity pass

### Runtime references

- [ReviewsPanel.jsx](/Users/nour/Documents/YourBarrio/yourbarrio-landing/components/business/profile/ReviewsPanel.jsx)
- [BusinessReviewsPanel.jsx](/Users/nour/Documents/YourBarrio/yourbarrio-landing/components/publicBusinessProfile/BusinessReviewsPanel.jsx)
- [PublicBusinessPreviewClient.jsx](/Users/nour/Documents/YourBarrio/yourbarrio-landing/components/publicBusinessProfile/PublicBusinessPreviewClient.jsx)
- [reviews.js](/Users/nour/Documents/YourBarrio/yourbarrio-landing/lib/publicBusinessProfile/reviews.js)
- [page.js](/Users/nour/Documents/YourBarrio/yourbarrio-landing/app/(business)/business/profile/page.js)
- [page.js](/Users/nour/Documents/YourBarrio/yourbarrio-landing/app/(business)/business/preview/page.js)

### Copy production?

Mostly yes.

The write restrictions and update-enforcement trigger should be copied to staging.

### Likely production bug?

No obvious bug in the production write restrictions.

One production-only piece should not block this first pass:

- `audit_write()` and `rls_write_audit`

That looks like observability, not required user-facing security behavior.

### Draft migration

Draft file:

- [20260424111000_align_business_reviews_write_parity_staging.sql](/Users/nour/Documents/YourBarrio/yourbarrio-landing/supabase/migrations/20260424111000_align_business_reviews_write_parity_staging.sql)

This draft does two things only:

- aligns the four write policies to `TO authenticated`
- adds the production-style `tg_enforce_business_reviews_update()` trigger function and trigger

It does not add the production `audit_write()` trigger yet.

### Expected risk

- Medium
- This touches customer review edits and business replies
- A bad trigger definition can block legitimate edits

### Rollback plan

- Drop `trg_enforce_business_reviews_update`
- Drop `tg_enforce_business_reviews_update()`
- Recreate the four prior staging policies with `TO public`

### Verification checks

- guest users cannot insert/update/delete `business_reviews`
- authenticated customer can insert own review
- authenticated customer can update only rating/title/body on own review
- authenticated business owner can update only `business_reply` and `business_reply_at`
- authenticated business owner cannot modify rating/title/body
- admin paths that use service role or admin flows are not blocked unexpectedly

## 3. Messaging behavior family

### Current state

- Staging:
  - `handle_message_insert()` is not `SECURITY DEFINER`
  - it stores full `NEW.body` in `last_message_preview`
  - `mark_conversation_read()` mutates first, validates participant second
  - `unread_total(text,uuid)` computes real counts
- Production:
  - `handle_message_insert()` is `SECURITY DEFINER`
  - preview is truncated to `left(new.body, 140)`
  - `mark_conversation_read()` validates the participant before mutating
  - `unread_total(text,uuid)` returns `0`
  - `unread_total(text)` wrapper exists

### Runtime references

- [messages.ts](/Users/nour/Documents/YourBarrio/yourbarrio-landing/lib/messages.ts)

### Copy production?

Partially.

Copy now:

- `handle_message_insert()`
- `mark_conversation_read(uuid)`

Do not copy yet:

- `unread_total(text,uuid) returns 0`
- `unread_total(text)` wrapper

### Likely production bug?

Possibly yes, for unread counts.

The production `unread_total(text,uuid)` body is explicitly marked as a temporary safe default and returns `0`. That should not be copied into staging without explicit approval.

### Draft migration

Draft file:

- [20260424112000_align_messaging_security_parity_staging.sql](/Users/nour/Documents/YourBarrio/yourbarrio-landing/supabase/migrations/20260424112000_align_messaging_security_parity_staging.sql)

This draft updates:

- `handle_message_insert()`
- `mark_conversation_read(uuid)`
- `get_or_create_conversation(uuid,uuid)` only to keep the staging definition in sync with the current production body shape

It does not change unread-count behavior.

### Expected risk

- Medium
- The biggest risk is breaking read-state updates in user conversations

### Rollback plan

- Recreate the previous staging `handle_message_insert()` and `mark_conversation_read()` definitions from `20251207090000_add_messaging.sql`
- If needed, revert `get_or_create_conversation()` to the previous staging body from the same migration

### Verification checks

- authenticated customer can create a conversation with a business
- non-participant cannot mark another conversation as read
- participants can still mark their own conversation as read
- `last_message_preview` still updates after insert
- preview is truncated to 140 chars
- no change to unread count semantics in staging

## 4. Impersonation access family

### Current state

- Staging:
  - `create_impersonation_session()` and `get_impersonation_session()` use `has_any_exact_admin_role(['admin_support','admin_super'])`
  - insert policy is `Support and super can create impersonation sessions`
- Production:
  - create policy allows `admin_support`, `admin_ops`, `admin_super`
  - function definitions use `has_admin_role(...)` rather than exact-role helper checks

### Runtime references

- [actions.ts](/Users/nour/Documents/YourBarrio/yourbarrio-landing/app/admin/actions.ts)
- [page.tsx](/Users/nour/Documents/YourBarrio/yourbarrio-landing/app/admin/impersonation/page.tsx)
- [supportMode.ts](/Users/nour/Documents/YourBarrio/yourbarrio-landing/lib/admin/supportMode.ts)
- [admin-rbac.md](/Users/nour/Documents/YourBarrio/yourbarrio-landing/docs/admin-rbac.md)

### Copy production?

No, not blindly.

### Likely production bug?

Yes, likely.

The repo's documented and app-enforced role matrix says:

- `admin_support`, `admin_super` can start/stop impersonation
- `admin_ops` should not inherit support mode

Sources:

- [admin-rbac.md](/Users/nour/Documents/YourBarrio/yourbarrio-landing/docs/admin-rbac.md)
- [permissions.ts](/Users/nour/Documents/YourBarrio/yourbarrio-landing/lib/admin/permissions.ts)
- [page.tsx](/Users/nour/Documents/YourBarrio/yourbarrio-landing/app/admin/impersonation/page.tsx)

So the production policy that allows `admin_ops` looks like a likely production bug.

### Draft migration

No executable migration is drafted yet.

Reason:

- staging appears closer to the documented contract than production
- a shared contract decision is needed before writing SQL

### Expected risk

- High if changed incorrectly
- This is an admin-privilege boundary, not just a convenience feature

### Rollback plan

- If a future migration is applied incorrectly, restore the previous policy and function bodies exactly
- Prefer temporary role narrowing over widening access

### Verification checks

- `admin_support` can start support mode
- `admin_super` can start support mode
- `admin_ops` cannot start support mode
- support-mode session read path still works for the actor
- stop/exit flow still works and logs correctly

### Decision needed from you

Confirm the intended impersonation matrix:

- `admin_support`: yes or no
- `admin_ops`: yes or no
- `admin_super`: yes or no

The repo currently points to:

- `admin_support = yes`
- `admin_ops = no`
- `admin_super = yes`

## 5. Admin audit RPC family

### Current state

- Staging:
  - has legacy overloads and a guarded 4-arg wrapper
  - downstream SQL functions still compile against those overloads
- Production:
  - has a canonical `log_admin_action(text,uuid,text,text,jsonb)` signature
  - has a simpler 4-arg wrapper that forwards to the canonical signature
  - does not keep the same legacy overload set as staging

### Runtime references

- [audit.ts](/Users/nour/Documents/YourBarrio/yourbarrio-landing/lib/admin/audit.ts)
- [requestDeletion.ts](/Users/nour/Documents/YourBarrio/yourbarrio-landing/lib/accountDeletion/requestDeletion.ts)
- [finalize-overdue-deletions.ts](/Users/nour/Documents/YourBarrio/yourbarrio-landing/supabase/functions/_shared/finalize-overdue-deletions.ts)
- [route.ts](/Users/nour/Documents/YourBarrio/yourbarrio-landing/app/api/admin/users/[id]/restore/route.ts)
- [route.ts](/Users/nour/Documents/YourBarrio/yourbarrio-landing/app/api/internal/purge-pending-deleted-users/route.ts)
- several admin SQL functions in `supabase/migrations`

### Copy production?

Not in one step.

### Likely production bug?

Not conclusively, but there is a contract gap:

- production relies on a simpler canonical signature
- staging still has SQL functions that may call legacy named-argument overloads
- adding the new canonical 5-arg signature before rebuilding those functions can create ambiguous overload resolution

Because of that, this area should be migrated in stages rather than copied wholesale.

### Draft migration

No executable migration is drafted yet.

Reason:

- adding the canonical 5-arg production signature before rebuilding dependent SQL functions is not clearly safe
- dropping old overloads now is explicitly unsafe

### Planned staged approach

1. Inventory every DB function that calls `public.log_admin_action(...)` using named arguments or UUID `target_id`.
2. Rebuild those functions against one canonical signature.
3. Only then:
   - add or swap the canonical wrapper set
   - remove obsolete overloads in a later cleanup migration

### Expected risk

- Medium to high
- The failure mode is subtle: SQL functions can compile or resolve differently than expected after overload changes

### Rollback plan

- Restore the previous overload set first
- Then restore the dependent function definitions
- Do not partially remove overloads without restoring callers

### Verification checks

- `lib/admin/audit.ts` server flows still log successfully
- account deletion request path still logs successfully
- restore-user admin API still logs successfully
- purge/finalizer paths still log successfully
- moderation and user-note SQL functions still execute without ambiguous function-call errors

### Decision needed from you

Confirm the target contract:

- keep a canonical 5-arg audit function with `target_id text`
- keep compatibility overloads temporarily
- remove legacy overloads only after dependent SQL functions are rebuilt

## Decisions needed before approval

1. Impersonation role matrix
   - recommended from repo docs: `admin_support=yes`, `admin_ops=no`, `admin_super=yes`
2. Messaging unread-count contract
   - keep staging real counts for now
   - do not copy production `0` fallback unless explicitly approved
3. Admin audit overload strategy
   - recommended: staged consolidation, not one-shot replacement

## Draft migrations created

Executable staging-first drafts:

- [20260424110000_align_resolve_listing_ref_staging.sql](/Users/nour/Documents/YourBarrio/yourbarrio-landing/supabase/migrations/20260424110000_align_resolve_listing_ref_staging.sql)
- [20260424111000_align_business_reviews_write_parity_staging.sql](/Users/nour/Documents/YourBarrio/yourbarrio-landing/supabase/migrations/20260424111000_align_business_reviews_write_parity_staging.sql)
- [20260424112000_align_messaging_security_parity_staging.sql](/Users/nour/Documents/YourBarrio/yourbarrio-landing/supabase/migrations/20260424112000_align_messaging_security_parity_staging.sql)

Not drafted as executable migrations yet:

- impersonation access family
- admin audit RPC family

## Staging execution results

Completed in staging on 2026-04-24.

### Preconditions confirmed

- linked project ref: `crskbfbleiubpkvyvvlf`
- local dev server on `127.0.0.1:3000` is pointed at staging
- latest staging backup available before apply: `2026-04-23T14:36:25.194Z`
- dry run confirmed only these three pending migrations:
  - `20260424110000_align_resolve_listing_ref_staging.sql`
  - `20260424111000_align_business_reviews_write_parity_staging.sql`
  - `20260424112000_align_messaging_security_parity_staging.sql`

### Migrations applied

- `20260424110000_align_resolve_listing_ref_staging.sql`
- `20260424111000_align_business_reviews_write_parity_staging.sql`
- `20260424112000_align_messaging_security_parity_staging.sql`

No rollback was needed.

### Verification results

#### `resolve_listing_ref(text)`

Verified over the staging anon RPC surface using a known listing from the staging-backed homepage feed:

- sample listing UUID: `3d4cd2a3-c74c-4082-92a4-a829f08e4084`
- sample listing public id: `1da858269363`
- UUID lookup returned the same row
- public-id lookup returned the same row

Result:

- passed

#### Guest listing/search routes

Verified against the local staging-backed app:

- `GET /api/home-listings?city=Long%20Beach&state=CA&limit=5` returned `200`
- `GET /api/search?q=gift` returned `200`
- `GET /listings` returned `200`

Result:

- passed

#### `business_reviews` write parity

Verified structurally in staging database metadata:

- `trg_enforce_business_reviews_update` now exists on `public.business_reviews`
- these four policies now target `authenticated` only:
  - `reviews_business_reply_update`
  - `reviews_customer_insert`
  - `reviews_owner_delete`
  - `reviews_owner_update`

Anonymous write behavior was therefore tightened as intended.

Direct authenticated insert/update/reply flow execution was not run in this pass because I did not create or mutate disposable customer/business test sessions just for verification.

Result:

- passed for schema/policy parity
- authenticated user-flow verification still recommended as a manual follow-up with known safe test accounts

#### Messaging behavior family

Verified structurally in staging database metadata:

- `handle_message_insert()` is now `SECURITY DEFINER`
- `handle_message_insert()` now truncates preview with `left(new.body, 140)`
- `mark_conversation_read(uuid)` now contains the participant-check path before mutation
- `unread_total(text,uuid)` did not change to the production fallback
  - current result type remains `bigint`
  - function body does not contain `select 0`

Direct message insert and conversation-read mutation tests were not run in this pass because they require authenticated participant and non-participant sessions and would otherwise mutate live staging rows.

Result:

- passed for function-definition parity
- live participant/non-participant mutation verification still recommended with safe test accounts

### Verification gaps intentionally left open

- authenticated customer review insert/update behavior
- authenticated business owner reply behavior
- direct message insert mutation proving `last_message_preview` changes on a new row
- direct participant vs non-participant `mark_conversation_read` mutation behavior

These remain unexecuted because this pass avoided ad hoc live-data mutations without known disposable test identities.

### Remaining decisions still open

- impersonation access family
  - approved contract for future migration: `admin_support = yes`, `admin_ops = no`, `admin_super = yes`
  - no migration applied yet
- admin audit RPC family
  - approved direction: staged consolidation with temporary compatibility overloads
  - no migration applied yet

## Live authenticated verification

Completed in staging on 2026-04-24 using disposable identities created only for this pass.

### Test identities used

Run labels were disposable and staging-only.

Final successful run:

- `customer-a` -> user id prefix `6bbd59d3`
- `customer-b` -> user id prefix `6de57378`
- `business-a` -> user id prefix `da45481b`
- `business-b` -> user id prefix `fde7be86`

Emails were disposable `@example.test` addresses and were removed during cleanup.

### Test data created

Final successful run created:

- one disposable review -> id prefix `90eb1509`
- one disposable conversation -> id prefix `91ee96d2`
- two disposable messages -> id prefixes `801d26ae`, `6e756616`

### Exact pass/fail results

All checks passed in the final run.

#### `business_reviews` customer flow

- anonymous guest cannot insert `business_reviews`
  - passed with `401`
- anonymous guest cannot update `business_reviews`
  - passed
  - PostgREST returned `200 []`, but the row remained unchanged, which confirms RLS blocked the write
- anonymous guest cannot delete `business_reviews`
  - passed
  - PostgREST returned `200 []`, but the row remained present, which confirms RLS blocked the delete
- authenticated customer can insert their own review
  - passed
- authenticated customer can update allowed customer-owned review fields
  - passed
- authenticated customer cannot update `business_reply` / `business_reply_at`
  - passed with trigger rejection `400`
- authenticated customer cannot update another customer's review
  - passed
  - request matched zero writable rows and the review stayed unchanged

#### `business_reviews` business owner flow

- authenticated business owner can update `business_reply` / `business_reply_at` for their own business review
  - passed
- authenticated business owner cannot modify customer review fields such as `rating`, `title`, `body`
  - passed with trigger rejection `400`
- authenticated unrelated business owner cannot reply to another business's review
  - passed
  - request matched zero writable rows and the review stayed unchanged

#### Messaging flow

- authenticated customer can create/get a conversation with a business using `get_or_create_conversation`
  - passed
- participant can send a message
  - passed
- `handle_message_insert` updates `last_message_preview`
  - passed
- `last_message_preview` is truncated to 140 chars
  - passed
  - observed preview length: `140`
- participant can mark their own conversation as read
  - passed for both business and customer participant paths
- non-participant cannot mark the conversation as read
  - passed with `400`

#### Unread counts

- `unread_total(text, uuid)` still returns real counts in staging
  - passed
  - business unread count observed as `1` after customer message
  - customer unread count observed as `1` after business reply
- unread counts dropped back to `0` after the intended participant marked the conversation as read
  - passed
- production's temporary `select 0` fallback was not copied
  - confirmed earlier structurally and now confirmed behaviorally

#### App smoke checks after mutations

- `/api/home-listings?city=Long%20Beach&state=CA&limit=5` -> `200`
- `/api/search?q=gift` -> `200`
- `/listings` -> `200`
- public business reviews API still returned `200`
- public business reviews API still included safe `author_profile.display_name` and `author_profile.avatar_url` fields

### Cleanup performed

Cleanup was completed successfully in the final run.

Removed:

- disposable messages
- disposable conversation
- disposable review
- disposable `public.users` rows
- disposable auth users

No cleanup errors were recorded.

### Production readiness for the three applied migrations

For these three migrations only:

- `20260424110000_align_resolve_listing_ref_staging.sql`
- `20260424111000_align_business_reviews_write_parity_staging.sql`
- `20260424112000_align_messaging_security_parity_staging.sql`

Result:

- production-ready based on current staging verification

That readiness statement does not cover the still-open impersonation or admin-audit alignment work.

## Production rollout results

Completed in production on 2026-04-24 for these three migrations only:

- `20260424110000_align_resolve_listing_ref_staging.sql`
- `20260424111000_align_business_reviews_write_parity_staging.sql`
- `20260424112000_align_messaging_security_parity_staging.sql`

### Preconditions confirmed

- linked production project ref: `nbzqnjanqkzuwyxnkjtr`
- latest production backup available before apply: `2026-04-24T09:58:07.795Z`
- migration list showed only these three pending:
  - `20260424110000_align_resolve_listing_ref_staging.sql`
  - `20260424111000_align_business_reviews_write_parity_staging.sql`
  - `20260424112000_align_messaging_security_parity_staging.sql`

### Apply result

- `supabase db push --linked` applied exactly the three approved migrations
- post-apply migration list showed local and remote aligned through `20260424112000`
- no rollback was needed

### Production verification results

#### `resolve_listing_ref(text)`

Verified over the production anon RPC surface using a known public listing from the live homepage listings feed:

- sample listing UUID: `6a375200-cb0b-4726-9b9f-5dbadf276a96`
- sample listing public id: `b28deead1d`
- UUID lookup returned the expected row
- public-id lookup returned the expected row

Result:

- passed

#### Guest homepage/listings/search routes

Verified against the live production app:

- `GET /api/home-listings?city=Long%20Beach&state=CA&limit=5` returned listing data successfully
- `GET /api/search?q=gift` returned `200`
- `GET /listings` returned `200`

Result:

- passed

#### Public business reviews API

Verified against the live production app:

- `GET /api/public-business-reviews?businessId=5956a2b0-47c9-47ca-bad1-c8b6b1618972&limit=10` returned `200`
- response still included safe `author_profile.display_name` and `author_profile.avatar_url` fields

Result:

- passed

#### Anonymous review writes

Verified directly against the production Supabase REST surface:

- anonymous `PATCH` to `public.business_reviews` returned `401`
- response error was `permission denied for table business_reviews`

Result:

- passed

#### `business_reviews` policy and trigger parity

Verified against production metadata:

- policies now target `authenticated` only:
  - `reviews_business_reply_update`
  - `reviews_customer_insert`
  - `reviews_owner_delete`
  - `reviews_owner_update`
- `trg_enforce_business_reviews_update` exists
- existing production triggers still include:
  - `business_reviews_set_updated_at`
  - `t_audit_business_reviews`

Result:

- passed

#### Messaging behavior family

Verified against production metadata:

- `handle_message_insert()` is `SECURITY DEFINER`
- `handle_message_insert()` truncates preview with `left(new.body, 140)`
- `mark_conversation_read(uuid)` is `SECURITY DEFINER`
- `mark_conversation_read(uuid)` validates participant access before the update path

Result:

- passed

#### Unread counts

Verified against production metadata:

- `unread_total(text)` exists and delegates to `unread_total(text, auth.uid())`
- `unread_total(text, uuid)` still returns the temporary safe fallback:
  - `select 0`

Result:

- documented unchanged production behavior
- this rollout did not modify unread-count semantics

### Production verification gap intentionally left open

I did not run disposable authenticated review-mutation or messaging-mutation tests in production in this pass.

Reason:

- no production service-role test harness was available locally for safe disposable user creation and cleanup
- forcing ad hoc writes with non-disposable production identities would have been riskier than the benefit

This means:

- public and metadata verification passed
- authenticated production mutation behavior remains inferred from the applied definitions plus the prior full staging live test pass

### Remaining drift still open

Not included in this rollout:

- impersonation access family
- admin audit RPC family

Those remain separate follow-up items.
