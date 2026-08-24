import { mockState } from "@/lib/mock-state";

function fmtPosition(value: number, lat: boolean) {
  const hemi = lat ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutes = (abs - degrees) * 60;
  return `${degrees}° ${minutes.toFixed(1)}' ${hemi}`;
}

export default function Home() {
  const s = mockState;
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">WARD MARITIME</div>
          <h1>SEAVANT</h1>
        </div>
        <div className="status"><span className="statusDot" /> SIMULATED DATA</div>
      </header>

      <section className="hero panel">
        <div>
          <div className="eyebrow">VOYAGE</div>
          <div className="route">{s.voyage.departure} <span>→</span> {s.voyage.destination}</div>
          <div className="phase">{s.voyage.phase.toUpperCase()} PASSAGE</div>
        </div>
        <div className="heroMetrics">
          <Metric label="REMAINING" value={`${s.voyage.distanceRemainingNm.toLocaleString()} NM`} />
          <Metric label="AVG SOG" value={`${s.voyage.averageSog.toFixed(1)} kt`} />
          <Metric label="ETA WINDOW" value={`± ${s.voyage.etaWindowMinutes} min`} />
        </div>
      </section>

      <section className="grid">
        <article className="panel vessel">
          <div className="sectionTitle">NOW</div>
          <div className="bigNav">{String(Math.round(s.vessel.cog)).padStart(3, "0")}°T</div>
          <div className="speed">{s.vessel.sog.toFixed(1)} <small>kt</small></div>
          <div className="position">
            {fmtPosition(s.vessel.position.lat, true)}<br />
            {fmtPosition(s.vessel.position.lon, false)}
          </div>
          <div className="source">SOURCE · {s.vessel.source.toUpperCase()}</div>
        </article>

        <article className="panel next">
          <div className="sectionTitle">WHAT MATTERS NEXT</div>
          <div className="attentionList">
            {s.awareness.map((item) => (
              <div className={`attention ${item.level}`} key={item.id}>
                <div className="horizon">{item.horizon.toUpperCase()}</div>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel picture">
          <div className="sectionTitle">OPERATIONAL PICTURE</div>
          <div className="mapPlaceholder">
            <div className="rangeRing ring1" />
            <div className="rangeRing ring2" />
            <div className="ship">▲</div>
            <div className="trackLine" />
            <div className="mapText">LIVE MAP INTEGRATION NEXT</div>
          </div>
        </article>

        <article className="panel watch">
          <div className="sectionTitle">WATCH</div>
          <div className="watchLead">{s.watch.courseSummary}</div>
          <div className="watchStats">
            <Metric label="DMG" value={`${s.watch.distanceMadeGoodNm.toFixed(1)} NM`} />
            <Metric label="AVG SOG" value={`${s.watch.averageSog.toFixed(1)} kt`} />
          </div>
          <ul>
            {s.watch.changes.map((change) => <li key={change}>{change}</li>)}
          </ul>
        </article>
      </section>

      <footer>SEAVANT ALPHA 0.1 · MARITIME OPERATIONS PLATFORM</footer>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}
