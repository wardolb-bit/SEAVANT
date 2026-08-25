import type { Position, VoyagePhase } from "./seavant-state";

export interface VoyageWaypoint { name: string; position: Position; }
export interface VoyagePlan { departure: string; destination: string; departurePosition: Position; destinationPosition: Position; waypoints: VoyageWaypoint[]; plannedSpeedKt: number; }
export interface SpeedSample { sog: number; at: number; }
export interface RouteDiagnostics {
  activeLeg: { from: string; to: string };
  legLengthNm: number;
  alongTrackNm: number;
  legRemainingNm: number;
  crossTrackErrorNm: number;
  crossTrackSide: "PORT" | "STARBOARD" | "ON TRACK";
  projectedRouteRemainingNm: number;
}
export interface VoyageSolution { distanceRemainingNm: number; nextWaypoint?: { name: string; distanceNm: number; eta: string }; averageSog: number; eta: string; etaWindowMinutes: number; etaConfidence: "LOW" | "MEDIUM" | "HIGH"; progressPercent: number; phase: VoyagePhase; diagnostics: RouteDiagnostics; }

const R_NM = 3440.065;
function rad(value: number) { return value * Math.PI / 180; }
function normalizeLonDelta(delta: number) { let d = delta; while (d > 180) d -= 360; while (d < -180) d += 360; return d; }
function normalizeAngleRad(value: number) { let a = value; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

export function distanceNm(a: Position, b: Position) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(normalizeLonDelta(b.lon - a.lon));
  const lat1 = rad(a.lat), lat2 = rad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function initialBearingRad(a: Position, b: Position) {
  const lat1 = rad(a.lat), lat2 = rad(b.lat);
  const dLon = rad(normalizeLonDelta(b.lon - a.lon));
  return Math.atan2(Math.sin(dLon) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon));
}

function projectToGreatCircleLeg(start: Position, end: Position, point: Position) {
  const legLengthNm = distanceNm(start, end);
  if (legLengthNm < 0.000001) return { legLengthNm, alongTrackNm: 0, signedXteNm: distanceNm(start, point), segmentDistanceNm: distanceNm(start, point), t: 0 };

  const delta13 = distanceNm(start, point) / R_NM;
  const theta13 = initialBearingRad(start, point);
  const theta12 = initialBearingRad(start, end);
  const dTheta = normalizeAngleRad(theta13 - theta12);
  const deltaXt = Math.asin(Math.max(-1, Math.min(1, Math.sin(delta13) * Math.sin(dTheta))));
  const signedXteNm = deltaXt * R_NM;
  const deltaAt = Math.atan2(Math.sin(delta13) * Math.cos(dTheta), Math.cos(delta13));
  const rawAlongTrackNm = deltaAt * R_NM;
  const alongTrackNm = Math.max(0, Math.min(legLengthNm, rawAlongTrackNm));
  const t = legLengthNm > 0 ? alongTrackNm / legLengthNm : 0;
  const segmentDistanceNm = rawAlongTrackNm < 0 ? distanceNm(point, start) : rawAlongTrackNm > legLengthNm ? distanceNm(point, end) : Math.abs(signedXteNm);
  return { legLengthNm, alongTrackNm, signedXteNm, segmentDistanceNm, t };
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

function nearestLeg(route: VoyageWaypoint[], position: Position) {
  if (route.length < 2) return { index: 0, distance: 0, t: 0, signedXte: 0, alongTrackNm: 0, legLengthNm: 0 };
  let best = { index: 0, distance: Infinity, t: 0, signedXte: 0, alongTrackNm: 0, legLengthNm: 0 };
  for (let i = 0; i < route.length - 1; i++) {
    const projected = projectToGreatCircleLeg(route[i].position, route[i + 1].position, position);
    if (projected.segmentDistanceNm < best.distance) {
      best = { index: i, distance: projected.segmentDistanceNm, t: projected.t, signedXte: projected.signedXteNm, alongTrackNm: projected.alongTrackNm, legLengthNm: projected.legLengthNm };
    }
  }
  if (best.t > 0.985 && best.index < route.length - 2) {
    const nextProjection = projectToGreatCircleLeg(route[best.index + 1].position, route[best.index + 2].position, position);
    return { index: best.index + 1, distance: nextProjection.segmentDistanceNm, t: nextProjection.t, signedXte: nextProjection.signedXteNm, alongTrackNm: nextProjection.alongTrackNm, legLengthNm: nextProjection.legLengthNm };
  }
  return best;
}

export function solveVoyage(plan: VoyagePlan, position: Position, samples: SpeedSample[], now = Date.now()): VoyageSolution {
  const fullRoute: VoyageWaypoint[] = [
    { name: plan.departure, position: plan.departurePosition },
    ...plan.waypoints,
    { name: plan.destination, position: plan.destinationPosition }
  ];

  const leg = nearestLeg(fullRoute, position);
  const legIndex = leg.index;
  const from = fullRoute[legIndex];
  const next = fullRoute[Math.min(legIndex + 1, fullRoute.length - 1)];
  const legLength = leg.legLengthNm || distanceNm(from.position, next.position);
  const alongTrack = Math.max(0, Math.min(legLength, leg.alongTrackNm));
  const legRemaining = Math.max(0, legLength - alongTrack);

  let downstream = 0;
  for (let i = legIndex + 1; i < fullRoute.length - 1; i++) downstream += distanceNm(fullRoute[i].position, fullRoute[i + 1].position);

  const nextDistance = distanceNm(position, next.position);
  const remaining = nextDistance + downstream;
  const projectedRemaining = legRemaining + downstream;

  const avg60 = rollingAverageSpeed(samples, now, 60);
  const avg180 = rollingAverageSpeed(samples, now, 180);
  const speed = avg60 ?? avg180 ?? plan.plannedSpeedKt;
  const hours = speed > 0.2 ? remaining / speed : 0;
  const etaMs = now + hours * 3_600_000;

  const sampleAgeMinutes = samples.length ? (now - samples[0].at) / 60_000 : 0;
  const confidence = sampleAgeMinutes >= 60 ? "HIGH" : sampleAgeMinutes >= 20 ? "MEDIUM" : "LOW";
  const window = confidence === "HIGH" ? Math.max(20, Math.round(hours * 1.5)) : confidence === "MEDIUM" ? Math.max(35, Math.round(hours * 2.5)) : Math.max(60, Math.round(hours * 4));

  const total = fullRoute.slice(0, -1).reduce((sum, wp, i) => sum + distanceNm(wp.position, fullRoute[i + 1].position), 0);
  const progress = total > 0 ? Math.max(0, Math.min(100, (1 - remaining / total) * 100)) : 0;
  const nextHours = speed > 0.2 ? nextDistance / speed : 0;
  const xte = Math.abs(leg.signedXte);
  const crossTrackSide: RouteDiagnostics["crossTrackSide"] = xte < 0.01 ? "ON TRACK" : leg.signedXte > 0 ? "STARBOARD" : "PORT";

  return {
    distanceRemainingNm: remaining,
    nextWaypoint: { name: next.name, distanceNm: nextDistance, eta: new Date(now + nextHours * 3_600_000).toISOString() },
    averageSog: speed,
    eta: new Date(etaMs).toISOString(),
    etaWindowMinutes: window,
    etaConfidence: confidence,
    progressPercent: progress,
    phase: phaseFor(remaining),
    diagnostics: {
      activeLeg: { from: from.name, to: next.name },
      legLengthNm: legLength,
      alongTrackNm: alongTrack,
      legRemainingNm: legRemaining,
      crossTrackErrorNm: xte,
      crossTrackSide,
      projectedRouteRemainingNm: projectedRemaining
    }
  };
}
