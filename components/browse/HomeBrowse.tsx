import StrapiBannersServer from "@/components/banners/StrapiBannersServer";
import CustomerHomeClient from "@/app/(customer)/customer/home/CustomerHomeClient";
import type { BrowseMode, HomeBrowseData } from "@/lib/browse/getHomeBrowseData";

type HomeBrowseProps = {
  mode: BrowseMode;
  initialData: HomeBrowseData;
};

export default async function HomeBrowse({ mode, initialData }: HomeBrowseProps) {
  return (
    <>
      <div className="relative z-10 mt-0 md:-mt-12">
        <StrapiBannersServer
          banners={initialData.banners}
          locationName={initialData.city}
        />
      </div>

      <CustomerHomeClient
        mode={mode}
        featuredCategories={initialData.featuredCategories}
        featuredCategoriesError={initialData.featuredCategoriesError}
        initialListings={initialData.listings}
      />
    </>
  );
}
