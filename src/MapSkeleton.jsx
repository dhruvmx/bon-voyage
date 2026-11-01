import { Layers, Play } from "lucide-react";

export default function RouteMapSkeleton({ color }) {
  return (
    <section className="panel map-panel" style={{ "--cargo-color": color }}>
      <div className="panel-heading">
        <div>
          <h2>Route map</h2>
        </div>
        <button className="small-button" disabled aria-label="Map layers">
          <Layers size={14} /> Map layers
        </button>
      </div>
      <div className="map-wrap map-skeleton-wrap" aria-busy="true">
        <div className="map-skeleton">
          <div className="map-skeleton-grid" />
          <div className="map-skeleton-content">
            <span className="map-dynamic-spinner large" aria-hidden="true" />
            <strong>Loading route map…</strong>
            <small>Preparing interactive maritime navigation</small>
          </div>
        </div>
        <span className="map-badge" role="status">
          <span className="map-badge-spinner" aria-hidden="true" />
          <span>Loading passage…</span>
        </span>
      </div>
      <div className="map-legend">
        <span>
          <i style={{ background: "var(--route-color)" }} /> Open water
        </span>
        <span>
          <i style={{ background: "var(--protected)" }} /> ≤10 kn protected transit (scenario)
        </span>
        <span>
          <i className="habitat-key" /> Whale habitat
        </span>
        <a
          href="https://www.naturalearthdata.com/about/terms-of-use/"
          target="_blank"
          rel="noreferrer"
        >
          Map attribution ↗
        </a>
      </div>
      <div className="playback">
        <button
          className="play-button"
          aria-label="Play voyage"
          disabled
        >
          <Play size={14} />
        </button>
        <div>
          <strong>Voyage preview</strong>
          <small>Loading map components…</small>
        </div>
        <input
          aria-label="Voyage progress"
          type="range"
          min="0"
          max="100"
          step=".1"
          value={0}
          disabled
          readOnly
        />
        <b>0%</b>
      </div>
    </section>
  );
}
