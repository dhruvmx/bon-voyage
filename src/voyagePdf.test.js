import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVoyagePdf} from './voyagePdf.js';
test('PDF contains selected route, cargo, vessel, notes and multipage complete details',()=>{
 const doc=buildVoyagePdf({name:'Test voyage',ports:[{id:'la',name:'Los Angeles'}],inputs:{origin:'la',destination:'oakland',cargo_items:[{name:'Apples',weight:10}]},vessel:{name:'Test vessel',capacity:100},notes:'Review cold chain',route:{name:'Recommended balance',cargo_results:[{name:'Apples',perishable:true,freshness:60}],segments:Array.from({length:40},(_,i)=>({distance:i,speed:18,hours:2}))}});
 const pdf=doc.output();assert(pdf.startsWith('%PDF-'));for(const value of ['Test voyage','Los Angeles','Apples','Test vessel','Review cold chain','Complete selected passage details','How to read this report'])assert(pdf.includes(value),value);assert(doc.getNumberOfPages()>1);
});
