-- Staging-only schema cleanup
-- Intended target: staging (crskbfbleiubpkvyvvlf)
-- Production must not be modified with this file.
-- This file records the reviewed cleanup set that was executed on staging on 2026-04-24.
-- It remains replay-safe because every statement uses IF EXISTS.

-- Objects selected for drop
-- table public.business_categories_legacy_archive | rows=125 | deps=none
-- table public.listing_taxonomy_legacy_archive | rows=5 | deps=none
-- table public.listings_legacy_cleanup_archive | rows=7 | deps=none
-- function public.admin_list_users(text,text,text,integer,integer) | rows=0 | deps=none
-- function public.admin_resolve_user_ref(text) | rows=0 | deps=none
-- function public.admin_search_accounts(text,text) | rows=0 | deps=none

begin;
drop table if exists public.business_categories_legacy_archive cascade;
drop table if exists public.listing_taxonomy_legacy_archive cascade;
drop table if exists public.listings_legacy_cleanup_archive cascade;
drop function if exists public.admin_list_users(text,text,text,integer,integer) cascade;
drop function if exists public.admin_resolve_user_ref(text) cascade;
drop function if exists public.admin_search_accounts(text,text) cascade;
commit;
