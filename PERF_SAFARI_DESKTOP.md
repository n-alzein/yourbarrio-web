# Safari Desktop Account Nav Perf

## Goal
Measure and validate input-to-navigation latency for Customer Account navigation on Safari Desktop.

## Enable instrumentation
Use any one of:
- Query param: `?perf=1`
- Env flag: `NEXT_PUBLIC_PERF_DEBUG=1`
- Local storage: `localStorage.setItem("PERF_DEBUG", "1")`

Instrumentation is off by default.

## Important: Do NOT measure perf in dev mode
Safari perf testing must run in production-like mode. `next dev` uses Fast Refresh/HMR
and can introduce multi-second rebuild stalls that invalidate web-vitals and rAF data.

### Run prod-perf mode (required)
1) Stop any running dev server.
2) Run: `npm run perf:prod`
3) Open Safari at `http://localhost:3000/... ?perf=1`
   - Windows: use `cross-env NODE_ENV=production ...` if needed.

### Sanity check (required)
In Safari Console, confirm there are **no** `[HMR]` or `[Fast Refresh]` logs.

---

## Stall Flight Recorder (perf-only)
Enabled with `?perf=1` or `localStorage.PERF_DEBUG=1`.

What it captures (ring buffer, last ~3–5s):
- input events: pointerdown, click, keydown, wheel, scroll
- pointermove batches (counted every 250ms)
- history changes: pushState/replaceState/popstate
- ResizeObserver / IntersectionObserver callbacks (if hookable)
- fetch start/end and resource timing entries (URL + duration)

When a rAF gap > 250ms occurs, it logs:
`[STALL] { gapMs, recentCounts, recentMarks }`

---

## Safari Timelines capture (required)
1) Run prod mode: `npm run build && npm run start`
2) Safari → Develop → Show Web Inspector → Timelines
3) Enable:
   - JavaScript & Events
   - Rendering Frames
   - Layout & Rendering
4) Start recording
5) Reproduce a single stall (click tile)
6) Stop recording

Classify the 3–4s gap:
- Heavy JS (long script execution) → identify function/file
- Rendering/layout/compositing (no JS, long render) → CSS/layer/paint bottleneck
- Network should not stall rAF (JS still ticks), so usually not the culprit

Combine with `[STALL]` logs to identify what happened just before the stall.

---

## Server-Timing (TTFB attribution)
Enable with `?perf=1` or `NEXT_PUBLIC_PERF_DEBUG=1` and run in prod mode:
1) `npm run build && npm run start`
2) Safari → Network → select the slow document request (e.g. `/categories/...`).
3) Inspect `Server-Timing` response header for `mw_*` durations.
4) Check Console for `[SSR_TIMING]` entries (auth/supabase).

---

## Safari nav guard (click-stall mitigation)
When Safari detects an internal navigation, it temporarily sets `html.nav-in-progress`
to disable expensive animations/backdrop blurs during the click window.

Perf logs (when `?perf=1`):
- `[NAV_GUARD] intent { href, t }` on click
- `[NAV_GUARD] load { href, t, reloadedAt }` if the navigation caused a full document reload

## Origin sanity check (required for Safari Desktop)
With `?perf=1`, check the Console for:
- `[PERF_ORIGIN] { href, origin, baseURI, env: { ... } }`
- `[PERF_FETCH]` logs for any `_rsc` or `http://localhost:3000` requests.

Expected: `requestedOrigin === locationOrigin` for `_rsc` requests, and no `http://localhost:3000` URLs.

Note: Safari may not allow fetch wrapping; in that case you will see
`[PERF_FETCH_RESOURCE]` logs without stack traces instead of `[PERF_FETCH]`.

## Manual repro (Safari Desktop)
1) Open Safari and log in as a customer.
2) Navigate to `/account/orders?perf=1`.
3) Open Web Inspector → Timelines → record.
4) Click the "History" tab to navigate to purchase history.
5) Stop recording and inspect:
   - Event handling delay (click dispatch)
   - Main thread long tasks before handler
   - Layout/style recalculations near the click
6) In the Console, capture the `PERF_NAV` log entry:
   - `PERF_NAV { id, href, type, pointerdownDispatchDelayMs, clickDispatchDelayMs, recentMaxEventLoopLagMs, recentMaxRafGapMs, t_handlerStart, t_navStart, deltas, frameGaps, longtaskSummary }`

## Expected log fields
- `deltas.inputToHandler`: time from pointerdown to handler start.
- `deltas.handlerToNav`: handler start to router/navigation start.
- `pointerdownDispatchDelayMs`: input dispatch delay for pointerdown (goal: < 50ms).
- `clickDispatchDelayMs`: input dispatch delay for click (goal: < 50ms).
- `recentMaxEventLoopLagMs`: worst event-loop lag in last 5s.
- `recentMaxRafGapMs`: worst rAF gap in last 5s.
- `frameGaps.maxGap`: largest rAF gap during the interaction window.
- `longtaskSummary`: long task count/total if available.

## Playwright (webkit) repro
1) `NEXT_PUBLIC_PERF_DEBUG=1` (optional if using localStorage in test)
2) `E2E_CUSTOMER_EMAIL=...` and `E2E_CUSTOMER_PASSWORD=...`
3) Run: `npm run test:e2e -- account-nav-perf.spec.js --project=webkit`

The test asserts `inputToHandler` stays under the configured threshold.

---

## Safari Desktop Layers Debug (opt-in)
Enable with `?perf=1` or `localStorage.PERF_DEBUG=1`.

Overlay prints:
- `isSafariDesktop`
- `tiles` count (elements with `data-layer="tile"`)
- active overrides: backdrop-blur, shadow reduction, GPU forcing, filter override.

## Layer audit (customer nav + tiles)
Suspected layer creators (Safari Desktop):
- `components/nav/GlobalHeader.jsx`: `backdrop-blur-xl` on the fixed header, `backdrop-blur-lg` on search form, `backdrop-blur-2xl` on dropdowns.
- `components/nav/HeaderAccountWidget.jsx`: `backdrop-blur-sm` on profile button, `backdrop-blur-2xl` on account menu.
- `components/customer/CategoryTilesGrid.jsx`: repeated tiles with shadows (`shadow-sm`/`hover:shadow-md`) across the grid.

## Verification checklist (Safari Desktop)
1) Open Safari → Develop → Show Web Inspector → Layers.
2) Before/after compare:
   - Header + dropdowns: fewer overlapping layers when idle.
   - Tile grid: reduced layers per tile (check for fewer promoted rectangles).
3) Timelines/Performance:
   - Hover across tiles should not create large rendering spikes.
   - Navigation clicks should not show multi-second gaps.
4) With `?perf=1`:
   - `[realtime:perf]` logs stable (if enabled elsewhere).
   - `raf-stall`/event-loop lag spikes reduced during hover/navigation.

## Notes (fill in after measurement)
- Layers count reduced by: ___ (manual observation)
- Max rAF stall reduced from ~___ms to ~___ms during hover/navigation

## Tile hit-test behavior
- `tile-hit-test` runs only on click (capture), and only when `?perf=1` and the target is inside `data-layer="tile"`.
- Hover/move should produce zero `tile-hit-test` logs.
