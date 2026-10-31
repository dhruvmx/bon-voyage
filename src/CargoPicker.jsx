import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { MAX_CARGO_ITEMS, profileNames } from "./cargo";

export default memo(function CargoPicker({ products, profiles, items, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [custom, setCustom] = useState(null);
  const [notice, setNotice] = useState("");
  const root = useRef(null), input = useRef(null), list = useRef(null);
  const id = useId();
  const full = items.length >= MAX_CARGO_ITEMS;
  const results = useMemo(() => products.filter((product) =>
    `${product.name} ${product.category}`.toLowerCase().includes(query.trim().toLowerCase())), [products, query]);
  const added = (product) => items.some((item) => item.product_id === product.id || item.name.toLowerCase() === product.name.toLowerCase());
  const exact = products.some((product) => product.name.toLowerCase() === query.trim().toLowerCase());
  const customDuplicate = custom && items.some((item) => item.name.toLowerCase() === custom.name.trim().toLowerCase());
  const numberInput = (value, multiplier = 1) => value === "" ? "" : Number(value) * multiplier;

  useEffect(() => {
    if (open) list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function add(product) {
    if (full || added(product)) return;
    onChange([...items, { product_id: product.id, name: product.name, profile: product.profile,
      weight: 10, temperature: product.temperature, shelf_life: product.shelf_life, cargo_age: 0 }]);
    setNotice(`${product.name} added.`); setQuery(""); setActive(0);
    if (items.length + 1 === MAX_CARGO_ITEMS) setOpen(false);
    else input.current?.focus();
  }

  function update(index, key, value) {
    onChange(items.map((item, i) => i === index ? { ...item, [key]: value } : item));
  }

  return <div className="cargo-picker" ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <div className="section-heading cargo-heading"><label htmlFor={`${id}-search`}>Cargo manifest</label><small>{items.length} / {MAX_CARGO_ITEMS} items</small></div>
    <div className="cargo-search-wrap">
      <div className="cargo-search">
        <Search size={16} aria-hidden="true" />
        <input id={`${id}-search`} ref={input} role="combobox" autoComplete="off"
          aria-expanded={open && !full} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${id}-option-${results[active].id}` : undefined}
          aria-describedby={`${id}-hint`} placeholder={full ? "10-item limit reached" : `Search ${products.length} cargo products…`}
          disabled={full} value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault(); setOpen(true);
              setActive((index) => Math.max(0, Math.min(results.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
            }
            if (event.key === "Enter" && open && results[active]) { event.preventDefault(); add(results[active]); }
          }} />
        <ChevronDown size={15} aria-hidden="true" />
      </div>
      {open && !full && <div className="cargo-dropdown">
        <ul id={`${id}-list`} role="listbox" aria-label="Cargo products" aria-multiselectable="true" ref={list}>
          {results.map((product, index) => <li key={product.id} id={`${id}-option-${product.id}`}
            role="option" aria-selected={added(product)} aria-disabled={added(product)}
            data-active={index === active} onMouseDown={(event) => event.preventDefault()}
            onClick={() => add(product)}>
            <span><b>{product.name}</b><small>{product.category}</small></span>
            {added(product) ? <Check size={15} /> : <Plus size={15} />}
          </li>)}
          {!results.length && <li role="presentation" className="cargo-no-results">No matching products. Add your own below.</li>}
        </ul>
        {query.trim() && !exact && <button className="text-button custom-cargo-action" type="button" onClick={() => {
          setCustom({ name: query.trim().slice(0, 100), profile: "electronics" }); setOpen(false);
        }}><Plus size={15} /> Add “{query.trim().slice(0, 40)}” as custom cargo</button>}
      </div>}
    </div>
    <small id={`${id}-hint`} className="cargo-hint">{full ? "Remove an item to add another." : "Search by product or category, or add custom cargo."}</small>
    {!custom && !full && <button type="button" className="text-button custom-cargo-action" onClick={() => {
      setCustom({ name: query.trim().slice(0, 100), profile: "electronics" }); setOpen(false);
    }}><Plus size={14} /> Custom cargo</button>}
    {custom && <fieldset className="custom-cargo-form">
      <legend>Custom cargo</legend>
      <label className="field"><span>Cargo name</span><input autoFocus value={custom.name} maxLength={100}
        onChange={(event) => setCustom({ ...custom, name: event.target.value })} /></label>
      <label className="field"><span>Perishability</span><select value={custom.profile}
        onChange={(event) => setCustom({ ...custom, profile: event.target.value })}>
        {Object.entries(profileNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      {customDuplicate && <small className="cargo-hint">This item is already on board. Adjust its weight instead.</small>}
      <div className="saved-actions"><button type="button" className="button" disabled={full || !custom.name.trim() || customDuplicate}
        onClick={() => {
          const profile = profiles[custom.profile];
          onChange([...items, { product_id: null, name: custom.name.trim(), profile: custom.profile, weight: 10,
            temperature: profile.temperature, shelf_life: profile.shelf, cargo_age: 0 }]);
          setNotice(`${custom.name.trim()} added.`); setCustom(null); setQuery(""); setOpen(false);
        }}>Add cargo</button><button type="button" className="text-button" onClick={() => setCustom(null)}>Cancel</button></div>
    </fieldset>}
    <div className="manifest-items">
      {items.map((item, index) => <article className="manifest-item" key={item.product_id || `custom-${item.name}`}>
        <details><summary><span><b>{item.name}</b><small>{item.weight || 0} t · {profileNames[item.profile]}</small></span><ChevronDown size={15} aria-hidden="true" /></summary>
          <div className="manifest-fields">
            <label className="field"><span>Weight (tonnes)</span><input aria-label={`${item.name} weight (tonnes)`} type="number" min="0.001" max="100000" step="any" value={item.weight}
              onChange={(event) => update(index, "weight", numberInput(event.target.value))} /></label>
            {!item.product_id && <label className="field"><span>Perishability</span><select aria-label={`${item.name} perishability`} value={item.profile} onChange={(event) => {
              const profile = event.target.value;
              onChange(items.map((cargo, i) => i === index ? { ...cargo, profile,
                temperature: profiles[profile].temperature, shelf_life: profiles[profile].shelf } : cargo));
            }}>{Object.entries(profileNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>}
            {item.profile !== "electronics" && <>
              <label className="field"><span>Temperature (°C)</span><input aria-label={`${item.name} temperature (°C)`} type="number" min="-30" max="40" step="any" value={item.temperature}
                onChange={(event) => update(index, "temperature", numberInput(event.target.value))} /></label>
              <label className="field"><span>Shelf life (days)</span><input aria-label={`${item.name} shelf life (days)`} type="number" min="0.01" max="4166.66" step="any" value={item.shelf_life === "" ? "" : Number((item.shelf_life / 24).toFixed(4))}
                onChange={(event) => update(index, "shelf_life", numberInput(event.target.value, 24))} /></label>
              <label className="field"><span>Cargo age (days)</span><input aria-label={`${item.name} age (days)`} type="number" min="0" max="4166.66" step="any" value={item.cargo_age === "" ? "" : Number((item.cargo_age / 24).toFixed(4))}
                onChange={(event) => update(index, "cargo_age", numberInput(event.target.value, 24))} /></label>
            </>}
          </div>
        </details>
        <button type="button" className="manifest-remove" aria-label={`Remove ${item.name}`} onClick={() => {
          onChange(items.filter((_, i) => i !== index)); setNotice(`${item.name} removed.`);
        }}><X size={15} /></button>
      </article>)}
    </div>
    <div className="manifest-total"><span>Total cargo</span><strong>{items.reduce((total, item) => total + (Number(item.weight) || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} t</strong></div>
    <small className="cargo-hint">Handling values are editable scenario assumptions. Temperatures assume separate cargo compartments.</small>
    <span className="sr-only" role="status">{notice}</span>
  </div>;
});
