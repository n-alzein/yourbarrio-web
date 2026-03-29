import { fetchStrapiBanners, strapiAbsoluteUrl } from "@/lib/strapi";
import HeroBanner from "@/components/home/HeroBanner";

function isBannerLive(banner: any, now: Date) {
  if (banner?.startAt) {
    const startAt = new Date(banner.startAt);
    if (!Number.isNaN(startAt.getTime()) && now < startAt) return false;
  }

  if (banner?.endAt) {
    const endAt = new Date(banner.endAt);
    if (!Number.isNaN(endAt.getTime()) && now > endAt) return false;
  }

  return true;
}

export default async function StrapiBannersServer({
  banners: preloadedBanners,
  locationName = null,
}: {
  banners?: any[] | null;
  locationName?: string | null;
} = {}) {
  let banners: any[] = Array.isArray(preloadedBanners) ? preloadedBanners : [];
  if (!Array.isArray(preloadedBanners)) {
    try {
      banners = await fetchStrapiBanners();
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[StrapiBannersServer] failed to load banners:", error);
      }
      return null;
    }
  }

  const now = new Date();
  const liveBanners = banners
    .map((banner) => banner?.attributes ?? banner)
    .filter(
      (banner) =>
        banner?.placement === "HOME_TOP" &&
        banner?.isActive === true &&
        isBannerLive(banner, now),
    )
    .sort((a, b) => Number(b?.priority ?? 0) - Number(a?.priority ?? 0));

  if (liveBanners.length === 0) return null;

  return (
    <section className="w-full">
      <div className="w-full">
        <div className="space-y-6">
          {liveBanners.map((banner, index) => {
            const imageCandidate =
              banner?.image?.formats?.large?.url ||
              banner?.image?.formats?.medium?.url ||
              banner?.image?.formats?.small?.url ||
              banner?.image?.url ||
              banner?.image?.formats?.thumbnail?.url ||
              null;
            const imageUrl = strapiAbsoluteUrl(imageCandidate);
            return (
              <HeroBanner
                key={banner?.id ?? banner?.title ?? banner?.ctaURL ?? `banner-${index}`}
                banner={banner}
                imageUrl={imageUrl}
                locationName={locationName}
                priority={index === 0}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
