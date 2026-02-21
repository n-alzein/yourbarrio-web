"use client";

import dynamic from "next/dynamic";
import React, { memo, useCallback, useMemo, useState } from "react";

const mapDisabled = process.env.NEXT_PUBLIC_DISABLE_MAP === "1";
const GoogleMapClient = mapDisabled
  ? null
  : dynamic(() => import("@/components/GoogleMapClient"), {
      ssr: false,
      loading: () => (
        <div className="h-full rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-xl p-6 text-white/70 text-sm">
          Loading map…
        </div>
      ),
    });

function CustomerMap({
  mapEnabled = true,
  mapBusinesses,
  onBusinessesChange,
  onControlsReady,
  selectedBusiness,
  clickDiagEnabled,
  enableSearch = true,
  preferredCenter = null,
}) {
  const [mapControls, setMapControls] = useState(null);

  const handleControlsReady = useCallback(
    (controls) => {
      setMapControls(controls);
      onControlsReady?.(controls);
    },
    [onControlsReady]
  );

  const mapProps = useMemo(
    () => ({
      radiusKm: 25,
      showBusinessErrors: false,
      containerClassName: "w-full h-full",
      cardClassName:
        "h-full rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-xl p-4 text-white flex flex-col gap-3",
      mapClassName: "h-[40vh] sm:h-[45vh] md:h-[360px] w-full",
      title: "",
      enableCategoryFilter: false,
      enableSearch,
      placesMode: "manual",
      disableGooglePlaces: false,
      prefilledBusinesses: mapBusinesses,
      onBusinessesChange,
      onControlsReady: handleControlsReady,
      preferredCenter,
    }),
    [enableSearch, mapBusinesses, onBusinessesChange, handleControlsReady, preferredCenter]
  );

  if (!mapEnabled || !GoogleMapClient) {
    return (
      <div className="h-full rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-xl p-6 text-white/70 text-sm flex items-center">
        {mapDisabled ? "Map disabled for diagnostics" : "Map disabled (HOME_BISECT_MAP=0)"}
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col gap-3"
      data-clickdiag={clickDiagEnabled ? "map-modal" : undefined}
    >
      <div className="flex-1 min-h-[320px]">
        <GoogleMapClient {...mapProps} />
      </div>
    </div>
  );
}

export default memo(CustomerMap);
