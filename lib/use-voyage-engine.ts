"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { VesselState } from "./seavant-state";
import { solveVoyage, type SpeedSample, type VoyagePlan } from "./voyage-engine";

const DEMO_PLAN: VoyagePlan = {
  departure: "Apra Harbor",
  destination: "Pearl Harbor",
  departurePosition: { lat: 13.44, lon: 144.65 },
  destinationPosition: { lat: 21.31, lon: -157.87 },
  plannedSpeedKt: 8.7,
  waypoints: [
    { name: "WP04", position: { lat: 12.45, lon: 146.1 } },
    { name: "WP05", position: { lat: 13.6, lon: 151.5 } },
    { name: "WP06", position: { lat: 17.0, lon: 166.0 } }
  ]
};

export function useVoyageEngine(vessel: VesselState) {
  const [samples, setSamples] = useState<SpeedSample[]>([]);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (vessel.source !== "live" || !Number.isFinite(vessel.sog)) return;
    const at = Date.now();
    setSamples((current) => [...current.filter((s) => at - s.at <= 3 * 60 * 60_000), { sog: vessel.sog, at }]);
  }, [vessel.sog, vessel.updatedAt, vessel.source]);

  return useMemo(() => {
    const now = Date.now();
    const effectiveSamples = samples.length
      ? samples
      : [{ sog: vessel.sog || DEMO_PLAN.plannedSpeedKt, at: startedAt.current }];
    return solveVoyage(DEMO_PLAN, vessel.position, effectiveSamples, now);
  }, [samples, vessel.position.lat, vessel.position.lon, vessel.sog]);
}
