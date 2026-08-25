"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "./supabase-client";
import type { VesselState } from "./seavant-state";
import type { WatchEvent } from "./watch-engine";

export function usePersistentWatch(organizationId: string, vesselId: string, vessel: VesselState, events: WatchEvent[], summary: { startedAt: string; distanceMadeGoodNm: number; averageSog: number; courseSummary: string; changes: string[] }) {
  const supabase = getSupabaseClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"idle" | "loading" | "synced" | "error">("loading");
  const savedEvents = useRef(new Set<string>());

  const restore = useCallback(async () => {
    setSyncState("loading");
    const { data, error } = await supabase.from("watch_sessions").select("id,started_at").eq("organization_id", organizationId).eq("vessel_id", vesselId).eq("status", "active").order("started_at", { ascending: false }).limit(1);
    if (error) { setSyncState("error"); return; }
    const active = data?.[0];
    setSessionId(active?.id ?? null);
    setStartedAt(active?.started_at ?? null);
    setSyncState(active ? "synced" : "idle");
  }, [organizationId, vesselId, supabase]);

  useEffect(() => { void restore(); }, [restore]);

  const startWatch = useCallback(async () => {
    if (sessionId) return;
    setSyncState("loading");
    const now = new Date().toISOString();
    const created = await supabase.from("watch_sessions").insert({ organization_id: organizationId, vessel_id: vesselId, started_at: now, start_lat: vessel.position.lat, start_lon: vessel.position.lon, status: "active" }).select("id,started_at").single();
    if (created.error || !created.data?.id) { setSyncState("error"); return; }
    savedEvents.current.clear();
    setSessionId(created.data.id);
    setStartedAt(created.data.started_at);
    setSyncState("synced");
  }, [organizationId, sessionId, supabase, vessel.position.lat, vessel.position.lon, vesselId]);

  const handover = useCallback(async () => {
    if (!sessionId) return;
    setSyncState("loading");
    const text = [summary.courseSummary, ...summary.changes].join("\n");
    const { error: sessionError } = await supabase.from("watch_sessions").update({ handover_summary: text, distance_made_good_nm: summary.distanceMadeGoodNm, average_sog_kt: summary.averageSog, updated_at: new Date().toISOString() }).eq("id", sessionId);
    const { error: eventError } = await supabase.from("watch_events").insert({ organization_id: organizationId, watch_session_id: sessionId, vessel_id: vesselId, occurred_at: new Date().toISOString(), event_type: "handover", level: "info", title: "Watch handover prepared", detail: text, lat: vessel.position.lat, lon: vessel.position.lon });
    setSyncState(sessionError || eventError ? "error" : "synced");
  }, [organizationId, sessionId, summary.averageSog, summary.changes, summary.courseSummary, summary.distanceMadeGoodNm, supabase, vessel.position.lat, vessel.position.lon, vesselId]);

  const endWatch = useCallback(async () => {
    if (!sessionId) return;
    setSyncState("loading");
    const now = new Date().toISOString();
    const { error } = await supabase.from("watch_sessions").update({ status: "completed", ended_at: now, end_lat: vessel.position.lat, end_lon: vessel.position.lon, distance_made_good_nm: summary.distanceMadeGoodNm, average_sog_kt: summary.averageSog, course_summary: summary.courseSummary, handover_summary: [summary.courseSummary, ...summary.changes].join("\n"), updated_at: now }).eq("id", sessionId);
    if (error) { setSyncState("error"); return; }
    setSessionId(null);
    setStartedAt(null);
    savedEvents.current.clear();
    setSyncState("idle");
  }, [sessionId, summary.averageSog, summary.changes, summary.courseSummary, summary.distanceMadeGoodNm, supabase, vessel.position.lat, vessel.position.lon]);

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

  return { sessionId, startedAt, syncState, startWatch, handover, endWatch };
}
