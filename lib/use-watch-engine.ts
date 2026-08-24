"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AwarenessItem, VesselState } from "./seavant-state";
import type { VoyageSolution } from "./voyage-engine";
import { summarizeWatch, type WatchEvent } from "./watch-engine";

export function useWatchEngine(vessel: VesselState, voyage: VoyageSolution, awareness: AwarenessItem[]) {
  const startedAt = useRef(Date.now());
  const startPosition = useRef(vessel.position);
  const previousCog = useRef(vessel.cog);
  const previousSog = useRef(vessel.sog);
  const previousAwarenessIds = useRef<Set<string>>(new Set());
  const [events, setEvents] = useState<WatchEvent[]>([]);
  const [speedSamples, setSpeedSamples] = useState<number[]>([vessel.sog]);

  useEffect(() => {
    if (!Number.isFinite(vessel.sog)) return;
    setSpeedSamples((current) => [...current.slice(-119), vessel.sog]);
  }, [vessel.updatedAt, vessel.sog]);

  useEffect(() => {
    const delta = Math.abs(vessel.cog - previousCog.current);
    if (delta >= 10) {
      pushEvent(setEvents, {
        id: `course-${vessel.updatedAt}`,
        at: new Date().toISOString(),
        type: "course",
        summary: `Course changed from ${Math.round(previousCog.current)}°T to ${Math.round(vessel.cog)}°T.`
      });
      previousCog.current = vessel.cog;
    }
  }, [vessel.cog, vessel.updatedAt]);

  useEffect(() => {
    const delta = vessel.sog - previousSog.current;
    if (Math.abs(delta) >= 1) {
      pushEvent(setEvents, {
        id: `speed-${vessel.updatedAt}`,
        at: new Date().toISOString(),
        type: "speed",
        summary: `SOG ${delta < 0 ? "decreased" : "increased"} from ${previousSog.current.toFixed(1)} to ${vessel.sog.toFixed(1)} kt.`
      });
      previousSog.current = vessel.sog;
    }
  }, [vessel.sog, vessel.updatedAt]);

  useEffect(() => {
    const previous = previousAwarenessIds.current;
    for (const item of awareness) {
      if (!previous.has(item.id) && item.id !== "quiet-now" && (item.level === "advisory" || item.level === "warning" || item.level === "action")) {
        pushEvent(setEvents, {
          id: `awareness-${item.id}-${Date.now()}`,
          at: new Date().toISOString(),
          type: "awareness",
          summary: item.title
        });
      }
    }
    previousAwarenessIds.current = new Set(awareness.map((item) => item.id));
  }, [awareness]);

  return useMemo(() => summarizeWatch({
    startedAt: startedAt.current,
    startPosition: startPosition.current,
    vessel,
    voyage,
    awareness,
    events,
    speedSamples
  }), [vessel, voyage, awareness, events, speedSamples]);
}

function pushEvent(setEvents: React.Dispatch<React.SetStateAction<WatchEvent[]>>, event: WatchEvent) {
  setEvents((current) => current.some((item) => item.id === event.id) ? current : [...current.slice(-24), event]);
}
