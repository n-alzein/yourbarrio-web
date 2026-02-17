# RSC Flight Redirect Guarding (Safari)

Safari can fail RSC/prefetch fetches when a server response for a flight request is a redirect (or an HTML fallback containing `NEXT_REDIRECT`), which can trigger hard navigations and reload loops.

Rule of thumb:
- Navigation/document requests may redirect for auth and role enforcement.
- RSC flight/prefetch requests must not redirect.

In this repo:
- `lib/next/requestKind.ts` classifies `isRscFlightRequest()` and `isNavigationRequest()`.
- `middleware.js` marks detected flight requests with `x-yb-rsc-flight: 1` and bypasses redirect logic for those requests.
- Redirecting pages/layouts/helpers check request kind so redirect logic only runs for real navigations.
