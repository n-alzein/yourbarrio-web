# Safari Reload Loop Probe

## Setup

1. Start dev server with diagnostics:
   - `NEXT_PUBLIC_RSC_LOOP_DIAG=1 npm run dev`
2. Optional automated check (uses Playwright/Chromium):
   - `node scripts/rsc_loop_diag_probe.mjs`
   - Expect: `SUMMARY refresh_attempts=1 blocked_events>=1`
3. Open Safari Web Inspector console.
4. Reproduce the flow that previously caused white-page/reload loops (business/customer page transition).

## Expected Diagnostic Logs

- You may see one refresh attempt log:
  - `[RSC_LOOP_DIAG] router.refresh_attempt ...`
  - Stack should point to `AuthProvider[useEffect()]` auth-event refresh path.
- If repeated attempts happen quickly, the guard must trip:
  - `[RSC_LOOP_DIAG] auto_refresh_blocked ...`
- Fetch failures should log once per failing request:
  - `[RSC_LOOP_DIAG] { event: "fetch_error", message: "...Load failed..." }`

## Pass Criteria

1. At most one automatic `router.refresh` attempt per mount burst.
2. If failures repeat, auto refresh stops for cooldown period (banner shown).
3. Page remains visible (no repeated white-screen navigation loop).
4. Retry requires explicit user action (`Retry now` banner button).

## Quick Validation Checklist

- [ ] No repeated `location.reload`/`location.replace` spam in console.
- [ ] No `router.refresh_attempt` spam (>2 in 10s).
- [ ] `auto_refresh_blocked` appears when repeated failures occur.
- [ ] After cooldown or manual retry, navigation recovers without loop.
