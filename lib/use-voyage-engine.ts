"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { VesselState } from "./seavant-state";
import { solveVoyage, type SpeedSample, type VoyagePlan } from "./voyage-engine";
import { getSupabaseClient } from "./supabase-client";

export const DEMO_PLAN: VoyagePlan = {
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

export function useVoyageEngine(vessel: VesselState, savedPlan?: VoyagePlan | null, ownership?: { organizationId: string; vesselId: string }) {
  const supabase = getSupabaseClient();
  const [samples, setSamples] = useState<SpeedSample[]>([]);
  const startedAt = useRef(Date.now());
  const lastPersistedMinute = useRef<number | null>(null);
  const plan = savedPlan ?? DEMO_PLAN;

  useEffect(() => {
    if (!ownership) return;
    let alive = true;
    const cutoff = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    void supabase.from("vessel_speed_samples").select("sampled_at,sog_kt").eq("organization_id", ownership.organizationId).eq("vessel_id", ownership.vesselId).gte("sampled_at", cutoff).order("sampled_at", { ascending: true }).then(({ data }) => {
      if (!alive || !data) return;
      setSamples(data.map((row: any) => ({ sog: Number(row.sog_kt), at: new Date(row.sampled_at).getTime() })).filter((sample: SpeedSample) => Number.isFinite(sample.sog) && Number.isFinite(sample.at)));
    });
    return () => { alive = false; };
  }, [ownership?.organizationId, ownership?.vesselId, supabase]);

  useEffect(() => {
    if (vessel.source !== "live" || !Number.isFinite(vessel.sog)) return;
    const at = Date.now();
    setSamples((current) => [...current.filter((s) => at - s.at <= 3 * 60 * 60_000), { sog: vessel.sog, at }]);

    if (!ownership) return;
    const minute = Math.floor(at / 60_000);
    if (lastPersistedMinute.current === minute) return;
    lastPersistedMinute.current = minute;
    void supabase.from("vessel_speed_samples").insert({ organization_id: ownership.organizationId, vessel_id: ownership.vesselId, sampled_at: new Date(at).toISOString(), sog_kt: vessel.sog });
  }, [vessel.sog, vessel.updatedAt, vessel.source, ownership?.organizationId, ownership?.vesselId, supabase]);

  return useMemo(() => {
    const now = Date.now();
    const effectiveSamples = samples.length ? samples : [{ sog: vessel.sog || plan.plannedSpeedKt, at: startedAt.current }];
    return { ...solveVoyage(plan, vessel.position, effectiveSamples, now), departure: plan.departure, destination: plan.destination };
  }, [samples, vessel.position.lat, vessel.position.lon, vessel.sog, plan]);
}
