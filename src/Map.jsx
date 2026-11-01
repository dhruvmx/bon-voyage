import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { positionAtProgress } from "./voyagePosition";
import "leaflet/dist/leaflet.css";
import { Layers, LocateFixed, Pause, Play, RefreshCw } from "lucide-react";

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
  calculating = false,
}) {
  const host = useRef(null),
    map = useRef(null),
    overlays = useRef(null),
    ship = useRef(null),
    initialBounds = useRef(null),
    routeLines = useRef([]),
    // Track which world copy offsets have been rendered for the base map layers
    renderedCopies = useRef(new Set()),
    coastlineData = useRef(null),
    baseLayerGroup = useRef(null);

  const [layers, setLayers] = useState({
    habitat: true,
    vsr: true,
    alternatives: true,
  });
  const [showLayers, setShowLayers] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [coastlineLoading, setCoastlineLoading] = useState(true);

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
    baseLayerGroup.current = L.layerGroup().addTo(instance);

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

    const gridStyle = {
      color: "var(--map-grid)",
      weight: 0.5,
      opacity: 0.6,
      interactive: false,
    };

    // Key international port and ocean labels
    const labels = [
      ["PACIFIC OCEAN", 0, -160, "ocean"],
      ["ATLANTIC OCEAN", 0, -30, "ocean"],
      ["INDIAN OCEAN", -20, 80, "ocean"],
      ["Shanghai", 31.23, 121.47, "city"],
      ["Singapore", 1.35, 103.82, "city"],
      ["Rotterdam", 51.92, 4.47, "city"],
      ["Los Angeles", 33.74, -118.27, "city"],
    ];

    // Render base map layers (coastline, grid, labels) for a single world copy offset
    const renderWorldCopy = (offset, coastData) => {
      if (!active) return;
      if (renderedCopies.current.has(offset)) return;
      renderedCopies.current.add(offset);
      const group = baseLayerGroup.current;

      // Coastline
      if (coastData) {
        const gj = offset === 0 ? coastData : shiftGeoJSON(coastData, offset);
        L.geoJSON(gj, {
          pane: "land",
          interactive: false,
          style: coastlineStyle,
        }).addTo(group);
      }

      // Vertical grid lines for this world copy
      for (let lon = -180; lon <= 180; lon += 30) {
        L.polyline(
          [
            [-80, lon + offset],
            [80, lon + offset],
          ],
          gridStyle
        ).addTo(group);
      }

      // Labels for this world copy
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
        }).addTo(group)
      );
    };

    // Determine which world copy offsets are needed for the current viewport
    const getNeededOffsets = () => {
      const bounds = instance.getBounds();
      const west = bounds.getWest();
      const east = bounds.getEast();
      // Which 360-wide world copies overlap with the viewport
      const minCopy = Math.floor((west + 180) / 360);
      const maxCopy = Math.ceil((east - 180) / 360);
      const offsets = [];
      for (let i = minCopy - 1; i <= maxCopy + 1; i++) {
        offsets.push(i * 360);
      }
      return offsets;
    };

    // Ensure all visible world copies are rendered
    const ensureWorldCopies = () => {
      const needed = getNeededOffsets();
      const data = coastlineData.current;
      needed.forEach((offset) => renderWorldCopy(offset, data));
    };

    // Horizontal latitude grid lines span a very wide range
    for (let lat = -60; lat <= 60; lat += 30) {
      L.polyline(
        [
          [lat, -5400],
          [lat, 5400],
        ],
        gridStyle
      ).addTo(baseLayerGroup.current);
    }

    // Load coastline and render initial copies
    fetch("/coastline.geojson")
      .then((r) => {
        if (!r.ok) throw new Error("Coastline unavailable");
        return r.json();
      })
      .then((data) => {
        if (!active) return;
        coastlineData.current = data;
        setCoastlineLoading(false);
        // Render initial world copies plus any the viewport already needs
        [-360, 0, 360].forEach((offset) => renderWorldCopy(offset, data));
        ensureWorldCopies();
      })
      .catch(() => {
        if (!active) return;
        setCoastlineLoading(false);
        setTileError(true);
        // Still render grid/labels for initial copies even without coastline
        [-360, 0, 360].forEach((offset) => renderWorldCopy(offset, null));
      });

    instance.attributionControl.addAttribution(
      '<a href="https://www.naturalearthdata.com/">Natural Earth</a> · Public domain'
    );

    // Dynamically load more world copies as the user pans.
    // Listen on both "move" (fires continuously during pan) and "moveend"
    // so the map renders immediately while panning, not just after stopping.
    instance.on("move", ensureWorldCopies);
    instance.on("moveend", ensureWorldCopies);

    const resize = new ResizeObserver(() => { if (active) instance.invalidateSize(); });
    resize.observe(host.current);

    return () => {
      active = false;
      instance.off("move", ensureWorldCopies);
      instance.off("moveend", ensureWorldCopies);
      resize.disconnect();
      instance.remove();
      map.current = null;
      renderedCopies.current = new Set();
      coastlineData.current = null;
      baseLayerGroup.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    if (!route) { overlays.current.clearLayers(); ship.current = null; return; }
    const instance = map.current;
    const group = overlays.current;
    group.clearLayers();
    routeLines.current = [];

    // Helper to offset a [lat, lng] coordinate pair by a longitude
    const shiftPt = (pt, offset) => [pt[0], pt[1] + offset];
    const shiftCoords = (coords, offset) => coords.map((pt) => shiftPt(pt, offset));

    // Track which route overlay offsets have been rendered
    const renderedRouteOffsets = new Set();
    const animationTimers = [];

    // Render route overlays for a single world copy offset
    const renderRouteAtOffset = (offset, animate) => {
      if (renderedRouteOffsets.has(offset)) return;
      renderedRouteOffsets.add(offset);

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
        className: "route-passage-line",
      })
        .bindTooltip(`${route.name} · ${route.speed} kn open water`)
        .addTo(group);
      routeLines.current.push(line);

      if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const el = line.getElement();
        if (el && typeof el.getTotalLength === "function") {
          try {
            const length = Math.ceil(el.getTotalLength());
            if (length > 0) {
              el.style.strokeDasharray = `${length}`;
              el.style.strokeDashoffset = `${length}`;
              void el.getBoundingClientRect();
              el.style.transition = "stroke-dashoffset 0.85s cubic-bezier(0.16, 1, 0.3, 1)";
              el.style.strokeDashoffset = "0";
              const timer = setTimeout(() => {
                if (el) {
                  el.style.strokeDasharray = "";
                  el.style.strokeDashoffset = "";
                  el.style.transition = "";
                }
              }, 900);
              animationTimers.push(timer);
            }
          } catch (_) {}
        }
      }

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
    };

    // Compute which world copy offsets the viewport needs
    const getNeededOffsets = () => {
      const bounds = instance.getBounds();
      const west = bounds.getWest();
      const east = bounds.getEast();
      const minCopy = Math.floor((west + 180) / 360);
      const maxCopy = Math.ceil((east - 180) / 360);
      const offsets = [];
      for (let i = minCopy - 1; i <= maxCopy + 1; i++) {
        offsets.push(i * 360);
      }
      return offsets;
    };

    const ensureRouteOverlays = () => {
      const needed = getNeededOffsets();
      needed.forEach((offset) => renderRouteAtOffset(offset, false));
    };

    // Render initial world copies with animation, then ensure viewport coverage
    [-360, 0, 360].forEach((offset) => renderRouteAtOffset(offset, true));
    ensureRouteOverlays();

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

    // Listen for panning to dynamically add route overlays for new world copies.
    // Use both "move" and "moveend" so overlays appear during panning, not just after.
    instance.on("move", ensureRouteOverlays);
    instance.on("moveend", ensureRouteOverlays);

    return () => {
      animationTimers.forEach(clearTimeout);
      instance.off("move", ensureRouteOverlays);
      instance.off("moveend", ensureRouteOverlays);
    };
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
      <div className="map-wrap" aria-busy={calculating || coastlineLoading}>
        <div
          className="map"
          ref={host}
          aria-label="Interactive maritime route map"
        />
        {calculating && (
          <div className="map-loading-indicator" role="status" aria-label="Calculating route">
            <div className="map-loading-bar" />
            <div className="map-loading-pill">
              <RefreshCw size={13} className="map-spin-icon" aria-hidden="true" />
              <span>Calculating passage…</span>
            </div>
          </div>
        )}
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
        <span className="map-badge" role="status" aria-live="polite">
          {calculating ? (
            <span className="map-badge-calculating">
              <span className="map-badge-spinner" aria-hidden="true" />
              <span>Calculating passage…</span>
            </span>
          ) : (
            <>● {route?.name || (coastlineLoading ? "Loading map data…" : "Calculating passage…")}</>
          )}
        </span>
        <button
          className="recenter"
          aria-label="Recenter map"
          disabled={!route || calculating}
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
      {coverage?.whale && <div className="coverage-note" role="status">
        <strong>{coverage.whale.score_available ? "California scenario coverage" : "Whale habitat coverage incomplete"}</strong>
        <p>{coverage.whale.summary} {coverage.whale.note}</p>
        <a href={coverage.whale.global_reference} target="_blank" rel="noreferrer">About worldwide habitat coverage ↗</a>
      </div>}
      <div className="playback">
        <button
          className="play-button"
          aria-label={playing ? "Pause voyage" : "Play voyage"}
          disabled={!route || calculating}
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
            {calculating
              ? "Updating passage…"
              : route
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
