import { formatDuration } from "./cargo";

export default function RouteComparison({ result, selected, onSelect, onShowMap, calculating }) {
  const recommended = result?.routes.find((r) => r.id === result.recommended);
  const options = result?.routes.filter((r) => result.status !== "infeasible" || r.id === result.recommended) || [];
  return <section className="routes-section" aria-busy={calculating}>
    <div className="section-heading">
      <div><h2>Compare routes</h2></div>
      <button className="small-button" disabled={!recommended || calculating} onClick={onShowMap}>Show on map ↑</button>
    </div>
    {result?.status === "infeasible" && <p className="comparison-help">No route meets the deadline.</p>}
    <div className="route-cards">
      {options.map((r) => {
        const perishables = r.cargo_results?.filter((item) => item.perishable) || [];
        const quality = perishables.length ? Math.min(...perishables.map((item) => item.freshness)) : null;
        const fuelDifference = r.fuel - recommended.fuel;
        return <button key={r.id} className={`route-card ${selected === r.id ? "selected" : ""}`}
          disabled={calculating} aria-pressed={selected === r.id} onClick={() => onSelect(r.id)}>
          <div className="route-card-top"><h3>{r.name}</h3><span className="radio">{selected === r.id && <span />}</span></div>
          <small className="route-path">{r.path_name} · {r.distance.toLocaleString()} nautical miles</small>
          <div className="route-metrics">
            <div><strong>{formatDuration(r.hours)}</strong><small>Sailing time</small></div>
            <div><strong>{r.fuel.toFixed(1)}<em> tonnes</em></strong><small>Fuel estimate</small></div>
            <div><strong>{quality === null ? "N/A" : `${quality.toFixed(1)}%`}</strong><small>{quality === null ? "Non-perishable" : "Lowest cargo quality"}</small></div>
            <div><strong>{formatDuration(Math.abs(r.slack_hours))}</strong><small>{r.feasible ? "Time before deadline" : "Time past deadline"}</small></div>
          </div>
          <small className="route-path">Open water {r.speed.toFixed(2)} kn{r.protected_distance > 0 ? ` · protected zones ${r.protected_speed.toFixed(2)} kn` : ""}</small>
          <div className="route-bottom">
            <span>{r.id === result.recommended ? "Recommended fuel" : Math.abs(fuelDifference) < .05 ? "Same fuel as recommended" : `${Math.abs(fuelDifference).toFixed(1)} t ${fuelDifference > 0 ? "more" : "less"} fuel than recommended`}</span>
            {result.recommended === r.id && <b>{result.status === "infeasible" ? "Earliest available" : "Recommended"}</b>}
          </div>
          {r.same_as && <small className="route-note">Same route and speeds as {result.routes.find((option) => option.id === r.same_as)?.name.toLowerCase()}.</small>}
          {r.newly_expired_tonnes > 0 && <small className="route-note cargo-at-risk">{r.newly_expired_tonnes.toLocaleString()} t expires before arrival.</small>}
          {selected === r.id && <small className="route-note">Selected · shown on map</small>}
        </button>;
      })}
    </div>
  </section>;
}
