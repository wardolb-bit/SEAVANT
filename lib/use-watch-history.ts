"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "./supabase-client";

export interface WatchHistoryItem {
  id: string;
  startedAt: string;
  endedAt: string | null;
  distanceMadeGoodNm: number;
  averageSog: number;
  handoverSummary: string | null;
}

export function useWatchHistory(organizationId: string, vesselId: string, refreshKey?: string | null) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [items, setItems] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("watch_sessions")
        .select("id,started_at,ended_at,distance_made_good_nm,average_sog_kt,handover_summary")
        .eq("organization_id", organizationId)
        .eq("vessel_id", vesselId)
        .eq("status", "completed")
        .order("ended_at", { ascending: false })
        .limit(12);
      if (!alive) return;
      if (error) { setItems([]); setLoading(false); return; }
      setItems((data ?? []).map((row: any) => ({
        id: row.id,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        distanceMadeGoodNm: Number(row.distance_made_good_nm ?? 0),
        averageSog: Number(row.average_sog_kt ?? 0),
        handoverSummary: row.handover_summary ?? null
      })));
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, [organizationId, vesselId, refreshKey, supabase]);

  return { items, loading };
}
