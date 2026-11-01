import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVoyagePdf } from './voyagePdf.js';
const cargo = Array.from({ length: 10 }, (_, i) => ({ name: `Cargo ${i + 1}`, weight: 10, perishable: true, freshness: 80, shelf_remaining: 100 }));
const data = { name: 'Test voyage', ports: [{ id: 'la', name: 'Los Angeles' }], inputs: { origin: 'la', destination: 'oakland' }, vessel: { name: 'Test vessel', capacity: 100 }, route: { name: 'Recommended balance', hours: 25, fuel: 23.4, protection: null, cargo_results: cargo, coordinates: Array.from({ length: 2000 }, () => [45, 100]), segments: Array.from({ length: 2000 }, () => ({ hours: 2, speed: 18 })) } };
test('ten-item voyage brief fits one page regardless of raw geometry size', () => {
 const doc = buildVoyagePdf(data), pdf = doc.output();
 assert.equal(doc.getNumberOfPages(), 1);
 for (const value of ['Test voyage', 'Los Angeles', 'Test vessel', 'Cargo 10', 'SAILING TIME', 'FUEL ESTIMATE', 'Cargo manifest', 'VOYAGE BRIEF']) assert(pdf.includes(value), value);
 assert(!pdf.includes('Coordinates')); assert(!pdf.includes('Segments'));
});
test('long cargo labels and notes wrap onto bounded continuation pages without dumping metadata', () => {
 const doc = buildVoyagePdf({ ...data, notes: 'Important operator instructions. '.repeat(500), route: { ...data.route, cargo_results: cargo.map((c) => ({ ...c, name: 'Long cargo description '.repeat(10) })) } });
 assert(doc.getNumberOfPages() <= 3);
 assert(doc.output().includes('Operator notes'));
});
test('missing assessments are N/A, zero quality and infeasible deadlines remain visible', () => {
 const pdf = buildVoyagePdf({ route: { feasible: false, cargo_results: [{ name: 'Apples', perishable: true, freshness: 0 }] } }).output();
 assert(pdf.includes('Deadline cannot be met')); assert(pdf.includes('(0%)')); assert(pdf.includes('(N/A)'));
});
