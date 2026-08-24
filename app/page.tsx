"use client";

import OperationalMap from "@/app/components/OperationalMap";
import { mockState } from "@/lib/mock-state";
import { useLiveVessel } from "@/lib/use-live-vessel";
import { useVoyageEngine } from "@/lib/use-voyage-engine";

function fmtPosition(value: number, lat: boolean) {
  const hemi = lat ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutes = (abs - degrees) * 60;
  return `${degrees}° ${minutes.toFixed(1)}' ${hemi}`;
}

function fmtEta(value: string) {
  const d = new Date(value);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()} ${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}Z`;
}

export default function Home() {
  const live = useLiveVessel(mockState.vessel);
  const voyage = useVoyageEngine(live.vessel);
  const s = { ...mockState, vessel: live.vessel, voyage: { ...mockState.voyage, ...voyage } };
  const livePosition = s.vessel.source === "live";
  const statusLabel = livePosition ? "LIVE AIS" : live.connection === "connected" ? "AIS CONNECTED · WAITING FOR OWN SHIP" : live.connection === "connecting" ? "CONNECTING TO AIS" : "SIMULATED FALLBACK";

  return (
    <main className="shell">
      <header className="topbar">
        <div><div className="eyebrow">WARD MARITIME</div><h1>SEAVANT</h1></div>
        <div className="status" title={live.lastError || live.wsUrl}><span className="statusDot" /> {statusLabel}</div>
      </header>

      <section className="hero panel">
        <div>
          <div className="eyebrow">VOYAGE</div>
          <div className="route">{s.voyage.departure} <span>→</span> {s.voyage.destination}</div>
          <div className="phase">{s.voyage.phase.toUpperCase()} PASSAGE · {s.voyage.progressPercent?.toFixed(0)}% COMPLETE</div>
        </div>
        <div className="heroMetrics">
          <Metric label="REMAINING" value={`${Math.round(s.voyage.distanceRemainingNm).toLocaleString()} NM`} />
          <Metric label="AVG SOG" value={`${s.voyage.averageSog.toFixed(1)} kt`} />
          <Metric label="ETA" value={fmtEta(s.voyage.eta)} />
          <Metric label="CONFIDENCE" value={`${s.voyage.etaConfidence} · ±${s.voyage.etaWindowMinutes}m`} />
        </div>
      </section>

      <section className="grid">
        <article className="panel vessel">
          <div className="sectionTitle">NOW</div>
          <div className="bigNav">{String(Math.round(s.vessel.cog)).padStart(3, "0")}°T</div>
          <div className="speed">{s.vessel.sog.toFixed(1)} <small>kt</small></div>
          <div className="position">{fmtPosition(s.vessel.position.lat, true)}<br />{fmtPosition(s.vessel.position.lon, false)}</div>
          <div className="source">SOURCE · {s.vessel.source.toUpperCase()}{livePosition ? " · AIVDO" : ""}</div>
        </article>

        <article className="panel next">
          <div className="sectionTitle">WHAT MATTERS NEXT</div>
          <div className="attentionList">
            {s.voyage.nextWaypoint && <div className="attention info"><div className="horizon">NEXT</div><div><strong>{s.voyage.nextWaypoint.name} · {s.voyage.nextWaypoint.distanceNm.toFixed(1)} NM</strong><p>Estimated waypoint time {fmtEta(s.voyage.nextWaypoint.eta)} at {s.voyage.averageSog.toFixed(1)} kt voyage speed.</p></div></div>}
            {s.awareness.filter((item) => item.id !== "wp04").map((item) => <div className={`attention ${item.level}`} key={item.id}><div className="horizon">{item.horizon.toUpperCase()}</div><div><strong>{item.title}</strong><p>{item.detail}</p></div></div>)}
          </div>
        </article>

        <article className="panel picture"><div className="sectionTitle">OPERATIONAL PICTURE</div><OperationalMap vessel={s.vessel} /></article>

        <article className="panel watch">
          <div className="sectionTitle">WATCH</div><div className="watchLead">{s.watch.courseSummary}</div>
          <div className="watchStats"><Metric label="DMG" value={`${s.watch.distanceMadeGoodNm.toFixed(1)} NM`} /><Metric label="AVG SOG" value={`${s.watch.averageSog.toFixed(1)} kt`} /></div>
          <ul>{s.watch.changes.map((change) => <li key={change}>{change}</li>)}</ul>
        </article>
      </section>
      <footer>SEAVANT ALPHA 0.4 · VOYAGE ENGINE</footer>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
