import type { Position, VoyagePhase } from "./seavant-state";

export interface VoyageWaypoint {
  name: string;
  position: Position;
}

export interface VoyagePlan {
  departure: string;
  destination: string;
  departurePosition: Position;
  destinationPosition: Position;
  waypoints: VoyageWaypoint[];
  plannedSpeedKt: number;
}

export interface SpeedSample {
  sog: number;
  at: number;
}

export interface VoyageSolution {
  distanceRemainingNm: number;
  nextWaypoint?: { name: string; distanceNm: number; eta: string };
  averageSog: number;
  eta: string;
  etaWindowMinutes: number;
  etaConfidence: "LOW" | "MEDIUM" | "HIGH";
  progressPercent: number;
  phase: VoyagePhase;
}

const R_NM = 3440.065;

function rad(value: number) { return value * Math.PI / 180; }

export function distanceNm(a: Position, b: Position) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function rollingAverageSpeed(samples: SpeedSample[], now = Date.now(), windowMinutes = 60) {
  const cutoff = now - windowMinutes * 60_000;
  const valid = samples.filter((sample) => sample.at >= cutoff && Number.isFinite(sample.sog) && sample.sog > 0.2);
  if (!valid.length) return undefined;
  return valid.reduce((sum, sample) => sum + sample.sog, 0) / valid.length;
}

function phaseFor(distanceRemainingNm: number): VoyagePhase {
  if (distanceRemainingNm <= 3) return "arrival";
  if (distanceRemainingNm <= 50) return "approach";
  if (distanceRemainingNm <= 150) return "coastal";
  return "ocean";
}

export function solveVoyage(plan: VoyagePlan, position: Position, samples: SpeedSample[], now = Date.now()): VoyageSolution {
  const route = [...plan.waypoints, { name: plan.destination, position: plan.destinationPosition }];
  let nextIndex = route.findIndex((wp) => distanceNm(position, wp.position) > 1);
  if (nextIndex < 0) nextIndex = route.length - 1;

  const next = route[nextIndex];
  let remaining = distanceNm(position, next.position);
  for (let i = nextIndex; i < route.length - 1; i++) remaining += distanceNm(route[i].position, route[i + 1].position);

  const avg60 = rollingAverageSpeed(samples, now, 60);
  const avg180 = rollingAverageSpeed(samples, now, 180);
  const speed = avg60 ?? avg180 ?? plan.plannedSpeedKt;
  const hours = speed > 0.2 ? remaining / speed : 0;
  const etaMs = now + hours * 3_600_000;

  const sampleAgeMinutes = samples.length ? (now - samples[0].at) / 60_000 : 0;
  const confidence = sampleAgeMinutes >= 60 ? "HIGH" : sampleAgeMinutes >= 20 ? "MEDIUM" : "LOW";
  const window = confidence === "HIGH" ? Math.max(20, Math.round(hours * 1.5)) : confidence === "MEDIUM" ? Math.max(35, Math.round(hours * 2.5)) : Math.max(60, Math.round(hours * 4));

  const total = distanceNm(plan.departurePosition, plan.destinationPosition);
  const progress = total > 0 ? Math.max(0, Math.min(100, (1 - remaining / total) * 100)) : 0;
  const nextHours = speed > 0.2 ? distanceNm(position, next.position) / speed : 0;

  return {
    distanceRemainingNm: remaining,
    nextWaypoint: { name: next.name, distanceNm: distanceNm(position, next.position), eta: new Date(now + nextHours * 3_600_000).toISOString() },
    averageSog: speed,
    eta: new Date(etaMs).toISOString(),
    etaWindowMinutes: window,
    etaConfidence: confidence,
    progressPercent: progress,
    phase: phaseFor(remaining)
  };
}
