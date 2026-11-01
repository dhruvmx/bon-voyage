import test from 'node:test';
import assert from 'node:assert/strict';
import { searchIndex, searchSuggestions } from './search.js';
const index = searchIndex({ ports: [{ id: 'shanghai', name: 'Shanghai', code: 'CNSHA' }], cargo_products: [{ id: 'coffee', name: 'Coffee beans', category: 'Agricultural products', profile: 'dry_goods' }] });
test('search suggests useful defaults and discovers features by intent', () => {
  assert(searchSuggestions(index, '').some((item) => item.id === 'compare'));
  assert.equal(searchSuggestions(index, 'compare routes')[0].id, 'compare');
  assert(searchSuggestions(index, 'shelf life').some((item) => item.id === 'cargo'));
  assert(searchSuggestions(index, 'dark').some((item) => item.id === 'mode:dark'));
  assert(searchSuggestions(index, '  AGRICULTURAL coffee ').some((item) => item.id === 'cargo:coffee'));
});
test('ports have unambiguous departure and arrival actions, searchable by code', () => {
  const ports = searchSuggestions(index, 'cnsha');
  assert.deepEqual(ports.map((item) => item.field), ['origin', 'destination']);
  assert.equal(searchSuggestions(index, 'arrive shanghai')[0].field, 'destination');
});
test('search normalizes accents, prioritizes labels, and safely handles arbitrary input', () => {
  const entries = [{ id: 'a', label: 'Café', detail: 'Food' }, { id: 'b', label: 'Other', detail: 'Cafe' }];
  assert.deepEqual(searchSuggestions(entries, 'CAFE').map((item) => item.id), ['a', 'b']);
  assert.deepEqual(searchSuggestions(index, '<img onerror=x>'), []);
  assert.deepEqual(searchSuggestions(index, 'definitely not in this index'), []);
  assert.equal(new Set(index.map((item) => item.id)).size, index.length);
});
