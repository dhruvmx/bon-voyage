import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { positionAtProgress } from "./voyagePosition";
import "leaflet/dist/leaflet.css";
import { Layers, LocateFixed, Pause, Play } from "lucide-react";

export default function VoyageMap({
  route,
  highlightToken = 0,
  routes,
  zones,
  color,
  coverage,
  progress,
  setProgress,
  playing,
  setPlaying,
}) {
  const host = useRef(null),
    map = useRef(null),
    overlays = useRef(null),
    ship = useRef(null),
    initialBounds = useRef(null),
    routeLines = useRef([]);

  const [layers, setLayers] = useState({
    habitat: true,
    vsr: true,
    alternatives: true,
  });
  const [showLayers, setShowLayers] = useState(false);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!host.current || map.current) return;

    // Initialize Leaflet map instance centered on global view
    // Infinite horizontal scroll: no maxBounds, worldCopyJump for smooth wrapping
    const instance = L.map(host.current, {
	    scrollWheelZoom: true,
	    zoomControl: true,
	    center: [20, 0],
	    zoom: 2,
	    minZoom: 2,
	    worldCopyJump: true,
	    maxBoundsViscosity: 0,
	    // Allow infinite horizontal panning
	    maxBounds: undefined,
	    inertia: true,
        // A queued Leaflet zoom transition can outlive a React unmount.
        zoomAnimation: false,
        markerZoomAnimation: false,
        fadeAnimation: false,
    });

    map.current = instance;
    overlays.current = L.layerGroup().addTo(instance);

    instance.createPane("land");
    instance.getPane("land").style.zIndex = 220;

    let active = true;

    // Helper: shift all coordinates in a GeoJSON by a longitude offset
    const shiftCoords = (coords, offset) => {
      if (typeof coords[0] === "number") return [coords[0] + offset, coords[1]];
      return coords.map((c) => shiftCoords(c, offset));
    };
    const shiftGeoJSON = (data, offset) => ({
      ...data,
      features: data.features.map((f) => ({
        ...f,
        geometry: {
          ...f.geometry,
          coordinates: shiftCoords(f.geometry.coordinates, offset),
        },
      })),
    });

    const coastlineStyle = {
      color: "var(--border)",
      weight: 1.2,
      fillColor: "var(--map-land)",
      fillOpacity: 1,
    };

    fetch("/coastline.geojson")
      .then((r) => {
        if (!r.ok) throw new Error("Coastline unavailable");
        return r.json();
      })
      .then((data) => {
        if (!active) return;
        // Render coastline at three world copies for infinite horizontal scroll
        [-360, 0, 360].forEach((offset) => {
          const gj = offset === 0 ? data : shiftGeoJSON(data, offset);
          L.geoJSON(gj, {
            pane: "land",
            interactive: false,
            style: coastlineStyle,
          }).addTo(instance);
        });
      })
      .catch(() => active && setTileError(true));

    instance.attributionControl.addAttribution(
      '<a href="https://www.naturalearthdata.com/">Natural Earth</a> · Public domain'
    );

    // Global latitude and longitude grid lines (across all world copies)
    const gridStyle = {
      color: "var(--map-grid)",
      weight: 0.5,
      opacity: 0.6,
      interactive: false,
    };
    for (let lat = -60; lat <= 60; lat += 30) {
      L.polyline(
        [
          [lat, -540],
          [lat, 540],
        ],
        gridStyle
      ).addTo(instance);
    }
    for (let offset = -360; offset <= 360; offset += 360) {
      for (let lon = -180; lon <= 180; lon += 30) {
        L.polyline(
          [
            [-80, lon + offset],
            [80, lon + offset],
          ],
          gridStyle
        ).addTo(instance);
      }
    }

    // Key international port and ocean labels (replicated across world copies)
    const labels = [
      ["PACIFIC OCEAN", 0, -160, "ocean"],
      ["ATLANTIC OCEAN", 0, -30, "ocean"],
      ["INDIAN OCEAN", -20, 80, "ocean"],
      ["Shanghai", 31.23, 121.47, "city"],
      ["Singapore", 1.35, 103.82, "city"],
      ["Rotterdam", 51.92, 4.47, "city"],
      ["Los Angeles", 33.74, -118.27, "city"],
    ];

    [-360, 0, 360].forEach((offset) =>
      labels.forEach(([name, lat, lon, type]) =>
        L.marker([lat, lon + offset], {
          pane: "markerPane",
          interactive: false,
          icon: L.divIcon({
            className: "geo-label " + type,
            html: name,
            iconSize: [140, 18],
            iconAnchor: [0, 9],
          }),
        }).addTo(instance)
      )
    );

    const resize = new ResizeObserver(() => { if (active) instance.invalidateSize(); });
    resize.observe(host.current);

    return () => {
      active = false;
      resize.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    if (!route) { overlays.current.clearLayers(); ship.current = null; return; }
    const group = overlays.current;
    group.clearLayers();
    routeLines.current = [];

    // Helper to offset a [lat, lng] coordinate pair by a longitude
    const shiftPt = (pt, offset) => [pt[0], pt[1] + offset];
    const shiftCoords = (coords, offset) => coords.map((pt) => shiftPt(pt, offset));

    // World copy offsets for infinite horizontal scroll
    const worldOffsets = [-360, 0, 360];

    worldOffsets.forEach((offset) => {
      // Protection / habitat zones
      zones
        .filter((z) => layers[z.kind === "vsr" ? "vsr" : "habitat"])
        .forEach((z) =>
          L.circle([z.lat, z.lon + offset], {
            radius: z.radius_nm * 1852,
            color: z.kind === "vsr" ? "var(--protected)" : "var(--habitat)",
            fillColor: z.kind === "vsr" ? "var(--protected)" : "var(--habitat)",
            fillOpacity: 0.22,
            dashArray: "6 5",
            weight: 2,
          })
            .bindTooltip(
              `${z.name}${
                z.kind === "vsr" ? " · 10 kn maximum" : " · Whale habitat / ≤10 kn"
              }`
            )
            .addTo(group)
        );

      // Alternative routes
      if (layers.alternatives)
        routes
          ?.filter((r, index, all) => (r.path_id || r.id) !== (route.path_id || route.id)
            && all.findIndex((other) => (other.path_id || other.id) === (r.path_id || r.id)) === index)
          .forEach((r) =>
            L.polyline(shiftCoords(r.coordinates, offset), {
              color: "var(--muted)",
              weight: 2,
              dashArray: "5 8",
              opacity: 0.5,
            })
              .bindTooltip(r.name)
              .addTo(group)
          );

      // Main route halo + line
      L.polyline(shiftCoords(route.coordinates, offset), {
        color: "var(--route-halo)",
        weight: 9,
      }).addTo(group);
      const line = L.polyline(shiftCoords(route.coordinates, offset), {
        color: "var(--route-color)",
        weight: 5,
      })
        .bindTooltip(`${route.name} · ${route.speed} kn open water`)
        .addTo(group);
      routeLines.current.push(line);

      // Protected transit segments
      let chunk = [],
        lastKind;
      route.segments?.forEach((s, i) => {
        if (s.kind !== lastKind && chunk.length) {
          if (lastKind !== "open")
            L.polyline(chunk, { color: "var(--protected)", weight: 5 }).addTo(
              group
            );
          chunk = [];
        }
        chunk.push(shiftPt(s.from, offset), shiftPt(s.to, offset));
        lastKind = s.kind;
        if (i === route.segments.length - 1 && s.kind !== "open")
          L.polyline(chunk, { color: "var(--protected)", weight: 5 }).addTo(
            group
          );
      });

      // Port markers
      [route.coordinates[0], route.coordinates.at(-1)].forEach((p, i) =>
        L.circleMarker(shiftPt(p, offset), {
          radius: 7,
          color: "var(--ink)",
          weight: 2,
          fillColor: i ? "var(--protected)" : "var(--surface)",
          fillOpacity: 1,
        })
          .bindTooltip(i ? "Destination port" : "Departure port", {
            permanent: offset === 0, // only permanent tooltip on center copy
            direction: "top",
          })
          .addTo(group)
      );
    });

    // Ship marker only on center copy (worldCopyJump keeps it visible)
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
      route.path_id,
    ]);
    if (initialBounds.current !== key) {
      map.current.fitBounds(L.latLngBounds(route.coordinates).pad(0.15), { animate: false });
      initialBounds.current = key;
    }
  }, [route, routes, zones, color, layers]);

  useEffect(() => {
    if (!highlightToken || !route || !map.current) return;
    map.current.fitBounds(L.latLngBounds(route.coordinates).pad(0.15), { animate: false });
    const elements = routeLines.current.map((line) => line.getElement()).filter(Boolean);
    elements.forEach((element) => {
      element.classList.remove("route-highlight");
      void element.getBoundingClientRect();
      element.classList.add("route-highlight");
    });
    const clear = () => elements.forEach((element) => element.classList.remove("route-highlight"));
    const timer = setTimeout(clear, 2400);
    return () => { clearTimeout(timer); clear(); };
  }, [highlightToken, route]);

  useEffect(() => {
    if (!ship.current || !route || !route.segments) return;
    ship.current.setLatLng(positionAtProgress(route, progress));
  }, [progress, route, layers]);

  return (
    <section className="panel map-panel" style={{ "--cargo-color": color }}>
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
              ["habitat", "Whale habitats (California scenario)"],
              ["vsr", "Modeled slow zones (California)"],
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
        <span className="map-badge" role="status">
          ● {route?.name || "Calculating passage…"}
        </span>
        <button
          className="recenter"
          aria-label="Recenter map"
          onClick={() =>
            route &&
            map.current?.fitBounds(
              L.latLngBounds(route.coordinates).pad(0.15), { animate: false }
            )
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
          <i style={{ background: "var(--route-color)" }} /> Open water
        </span>
        <span>
          <i style={{ background: "var(--protected)" }} /> ≤10 kn protected
          transit (scenario)
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
      {coverage?.whale && <details className="coverage-note">
        <summary><strong>{coverage.whale.score_available ? "California scenario coverage" : "Whale habitat coverage incomplete"}</strong><span>Data details</span></summary>
        <p>{coverage.whale.summary} {coverage.whale.note}</p>
        <a href={coverage.whale.global_reference} target="_blank" rel="noreferrer">About worldwide habitat coverage ↗</a>
      </details>}
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
            {progress >= 100 ? "Arrived at destination" : "Voyage preview"}
          </strong>
          <small>
            {route
              ? `${((route.hours * progress) / 100).toFixed(1)} h elapsed · ${(
                  route.hours *
                  (1 - progress / 100)
                ).toFixed(1)} h remaining`
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
