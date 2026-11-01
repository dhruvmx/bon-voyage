import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyAtProgress} from './journey.js';
import {headingAtProgress} from './voyagePosition.js';
const route={hours:99,fuel:10,speed:10,coordinates:[[0,0],[0,10],[10,10]],segments:[{from:[0,0],to:[0,10],hours:1,distance:10,speed:10},{from:[0,10],to:[10,10],hours:2,distance:10,speed:5}],cargo_results:[{perishable:true,weight:1,effective_shelf_life_hours:10,departure_remaining_hours:8},{perishable:false,weight:999}]};
test('heading follows east then north, including at arrival',()=>{assert.equal(headingAtProgress(route,0),90);assert.equal(headingAtProgress(route,60),0);assert.equal(headingAtProgress(route,100),0);});
test('dashboard uses exact segment time, worst perishable quality and segment fuel',()=>{const j=journeyAtProgress(route,100/3);assert.equal(j.remainingHours,2);assert.equal(j.worstFreshness,70);assert.equal(j.fuelConsumed,8);assert.equal(j.co2Consumed,8*3.114);const end=journeyAtProgress(route,100);assert.equal(end.fuelConsumed,10);assert.equal(end.remainingHours,0);assert.equal(end.worstFreshness,50);});
test('durable cargo has no freshness percentage; empty and expired cargo are bounded',()=>{assert.equal(journeyAtProgress({...route,cargo_results:[{perishable:false,weight:10}]},100).worstFreshness,null);assert.equal(journeyAtProgress({...route,cargo_results:[{perishable:true,weight:1,effective_shelf_life_hours:1,departure_remaining_hours:0}]},100).worstFreshness,0);assert.equal(journeyAtProgress(null,0),null);});
