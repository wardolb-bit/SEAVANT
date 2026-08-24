import type { AwarenessItem, VesselState } from "./seavant-state";
import type { VoyageSolution } from "./voyage-engine";
import { distanceNm } from "./voyage-engine";

export interface WatchEvent {
  id: string;
  at: string;
  type: "course" | "speed" | "voyage" | "awareness" | "system";
  summary: string;
}

export interface WatchSnapshot {
  startedAt: string;
  distanceMadeGoodNm: number;
  averageSog: number;
  courseSummary: string;
  changes: string[];
  events: WatchEvent[];
}

export function summarizeWatch(params: {
  startedAt: number;
  startPosition: VesselState["position"];
  vessel: VesselState;
  voyage: VoyageSolution;
  awareness: AwarenessItem[];
  events: WatchEvent[];
  speedSamples: number[];
}): WatchSnapshot {
  const avg = params.speedSamples.length
    ? params.speedSamples.reduce((sum, value) => sum + value, 0) / params.speedSamples.length
    : params.vessel.sog;
  const dmg = distanceNm(params.startPosition, params.vessel.position);
  const significant = params.events.slice(-5).map((event) => event.summary);
  if (!significant.length) significant.push("No significant watch events recorded.");

  return {
    startedAt: new Date(params.startedAt).toISOString(),
    distanceMadeGoodNm: dmg,
    averageSog: avg,
    courseSummary: `Maintaining approximately ${String(Math.round(params.vessel.cog)).padStart(3, "0")}°T. ${params.voyage.nextWaypoint ? `${params.voyage.nextWaypoint.name} remains ${params.voyage.nextWaypoint.distanceNm.toFixed(1)} NM ahead.` : "No active waypoint."}`,
    changes: significant,
    events: params.events
  };
}
