"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { VesselState } from "@/lib/seavant-state";

interface OperationalMapProps {
  vessel: VesselState;
}

const DEFAULT_CENTER: [number, number] = [145.3467, 12.0617];

export default function OperationalMap({ vessel }: OperationalMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const hasCenteredOnLivePosition = useRef(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: DEFAULT_CENTER,
      zoom: 6,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.on("load", () => setLoaded(true));
    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !Number.isFinite(vessel.position.lat) || !Number.isFinite(vessel.position.lon)) return;

    const lngLat: [number, number] = [vessel.position.lon, vessel.position.lat];

    if (!markerRef.current) {
      const element = document.createElement("div");
      element.className = "ownShipMarker";
      element.innerHTML = "<span>▲</span>";
      markerRef.current = new maplibregl.Marker({ element, rotationAlignment: "map" })
        .setLngLat(lngLat)
        .addTo(map);
    } else {
      markerRef.current.setLngLat(lngLat);
    }

    const rotation = Number.isFinite(vessel.heading) ? vessel.heading : vessel.cog;
    markerRef.current.setRotation(rotation || 0);

    if (vessel.source === "live" && !hasCenteredOnLivePosition.current) {
      map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), 7), duration: 900 });
      hasCenteredOnLivePosition.current = true;
    }
  }, [vessel]);

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: [vessel.position.lon, vessel.position.lat],
      zoom: Math.max(map.getZoom(), 7),
      duration: 600,
    });
  };

  return (
    <div className="operationalMapWrap">
      <div ref={containerRef} className="operationalMap" />
      <div className="mapStatus">{loaded ? "MAP READY" : "LOADING MAP"}</div>
      <button className="recenterButton" type="button" onClick={recenter}>RECENTER</button>
    </div>
  );
}
