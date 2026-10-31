import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowUpRight,
  BarChart3,
  Check,
  Compass,
  Download,
  Flag,
  HelpCircle,
  Leaf,
  LogOut,
  Plus,
  Settings,
  Ship,
  Trash2,
  User,
  Waves,
  X,
  Anchor,
  Pencil,
  Clock,
  ShieldCheck,
  RefreshCw,
  Search,
} from "lucide-react";
import { api, download } from "./api";
import VoyageMap from "./Map";
import Appearance from "./Appearance";
import Intro from "./Intro";
import SidebarControls from "./SidebarControls";
import CargoPicker from "./CargoPicker";
import { cargoItems, manifestInputs, manifestError, whaleAssessed, formatHours } from "./cargo";

const freshInputs = () => ({
  origin: "la",
  destination: "oakland",
  cargo_type: "avocados",
  cargo_name: "Avocados",
  cargo_items: [{ product_id: "avocados", name: "Avocados", profile: "avocados", weight: 240, temperature: 5, shelf_life: 504, cargo_age: 0, routing_priority: "auto" }],
  weight: 240,
  temperature: 5,
  shelf_life: 504,
  cargo_age: 0,
  arrival_window: 36,
  max_speed: 24,
  fuel_per_day: 35,
  whale_activity: 1,
  departure: new Date(Date.now() + 3600000).toISOString().slice(0, 16) + "Z",
});
const defaultVessel = {
  name: "",
  imo: "",
  max_speed: 24,
  fuel_per_day: 35,
  capacity: 12000,
};
const date = (value) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const initials = (name) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function Modal({ title, eyebrow, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    const close = (e) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", close);
    return () => {
      dialog.removeEventListener("cancel", close);
      dialog.close();
    };
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      onClick={(e) => {
        if (e.target === ref.current) {
          const b = ref.current.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            onClose();
        }
      }}
    >
      <button
        className="modal-close"
        aria-label="Close dialog"
        onClick={onClose}
      >
        <X size={21} />
      </button>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
function ErrorMessage({ error }) {
  return error ? (
    <div className="error" role="alert">
      {error}
    </div>
  ) : null;
}
function Stat({ label, value, unit, sub, dark, icon: Icon }) {
  return (
    <article className="stat" title={sub}>
      <div className="stat-label">
        {label}
        <Icon size={16} />
      </div>
      <div className="stat-number">
        {value}
        <em>{unit}</em>
      </div>
      <small className="stat-sub">{sub}</small>
    </article>
  );
}

export default function App() {
  const [catalog, setCatalog] = useState(null),
    [user, setUser] = useState(null),
    [authChecked, setAuthChecked] = useState(false),
    [view, setView] = useState("planner");
  const [inputs, setInputs] = useState(freshInputs),
    [result, setResult] = useState(null),
    [selected, setSelected] = useState("balanced"),
    [calculating, setCalculating] = useState(false),
    [planError, setPlanError] = useState("");
  const manifest = useMemo(() => cargoItems(inputs), [inputs]);
  const setManifest = useCallback((items) => setInputs((previous) => manifestInputs(previous, items)), []);
  const [voyages, setVoyages] = useState([]),
    [vessels, setVessels] = useState([]),
    [vesselId, setVesselId] = useState(""),
    [editingId, setEditingId] = useState(null),
    [voyageName, setVoyageName] = useState(""),
    [notes, setNotes] = useState(""),
    [voyageStatus, setVoyageStatus] = useState("Planned");
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null),
    [authMode, setAuthMode] = useState("signup"),
    [toast, setToast] = useState(""),
    [dataError, setDataError] = useState(""),
    [progress, setProgress] = useState(0),
    [playing, setPlaying] = useState(false),
    [query, setQuery] = useState("");
  const [introState, setIntroState] = useState("playing"),
    [introRevealed, setIntroRevealed] = useState(false),
    introLoginShown = useRef(false);
  const closeModal = useCallback(() => setModal(null), []),
    requestNo = useRef(0),
    desiredRoute = useRef(null),
    toastTimer = useRef(null);
  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const refresh = useCallback(async () => {
    try {
      const [vs, ss] = await Promise.all([api("/voyages"), api("/vessels")]);
      setVoyages(vs);
      setVessels(ss);
      setDataError("");
    } catch (e) {
      setDataError(e.message);
    }
  }, []);
  useEffect(() => {
    let active = true;
    api("/catalog")
      .then((x) => active && setCatalog(x))
      .catch((e) => active && setPlanError(e.message));
    api("/auth/me")
      .then((x) => active && setUser(x))
      .catch((e) => {
        if (e.status !== 401 && active) setDataError(e.message);
      })
      .finally(() => active && setAuthChecked(true));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (user) refresh();
    else {
      setVoyages([]);
      setVessels([]);
    }
  }, [user?.id, refresh]);
  useEffect(() => {
    if (!catalog) return;
    const cargoError = manifestError(manifest);
    if (cargoError) {
      ++requestNo.current; setPlanError(cargoError); setResult(null); setCalculating(false); return;
    }
    const n = ++requestNo.current;
    setCalculating(true);
    setPlanError("");
    const timer = setTimeout(
      () =>
        api("/plan", { method: "POST", body: inputs })
          .then((x) => {
            if (n === requestNo.current) {
              setResult(x);
              setSelected(desiredRoute.current || x.recommended);
              desiredRoute.current = null;
            }
          })
          .catch((e) => {
            if (n === requestNo.current) {
              setPlanError(e.message);
              setResult(null);
            }
          })
          .finally(() => {
            if (n === requestNo.current) setCalculating(false);
          }),
      300,
    );
    return () => clearTimeout(timer);
  }, [inputs, catalog, manifest]);
  useEffect(() => {
    setProgress(0);
    setPlaying(false);
  }, [selected, result]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setProgress((p) => Math.min(100, p + 0.3)),
      80,
    );
    return () => clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    if (progress >= 100) setPlaying(false);
  }, [progress]);
  const route = result?.routes.find((x) => x.id === selected),
    cargo = catalog?.cargo_types[inputs.cargo_type];
  const change = (key, value) => setInputs((p) => ({ ...p, [key]: value }));
  const requireAuth = () => {
    if (user) return true;
    setAuthMode("signup");
    setModal("auth");
    return false;
  };
  const switchView = (name) => {
    setView(name);
    setPlaying(false);
    setQuery("");
  };
  const useVessel = (id) => {
    setVesselId(id);
    const v = vessels.find((x) => x.id === id);
    if (v)
      setInputs((p) => ({
        ...p,
        max_speed: v.max_speed,
        fuel_per_day: v.fuel_per_day,
      }));
  };
  const loadVoyage = (v) => {
    desiredRoute.current = v.route_id;
    setInputs(v.inputs);
    setVesselId(vessels.some(s => s.id === v.vessel_id) ? v.vessel_id : "");
    setEditingId(v.id);
    setVoyageName(v.name);
    setNotes(v.notes);
    setVoyageStatus(v.status);
    setView("planner");
    notify("Voyage loaded. Adjust inputs and save to update it.");
  };
  const newVoyage = () => {
    setInputs(freshInputs());
    setEditingId(null);
    setVoyageName("");
    setNotes("");
    setVesselId("");
    setVoyageStatus("Planned");
    switchView("planner");
  };
  async function saveVoyage(e) {
    e.preventDefault();
    if (!route || saving) return;
    setSaving(true);
    setDataError("");
    try {
      await api("/voyages" + (editingId ? "/" + editingId : ""), {
        method: editingId ? "PUT" : "POST",
        body: {
          name: voyageName,
          notes,
          status: voyageStatus,
          vessel_id: vesselId || null,
          route_id: selected,
          inputs,
        },
      });
      await refresh();
      setModal(null);
      notify(editingId ? "Voyage updated." : "Voyage saved to your account.");
    } catch (err) {
      setDataError(err.message);
    } finally {
      setSaving(false);
    }
  }
  async function removeRecord(type, id) {
    try {
      await api("/" + type + "/" + id, { method: "DELETE" });
      await refresh();
      if (type === "voyages" && editingId === id) setEditingId(null);
      notify(type === "voyages" ? "Voyage deleted." : "Vessel removed.");
      setModal(null);
    } catch (e) {
      setDataError(e.message);
    }
  }
  const selectedVessel = vessels.find((v) => v.id === vesselId),
    capacityError = selectedVessel && inputs.weight > selectedVessel.capacity;
  const ready = route && !calculating && !planError && !capacityError;
  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-heading">
        <button
          className="brand"
          aria-label="Bon Voyage home"
          onClick={() => switchView("planner")}
        >
          <Waves size={31} />
          <span>Bon Voyage</span>
        </button>
        <SidebarControls />
        </div>
        <div className="sidebar-content" tabIndex={0} role="region" aria-label="Sidebar navigation and profile">
        <div className="workspace">
          <div>
            <strong>{user?.company || "Pacific operations"}</strong>
          </div>
        </div>
        <nav id="sidebar-navigation" aria-label="Workspace navigation">
          {[
            ["planner", "Route planner", Compass],
            ["voyages", "My voyages", Flag],
            ["fleet", "My fleet", Ship],
            ["insights", "Impact overview", BarChart3],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              aria-label={label}
              title={label}
              className={view === id ? "active" : ""}
              onClick={() => switchView(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "voyages" && <b>{voyages.length}</b>}
            </button>
          ))}
        </nav>
        <button
          className="profile-button"
          aria-label="My profile"
          onClick={() => {
            if (requireAuth()) switchView("profile");
          }}
        >
          <span className="avatar">
            {user ? initials(user.name) : <User size={18} />}
          </span>
          <span>
            <strong>{user?.name || "Your workspace"}</strong>
            <small>{user?.role || "Log in / sign up"}</small>
          </span>
          <Settings size={15} />
        </button>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <b>
              {
                {
                  planner: "Route planner",
                  voyages: "My voyages",
                  fleet: "My fleet",
                  insights: "Impact overview",
                  profile: "My profile",
                }[view]
              }
            </b>
          </div>
          <div className="header-actions">
            <Appearance />
            <button
              className="icon-button"
              aria-label="How Bon Voyage works"
              onClick={() => setModal("help")}
            >
              <HelpCircle size={18} />
            </button>
            {user ? (
              <button
                className="avatar"
                aria-label="Open profile"
                onClick={() => switchView("profile")}
              >
                {initials(user.name)}
              </button>
            ) : (
              <>
                <button
                  className="text-button"
                  onClick={() => {
                    setAuthMode("login");
                    setModal("auth");
                  }}
                >
                  Log in
                </button>
                <button
                  className="button small"
                  onClick={() => {
                    setAuthMode("signup");
                    setModal("auth");
                  }}
                >
                  Sign up <ArrowUpRight size={14} />
                </button>
              </>
            )}
          </div>
        </header>
        <div className="page">
          <div className="page-title">
            <div>
              <h1>
                {view === "planner"
                  ? "A better way across."
                  : view === "voyages"
                    ? "Your voyages. Your course."
                    : view === "fleet"
                      ? "A fleet with purpose."
                      : view === "insights"
                        ? "Every passage adds up."
                        : "Make yourself at home."}
              </h1>
              <p>
                {view === "planner"
                  ? "Fresh cargo. Safer oceans. Smarter voyages."
                  : view === "profile"
                    ? "Your identity, preferences, and account."
                    : "Your maritime workspace, connected from port to port."}
              </p>
            </div>
            {view === "planner" ? (
              <button
                className="button secondary"
                disabled={!ready}
                onClick={() =>
                  download({ inputs, route, data_mode: result.data_mode, data_coverage: result.data_coverage })
                }
              >
                <Download size={15} /> Export voyage
              </button>
            ) : (
              view !== "profile" && (
                <button className="button" onClick={newVoyage}>
                  <Plus size={16} /> New voyage
                </button>
              )
            )}
          </div>
          {dataError && (
            <div className="error global-error" role="alert">
              {dataError}
              <button
                className="text-button"
                onClick={() => {
                  setDataError("");
                  if (user) refresh();
                }}
              >
                Retry
              </button>
            </div>
          )}
          {!catalog ? (
            <div className="empty-state">
              <Compass size={42} />
              <h2>
                {planError
                  ? "The backend is unavailable."
                  : "Connecting to your ocean workspace…"}
              </h2>
              <p>
                {planError || "Loading ports and cargo categories from Python."}
              </p>
              <button className="button" onClick={() => location.reload()}>
                Reconnect
              </button>
            </div>
          ) : view === "planner" ? (
            <>
              <section className="stats">
                <Stat
                  label={manifest.length > 1 ? "Cargo freshness (avg.)" : "Arrival freshness"}
                  value={route ? route.freshness.toFixed(1) : "—"}
                  unit="%"
                  sub={`${Number(inputs.weight).toLocaleString()} tonnes · ${manifest.length} cargo item${manifest.length === 1 ? "" : "s"}`}
                  icon={Leaf}
                />
                <Stat
                  label="Estimated arrival"
                  value={route ? route.hours.toFixed(1) : "—"}
                  unit="hrs"
                  sub={
                    route ? date(route.eta) : "Calculate a passage to see ETA"
                  }
                  icon={Clock}
                />
                <Stat
                  label="Fuel use"
                  value={
                    route
                      ? (route.fuel_delta > 0 ? "+" : "") + route.fuel_delta
                      : "—"
                  }
                  unit="%"
                  sub={
                    route
                      ? `${route.fuel.toFixed(1)} t fuel · ${route.co2.toFixed(1)} t CO₂`
                      : "Speed-adjusted consumption"
                  }
                  icon={BarChart3}
                />
                <Stat
                  label="Whale assessment"
                  value={whaleAssessed(route, inputs) ? Math.round(route.protection) : "N/A"}
                  unit={whaleAssessed(route, inputs) ? "/100" : ""}
                  sub={whaleAssessed(route, inputs) ? "California scenario estimate" : "Habitat coverage incomplete"}
                  dark
                  icon={ShieldCheck}
                />
              </section>
              <div className="planner-grid">
                <div>
                  <VoyageMap
                    route={route}
                    routes={result?.routes || []}
                    zones={catalog.zones}
                    color={manifest.length > 1 ? "var(--accent)" : cargo?.color || "var(--accent)"}
                    coverage={result?.data_coverage}
                    progress={progress}
                    setProgress={setProgress}
                    playing={playing}
                    setPlaying={setPlaying}
                  />
                </div>
                <section className="panel config">
                  <div className="panel-heading">
                    <h2>Plan your passage</h2>
                  </div>
                  <div className="config-body">
                    <div className="port-pickers">
                      <Field label="Departure port">
                        <select
                          value={inputs.origin}
                          onChange={(e) =>
                            setInputs((p) => ({
                              ...p,
                              origin: e.target.value,
                              destination:
                                e.target.value === p.destination
                                  ? p.origin
                                  : p.destination,
                            }))
                          }
                        >
                          {catalog.ports.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {p.code}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <button
                        className="swap"
                        aria-label="Swap departure and destination"
                        onClick={() =>
                          setInputs((p) => ({
                            ...p,
                            origin: p.destination,
                            destination: p.origin,
                          }))
                        }
                      >
                        <ArrowDownUp size={15} />
                      </button>
                      <Field label="Destination port">
                        <select
                          value={inputs.destination}
                          onChange={(e) =>
                            setInputs((p) => ({
                              ...p,
                              destination: e.target.value,
                              origin:
                                e.target.value === p.origin
                                  ? p.destination
                                  : p.origin,
                            }))
                          }
                        >
                          {catalog.ports.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {p.code}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <CargoPicker products={catalog.cargo_products || []} profiles={catalog.cargo_types}
                      items={manifest} onChange={setManifest} results={route?.cargo_results} calculating={calculating} />
                    <label className="range-label" htmlFor="arrival-window">
                      Arrival window{" "}
                      <strong>{formatHours(inputs.arrival_window)}</strong>
                    </label>
                    <input
                      id="arrival-window"
                      type="range"
                      min="1"
                      max={catalog.max_arrival_hours || 2160}
                      value={inputs.arrival_window}
                      onChange={(e) =>
                        change("arrival_window", Number(e.target.value))
                      }
                    />
                    <div className="arrival-scale"><span>1 hour</span><span>90 days</span></div>
                    <Field label="Arrival window (hours)" type="number" min="1" max="2160" step="1"
                      value={inputs.arrival_window} onChange={(event) => change("arrival_window", Number(event.target.value))} />
                    <details className="advanced">
                      <summary>
                        Vessel, cargo & departure details <Plus size={13} />
                      </summary>
                      <div className="advanced-fields">
                        <Field label="Assigned vessel">
                          <select
                            value={vesselId}
                            onChange={(e) => useVessel(e.target.value)}
                          >
                            <option value="">
                              Custom vessel specifications
                            </option>
                            {vessels.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        {!user && (
                          <small>
                            Sign up to add and assign your own vessels.
                          </small>
                        )}
                        <div className="two-fields">
                          <Field
                            label="Maximum speed (kn)"
                            type="number"
                            min="5"
                            max="35"
                            value={inputs.max_speed}
                            onChange={(e) => {
                              setVesselId("");
                              change("max_speed", Number(e.target.value));
                            }}
                          />
                          <Field
                            label="Fuel at 18 kn (t/day)"
                            type="number"
                            min="1"
                            max="500"
                            value={inputs.fuel_per_day}
                            onChange={(e) => {
                              setVesselId("");
                              change("fuel_per_day", Number(e.target.value));
                            }}
                          />
                        </div>
                        <Field label="Departure (your local time)">
                          <input
                            type="datetime-local"
                            value={new Date(
                              new Date(inputs.departure).getTime() -
                                new Date(inputs.departure).getTimezoneOffset() *
                                  60000,
                            )
                              .toISOString()
                              .slice(0, 16)}
                            onChange={(e) => {
                              if (e.target.value)
                                change(
                                  "departure",
                                  new Date(e.target.value).toISOString(),
                                );
                            }}
                          />
                        </Field>
                        <Field label="Whale activity">
                          <select
                            value={inputs.whale_activity}
                            onChange={(e) =>
                              change("whale_activity", Number(e.target.value))
                            }
                          >
                            <option value="0.5">Low</option>
                            <option value="1">Typical</option>
                            <option value="2">High migration activity</option>
                            <option value="3">Peak activity</option>
                          </select>
                        </Field>
                      </div>
                    </details>
                    <ErrorMessage
                      error={
                        planError ||
                        (capacityError
                          ? "Cargo exceeds the assigned vessel’s capacity."
                          : "")
                      }
                    />
                    {route && !route.feasible && (
                      <div className="warning">
                        Arrival window cannot be met at {inputs.max_speed}{" "}
                        knots. Earliest arrival on this passage:{" "}
                        {route.hours.toFixed(1)} hours.
                      </div>
                    )}
                    {route &&
                      (route.worst_cargo_freshness ?? route.freshness) < 70 && (
                        <div className="warning">
                          One or more cargo items have low freshness. Review the item-level results, handling values, or arrival window.
                        </div>
                      )}
                    <button
                      className="button full"
                      disabled={!ready}
                      onClick={() => {
                        if (requireAuth()) {
                          setDataError("");
                          if (!voyageName)
                            setVoyageName(
                              `${manifest.length > 1 ? `${manifest.length} cargo items` : inputs.cargo_name} · ${catalog.ports.find((p) => p.id === inputs.destination).name}`.slice(0, 120),
                            );
                          setModal("save");
                        }
                      }}
                    >
                      {calculating
                        ? "Calculating passage…"
                        : editingId
                          ? "Update saved voyage"
                          : "Save this passage"}
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                </section>
              </div>
              {route?.cargo_results && <section className="panel cargo-arrival">
                <div className="panel-heading"><div><h2>Cargo on arrival</h2><p>Item-level estimates for the selected passage. The headline freshness is weighted by cargo mass.</p></div></div>
                {route.score_breakdown && <div className="route-priorities">
                  <strong>Applied route priorities</strong>
                  <span>{Math.round(route.score_breakdown.weights.freshness * 100)}% freshness · {Math.round(route.score_breakdown.weights.fuel * 100)}% fuel · {route.score_breakdown.components.habitat === null ? "Habitat unassessed" : `${Math.round(route.score_breakdown.weights.habitat * 100)}% habitat`}</span>
                  <small>Arrival feasibility and avoiding newly exhausted cargo budgets come first. Then these weights rank quality loss, fuel use, and available habitat data.</small>
                </div>}
                <div className="cargo-table-wrap"><table><caption className="sr-only">Cargo freshness and remaining shelf life</caption>
                  <thead><tr><th scope="col">Cargo</th><th scope="col">Weight</th><th scope="col">Freshness</th><th scope="col">Shelf life left</th></tr></thead>
                  <tbody>{route.cargo_results.map((item, index) => <tr key={index}><th scope="row">{item.name}</th><td>{item.weight.toLocaleString()} t</td><td className={item.freshness < 70 ? "cargo-at-risk" : ""}>{item.freshness.toFixed(1)}%</td><td>{item.perishable === false || item.profile === "electronics" ? "Non-perishable" : formatHours(Math.floor(item.shelf_remaining))}</td></tr>)}</tbody>
                </table></div>
              </section>}
              <section className="routes-section">
                <div className="section-heading">
                  <div>
                    <h2>Compare routes</h2>
                    <p>
                      Choose the passage that fits your cargo.
                    </p>
                  </div>
                  <span className="stamp">
                    {calculating ? "Recalculating…" : `3 passage options · ${result?.distinct_paths || 0} distinct paths`}
                  </span>
                </div>
                <div className="route-cards">
                  {result?.routes.map((r) => (
                    <button
                      key={r.id}
                      className={
                        "route-card " + (selected === r.id ? "selected" : "")
                      }
                      onClick={() => setSelected(r.id)}
                      aria-pressed={selected === r.id}
                    >
                      <div className="route-card-top">
                        <h3>{r.name}</h3>
                        <span className="radio">
                          {selected === r.id && <span />}
                        </span>
                      </div>
                      <div className="route-metrics">
                        <div>
                          <strong>
                            {r.hours.toFixed(1)}
                            <em> hrs</em>
                          </strong>
                          <small>Transit</small>
                        </div>
                        <div>
                          <strong>{r.freshness.toFixed(1)}%</strong>
                          <small>Freshness</small>
                        </div>
                        <div>
                          <strong>
                            {whaleAssessed(r, inputs) ? Math.round(r.protection) : "N/A"}
                            {whaleAssessed(r, inputs) && <em>/100</em>}
                          </strong>
                          <small>Whale assessment</small>
                        </div>
                      </div>
                      <div className="route-bottom">
                        <span>
                          {r.distance} nm ·{" "}
                          {r.feasible ? "Within window" : "Window exceeded"}
                        </span>
                        {result.recommended === r.id && <b>Recommended ↗</b>}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
              {route && (
                <section className="panel speed-panel">
                  <div className="speed-segments">
                    <div><strong>{Math.min(10, inputs.max_speed)} kn</strong><small>Modeled slow zones only</small></div>
                    <div><strong>{route.speed.toFixed(1)} kn</strong><small>Open-water speed</small></div>
                    <div><strong>{route.shelf_remaining === null ? "No modeled expiry" : `${route.shelf_remaining.toFixed(0)} h`}</strong><small>{route.shelf_remaining === null ? "Non-perishable cargo" : "Earliest quality horizon on arrival"}</small></div>
                  </div>
                </section>
              )}
            </>
          ) : view === "profile" ? (
            user ? (
              <Profile
                user={user}
                setUser={setUser}
                notify={notify}
                onLogout={async () => {
                  try {
                    await api("/auth/logout", { method: "POST" });
                    setUser(null);
                    setView("planner");
                    setVesselId("");
                    setEditingId(null);
                    notify("You have logged out.");
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              />
            ) : (
              <AccountPrompt
                open={() => {
                  setAuthMode("login");
                  setModal("auth");
                }}
              />
            )
          ) : !user ? (
            <AccountPrompt
              open={() => {
                setAuthMode("signup");
                setModal("auth");
              }}
            />
          ) : view === "voyages" ? (
            <>
              <div className="list-toolbar">
                <h2>
                  {voyages.length} saved{" "}
                  {voyages.length === 1 ? "voyage" : "voyages"}
                </h2>
                <div className="search">
                  <Search size={15} />
                  <input
                    aria-label="Search voyages"
                    placeholder="Search your voyages…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <button
                  className="icon-button"
                  aria-label="Refresh voyages"
                  onClick={refresh}
                >
                  <RefreshCw size={17} />
                </button>
              </div>
              {!voyages.length ? (
                <Empty
                  icon={Flag}
                  title="Your next passage starts here."
                  text="Plan a voyage, select a route, and save it to your account."
                  action="Plan a voyage"
                  onClick={newVoyage}
                />
              ) : (
                <div className="saved-list">
                  {voyages
                    .filter((v) =>
                      (v.name + " " + v.inputs.cargo_name + " " + (v.inputs.cargo_items || []).map((item) => item.name).join(" "))
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((v) => (
                      <article className="saved-card" key={v.id}>
                        <div className="saved-top">
                          <span className="stamp">{v.status}</span>
                          <span>{v.result.distance} nm</span>
                        </div>
                        <h3>{v.name}</h3>
                        <p>
                          {
                            catalog.ports.find((p) => p.id === v.inputs.origin)
                              ?.name
                          }{" "}
                          →{" "}
                          {
                            catalog.ports.find(
                              (p) => p.id === v.inputs.destination,
                            )?.name
                          }
                        </p>
                        <div className="saved-metrics">
                          <span>
                            <strong>{v.result.hours.toFixed(1)}h</strong>
                            <small>Transit</small>
                          </span>
                          <span>
                            <strong>{v.result.freshness.toFixed(1)}%</strong>
                            <small>Freshness</small>
                          </span>
                          <span>
                            <strong>{v.inputs.weight} t</strong>
                            <small>{v.inputs.cargo_name}</small>
                          </span>
                        </div>
                        <p className="saved-notes">
                          {v.notes || v.result.name}
                        </p>
                        <div className="saved-actions">
                          <button
                            className="button small"
                            onClick={() => loadVoyage(v)}
                          >
                            Open & edit <ArrowUpRight size={14} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={"Export " + v.name}
                            onClick={() => download(v)}
                          >
                            <Download size={16} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={"Delete " + v.name}
                            onClick={() =>
                              setModal({
                                type: "delete",
                                record: "voyages",
                                item: v,
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              )}
            </>
          ) : view === "fleet" ? (
            <>
              <div className="list-toolbar">
                <h2>{vessels.length} vessels in your fleet</h2>
                <button
                  className="button"
                  onClick={() => setModal({ type: "vessel", item: null })}
                >
                  <Plus size={16} /> Add vessel
                </button>
              </div>
              {!vessels.length ? (
                <Empty
                  icon={Ship}
                  title="Meet your future fleet."
                  text="Add vessel specifications to calculate routes using their speed, fuel consumption, and cargo capacity."
                  action="Add your first vessel"
                  onClick={() => setModal({ type: "vessel", item: null })}
                />
              ) : (
                <div className="saved-list">
                  {vessels.map((v) => (
                    <article className="saved-card vessel-card" key={v.id}>
                      <Ship size={34} />
                      <h3>{v.name}</h3>
                      <p>{v.imo ? "IMO " + v.imo : "IMO not specified"}</p>
                      <div className="saved-metrics">
                        <span>
                          <strong>{v.max_speed} kn</strong>
                          <small>Max speed</small>
                        </span>
                        <span>
                          <strong>{v.fuel_per_day} t</strong>
                          <small>Fuel / day</small>
                        </span>
                        <span>
                          <strong>{v.capacity.toLocaleString()} t</strong>
                          <small>Capacity</small>
                        </span>
                      </div>
                      <div className="saved-actions">
                        <button
                          className="button small"
                          onClick={() => {
                            useVessel(v.id);
                            setView("planner");
                            notify(v.name + " assigned to your passage.");
                          }}
                        >
                          Plan passage <ArrowUpRight size={14} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={"Edit " + v.name}
                          onClick={() => setModal({ type: "vessel", item: v })}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={"Remove " + v.name}
                          onClick={() =>
                            setModal({
                              type: "delete",
                              record: "vessels",
                              item: v,
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Insights voyages={voyages} onPlan={newVoyage} />
          )}
          <footer><span>Bon Voyage</span><span>Maritime planning scenario · habitat coverage varies</span></footer>
        </div>
      </main>
      {introState === "playing" && (
        <Intro
          onReveal={() => setIntroRevealed(true)}
          onDone={() => setIntroState("done")}
        />
      )}
      {modal === "auth" && (
        <Auth
          mode={authMode}
          setMode={setAuthMode}
          onClose={closeModal}
          onSuccess={(u) => {
            setUser(u);
            setModal(null);
            notify("Welcome aboard, " + u.name + ".");
          }}
        />
      )}
      {modal === "help" && (
        <Modal
          title="Three priorities. One passage."
          eyebrow="THE BON VOYAGE APPROACH"
          onClose={closeModal}
        >
          <p>
            Choose ports and cargo, then adjust arrival time, temperature, and
            vessel specifications. Choose up to ten catalogue or custom cargo items. The Python planner compares three passage options across California corridors or global sea lanes.
          </p>
          <div className="info-box">
            <h3>What changes the route?</h3>
            <p>
              Each item has a perishability model, weight, and handling values. The planner considers the most time-sensitive item as well as fuel use. Modeled California slow zones stay at or below 10 knots; worldwide habitat coverage is incomplete.
            </p>
          </div>
          <p>
            The map uses geographic coordinates and bundled Natural Earth coastlines. Habitat
            zones and vessel conditions are configurable planning scenarios.
            Sign up to save voyages and add your fleet.
          </p>
          <button className="button full" onClick={closeModal}>
            Chart your course <ArrowUpRight size={16} />
          </button>
        </Modal>
      )}
      {modal === "save" && (
        <Modal
          title={editingId ? "Update your passage." : "Your course is set."}
          eyebrow="SAVE TO YOUR WORKSPACE"
          onClose={closeModal}
        >
          <form onSubmit={saveVoyage}>
            <div className="confirmation">
              <strong>
                {route?.hours.toFixed(1)}h <small>TRANSIT</small>
              </strong>
              <strong>
                {route?.freshness.toFixed(1)}% <small>Freshness</small>
              </strong>
              <strong>
                {whaleAssessed(route, inputs) ? Math.round(route.protection) : "N/A"} <small>Whale assessment</small>
              </strong>
            </div>
            <Field
              label="Voyage name"
              required
              minLength="2"
              maxLength="120"
              value={voyageName}
              onChange={(e) => setVoyageName(e.target.value)}
            />
            <Field label="Status">
              <select
                value={voyageStatus}
                onChange={(e) => setVoyageStatus(e.target.value)}
              >
                <option>Planned</option>
                <option>In transit</option>
                <option>Arrived</option>
              </select>
            </Field>
            <Field label="Operator notes">
              <textarea
                rows="3"
                maxLength="3000"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Cargo handling, berth details, destination requirements…"
              />
            </Field>
            <ErrorMessage error={dataError} />
            <button className="button full" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Update voyage" : "Save voyage"}
              <ArrowUpRight size={17} />
            </button>
          </form>
        </Modal>
      )}
      {modal?.type === "vessel" && (
        <VesselForm
          item={modal.item}
          onClose={closeModal}
          onSave={async (data) => {
            await api("/vessels" + (modal.item ? "/" + modal.item.id : ""), {
              method: modal.item ? "PUT" : "POST",
              body: data,
            });
            await refresh();
            setModal(null);
            notify(
              "Vessel " + (modal.item ? "updated." : "added to your fleet."),
            );
          }}
        />
      )}
      {modal?.type === "delete" && (
        <Modal
          title={"Remove " + modal.item.name + "?"}
          eyebrow="WORKSPACE UPDATE"
          onClose={closeModal}
        >
          <p>
            This removes the{" "}
            {modal.record === "voyages" ? "saved voyage" : "vessel"} from your
            account.
            {modal.record === "vessels"
              ? " Previously saved voyage calculations are retained."
              : ""}
          </p>
          <ErrorMessage error={dataError} />
          <div className="modal-actions">
            <button className="button secondary" onClick={closeModal}>
              Keep it
            </button>
            <button
              className="button danger"
              onClick={() => removeRecord(modal.record, modal.item.id)}
            >
              Remove
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </>
  );
}

function Auth({ mode, setMode, onClose, onSuccess }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const p = Object.fromEntries(new FormData(e.currentTarget));
    try {
      onSuccess(await api("/auth/" + mode, { method: "POST", body: p }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={mode === "signup" ? "Welcome aboard." : "Good to have you back."}
      eyebrow="YOUR OCEAN WORKSPACE"
      onClose={onClose}
    >
      <p>
        {mode === "signup"
          ? "Create an account to save your voyages and manage your fleet."
          : "Log in to pick up where your last passage left off."}
      </p>
      <div className="auth-tabs">
        <button
          className={mode === "signup" ? "active" : ""}
          onClick={() => {
            setMode("signup");
            setError("");
          }}
        >
          Sign up
        </button>
        <button
          className={mode === "login" ? "active" : ""}
          onClick={() => {
            setMode("login");
            setError("");
          }}
        >
          Log in
        </button>
      </div>
      <form onSubmit={submit}>
        {mode === "signup" && (
          <>
            <Field
              label="Full name"
              name="name"
              required
              minLength="2"
              maxLength="80"
              autoComplete="name"
              placeholder="Alex Kim"
            />
            <Field
              label="Company / organization"
              name="company"
              maxLength="120"
              autoComplete="organization"
              placeholder="Pacific operations (optional)"
            />
          </>
        )}
        <Field
          label="Email address"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
        />
        <Field
          label="Password"
          name="password"
          type="password"
          minLength={mode === "signup" ? 8 : 1}
          maxLength="128"
          required
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder={
            mode === "signup" ? "At least 8 characters" : "Your password"
          }
        />
        <ErrorMessage error={error} />
        <button className="button full" disabled={busy}>
          {busy
            ? "Connecting…"
            : mode === "signup"
              ? "Create your workspace"
              : "Log in"}
          <ArrowUpRight size={17} />
        </button>
        <p className="fine-print">
          Your voyages are private to your account. Passwords are hashed on the
          Python server.
        </p>
      </form>
    </Modal>
  );
}
function AccountPrompt({ open }) {
  return (
    <Empty
      icon={User}
      title="A workspace of your own."
      text="Create an account or log in to manage vessels, save voyages, and track your impact."
      action="Log in / sign up"
      onClick={open}
    />
  );
}
function Empty({ icon: Icon, title, text, action, onClick }) {
  return (
    <div className="empty-state">
      <Icon size={44} />
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="button" onClick={onClick}>
        {action}
        <ArrowUpRight size={16} />
      </button>
    </div>
  );
}
function VesselForm({ item, onClose, onSave }) {
  const [data, setData] = useState(item || defaultVessel),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={item ? "Edit your vessel." : "A new addition to the fleet."}
      eyebrow="VESSEL SPECIFICATIONS"
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(data);
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label="Vessel name"
          required
          minLength="2"
          maxLength="100"
          value={data.name}
          onChange={(e) => setData({ ...data, name: e.target.value })}
        />
        <Field
          label="IMO number (optional)"
          pattern="[0-9]{7}"
          maxLength="7"
          value={data.imo}
          onChange={(e) => setData({ ...data, imo: e.target.value })}
        />
        <div className="two-fields">
          {[
            ["max_speed", "Maximum speed (kn)", 5, 35],
            ["fuel_per_day", "Fuel at 18 kn (t/day)", 1, 500],
            ["capacity", "Cargo capacity (tonnes)", 1, 500000],
          ].map(([id, label, min, max]) => (
            <Field
              key={id}
              label={label}
              type="number"
              step="any"
              min={min}
              max={max}
              required
              value={data[id]}
              onChange={(e) =>
                setData({ ...data, [id]: Number(e.target.value) })
              }
            />
          ))}
        </div>
        <ErrorMessage error={error} />
        <button className="button full" disabled={busy}>
          {busy ? "Saving…" : "Save vessel"}
          <ArrowUpRight size={17} />
        </button>
      </form>
    </Modal>
  );
}
function Profile({ user, setUser, notify, onLogout }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [changing, setChanging] = useState(false);
  return (
    <div className="profile-grid">
      <section className="panel profile-panel">
        <span className="avatar large">{initials(user.name)}</span>
        <h2>{user.name}</h2>
        <p>{user.email}</p>
        <div className="stamp">{user.role}</div>
        <p>{user.company || "Independent maritime operator"}</p>
        <button className="button secondary full" onClick={onLogout}>
          <LogOut size={15} /> Log out
        </button>
      </section>
      <section className="panel profile-edit">
        <h2>Your profile</h2>
        <p>Make this workspace yours.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              setUser(
                await api("/profile", {
                  method: "PUT",
                  body: Object.fromEntries(new FormData(e.currentTarget)),
                }),
              );
              notify("Profile updated.");
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label="Full name"
            name="name"
            required
            minLength="2"
            maxLength="80"
            defaultValue={user.name}
          />
          <Field
            label="Organization"
            name="company"
            maxLength="120"
            defaultValue={user.company}
          />
          <Field
            label="Role / title"
            name="role"
            required
            minLength="2"
            maxLength="80"
            defaultValue={user.role}
          />
          <ErrorMessage error={!changing && error} />
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
            <Check size={16} />
          </button>
        </form>
        <hr />
        <h2>Account security</h2>
        <p>Update your password. Other sessions will be signed out.</p>
        <button
          className="button secondary"
          onClick={() => {
            setChanging(!changing);
            setError("");
          }}
        >
          Change password
        </button>
        {changing && (
          <form
            className="password-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const p = Object.fromEntries(new FormData(form));
              if (p.new_password !== p.confirm) {
                setError("New passwords do not match.");
                return;
              }
              setBusy(true);
              try {
                await api("/auth/password", { method: "PUT", body: p });
                form.reset();
                setChanging(false);
                setError("");
                notify("Password changed.");
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="Current password"
              name="current_password"
              type="password"
              autoComplete="current-password"
              required
            />
            <Field
              label="New password"
              name="new_password"
              type="password"
              minLength="8"
              maxLength="128"
              autoComplete="new-password"
              required
            />
            <Field
              label="Confirm new password"
              name="confirm"
              type="password"
              minLength="8"
              maxLength="128"
              autoComplete="new-password"
              required
            />
            <ErrorMessage error={error} />
            <button className="button" disabled={busy}>
              Update password
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
function Insights({ voyages, onPlan }) {
  const assessed = voyages.filter((voyage) => whaleAssessed(voyage.result, voyage.inputs));
  const total = voyages.reduce((s, v) => s + v.inputs.weight, 0),
    fuel = voyages.reduce((s, v) => s + v.result.fuel, 0),
    protection = assessed.length
      ? assessed.reduce((sum, voyage) => sum + voyage.result.protection, 0) / assessed.length
      : null;
  return (
    <>
      <section className="stats">
        <Stat
          label="Saved voyages"
          value={voyages.length}
          sub="Passages in your workspace"
          icon={Flag}
        />
        <Stat
          label="Cargo on course"
          value={total.toLocaleString()}
          unit="t"
          sub="Across all saved voyages"
          icon={Ship}
        />
        <Stat
          label="Planned fuel"
          value={fuel.toFixed(1)}
          unit="t"
          sub="Backend-calculated consumption"
          icon={Leaf}
        />
        <Stat
          label="Whale assessment"
          value={protection === null ? "N/A" : Math.round(protection)}
          unit={protection === null ? "" : "/100"}
          sub={`${assessed.length} of ${voyages.length} voyages have California scenario estimates`}
          dark
          icon={ShieldCheck}
        />
      </section>
      {!voyages.length ? (
        <Empty
          icon={BarChart3}
          title="Good decisions leave a wake."
          text="Save a voyage to start tracking your cargo and ocean impact."
          action="Plan your first voyage"
          onClick={onPlan}
        />
      ) : (
        <section className="panel insights-panel">
          <h2>Freshness across your passages</h2>
          <p>Arrival freshness for every saved cargo shipment.</p>
          <div className="freshness-chart">
            {voyages.map((v) => (
              <div key={v.id}>
                <span>{v.name}</span>
                <div className="chart-track">
                  <i
                    style={{
                      width: v.result.freshness + "%",
                      background:
                        v.result.freshness < 70 ? "#b95b3d" : "#85945b",
                    }}
                  />
                </div>
                <strong>{v.result.freshness.toFixed(1)}%</strong>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="info-box">
        <h3>How this impact is measured</h3>
        <p>
          Fuel is calculated segment by segment from your vessel’s consumption
          at 18 knots, using a cubic speed model. Freshness responds to elapsed
          time, cargo age, temperature, and the shelf-life window. Whale
          assessment reflects only the bundled California scenario zones. Unassessed international voyages are excluded from the average; missing habitat data does not mean a passage is safe. Mixed cargo freshness is weighted by mass; recommendations also consider the most time-sensitive item.
        </p>
      </div>
    </>
  );
}



