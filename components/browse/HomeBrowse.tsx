import HeroBanner from "@/components/home/HeroBanner";
import CustomerHomeClient from "@/app/(customer)/customer/home/CustomerHomeClient";
import { homeHeroConfig } from "@/lib/home/homeHero";
import type { BrowseMode, HomeBrowseData } from "@/lib/browse/getHomeBrowseData";

type HomeBrowseProps = {
  mode: BrowseMode;
  initialData: HomeBrowseData;
};

export default async function HomeBrowse({ mode, initialData }: HomeBrowseProps) {
  return (
    <>
      <div className="relative z-10 mt-0 md:-mt-12">
        <HeroBanner hero={homeHeroConfig} priority />
      </div>

      <CustomerHomeClient
        mode={mode}
        featuredCategories={initialData.featuredCategories}
        featuredCategoriesError={initialData.featuredCategoriesError}
        initialListings={initialData.listings}
        initialCity={initialData.city}
      />
    </>
  );
}
