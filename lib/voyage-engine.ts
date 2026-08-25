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
const WGS84_A_M = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const WGS84_E = Math.sqrt(WGS84_E2);
const METERS_PER_NM = 1852;
function rad(value: number) { return value * Math.PI / 180; }
function normalizeLonDelta(delta: number) { let d = delta; while (d > 180) d -= 360; while (d < -180) d += 360; return d; }
function clampLatRad(phi: number) { const limit = Math.PI / 2 - 1e-12; return Math.max(-limit, Math.min(limit, phi)); }
function mercatorY(latDeg: number) { const phi = clampLatRad(rad(latDeg)); return Math.log(Math.tan(Math.PI / 4 + phi / 2)); }
function ellipsoidalMercatorY(latDeg: number) {
  const phi = clampLatRad(rad(latDeg));
  const sinPhi = Math.sin(phi);
  return Math.log(Math.tan(Math.PI / 4 + phi / 2)) - (WGS84_E / 2) * Math.log((1 + WGS84_E * sinPhi) / (1 - WGS84_E * sinPhi));
}
function meridionalArcM(phi: number) {
  const e2 = WGS84_E2, e4 = e2 * e2, e6 = e4 * e2;
  return WGS84_A_M * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi) + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi) - (35 * e6 / 3072) * Math.sin(6 * phi));
}

export function distanceNm(a: Position, b: Position) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(normalizeLonDelta(b.lon - a.lon));
  const lat1 = rad(a.lat), lat2 = rad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function rhumbDistanceNm(a: Position, b: Position) {
  const phi1 = rad(a.lat), phi2 = rad(b.lat);
  const dLambda = rad(normalizeLonDelta(b.lon - a.lon));
  const dPsi = ellipsoidalMercatorY(b.lat) - ellipsoidalMercatorY(a.lat);
  const course = Math.atan2(dLambda, dPsi);
  const dM = meridionalArcM(phi2) - meridionalArcM(phi1);
  let meters: number;
  if (Math.abs(Math.cos(course)) > 1e-10 && Math.abs(phi2 - phi1) > 1e-12) {
    meters = Math.abs(dM / Math.cos(course));
  } else {
    const phi = (phi1 + phi2) / 2;
    const sinPhi = Math.sin(phi);
    const primeVerticalRadius = WGS84_A_M / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
    meters = Math.abs(primeVerticalRadius * Math.cos(phi) * dLambda);
  }
  return meters / METERS_PER_NM;
}

function projectToRhumbLeg(start: Position, end: Position, point: Position) {
  let endLon = end.lon;
  while (endLon - start.lon > 180) endLon -= 360;
  while (endLon - start.lon < -180) endLon += 360;
  let pointLon = point.lon;
  while (pointLon - start.lon > 180) pointLon -= 360;
  while (pointLon - start.lon < -180) pointLon += 360;

  const ax = rad(start.lon), ay = mercatorY(start.lat);
  const bx = rad(endLon), by = mercatorY(end.lat);
  const px = rad(pointLon), py = mercatorY(point.lat);
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const rawT = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0;
  const t = Math.max(0, Math.min(1, rawT));
  const cx = ax + t * vx, cy = ay + t * vy;
  const dx = px - cx, dy = py - cy;

  const scale = Math.cos(rad(point.lat));
  const segmentDistanceNm = Math.hypot(dx, dy) * R_NM * scale;
  const signedCross = len2 > 0 ? (vx * wy - vy * wx) / Math.sqrt(len2) : 0;
  const signedXteNm = signedCross * R_NM * scale;
  const legLengthNm = rhumbDistanceNm(start, end);
  const alongTrackNm = Math.max(0, Math.min(legLengthNm, legLengthNm * t));
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
    const projected = projectToRhumbLeg(route[i].position, route[i + 1].position, position);
    if (projected.segmentDistanceNm < best.distance) best = { index: i, distance: projected.segmentDistanceNm, t: projected.t, signedXte: projected.signedXteNm, alongTrackNm: projected.alongTrackNm, legLengthNm: projected.legLengthNm };
  }
  if (best.t > 0.985 && best.index < route.length - 2) {
    const nextProjection = projectToRhumbLeg(route[best.index + 1].position, route[best.index + 2].position, position);
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
  const legLength = leg.legLengthNm || rhumbDistanceNm(from.position, next.position);
  const alongTrack = Math.max(0, Math.min(legLength, leg.alongTrackNm));
  const legRemaining = Math.max(0, legLength - alongTrack);

  let downstream = 0;
  for (let i = legIndex + 1; i < fullRoute.length - 1; i++) downstream += rhumbDistanceNm(fullRoute[i].position, fullRoute[i + 1].position);

  const nextDistance = rhumbDistanceNm(position, next.position);
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

  const total = fullRoute.slice(0, -1).reduce((sum, wp, i) => sum + rhumbDistanceNm(wp.position, fullRoute[i + 1].position), 0);
  const progress = total > 0 ? Math.max(0, Math.min(100, (1 - remaining / total) * 100)) : 0;
  const nextHours = speed > 0.2 ? nextDistance / speed : 0;
  const xte = Math.abs(leg.signedXte);
  const crossTrackSide: RouteDiagnostics["crossTrackSide"] = xte < 0.01 ? "ON TRACK" : leg.signedXte > 0 ? "PORT" : "STARBOARD";

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
