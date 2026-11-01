import test from 'node:test';
import assert from 'node:assert/strict';
import { positionAtProgress } from './voyagePosition.js';
const route = {
  hours: 4.00001, coordinates: [[0,0],[0,10],[0,40]],
  segments: [{from:[0,0],to:[0,10],hours:1},{from:[0,10],to:[0,40],hours:3}],
};
test('jumping to arrival lands exactly at destination despite rounded duration', () => {
  for (const hours of [3.99999,4.00001]) {
    assert.deepEqual(positionAtProgress({...route,hours},100),[0,40]);
    assert.deepEqual(positionAtProgress({...route,hours},0),[0,0]);
  }
});
test('interpolation follows segment time in both playback directions', () => {
  for (const [progress,position] of [[75,[0,30]],[25,[0,10]],[50,[0,20]]])
    assert.deepEqual(positionAtProgress(route,progress),position);
});
test('zero-time segments, bounds and missing segments do not leave a stale position', () => {
  const withZero={...route,segments:[{from:[0,0],to:[0,0],hours:0},...route.segments]};
  assert.deepEqual(positionAtProgress(withZero,50),[0,20]);
  assert.deepEqual(positionAtProgress(route,-1),[0,0]);
  assert.deepEqual(positionAtProgress(route,101),[0,40]);
  assert.deepEqual(positionAtProgress({...route,segments:[]},100),[0,40]);
});
