import { jsPDF } from 'jspdf';

const C = { ink: '#173C49', muted: '#607680', accent: '#16788D', pale: '#EDF5F6', line: '#DCE7EA', white: '#FFFFFF', amber: '#925521', alert: '#FFF2E5' };
const number = (value, digits = 1) => value != null && Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
const date = (value) => {
  const d = new Date(value);
  return value && Number.isFinite(d.getTime()) ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }) : 'Not set';
};
const duration = (hours) => {
  if (hours == null || !Number.isFinite(Number(hours))) return '—';
  const minutes = Math.round(hours * 60), days = Math.floor(minutes / 1440), h = Math.floor(minutes % 1440 / 60), m = minutes % 60;
  return [days && `${days}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || '0m';
};
export function buildVoyagePdf(data) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const route = data.route || data.result || {}, inputs = data.inputs || {}, vessel = data.vessel || {};
  const cargo = route.cargo_results?.length ? route.cargo_results : inputs.cargo_items || [];
  const perishables = cargo.filter((item) => item.perishable === true && item.freshness != null && Number.isFinite(Number(item.freshness)));
  const quality = perishables.length ? Math.min(...perishables.map((item) => Number(item.freshness))) : null;
  const warning = route.feasible === false || (quality != null && quality < 70);
  const port = (id) => data.ports?.find((p) => p.id === id)?.name || id || 'Not specified';
  // Deliberately curated: raw geometry and internal model dictionaries do not belong in a voyage brief.
  function text(value, x, y, size = 10, color = C.ink, bold = false, width = 174, maxLines = 1) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color);
    const lines = doc.splitTextToSize(String(value), width);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (last.length && doc.getTextWidth(`${last}...`) > width) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last}...`;
    }
    doc.text(lines, x, y, { lineHeightFactor: 1.3 });
    return lines.length * size * .46;
  }
  function box(x, y, w, h, fill, radius = 3) {
    doc.setFillColor(fill); doc.roundedRect(x, y, w, h, radius, radius, 'F');
  }
  function rule(y) { doc.setDrawColor(C.line); doc.line(18, y, 192, y); }
  function section(title, y) { text(title, 18, y, 11, C.ink, true); }
  box(0, 0, 210, 39, C.ink, 0);
  text('BON VOYAGE', 18, 17, 18, C.white, true);
  text('VOYAGE BRIEF', 18, 28, 8, '#BAD8DF');
  text(`Generated ${new Date().toISOString().slice(0, 10)} | UTC`, 126, 18, 8, '#BAD8DF', false, 66);
  text(data.status || 'Planning estimate', 126, 28, 9, C.white, false, 66);
  text(`${port(inputs.origin)}  >  ${port(inputs.destination)}`, 18, 51, 19, C.ink, true, 174, 2);
  text(data.name || route.name || 'Selected passage', 18, 67, 10, C.muted, false, 174);
  text(`${route.name || 'Selected passage'}  |  ${number(route.distance)} nm  |  ${number(route.co2)} t CO2 estimated`, 18, 74, 8.5, C.muted);

  const metrics = [
    ['SAILING TIME', duration(route.hours)],
    ['FUEL ESTIMATE', `${number(route.fuel)} t`],
    ['LOWEST CARGO QUALITY', quality == null ? 'N/A' : `${number(quality)}%`],
    ['WHALE ASSESSMENT', route.protection == null ? 'N/A' : `${number(route.protection, 0)} / 100`],
  ];
  metrics.forEach(([title, value], i) => {
    const x = 18 + i * 44.5;
    box(x, 81, 40.5, 26, C.pale);
    text(title, x + 3, 89, 6.7, C.muted, true, 35);
    text(value, x + 3, 100, 16, i === 2 && quality != null && quality < 70 ? C.amber : C.ink, true, 35);
  });
  box(18, 112, 174, 13, warning ? C.alert : C.pale);
  const status = route.feasible === false ? 'Deadline cannot be met at the allowed speeds.' : quality != null && quality < 70 ? 'Cargo review needed: arrival quality is below the 70% planning target.' : 'Passage estimates ready for review.';
  text(status, 22, 118, 8, warning ? C.amber : C.accent, true, 166);
  text('Quality = lowest perishable shelf life on arrival. Whale score = whole-route exposure; higher is better.', 22, 122, 6.5, C.muted, false, 166);

  section('Schedule', 132);
  [['DEPARTURE', inputs.departure], ['ESTIMATED ARRIVAL', route.eta], ['LATEST ACCEPTABLE ARRIVAL', data.deadline_at]].forEach(([title, value], i) => {
    const x = 18 + i * 59;
    text(title, x, 140, 7, C.muted, true, 56);
    text(date(value), x, 147, 10, C.ink, true, 56);
  });
  rule(152);
  section('Vessel & operating plan', 161);
  text(vessel.name || 'Custom vessel settings', 18, 169, 10, C.ink, true, 85);
  text(`${number(route.speed)} kn cruise  |  ${number(inputs.min_speed)}–${number(inputs.max_speed)} kn allowed`, 107, 169, 8, C.muted, false, 85);
  text(`${number(vessel.fuel_per_day ?? inputs.fuel_per_day)} t/day at 18 kn${vessel.capacity != null ? `  |  ${number(vessel.capacity)} t capacity` : ''}${vessel.imo ? `  |  IMO ${vessel.imo}` : ''}`, 18, 176, 8, C.muted);

  const widths = [65, 24, 25, 30, 30], xs = [18, 83, 107, 132, 162];
  function tableHeader(y) {
    box(18, y, 174, 9, C.ink, 1);
    ['CARGO', 'WEIGHT (t)', 'TEMP (C)', 'ARRIVAL QUALITY', 'LIFE LEFT'].forEach((title, i) => text(title, xs[i] + 2, y + 6, 6.5, C.white, true, widths[i] - 4));
  }
  section(`Cargo manifest  /  ${cargo.length} item${cargo.length === 1 ? '' : 's'}`, 186);
  tableHeader(190);
  let y = 199;
  for (const item of cargo) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    const rows = Math.min(2, doc.splitTextToSize(String(item.name || 'Cargo item'), 59).length);
    const height = Math.max(6.5, rows * 3.7 + 2.8);
    if (y + height > 267) { doc.addPage(); text('BON VOYAGE / CARGO MANIFEST', 18, 21, 13, C.ink, true); tableHeader(29); y = 38; }
    if (cargo.indexOf(item) % 2 === 0) box(18, y, 174, height, C.pale, 0);
    const input = inputs.cargo_items?.find((c) => c.product_id === item.product_id && c.name === item.name) || inputs.cargo_items?.find((c) => c.name === item.name) || {};
    text(item.name || 'Cargo item', 20, y + 4.5, 8, C.ink, false, 59, 2);
    text(number(item.weight), 85, y + 4.5, 8, C.ink, false, 20);
    text(number(input.temperature ?? item.temperature), 109, y + 4.5, 8, C.ink, false, 21);
    const durable = item.perishable === false;
    text(durable ? 'N/A' : item.freshness != null ? `${number(item.freshness)}%` : 'Unassessed', 134, y + 4.5, 8, item.freshness != null && item.freshness < 70 ? C.amber : C.ink, false, 26);
    text(durable ? 'Non-perishable' : item.shelf_remaining != null ? duration(item.shelf_remaining) : 'Unassessed', 164, y + 4.5, 7.5, C.muted, false, 26);
    y += height;
  }
  if (!cargo.length) { text('No cargo recorded.', 20, y + 7, 9, C.muted); y += 12; }
  if (data.notes?.trim()) {
    if (y + 31 > 267) { doc.addPage(); y = 22; }
    section('Operator notes', y + 10);
    y += 16;
    text(data.notes.trim(), 18, y, 8, C.muted, false, 174, 3);
  }
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    doc.setPage(page); rule(273);
    text('Planning estimates, not live telemetry or a food-safety assessment. The 70% target is application policy.', 18, 279, 6.8, C.muted);
    text(route.protection == null ? 'Whale habitat coverage incomplete; no assessment available.' : 'Whale assessment covers bundled mapped zones only (approximate, partial); it is not a safety probability.', 18, 283, 6.8, C.muted);
    text('BON VOYAGE  /  Voyage brief', 18, 291, 7, C.accent, true);
    text(`${page} / ${count}`, 180, 291, 7, C.muted);
  }
  return doc;
}
export function saveVoyagePdf(data) {
  const name = (data.name || 'bon-voyage').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);
  buildVoyagePdf(data).save(`${name || 'voyage'}.pdf`);
}
