import { jsPDF } from 'jspdf';

const label = (key) => key.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export function buildVoyagePdf(data) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const route = data.route || data.result || {}, inputs = data.inputs || {};
  let y = 24;
  const line = (text, { size = 10, bold = false, indent = 0 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(text), 172 - indent);
    for (const row of lines) {
      if (y > 274) { doc.addPage(); y = 22; }
      doc.text(row, 19 + indent, y); y += size * .45 + 1.5;
    }
  };
  const section = (title) => { y += 5; line(title, { size: 14, bold: true }); y += 2; };
  const fields = (value, depth = 0) => {
    if (value == null) { line('Not available', { indent: depth * 3 }); return; }
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== null && typeof entry === 'object') {
        line(label(key), { bold: true, indent: depth * 3 });
        if (Array.isArray(entry)) entry.forEach((item, index) => {
          if (item && typeof item === 'object') { line(`Item ${index + 1}`, { bold: true, indent: (depth + 1) * 3 }); fields(item, depth + 1); }
          else line(String(item), { indent: (depth + 1) * 3 });
        });
        else fields(entry, depth + 1);
      } else line(`${label(key)}: ${entry == null ? 'Not assessed / not available' : entry}`, { indent: depth * 3 });
    }
  };
  line('BON VOYAGE', { size: 22, bold: true });
  line(data.name || 'Voyage planning report', { size: 16 });
  line(`Generated ${new Date().toISOString()} (UTC)`);
  section('Passage summary');
  const portName = (id) => data.ports?.find((p) => p.id === id)?.name || id || 'Not specified';
  line(`${portName(inputs.origin)} to ${portName(inputs.destination)}`, { bold: true });
  fields({ selected_passage: route.name, departure_utc: inputs.departure, estimated_arrival_utc: route.eta,
    latest_arrival_utc: data.deadline_at, sailing_time_hours: route.hours, distance_nautical_miles: route.distance,
    fuel_estimate_tonnes: route.fuel, co2_estimate_tonnes: route.co2,
    lowest_perishable_arrival_quality_percent: Math.min(...(route.cargo_results || []).filter((c) => c.perishable).map((c) => c.freshness)) === Infinity ? 'Not applicable' : Math.min(...route.cargo_results.filter((c) => c.perishable).map((c) => c.freshness)),
    whole_route_whale_score_out_of_100: route.protection, deadline_feasible: route.feasible });
  section('Vessel and operating assumptions');
  fields(data.vessel || { assigned_vessel_id: data.vessel_id || 'Custom vessel', min_speed_knots: inputs.min_speed, max_speed_knots: inputs.max_speed, reference_fuel_tonnes_per_day_at_18_knots: inputs.fuel_per_day });
  section('Cargo manifest and planning inputs'); fields(inputs);
  section('Complete selected passage details'); fields(route);
  section('Voyage record'); fields({ status: data.status || 'Unsaved plan', notes: data.notes || '', id: data.id || null, created_at: data.created_at || null });
  section('Data coverage and optimization'); fields({ data_mode: data.data_mode, data_coverage: data.data_coverage, optimization: data.optimization });
  section('How to read this report');
  line('Planning estimates, not live vessel telemetry or a food-safety assessment. Quality is modeled remaining shelf life. The lowest perishable value avoids hiding sensitive cargo within durable loads. The 70% arrival target is application policy, not a safety standard. Impossible shelf-life requirements remain flagged.');
  line('Fuel uses vessel consumption at 18 knots with a cubic speed-rate model. CO2 uses 3.114 tonnes per tonne of fuel. Whale scores describe whole-route modeled exposure where habitat data exists; they are not safety probabilities. Coordinates are latitude/longitude; segment distances are nautical miles, speeds knots and durations hours.');
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) { doc.setPage(page); doc.setFontSize(9); doc.setTextColor(100); doc.text(`Bon Voyage | Planning report | ${page} / ${count}`, 19, 288); }
  return doc;
}
export function saveVoyagePdf(data) {
  const name = (data.name || 'bon-voyage').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);
  buildVoyagePdf(data).save(`${name || 'voyage'}.pdf`);
}
