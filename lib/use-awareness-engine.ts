"use client";

import { useEffect, useMemo, useRef } from "react";
import type { VesselState, VoyagePhase } from "./seavant-state";
import type { VoyageSolution } from "./voyage-engine";
import { buildAwareness } from "./awareness-engine";

export function useAwarenessEngine(vessel: VesselState, voyage: VoyageSolution) {
  const previousEta = useRef<string>();
  const previousPhase = useRef<VoyagePhase>();

  const awareness = useMemo(() => buildAwareness({
    voyage,
    previousEta: previousEta.current,
    previousPhase: previousPhase.current,
    currentSog: vessel.sog,
    positionReportDueAt: nextPositionReport()
  }), [voyage, vessel.sog]);

  useEffect(() => {
    previousEta.current = voyage.eta;
    previousPhase.current = voyage.phase;
  }, [voyage.eta, voyage.phase]);

  return awareness;
}

function nextPositionReport(now = new Date()) {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  const hour = next.getUTCHours();
  const reportHours = [0, 6, 12, 18];
  const future = reportHours.find((h) => h > hour);
  if (future !== undefined) next.setUTCHours(future);
  else { next.setUTCDate(next.getUTCDate() + 1); next.setUTCHours(0); }
  return next.toISOString();
}
