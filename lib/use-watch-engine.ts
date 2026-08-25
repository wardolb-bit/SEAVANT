"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AwarenessItem, VesselState } from "./seavant-state";
import type { VoyageSolution } from "./voyage-engine";
import { summarizeWatch, type WatchEvent } from "./watch-engine";
import type { RestoredWatchState } from "./use-watch-restore";

export function useWatchEngine(vessel: VesselState, voyage: VoyageSolution, awareness: AwarenessItem[], restored?: RestoredWatchState | null) {
  const startedAt = useRef(restored ? new Date(restored.startedAt).getTime() : Date.now());
  const startPosition = useRef(restored?.startPosition ?? vessel.position);
  const previousCog = useRef(vessel.cog);
  const previousSog = useRef(vessel.sog);
  const previousAwarenessIds = useRef<Set<string>>(new Set());
  const [events, setEvents] = useState<WatchEvent[]>(restored?.events ?? []);
  const [speedSamples, setSpeedSamples] = useState<number[]>(restored?.averageSog ? [restored.averageSog] : [vessel.sog]);
  const hydratedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!restored) return;
    const key = `${restored.startedAt}:${restored.events.length}`;
    if (hydratedKey.current === key) return;
    hydratedKey.current = key;
    startedAt.current = new Date(restored.startedAt).getTime();
    startPosition.current = restored.startPosition;
    setEvents(restored.events);
    if (Number.isFinite(restored.averageSog)) setSpeedSamples([restored.averageSog!]);
  }, [restored]);

  useEffect(() => {
    if (!Number.isFinite(vessel.sog)) return;
    setSpeedSamples((current) => [...current.slice(-119), vessel.sog]);
  }, [vessel.updatedAt, vessel.sog]);

  useEffect(() => {
    const delta = Math.abs(vessel.cog - previousCog.current);
    if (delta >= 10) {
      pushEvent(setEvents, { id: `course-${vessel.updatedAt}`, at: new Date().toISOString(), type: "course", summary: `Course changed from ${Math.round(previousCog.current)}°T to ${Math.round(vessel.cog)}°T.` });
      previousCog.current = vessel.cog;
    }
  }, [vessel.cog, vessel.updatedAt]);

  useEffect(() => {
    const delta = vessel.sog - previousSog.current;
    if (Math.abs(delta) >= 1) {
      pushEvent(setEvents, { id: `speed-${vessel.updatedAt}`, at: new Date().toISOString(), type: "speed", summary: `SOG ${delta < 0 ? "decreased" : "increased"} from ${previousSog.current.toFixed(1)} to ${vessel.sog.toFixed(1)} kt.` });
      previousSog.current = vessel.sog;
    }
  }, [vessel.sog, vessel.updatedAt]);

  useEffect(() => {
    const previous = previousAwarenessIds.current;
    for (const item of awareness) {
      if (!previous.has(item.id) && item.id !== "quiet-now" && (item.level === "advisory" || item.level === "warning" || item.level === "action")) {
        pushEvent(setEvents, { id: `awareness-${item.id}-${Date.now()}`, at: new Date().toISOString(), type: "awareness", summary: item.title });
      }
    }
    previousAwarenessIds.current = new Set(awareness.map((item) => item.id));
  }, [awareness]);

  return useMemo(() => summarizeWatch({ startedAt: startedAt.current, startPosition: startPosition.current, vessel, voyage, awareness, events, speedSamples }), [vessel, voyage, awareness, events, speedSamples]);
}

function pushEvent(setEvents: React.Dispatch<React.SetStateAction<WatchEvent[]>>, event: WatchEvent) {
  setEvents((current) => current.some((item) => item.id === event.id) ? current : [...current.slice(-24), event]);
}
