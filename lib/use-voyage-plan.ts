"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "./supabase-client";
import type { VoyagePlan } from "./voyage-engine";

export interface StoredVoyagePlan extends VoyagePlan {
  id: string;
  status: "planned" | "active" | "completed" | "cancelled";
  plannedDepartureAt?: string | null;
}

export function useVoyagePlan(organizationId: string, vesselId: string) {
  const supabase = getSupabaseClient();
  const [plan, setPlan] = useState<StoredVoyagePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: voyageError } = await supabase
      .from("voyages")
      .select("id,departure_name,destination_name,departure_lat,departure_lon,destination_lat,destination_lon,planned_speed_kt,planned_departure_at,status")
      .eq("organization_id", organizationId)
      .eq("vessel_id", vesselId)
      .in("status", ["active", "planned"])
      .order("status", { ascending: true })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (voyageError) { setError(voyageError.message); setLoading(false); return; }
    if (!data) { setPlan(null); setLoading(false); return; }

    const { data: waypointRows, error: waypointError } = await supabase
      .from("voyage_waypoints")
      .select("id,sequence_no,name,lat,lon")
      .eq("voyage_id", data.id)
      .order("sequence_no", { ascending: true });

    if (waypointError) { setError(waypointError.message); setLoading(false); return; }

    setPlan({
      id: data.id,
      status: data.status,
      departure: data.departure_name,
      destination: data.destination_name,
      departurePosition: { lat: data.departure_lat ?? 0, lon: data.departure_lon ?? 0 },
      destinationPosition: { lat: data.destination_lat ?? 0, lon: data.destination_lon ?? 0 },
      plannedSpeedKt: Number(data.planned_speed_kt ?? 0),
      plannedDepartureAt: data.planned_departure_at,
      waypoints: (waypointRows ?? []).map((wp) => ({ name: wp.name, position: { lat: wp.lat, lon: wp.lon } }))
    });
    setLoading(false);
  }, [organizationId, vesselId, supabase]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { plan, loading, error, refresh };
}
