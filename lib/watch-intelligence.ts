import type { VesselState } from "./seavant-state";
import type { VoyageSolution } from "./voyage-engine";

export interface WatchStartSnapshot {
  capturedAt: string;
  cog: number;
  sog: number;
  xteNm: number;
  xteSide: "PORT" | "STARBOARD" | "ON TRACK";
  eta: string;
  nextWaypoint?: string;
  dtgNextNm?: number;
  routeRemainingNm: number;
  activeLeg?: { from: string; to: string };
}

export interface WatchIntelligence {
  etaDeltaMinutes: number;
  xteDeltaNm: number;
  routeRemainingDeltaNm: number;
  summary: string;
  detailLines: string[];
}

export function makeWatchStartSnapshot(vessel: VesselState, voyage: VoyageSolution): WatchStartSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    cog: vessel.cog,
    sog: vessel.sog,
    xteNm: voyage.diagnostics?.crossTrackErrorNm ?? 0,
    xteSide: voyage.diagnostics?.crossTrackSide ?? "ON TRACK",
    eta: voyage.eta,
    nextWaypoint: voyage.nextWaypoint?.name,
    dtgNextNm: voyage.nextWaypoint?.distanceNm,
    routeRemainingNm: voyage.distanceRemainingNm,
    activeLeg: voyage.diagnostics?.activeLeg
  };
}

export function buildWatchIntelligence(
  baseline: WatchStartSnapshot,
  vessel: VesselState,
  voyage: VoyageSolution,
  distanceMadeGoodNm: number,
  averageSog: number
): WatchIntelligence {
  const currentXte = voyage.diagnostics?.crossTrackErrorNm ?? 0;
  const currentSide = voyage.diagnostics?.crossTrackSide ?? "ON TRACK";
  const etaDeltaMinutes = (Date.parse(voyage.eta) - Date.parse(baseline.eta)) / 60_000;
  const routeRemainingDeltaNm = voyage.distanceRemainingNm - baseline.routeRemainingNm;
  const xteDeltaNm = currentXte - baseline.xteNm;
  const etaText = formatEtaDelta(etaDeltaMinutes);
  const leg = voyage.diagnostics?.activeLeg;
  const legText = leg ? `${leg.from}–${leg.to}` : "active route";
  const nextText = voyage.nextWaypoint ? `${voyage.nextWaypoint.name} · ${voyage.nextWaypoint.distanceNm.toFixed(1)} NM` : "No active waypoint";

  const summary = `Vessel remains on ${legText}. XTE is ${formatXte(currentXte, currentSide)}. Average SOG ${averageSog.toFixed(1)} kt. Destination ETA ${etaText.toLowerCase()}. ${voyage.nextWaypoint ? `${voyage.nextWaypoint.name} remains ${voyage.nextWaypoint.distanceNm.toFixed(1)} NM ahead.` : "No active waypoint."}`;

  return {
    etaDeltaMinutes,
    xteDeltaNm,
    routeRemainingDeltaNm,
    summary,
    detailLines: [
      `XTE ${formatXte(baseline.xteNm, baseline.xteSide)} → ${formatXte(currentXte, currentSide)}`,
      `ETA ${etaText}`,
      `SOG ${baseline.sog.toFixed(1)} → ${vessel.sog.toFixed(1)} kt · watch average ${averageSog.toFixed(1)} kt`,
      `Next waypoint ${nextText}`,
      `Made good ${distanceMadeGoodNm.toFixed(1)} NM · route remaining ${voyage.distanceRemainingNm.toFixed(1)} NM`
    ]
  };
}

export function formatEtaDelta(minutes: number) {
  if (!Number.isFinite(minutes) || Math.abs(minutes) < 15) return "essentially unchanged";
  const rounded = Math.max(15, Math.round(Math.abs(minutes) / 15) * 15);
  return minutes > 0 ? `slipped ${rounded} min` : `advanced ${rounded} min`;
}

export function formatXte(value: number, side: WatchStartSnapshot["xteSide"]) {
  if (!Number.isFinite(value) || side === "ON TRACK" || value < 0.01) return "on track";
  return `${value.toFixed(2)} NM ${side}`;
}
