export type VoyagePhase = "departure" | "coastal" | "ocean" | "approach" | "arrival";
export type AttentionLevel = "info" | "advisory" | "warning" | "action";

export interface Position {
  lat: number;
  lon: number;
}

export interface VesselState {
  name: string;
  position: Position;
  cog: number;
  sog: number;
  heading?: number;
  source: "live" | "simulated" | "manual";
  updatedAt: string;
}

export interface VoyageState {
  departure: string;
  destination: string;
  phase: VoyagePhase;
  distanceRemainingNm: number;
  eta: string;
  etaWindowMinutes: number;
  averageSog: number;
  nextWaypoint?: {
    name: string;
    distanceNm: number;
    eta: string;
  };
}

export interface EnvironmentState {
  summary: string;
  windKt?: number;
  seaStateM?: number;
  pressureHpa?: number;
  trend?: string;
}

export interface AwarenessItem {
  id: string;
  level: AttentionLevel;
  horizon: "now" | "6h" | "24h" | "voyage" | "arrival";
  title: string;
  detail: string;
  dueAt?: string;
}

export interface WatchState {
  startedAt: string;
  distanceMadeGoodNm: number;
  averageSog: number;
  courseSummary: string;
  changes: string[];
}

export interface SeavantState {
  vessel: VesselState;
  voyage: VoyageState;
  environment: EnvironmentState;
  awareness: AwarenessItem[];
  watch: WatchState;
}
