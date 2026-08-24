import type { SeavantState } from "./seavant-state";

export const mockState: SeavantState = {
  vessel: {
    name: "SEAVANT DEMO",
    position: { lat: 12.0617, lon: 145.3467 },
    cog: 70,
    sog: 9.1,
    heading: 69,
    source: "simulated",
    updatedAt: "2026-08-25T09:30:00+11:00"
  },
  voyage: {
    departure: "Apra Harbor",
    destination: "Pearl Harbor",
    phase: "ocean",
    distanceRemainingNm: 1286,
    eta: "2026-08-27T14:30:00+11:00",
    etaWindowMinutes: 45,
    averageSog: 8.7,
    nextWaypoint: {
      name: "WP04",
      distanceNm: 46.2,
      eta: "2026-08-25T14:48:00+11:00"
    }
  },
  environment: {
    summary: "Conditions manageable. Wind and seas forecast to build later in the voyage.",
    windKt: 18,
    seaStateM: 2.4,
    pressureHpa: 1008,
    trend: "Wind increasing"
  },
  awareness: [
    {
      id: "wx-build",
      level: "advisory",
      horizon: "24h",
      title: "Weather building ahead",
      detail: "Wind expected to increase to 25–30 kt with seas building after 1800."
    },
    {
      id: "wp04",
      level: "info",
      horizon: "6h",
      title: "Next waypoint",
      detail: "WP04 in 46.2 NM at current voyage speed."
    },
    {
      id: "pos-report",
      level: "info",
      horizon: "6h",
      title: "Position report due",
      detail: "Next scheduled position report is due at 1200Z."
    }
  ],
  watch: {
    startedAt: "2026-08-25T08:00:00+11:00",
    distanceMadeGoodNm: 13.1,
    averageSog: 8.8,
    courseSummary: "Maintained approximately 070°T.",
    changes: [
      "Wind increased from 16 kt to 18 kt.",
      "Destination ETA moved 22 minutes later.",
      "No significant navigation events."
    ]
  }
};
