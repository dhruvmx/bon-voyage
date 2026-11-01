import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Search, X } from 'lucide-react';
import { api, getSessionVersion } from './api';
import { searchIndex, searchSuggestions } from './search';

const emptyPages = () => ({ voyages: { items: [], has_more: false }, vessels: { items: [], has_more: false } });
export default function WorkspaceSearch({ catalog, user, blocked, onAction }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0);
  const [remote, setRemote] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const dialog = useRef(null), input = useRef(null), results = useRef(null), request = useRef(null);
  const id = useId(), owner = user?.id, term = query.trim();
  const index = useMemo(() => searchIndex(catalog), [catalog]);
  const local = useMemo(() => searchSuggestions(index, query).filter((item) => !user || !['login', 'signup'].includes(item.id)), [index, query, user]);
  const pages = remote?.term === term && remote?.owner === owner ? remote.pages : emptyPages();
  const matches = [...local, ...pages.voyages.items.map((item) => ({ id: `voyage:${item.id}`, kind: 'voyage', item, label: item.name, detail: `${item.status} · Open saved passage`, group: 'Saved voyages' })),
    ...pages.vessels.items.map((item) => ({ id: `vessel:${item.id}`, kind: 'vessel', item, label: item.name, detail: `${item.max_speed} kn · Use this vessel`, group: 'Fleet' }))];
  const current = Math.min(active, Math.max(0, matches.length - 1));

  useEffect(() => {
    if (open && !dialog.current.open) { dialog.current.showModal(); input.current.focus(); }
    else if (!open && dialog.current.open) dialog.current.close();
  }, [open]);
  useEffect(() => { setOpen(false); setQuery(''); setRemote(null); }, [owner, blocked]);
  useEffect(() => {
    const shortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !blocked) {
        event.preventDefault(); setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [blocked]);
  useEffect(() => {
    if (open) results.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current, open]);
  useEffect(() => {
    const controller = new AbortController(), session = getSessionVersion();
    request.current = controller;
    setError(''); setBusy(false); setRemote(null);
    if (!open || !owner || term.length < 2) return () => controller.abort();
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const data = await Promise.all(['voyages', 'vessels'].map((type) => api(`/${type}?limit=10&q=${encodeURIComponent(term)}`, { signal: controller.signal })));
        if (!controller.signal.aborted && session === getSessionVersion()) setRemote({ term, owner, pages: { voyages: data[0], vessels: data[1] } });
      } catch (e) { if (!controller.signal.aborted && session === getSessionVersion()) setError(e.message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, owner, term, retry]);

  async function more(type) {
    const controller = request.current, session = getSessionVersion();
    if (!controller || controller.signal.aborted || busy) return;
    setBusy(true); setError('');
    try {
      const data = await api(`/${type}?limit=10&offset=${pages[type].items.length}&q=${encodeURIComponent(term)}`, { signal: controller.signal });
      if (!controller.signal.aborted && session === getSessionVersion()) setRemote((previous) => ({ ...previous, pages: { ...previous.pages, [type]: { ...data, items: [...previous.pages[type].items, ...data.items] } } }));
    } catch (e) { if (!controller.signal.aborted && session === getSessionVersion()) setError(e.message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function choose(item) {
    if (!item) return;
    setOpen(false);
    // The native dialog must release its inert background before focusing a control.
    requestAnimationFrame(() => onAction(item));
  }
  return <>
    <button className="workspace-search-trigger" aria-label="Search workspace" disabled={blocked} onClick={() => { setQuery(''); setActive(0); setOpen(true); }}>
      <Search size={17} aria-hidden="true" /><span>Search anything…</span><kbd>⌘ / Ctrl K</kbd>
    </button>
    <dialog ref={dialog} className="workspace-search" aria-label="Search workspace" onCancel={(event) => { event.preventDefault(); setOpen(false); }} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === dialog.current) { const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setOpen(false); } }}>
      <div className="workspace-search-input">
        <Search size={20} aria-hidden="true" />
        <input ref={input} role="combobox" aria-label="Search features, ports, cargo and saved records" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`} aria-activedescendant={matches[current] ? `${id}-${current}` : undefined} autoComplete="off" maxLength={100}
          placeholder="Search features, ports, cargo…" value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setActive(matches.length ? (current + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length : 0); }
            if (event.key === 'Enter') { event.preventDefault(); choose(matches[current]); }
          }} />
        {query && <button className="text-button workspace-search-clear" aria-label="Clear search" onClick={() => { setQuery(''); setActive(0); input.current.focus(); }}>Clear</button>}
        <button className="icon-button" aria-label="Close search" onClick={() => setOpen(false)}><X size={19} /></button>
      </div>
      <div className="workspace-search-caption" role="status">{term ? `${matches.length} suggestions${busy ? ' · Searching saved records…' : ''}` : 'Jump to anything in your workspace'}</div>
      <div ref={results} id={`${id}-results`} role="listbox" aria-label="Search suggestions" className="workspace-search-results">
        {matches.map((item, position) => <div key={item.id} id={`${id}-${position}`} role="option" aria-selected={position === current} className="workspace-search-option" onMouseDown={(event) => event.preventDefault()} onMouseMove={() => setActive(position)} onClick={() => choose(item)}>
          <span><strong>{item.label}</strong><small>{item.detail}</small></span><span className="workspace-search-kind">{item.group}<ArrowUpRight size={14} aria-hidden="true" /></span>
        </div>)}
      </div>
      {!matches.length && <p className="workspace-search-empty">{busy ? 'Searching your workspace…' : 'No matches. Try a port, cargo name, or feature like “compare”.'}</p>}
      {error && <div className="workspace-search-message" role="alert">Saved records: {error} <button className="text-button" onClick={() => setRetry((n) => n + 1)}>Retry</button></div>}
      {(pages.voyages.has_more || pages.vessels.has_more) && <div className="workspace-search-more">{['voyages', 'vessels'].filter((type) => pages[type].has_more).map((type) => <button key={type} className="small-button" disabled={busy} onClick={() => more(type)}>More matching {type}</button>)}</div>}
      <div className="workspace-search-footer"><span>↑ ↓ to explore · Enter to open · Esc to close</span>{!user && <span>Log in to search saved records</span>}</div>
    </dialog>
  </>;
}
