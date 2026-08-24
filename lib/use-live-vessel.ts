"use client";

import { useEffect, useState } from "react";
import { decodeOwnShipAivdo } from "@/lib/ais-parser";
import { getAisWebSocketUrl } from "@/lib/ais-websocket";
import type { VesselState } from "@/lib/seavant-state";

export type AisConnectionState = "connecting" | "connected" | "disconnected" | "error";

interface LiveVesselResult {
  vessel: VesselState;
  connection: AisConnectionState;
  wsUrl: string;
  lastError?: string;
}

export function useLiveVessel(fallback: VesselState): LiveVesselResult {
  const [vessel, setVessel] = useState<VesselState>(fallback);
  const [connection, setConnection] = useState<AisConnectionState>("connecting");
  const [wsUrl, setWsUrl] = useState("");
  const [lastError, setLastError] = useState<string>();

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      const url = getAisWebSocketUrl();
      setWsUrl(url);
      setConnection("connecting");

      try {
        socket = new WebSocket(url);
      } catch (error) {
        setConnection("error");
        setLastError(error instanceof Error ? error.message : "Could not create AIS WebSocket");
        reconnectTimer = setTimeout(connect, 5000);
        return;
      }

      socket.onopen = () => {
        setConnection("connected");
        setLastError(undefined);
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data));

          if (message?.type === "status") {
            if (message.connected === false) {
              setLastError(message.lastError || "AIS serial source is not connected");
            }
            return;
          }

          if (message?.type !== "nmea" || typeof message.line !== "string") return;
          const update = decodeOwnShipAivdo(message.line);
          if (!update?.position) return;

          setVessel((current) => ({
            ...current,
            ...update,
            position: update.position ?? current.position,
            sog: update.sog ?? current.sog,
            cog: update.cog ?? current.cog,
            heading: update.heading ?? current.heading,
            source: "live",
            updatedAt: update.updatedAt ?? new Date().toISOString(),
          }));
        } catch {
          // Ignore malformed/non-JSON messages so the live feed stays resilient.
        }
      };

      socket.onerror = () => {
        setConnection("error");
        setLastError("AIS WebSocket connection error");
      };

      socket.onclose = () => {
        if (stopped) return;
        setConnection("disconnected");
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return { vessel, connection, wsUrl, lastError };
}
