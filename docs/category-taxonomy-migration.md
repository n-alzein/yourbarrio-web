# Category taxonomy migration

Mixed model before this change:
- `businesses.category` and `users.category` were used as the business identity in onboarding, profile editing, cards, public business pages, admin views, and nearby/search business results.
- `listings.category` and `category_id` were used for listing classification in listing CRUD, browse pages, listing details, saved items, search, and related storefront UI.
- Shared fallback image logic and some UI labels treated both as one taxonomy, which caused business identity and listing classification to blur together.

What changed:
- Added a short `business_type` taxonomy for business identity and kept detailed listing taxonomy under `listing_category`.
- Added compatibility helpers so reads prefer `business_type` or `listing_category`, then fall back to legacy `category`.
- Split placeholder resolution into business-type and listing-category helpers.

Temporary compatibility behavior:
- Business reads still fall back to legacy `category` and infer a broad `business_type` when only old data exists.
- Listing reads still fall back to `category_info` or legacy `category` when `listing_category` is not present yet.
- Write paths currently keep legacy `category` populated alongside the new fields to avoid breaking older queries and UI during rollout.
