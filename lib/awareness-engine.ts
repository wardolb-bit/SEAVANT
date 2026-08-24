import type { AwarenessItem, VoyagePhase } from "./seavant-state";
import type { VoyageSolution } from "./voyage-engine";

export interface AwarenessSnapshot {
  voyage: VoyageSolution;
  previousEta?: string;
  previousPhase?: VoyagePhase;
  currentSog: number;
  positionReportDueAt?: string;
}

function hoursUntil(iso: string, now: number) {
  return Math.max(0, (new Date(iso).getTime() - now) / 3_600_000);
}

function horizonForHours(hours: number): AwarenessItem["horizon"] {
  if (hours <= 0.25) return "now";
  if (hours <= 6) return "6h";
  if (hours <= 24) return "24h";
  return "voyage";
}

export function buildAwareness(snapshot: AwarenessSnapshot, now = Date.now()): AwarenessItem[] {
  const items: AwarenessItem[] = [];
  const { voyage } = snapshot;

  if (voyage.nextWaypoint) {
    const hours = hoursUntil(voyage.nextWaypoint.eta, now);
    items.push({
      id: "next-waypoint",
      level: hours <= 1 ? "advisory" : "info",
      horizon: horizonForHours(hours),
      title: `${voyage.nextWaypoint.name} in ${voyage.nextWaypoint.distanceNm.toFixed(1)} NM`,
      detail: `Estimated in ${hours < 1 ? Math.max(1, Math.round(hours * 60)) + " min" : hours.toFixed(1) + " hr"} at ${voyage.averageSog.toFixed(1)} kt voyage speed.`,
      dueAt: voyage.nextWaypoint.eta
    });
  }

  if (snapshot.positionReportDueAt) {
    const hours = hoursUntil(snapshot.positionReportDueAt, now);
    if (hours <= 24) items.push({
      id: "position-report",
      level: hours <= 0.5 ? "advisory" : "info",
      horizon: horizonForHours(hours),
      title: "Position report due",
      detail: hours <= 0.25 ? "Position report is due now." : `Scheduled in ${hours < 1 ? Math.round(hours * 60) + " min" : hours.toFixed(1) + " hr"}.`,
      dueAt: snapshot.positionReportDueAt
    });
  }

  if (snapshot.previousEta) {
    const shiftMinutes = Math.round((new Date(voyage.eta).getTime() - new Date(snapshot.previousEta).getTime()) / 60_000);
    if (Math.abs(shiftMinutes) >= 30) items.push({
      id: "eta-shift",
      level: Math.abs(shiftMinutes) >= 90 ? "advisory" : "info",
      horizon: "voyage",
      title: `Destination ETA moved ${shiftMinutes > 0 ? "later" : "earlier"}`,
      detail: `${Math.abs(shiftMinutes)} minute change from the previous stable estimate.`
    });
  }

  const speedDelta = snapshot.currentSog - voyage.averageSog;
  if (Math.abs(speedDelta) >= 0.7) items.push({
    id: "speed-trend",
    level: Math.abs(speedDelta) >= 1.5 ? "advisory" : "info",
    horizon: "now",
    title: speedDelta < 0 ? "Speed below voyage average" : "Speed above voyage average",
    detail: `Current SOG ${snapshot.currentSog.toFixed(1)} kt versus ${voyage.averageSog.toFixed(1)} kt rolling voyage speed.`
  });

  if (snapshot.previousPhase && snapshot.previousPhase !== voyage.phase) items.push({
    id: "phase-change",
    level: voyage.phase === "approach" || voyage.phase === "arrival" ? "advisory" : "info",
    horizon: voyage.phase === "arrival" ? "now" : "arrival",
    title: `Voyage phase changed to ${voyage.phase.toUpperCase()}`,
    detail: `SEAVANT transitioned from ${snapshot.previousPhase.toUpperCase()} based on remaining voyage distance.`
  });

  if (voyage.phase === "approach") items.push({ id: "approach", level: "advisory", horizon: "arrival", title: "Approach phase active", detail: `${voyage.distanceRemainingNm.toFixed(0)} NM remain to destination. Begin prioritizing arrival and approach requirements.` });
  if (voyage.phase === "arrival") items.push({ id: "arrival", level: "action", horizon: "now", title: "Arrival phase active", detail: `${voyage.distanceRemainingNm.toFixed(1)} NM remain to destination.` });

  if (!items.some((item) => item.horizon === "now" && (item.level === "warning" || item.level === "action" || item.level === "advisory"))) {
    items.push({ id: "quiet-now", level: "info", horizon: "now", title: "No immediate voyage concerns", detail: "No voyage-derived condition currently requires watchstander action." });
  }

  const rank = { now: 0, "6h": 1, "24h": 2, voyage: 3, arrival: 4 };
  const levelRank = { action: 0, warning: 1, advisory: 2, info: 3 };
  return items.sort((a, b) => rank[a.horizon] - rank[b.horizon] || levelRank[a.level] - levelRank[b.level]);
}
