-- Business type / listing category separation verification.
-- Run after applying 20260504120000_split_business_types_listing_categories.sql.

select count(*) as business_types_count
from public.business_types;

select count(*) as listing_categories_count
from public.listing_categories;

select count(*) as businesses_with_null_business_type_id
from public.businesses
where business_type_id is null;

select count(*) as listings_with_null_listing_category_id
from public.listings
where listing_category_id is null;

select
  b.business_type,
  b.category,
  count(*) as row_count
from public.businesses b
left join public.business_types bt
  on bt.id = b.business_type_id
where bt.id is null
group by b.business_type, b.category
order by row_count desc, b.business_type, b.category;

select
  l.category,
  l.listing_category,
  count(*) as row_count
from public.listings l
left join public.listing_categories lc
  on lc.id = l.listing_category_id
where lc.id is null
group by l.category, l.listing_category
order by row_count desc, l.category, l.listing_category;

select
  bt.slug,
  bt.name,
  count(b.id) as public_verified_active_business_count
from public.business_types bt
join public.businesses b
  on b.business_type_id = bt.id
where bt.is_active = true
  and b.verification_status in ('auto_verified', 'manually_verified')
  and b.account_status = 'active'
  and b.deleted_at is null
  and coalesce(b.is_internal, false) = false
group by bt.slug, bt.name, bt.sort_order
order by bt.sort_order, bt.name;
