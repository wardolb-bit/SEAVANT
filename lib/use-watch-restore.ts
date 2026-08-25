"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "./supabase-client";
import type { WatchEvent } from "./watch-engine";

export interface RestoredWatchState {
  startedAt: string;
  startPosition: { lat: number; lon: number };
  averageSog?: number;
  events: WatchEvent[];
}

export function useWatchRestore(organizationId: string, vesselId: string) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [state, setState] = useState<RestoredWatchState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const { data: sessions, error } = await supabase
        .from("watch_sessions")
        .select("id,started_at,start_lat,start_lon,average_sog_kt")
        .eq("organization_id", organizationId)
        .eq("vessel_id", vesselId)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1);
      if (!alive) return;
      if (error || !sessions?.[0]) { setState(null); setLoading(false); return; }

      const session = sessions[0];
      const { data: rows } = await supabase
        .from("watch_events")
        .select("id,occurred_at,event_type,title,metadata")
        .eq("watch_session_id", session.id)
        .order("occurred_at", { ascending: true });
      if (!alive) return;

      const events: WatchEvent[] = (rows ?? []).map((row: any) => ({
        id: row.metadata?.client_event_id ?? row.id,
        at: row.occurred_at,
        type: normalizeType(row.event_type),
        summary: row.title
      }));

      setState({
        startedAt: session.started_at,
        startPosition: { lat: session.start_lat ?? 0, lon: session.start_lon ?? 0 },
        averageSog: session.average_sog_kt ?? undefined,
        events
      });
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, [organizationId, vesselId, supabase]);

  return { restoredWatch: state, restoreLoading: loading };
}

function normalizeType(value: string): WatchEvent["type"] {
  return value === "course" || value === "speed" || value === "voyage" || value === "awareness" ? value : "system";
}
