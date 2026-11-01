import { themes, modes } from './appearance.js';

const feature = (id, label, detail, keywords = '') => ({ id, kind: 'feature', label, detail, keywords, group: 'Workspace' });
export const features = [
  feature('planner', 'Route planner', 'Plan a passage between ports', 'home routes map optimize'),
  feature('new', 'New voyage', 'Start a fresh passage', 'reset create'),
  feature('compare', 'Compare routes', 'Compare time, fuel, cargo and wildlife impact', 'balanced fastest safest alternatives'),
  feature('cargo', 'Cargo manifest', 'Add up to 10 products or create custom cargo', 'goods freight weight temperature perishability shelf life'),
  feature('deadline', 'Arrival allowance', 'Set the maximum time available', 'arrival window deadline slider sailing time'),
  feature('advanced', 'Vessel & departure settings', 'Speed, fuel, departure and assigned vessel', 'advanced ship cruise knots date'),
  feature('report', 'Passage report', 'Cargo condition, wildlife exposure and speed breakdown', 'metrics freshness emissions statistics data'),
  feature('map', 'Voyage map & playback', 'View and play the selected route', 'animation progress sea passage'),
  feature('layers', 'Map layers', 'Ports, whale habitats and routing overlays', 'coverage protected zones'),
  feature('coverage', 'Data sources & coverage', 'Understand the data behind the route', 'live modeled limitations'),
  feature('save', 'Save this passage', 'Save or update your current voyage', 'account saved'),
  feature('export', 'Export voyage', 'Download the current passage as JSON', 'download file'),
  feature('voyages', 'My voyages', 'Browse and search saved passages', 'history saved trips'),
  feature('fleet', 'My fleet', 'Manage your vessels', 'ships boats'),
  feature('add-vessel', 'Add a vessel', 'Register a ship in your fleet', 'new boat capacity imo'),
  feature('insights', 'Impact overview', 'Fleet and voyage totals', 'analytics dashboard statistics'),
  feature('profile', 'My profile', 'Name, company and password settings', 'account identity security'),
  feature('appearance', 'Appearance', 'Choose a theme and display mode', 'colors palette settings'),
  ...themes.map((theme) => feature(`theme:${theme.id}`, `${theme.name} theme`, 'Change workspace colors', `appearance palette ${theme.id === 'walnut' ? 'woody nutty wood brown' : ''}`)),
  ...modes.map((mode) => feature(`mode:${mode}`, `${mode === 'system' ? 'System' : mode === 'dark' ? 'Dark' : 'Light'} mode`, 'Change display mode', 'appearance white black device')),
  feature('help', 'How Bon Voyage works', 'A guide to planning your voyage', 'help support tutorial'),
  feature('login', 'Log in', 'Access your saved workspace', 'sign in account'),
  feature('signup', 'Sign up', 'Create your account', 'register join'),
];

export function searchIndex(catalog) {
  return [...features,
    ...(catalog?.ports || []).flatMap((port) => ['origin', 'destination'].map((field) => ({
      id: `port:${field}:${port.id}`, kind: 'port', field, value: port.id,
      label: `${field === 'origin' ? 'Depart from' : 'Arrive at'} ${port.name}`,
      detail: `${port.code || port.id} · ${field === 'origin' ? 'Departure' : 'Destination'} port`,
      keywords: `${port.name} ${port.code || ''} port`, group: 'Ports',
    }))),
    ...(catalog?.cargo_products || []).map((product) => ({
      id: `cargo:${product.id}`, kind: 'cargo', product, label: `Add ${product.name}`,
      detail: product.category, keywords: `${product.name} ${product.category} ${product.profile} cargo`, group: 'Cargo',
    })),
  ];
}
export const normalizeSearch = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function searchSuggestions(index, query) {
  const text = normalizeSearch(query);
  if (!text) return index.filter((item) => ['planner', 'compare', 'cargo', 'voyages', 'fleet', 'appearance', 'help'].includes(item.id));
  const tokens = text.split(/\s+/);
  return index.map((item, order) => {
    const label = normalizeSearch(item.label), words = normalizeSearch(`${item.label} ${item.detail} ${item.keywords || ''}`);
    if (!tokens.every((token) => words.includes(token))) return null;
    const score = label === text ? 0 : label.startsWith(text) ? 1 : label.includes(text) ? 2 : tokens.every((token) => label.includes(token)) ? 3 : 4;
    return { item, score, order };
  }).filter(Boolean).sort((a, b) => a.score - b.score || a.order - b.order).map(({ item }) => item);
}
