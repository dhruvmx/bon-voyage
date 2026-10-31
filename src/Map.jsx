import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Layers, LocateFixed, Pause, Play } from "lucide-react";

export default function VoyageMap({
  route,
  routes,
  zones,
  color,
  progress,
  setProgress,
  playing,
  setPlaying,
}) {
  const host = useRef(null),
    map = useRef(null),
    overlays = useRef(null),
    ship = useRef(null),
    initialBounds = useRef(null);
  const [layers, setLayers] = useState({
    habitat: true,
    vsr: true,
    alternatives: true,
  });
  const [showLayers, setShowLayers] = useState(false),
    [tileError, setTileError] = useState(false);
  useEffect(() => {
    const instance = L.map(host.current, {
      scrollWheelZoom: false,
      zoomControl: true,
    }).setView([35.8, -121], 6);
    map.current = instance;
    overlays.current = L.layerGroup().addTo(instance);
    instance.createPane('land');
    instance.getPane('land').style.zIndex = 220;
    let active = true;
    fetch('/coastline.geojson').then(r => {
      if (!r.ok) throw new Error('Coastline unavailable');
      return r.json();
    }).then(data => {
      if (!active) return;
      L.geoJSON(data, {pane:'land', interactive:false, style:{color:'#9b9d78',weight:1.2,fillColor:'#f1e7c8',fillOpacity:1}}).addTo(instance);
    }).catch(() => active && setTileError(true));
    instance.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/">Natural Earth</a> · Public domain');
    for (let lat=30;lat<=43;lat++) L.polyline([[lat,-132],[lat,-114]],{color:'#a6b8a2',weight:.5,opacity:.6,interactive:false}).addTo(instance);
    for (let lon=-130;lon<=-115;lon++) L.polyline([[29,lon],[44,lon]],{color:'#a6b8a2',weight:.5,opacity:.6,interactive:false}).addTo(instance);
    const labels=[['CALIFORNIA',36.2,-119.3,'region'],['NORTH PACIFIC OCEAN',35.7,-124.7,'ocean'],['San Francisco',37.8,-122.4,'city'],['Monterey',36.6,-121.9,'city'],['Santa Barbara',34.42,-119.7,'city'],['Los Angeles',34.05,-118.24,'city'],['San Diego',32.72,-117.16,'city'],['Humboldt Bay',40.8,-124.16,'city']];
    labels.forEach(([name,lat,lon,type]) => L.marker([lat,lon],{pane:'markerPane',interactive:false,icon:L.divIcon({className:'geo-label '+type,html:name,iconSize:[140,18],iconAnchor:[0,9]})}).addTo(instance));
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(host.current);
    return () => {
      active = false;
      resize.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!map.current || !route) return;
    const group = overlays.current;
    group.clearLayers();
    zones
      .filter((z) => layers[z.kind === "vsr" ? "vsr" : "habitat"])
      .forEach((z) =>
        L.circle([z.lat, z.lon], {
          radius: z.radius_nm * 1852,
          color: z.kind === "vsr" ? "#a77a2b" : "#5c7448",
          fillColor: z.kind === "vsr" ? "#e8ad48" : "#99af78",
          fillOpacity: 0.22,
          dashArray: "6 5",
          weight: 2,
        })
          .bindTooltip(
            `${z.name}${z.kind === "vsr" ? " · 10 kn maximum" : " · Whale habitat / 10 kn"}`,
          )
          .addTo(group),
      );
    if (layers.alternatives)
      routes
        .filter((r) => r.id !== route.id)
        .forEach((r) =>
          L.polyline(r.coordinates, {
            color: "#6b7468",
            weight: 2,
            dashArray: "5 8",
            opacity: 0.5,
          })
            .bindTooltip(r.name)
            .addTo(group),
        );
    L.polyline(route.coordinates, { color: "#fff9e7", weight: 9 }).addTo(group);
    L.polyline(route.coordinates, { color, weight: 5 })
      .bindTooltip(`${route.name} · ${route.speed} kn open water`)
      .addTo(group);
    let chunk = [],
      lastKind;
    route.segments.forEach((s, i) => {
      if (s.kind !== lastKind && chunk.length) {
        if (lastKind !== "open")
          L.polyline(chunk, { color: "#d59034", weight: 5 }).addTo(group);
        chunk = [];
      }
      chunk.push(s.from, s.to);
      lastKind = s.kind;
      if (i === route.segments.length - 1 && s.kind !== "open")
        L.polyline(chunk, { color: "#d59034", weight: 5 }).addTo(group);
    });
    [route.coordinates[0], route.coordinates.at(-1)].forEach((p, i) =>
      L.circleMarker(p, {
        radius: 7,
        color: "#24221d",
        weight: 2,
        fillColor: i ? "#e8ad48" : "#faf0d2",
        fillOpacity: 1,
      })
        .bindTooltip(i ? "Destination port" : "Departure port", {
          permanent: true,
          direction: "top",
        })
        .addTo(group),
    );
    ship.current = L.marker(route.coordinates[0], {
      interactive: false,
      icon: L.divIcon({
        className: "ship-marker",
        html: "<span>➤</span>",
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
    }).addTo(group);
    const key = JSON.stringify([
      route.coordinates[0],
      route.coordinates.at(-1),
    ]);
    if (initialBounds.current !== key) {
      map.current.fitBounds(L.latLngBounds(route.coordinates).pad(0.15));
      initialBounds.current = key;
    }
  }, [route, routes, zones, color, layers]);
  useEffect(() => {
    if (!ship.current || !route) return;
    const target = (route.hours * progress) / 100;
    let elapsed = 0;
    for (const s of route.segments) {
      if (elapsed + s.hours >= target) {
        const t = Math.min(1, (target - elapsed) / s.hours);
        ship.current.setLatLng([
          s.from[0] + (s.to[0] - s.from[0]) * t,
          s.from[1] + (s.to[1] - s.from[1]) * t,
        ]);
        break;
      }
      elapsed += s.hours;
    }
  }, [progress, route, layers]);
  return (
    <section className="panel map-panel">
      <div className="panel-heading">
        <div>
          <h2>Route map</h2>

        </div>
        <button
          className="small-button"
          onClick={() => setShowLayers(!showLayers)}
          aria-expanded={showLayers}
        >
          <Layers size={14} /> Map layers
        </button>
      </div>
      <div className="map-wrap">
        <div
          className="map"
          ref={host}
          aria-label="Interactive maritime route map"
        />
        {showLayers && (
          <div className="layer-menu">
            {[
              ["habitat", "Whale habitats"],
              ["vsr", "Speed reduction zones"],
              ["alternatives", "Alternative routes"],
            ].map(([id, label]) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={layers[id]}
                  onChange={(e) =>
                    setLayers({ ...layers, [id]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        )}
        <span className="map-badge">
          ● {route?.name || "Calculating passage…"}
        </span>
        <button
          className="recenter"
          aria-label="Recenter map"
          onClick={() =>
            route &&
            map.current.fitBounds(L.latLngBounds(route.coordinates).pad(0.15))
          }
        >
          <LocateFixed size={18} />
        </button>
        {tileError && (
          <span className="tile-error">
            Coastline data could not be loaded. Reload the page to retry.
          </span>
        )}
      </div>
      <div className="map-legend">
        <span>
          <i style={{ background: color }} /> Open water
        </span>
        <span>
          <i style={{ background: "#d59034" }} /> 10 kn protected transit
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
          aria-label={playing ? "Pause voyage" : "Play voyage"}
          disabled={!route}
          onClick={() => {
            if (progress >= 100) setProgress(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <div>
          <strong>
            {progress >= 100
              ? "Arrived at destination"
              : "Voyage preview"}
          </strong>
          <small>
            {route
              ? `${((route.hours * progress) / 100).toFixed(1)} h elapsed · ${(route.hours * (1 - progress / 100)).toFixed(1)} h remaining`
              : "Waiting for route"}
          </small>
        </div>
        <input
          aria-label="Voyage progress"
          type="range"
          min="0"
          max="100"
          step=".1"
          value={progress}
          onChange={(e) => {
            setPlaying(false);
            setProgress(Number(e.target.value));
          }}
        />
        <b>{Math.round(progress)}%</b>
      </div>
    </section>
  );
}


