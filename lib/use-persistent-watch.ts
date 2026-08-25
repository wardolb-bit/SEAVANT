"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "./supabase-client";
import type { VesselState } from "./seavant-state";
import type { WatchEvent } from "./watch-engine";

export function usePersistentWatch(organizationId: string, vesselId: string, vessel: VesselState, events: WatchEvent[], summary: { startedAt: string; distanceMadeGoodNm: number; averageSog: number; courseSummary: string; changes: string[] }) {
  const supabase = getSupabaseClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"loading" | "synced" | "error">("loading");
  const savedEvents = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;
    async function restore() {
      setSyncState("loading");
      const { data, error } = await supabase.from("watch_sessions").select("id,started_at").eq("organization_id", organizationId).eq("vessel_id", vesselId).eq("status", "active").order("started_at", { ascending: false }).limit(1);
      if (error) { if (alive) setSyncState("error"); return; }
      let id: string | null = data?.[0]?.id ?? null;
      if (!id) {
        const created = await supabase.from("watch_sessions").insert({ organization_id: organizationId, vessel_id: vesselId, started_at: summary.startedAt, start_lat: vessel.position.lat, start_lon: vessel.position.lon, status: "active" }).select("id").single();
        if (created.error || !created.data?.id) { if (alive) setSyncState("error"); return; }
        id = created.data.id;
      }
      if (alive) { setSessionId(id); setSyncState("synced"); }
    }
    void restore();
    return () => { alive = false; };
  }, [organizationId, vesselId, supabase]);

  useEffect(() => {
    if (!sessionId) return;
    const timer = window.setTimeout(async () => {
      const { error } = await supabase.from("watch_sessions").update({ distance_made_good_nm: summary.distanceMadeGoodNm, average_sog_kt: summary.averageSog, course_summary: summary.courseSummary, handover_summary: summary.changes.join("\n"), updated_at: new Date().toISOString() }).eq("id", sessionId);
      setSyncState(error ? "error" : "synced");
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [sessionId, summary.distanceMadeGoodNm, summary.averageSog, summary.courseSummary, summary.changes, supabase]);

  useEffect(() => {
    if (!sessionId) return;
    for (const event of events) {
      if (savedEvents.current.has(event.id)) continue;
      savedEvents.current.add(event.id);
      void supabase.from("watch_events").insert({ organization_id: organizationId, watch_session_id: sessionId, vessel_id: vesselId, occurred_at: event.at, event_type: event.type, level: "info", title: event.summary, lat: vessel.position.lat, lon: vessel.position.lon, metadata: { client_event_id: event.id } }).then(({ error }) => { if (error) { savedEvents.current.delete(event.id); setSyncState("error"); } });
    }
  }, [events, organizationId, sessionId, vesselId, vessel.position.lat, vessel.position.lon, supabase]);

  return { sessionId, syncState };
}
