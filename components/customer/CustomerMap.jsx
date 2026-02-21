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
  activeBusinessId,
  hoveredBusinessId,
  selectedBusinessId,
  onMarkerHover,
  onMarkerLeave,
  onMarkerClick,
  showRecenterControl = false,
  recenterButtonTestId = "recenter-map",
  markerClickBehavior = "navigate",
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
        "h-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-xl p-0 text-white flex flex-col overflow-hidden",
      mapClassName: "h-full w-full rounded-2xl overflow-hidden",
      title: "",
      enableCategoryFilter: false,
      enableSearch,
      placesMode: "manual",
      disableGooglePlaces: false,
      prefilledBusinesses: mapBusinesses,
      onBusinessesChange,
      onControlsReady: handleControlsReady,
      preferredCenter,
      activeBusinessId,
      hoveredBusinessId,
      selectedBusiness,
      selectedBusinessId:
        selectedBusinessId ??
        (selectedBusiness && (selectedBusiness.id || selectedBusiness.public_id)) ??
        null,
      onMarkerHover,
      onMarkerLeave,
      onMarkerClick,
      showRecenterControl,
      recenterButtonTestId,
      markerClickBehavior,
    }),
    [
      enableSearch,
      mapBusinesses,
      onBusinessesChange,
      handleControlsReady,
      preferredCenter,
      activeBusinessId,
      hoveredBusinessId,
      selectedBusinessId,
      selectedBusiness,
      onMarkerHover,
      onMarkerLeave,
      onMarkerClick,
      showRecenterControl,
      recenterButtonTestId,
      markerClickBehavior,
    ]
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
