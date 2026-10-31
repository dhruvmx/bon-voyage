export const MAX_CARGO_ITEMS = 10;
export const profileNames = {
  berries: "Highly perishable", avocados: "Perishable produce",
  grain: "Long shelf life", electronics: "Non-perishable",
  frozen: "Frozen goods",
};

export function cargoItems(inputs) {
  if (Array.isArray(inputs.cargo_items)) return inputs.cargo_items;
  // Older saved voyages remain editable as a one-item manifest.
  return [{ product_id: null, name: inputs.cargo_name || "Cargo", profile: inputs.cargo_type,
    weight: inputs.weight, temperature: inputs.temperature,
    shelf_life: inputs.shelf_life, cargo_age: inputs.cargo_age }];
}

export function manifestInputs(inputs, items) {
  const first = items[0];
  return { ...inputs, cargo_items: items,
    weight: Math.round(items.reduce((total, item) => total + (Number(item.weight) || 0), 0) * 1e6) / 1e6,
    cargo_name: items.map((item) => item.name).join(", ").slice(0, 100) || "Cargo manifest",
    cargo_type: first?.profile || "electronics", temperature: first?.temperature ?? 18,
    shelf_life: first?.shelf_life ?? 99999, cargo_age: first?.cargo_age ?? 0 };
}

export function manifestError(items) {
  if (!items.length) return "Add at least one cargo item to plan a passage.";
  if (items.length > MAX_CARGO_ITEMS) return "A ship can carry up to 10 cargo items in this planner.";
  for (const item of items) {
    if (!item.name?.trim()) return "Every cargo item needs a name.";
    if (!Number.isFinite(item.weight) || item.weight < 0.001) return `Enter a weight of at least 0.001 tonnes for ${item.name}.`;
    if (!Number.isFinite(item.temperature) || item.temperature < -30 || item.temperature > 40) return `Set ${item.name}'s temperature between −30 and 40°C.`;
    if (!Number.isFinite(item.shelf_life) || item.shelf_life <= 0 || item.shelf_life > 100000) return `Enter a valid shelf life for ${item.name}.`;
    if (!Number.isFinite(item.cargo_age) || item.cargo_age < 0 || item.cargo_age > 100000) return `Enter a valid cargo age for ${item.name}.`;
  }
  if (items.reduce((total, item) => total + item.weight, 0) > 100000) return "Total cargo weight cannot exceed 100,000 tonnes.";
  return "";
}

const californiaPorts = new Set(["la", "oakland", "sandiego", "humboldt"]);
export function whaleAssessed(route, inputs) {
  if (route?.protection == null) return false;
  if (route.whale_assessed !== undefined) return route.whale_assessed;
  return californiaPorts.has(inputs.origin) && californiaPorts.has(inputs.destination);
}

export function formatHours(hours) {
  const days = Math.floor(hours / 24), remainder = hours % 24;
  return days ? `${days}d${remainder ? ` ${remainder}h` : ""}` : `${hours}h`;
}

export function formatDuration(hours) {
  if (!Number.isFinite(hours)) return "—";
  const total = Math.max(0, Math.round(hours * 60));
  if (total === 0 && hours > 0) return "<1 min";
  const days = Math.floor(total / 1440), h = Math.floor(total % 1440 / 60), minutes = total % 60;
  return [days && `${days}d`, h && `${h}h`, minutes && `${minutes}m`].filter(Boolean).join(" ") || "0 min";
}
