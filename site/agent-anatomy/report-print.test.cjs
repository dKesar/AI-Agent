'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const M=require('./lesson-model.js'),E=require('./engine.js');
test('printing expands all journal sections and restores their previous state afterwards',()=>{
 const html=M.report(M.fresh(),E),source=html.match(/<script data-report-print>([\s\S]*?)<\/script>/);assert.ok(source);
 const events={},details=[{open:false},{open:true},{open:false}];vm.runInNewContext(source[1],{window:{addEventListener:(key,fn)=>events[key]=fn},document:{querySelectorAll:()=>details}});
 events.beforeprint();assert.deepEqual(details.map(d=>d.open),[true,true,true]);events.beforeprint();events.afterprint();assert.deepEqual(details.map(d=>d.open),[false,true,false]);
 events.beforeprint();events.afterprint();assert.deepEqual(details.map(d=>d.open),[false,true,false]);
});
