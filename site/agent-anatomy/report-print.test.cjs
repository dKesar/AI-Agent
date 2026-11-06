'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const M=require('./lesson-model.js'),E=require('./engine.js');
const C=require('./course-model.js');
test('printing expands all journal sections and restores their previous state afterwards',()=>{
 const html=M.report(M.fresh(),E),source=html.match(/<script data-report-print>([\s\S]*?)<\/script>/);assert.ok(source);
 const events={},details=[{open:false},{open:true},{open:false}];vm.runInNewContext(source[1],{window:{addEventListener:(key,fn)=>events[key]=fn},document:{querySelectorAll:()=>details}});
 events.beforeprint();assert.deepEqual(details.map(d=>d.open),[true,true,true]);events.beforeprint();events.afterprint();assert.deepEqual(details.map(d=>d.open),[false,true,false]);
 events.beforeprint();events.afterprint();assert.deepEqual(details.map(d=>d.open),[false,true,false]);
});

test('compact print expands journals only when the reader opens the appendix',()=>{
 const html=C.report({one:M.fresh()},E,M);
 const source=html.match(/<script data-report-print>([\s\S]*?)<\/script>/);
 const events={},appendix={open:false},journal={open:false};
 vm.runInNewContext(source[1],{
  window:{addEventListener:(key,fn)=>events[key]=fn},
  document:{querySelectorAll:selector=>{
   assert.equal(selector,'main details, .report-appendix[open] details');
   return appendix.open?[journal]:[];
  }}
 });
 assert.match(html,/\.report-appendix:not\(\[open\]\),\.report-print-help\{display:none!important\}/);
 events.beforeprint();assert.equal(appendix.open,false);assert.equal(journal.open,false);events.afterprint();
 appendix.open=true;events.beforeprint();assert.equal(journal.open,true);events.afterprint();
 assert.equal(appendix.open,true);assert.equal(journal.open,false);
});
