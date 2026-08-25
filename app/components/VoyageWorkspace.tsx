"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase-client";
import { distanceNm, type VoyagePlan } from "@/lib/voyage-engine";
import type { StoredVoyagePlan } from "@/lib/use-voyage-plan";

interface Props {
  organizationId: string;
  vesselId: string;
  vesselName: string;
  currentPosition: { lat: number; lon: number };
  plan: StoredVoyagePlan | null;
  loading: boolean;
  onSaved: () => Promise<void>;
}

type DraftWaypoint = { name: string; lat: string; lon: string };

export default function VoyageWorkspace({ organizationId, vesselId, vesselName, currentPosition, plan, loading, onSaved }: Props) {
  const supabase = getSupabaseClient();
  const [departure, setDeparture] = useState("");
  const [destination, setDestination] = useState("");
  const [departureLat, setDepartureLat] = useState("");
  const [departureLon, setDepartureLon] = useState("");
  const [destinationLat, setDestinationLat] = useState("");
  const [destinationLon, setDestinationLon] = useState("");
  const [speed, setSpeed] = useState("8.0");
  const [plannedDeparture, setPlannedDeparture] = useState("");
  const [waypoints, setWaypoints] = useState<DraftWaypoint[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!plan) return;
    setDeparture(plan.departure); setDestination(plan.destination);
    setDepartureLat(String(plan.departurePosition.lat)); setDepartureLon(String(plan.departurePosition.lon));
    setDestinationLat(String(plan.destinationPosition.lat)); setDestinationLon(String(plan.destinationPosition.lon));
    setSpeed(String(plan.plannedSpeedKt));
    setPlannedDeparture(plan.plannedDepartureAt ? toLocalInput(plan.plannedDepartureAt) : "");
    setWaypoints(plan.waypoints.map((wp) => ({ name: wp.name, lat: String(wp.position.lat), lon: String(wp.position.lon) })));
  }, [plan?.id]);

  const routeDistance = useMemo(() => {
    const dep = point(departureLat, departureLon); const dest = point(destinationLat, destinationLon);
    if (!dep || !dest) return null;
    const pts = [dep, ...waypoints.map((wp) => point(wp.lat, wp.lon)).filter(Boolean) as {lat:number;lon:number}[], dest];
    return pts.slice(0, -1).reduce((sum, p, i) => sum + distanceNm(p, pts[i + 1]), 0);
  }, [departureLat, departureLon, destinationLat, destinationLon, waypoints]);

  function addWaypoint() { setWaypoints((wps) => [...wps, { name: `WP${String(wps.length + 1).padStart(2, "0")}`, lat: "", lon: "" }]); }
  function updateWaypoint(index: number, key: keyof DraftWaypoint, value: string) { setWaypoints((wps) => wps.map((wp, i) => i === index ? { ...wp, [key]: value } : wp)); }
  function moveWaypoint(index: number, delta: number) { setWaypoints((wps) => { const next = [...wps]; const target = index + delta; if (target < 0 || target >= next.length) return next; [next[index], next[target]] = [next[target], next[index]]; return next; }); }
  function removeWaypoint(index: number) { setWaypoints((wps) => wps.filter((_, i) => i !== index)); }
  function useCurrentDeparture() { setDepartureLat(currentPosition.lat.toFixed(6)); setDepartureLon(currentPosition.lon.toFixed(6)); if (!departure) setDeparture("Current position"); }

  async function save(activate: boolean) {
    const dep = point(departureLat, departureLon); const dest = point(destinationLat, destinationLon); const plannedSpeed = Number(speed);
    if (!departure.trim() || !destination.trim() || !dep || !dest || !Number.isFinite(plannedSpeed) || plannedSpeed <= 0) { setMessage("Enter departure, destination, valid positions, and planned speed."); return; }
    const parsedWps = waypoints.map((wp) => ({ ...wp, position: point(wp.lat, wp.lon) }));
    if (parsedWps.some((wp) => !wp.name.trim() || !wp.position)) { setMessage("Complete every waypoint name and position, or remove the unfinished waypoint."); return; }
    setSaving(true); setMessage(null);
    try {
      let voyageId = plan?.id;
      const payload = { organization_id: organizationId, vessel_id: vesselId, vessel_name: vesselName, departure_name: departure.trim(), destination_name: destination.trim(), departure_lat: dep.lat, departure_lon: dep.lon, destination_lat: dest.lat, destination_lon: dest.lon, planned_speed_kt: plannedSpeed, planned_departure_at: plannedDeparture ? new Date(plannedDeparture).toISOString() : null, status: activate ? "active" : "planned", started_at: activate ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
      if (voyageId) {
        const { error } = await supabase.from("voyages").update(payload).eq("id", voyageId); if (error) throw error;
        const { error: deleteError } = await supabase.from("voyage_waypoints").delete().eq("voyage_id", voyageId); if (deleteError) throw deleteError;
      } else {
        const { data, error } = await supabase.from("voyages").insert(payload).select("id").single(); if (error) throw error; voyageId = data.id;
      }
      if (parsedWps.length) {
        const { error } = await supabase.from("voyage_waypoints").insert(parsedWps.map((wp, index) => ({ voyage_id: voyageId, sequence_no: index + 1, name: wp.name.trim(), lat: wp.position!.lat, lon: wp.position!.lon }))); if (error) throw error;
      }
      await onSaved(); setMessage(activate ? "Voyage activated. Operations is now using this route." : "Voyage saved as planned.");
    } catch (error: any) { setMessage(error?.message ?? "Unable to save voyage."); }
    finally { setSaving(false); }
  }

  if (loading) return <section className="panel workspaceShell"><div className="eyebrow">VOYAGE</div><h2>Loading voyage...</h2></section>;

  return <section className="voyageWorkspace">
    <article className="panel voyageBuilder">
      <div className="workspaceHeading"><div><div className="eyebrow">VOYAGE BUILDER</div><h2>{plan ? `${plan.status.toUpperCase()} VOYAGE` : "Create voyage"}</h2></div><div className="cloudBadge">{plan ? "CLOUD SAVED" : "NEW PLAN"}</div></div>
      <div className="voyageFormGrid">
        <label>DEPARTURE<input value={departure} onChange={(e) => setDeparture(e.target.value)} placeholder="Apra Harbor" /></label>
        <label>DESTINATION<input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Pearl Harbor" /></label>
        <label>DEPARTURE LAT<input value={departureLat} onChange={(e) => setDepartureLat(e.target.value)} inputMode="decimal" placeholder="13.4400" /></label>
        <label>DEPARTURE LON<input value={departureLon} onChange={(e) => setDepartureLon(e.target.value)} inputMode="decimal" placeholder="144.6500" /></label>
        <label>DESTINATION LAT<input value={destinationLat} onChange={(e) => setDestinationLat(e.target.value)} inputMode="decimal" placeholder="21.3100" /></label>
        <label>DESTINATION LON<input value={destinationLon} onChange={(e) => setDestinationLon(e.target.value)} inputMode="decimal" placeholder="-157.8700" /></label>
        <label>PLANNED SPEED · KT<input value={speed} onChange={(e) => setSpeed(e.target.value)} inputMode="decimal" /></label>
        <label>PLANNED DEPARTURE<input type="datetime-local" value={plannedDeparture} onChange={(e) => setPlannedDeparture(e.target.value)} /></label>
      </div>
      <button className="secondaryAction voyageUtility" type="button" onClick={useCurrentDeparture}>USE CURRENT POSITION AS DEPARTURE</button>

      <div className="waypointHeader"><div><div className="sectionTitle">WAYPOINTS</div><p>Intermediate route points in passage order.</p></div><button className="secondaryAction voyageUtility" type="button" onClick={addWaypoint}>+ ADD WAYPOINT</button></div>
      <div className="waypointTable">
        {waypoints.length ? waypoints.map((wp, index) => <div className="waypointRow" key={index}>
          <span className="waypointSeq">{String(index + 1).padStart(2, "0")}</span>
          <input aria-label={`Waypoint ${index + 1} name`} value={wp.name} onChange={(e) => updateWaypoint(index, "name", e.target.value)} />
          <input aria-label={`Waypoint ${index + 1} latitude`} value={wp.lat} inputMode="decimal" placeholder="LAT" onChange={(e) => updateWaypoint(index, "lat", e.target.value)} />
          <input aria-label={`Waypoint ${index + 1} longitude`} value={wp.lon} inputMode="decimal" placeholder="LON" onChange={(e) => updateWaypoint(index, "lon", e.target.value)} />
          <div className="waypointActions"><button onClick={() => moveWaypoint(index, -1)} disabled={index === 0}>↑</button><button onClick={() => moveWaypoint(index, 1)} disabled={index === waypoints.length - 1}>↓</button><button onClick={() => removeWaypoint(index)}>×</button></div>
        </div>) : <div className="emptyState">Direct route. Add waypoints if the passage requires them.</div>}
      </div>
      <div className="voyageBuilderFooter"><div>{routeDistance !== null && <><span>ROUTE DISTANCE</span><strong>{routeDistance.toFixed(1)} NM</strong></>}</div><div className="voyageSaveActions"><button className="secondaryAction" disabled={saving} onClick={() => void save(false)}>SAVE PLAN</button><button className="primaryAction compactAction" disabled={saving} onClick={() => void save(true)}>ACTIVATE VOYAGE</button></div></div>
      {message && <div className="authMessage">{message}</div>}
    </article>
  </section>;
}

function point(lat: string, lon: string) { const a = Number(lat), b = Number(lon); return Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180 ? { lat: a, lon: b } : null; }
function toLocalInput(iso: string) { const d = new Date(iso); const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
