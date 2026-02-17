This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Auth Routing and Diagnostics

- Authenticated routes live under `app/(app)` and are protected by middleware plus server layouts.
- Public routes live under `app/(public)` and always render the public shell.
- To enable client auth diagnostics, set `NEXT_PUBLIC_AUTH_DIAG=1` and inspect console logs for auth state transitions.

### RSC Redirect Safety (Safari)

- Any request containing `_rsc` must never return HTML and must never redirect.
- Middleware enforces this by returning a stable non-HTML response (`204` with `content-type: text/x-component`) for `_rsc` requests on app pages.
- Auth/role redirects are limited to true document navigations determined by fetch metadata (`sec-fetch-mode`, `sec-fetch-dest`, `sec-fetch-user`).
- API routes and internal/assets are not rewritten for `_rsc`.

Remote probe evidence (2026-02-15 UTC):
- `BASE_URL=https://yourbarrio.com` returns `307` for all probed variants due to host canonical redirect to `https://www.yourbarrio.com/...`.
- `BASE_URL=https://www.yourbarrio.com`:
  - `/?_rsc=test` and `/business?_rsc=test` flight-like probes return `200`.
  - `/business/onboarding?_rsc=test` flight-like probes return `307 -> /signin?modal=signin&next=%2Fbusiness%2Fonboarding` (this is the app-level redirect to eliminate).

Safari verification:
- Open Network panel and inspect `/business/onboarding?_rsc=...` requests.
- Confirm response headers include `x-yb-request-kind` and `x-yb-redirect-suppressed`.
- For any flight/prefetch request, expected is `x-yb-request-kind: non-navigation`, `x-yb-redirect-suppressed: 1`, and no `Location` header.

Manual Safari smoke test:
- iPhone Safari: login → open `/customer/home` → scroll for 60s → background/foreground → no public navbar flash and no blank screen.
- Unauthenticated access to `/customer/home` redirects to `/`.
- Unauthenticated access to `/business/dashboard` redirects to `/business-auth/login`.

## Business Categories (Listings)

- Listings now store a normalized `category_id` that references `business_categories`, while the legacy `listings.category` string remains for compatibility.
- The migration `supabase/migrations/20260131123000_business_categories.sql` seeds canonical categories, inserts any legacy ones, and backfills `category_id`.
- A trigger keeps `listings.category` in sync with `category_id` on writes; plan to remove the legacy column after all clients have migrated.
