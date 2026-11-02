'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('./block-two-model.js'),F=require('./lesson-model.js'),E=require('./engine.js');

test('three experiments produce distinct evidence and reasons for stopping',()=>{
 const s=M.fresh();
 for(const c of M.CASES){s.cases[c.id].prediction='draft';const r=M.run(s,c.id,E);assert.equal(M.current(s,c.id).prediction,'draft');assert.equal(r.sent,false);}
 const empty=E.runScenario('missing'),ambiguous=E.runScenario('ambiguous'),error=E.runScenario('unavailable');
 assert.deepEqual(empty.state.matches,[]);assert.equal(empty.state.searchErrors,0);assert.equal(empty.state.stopReason,'no_matching_policy');
 assert.deepEqual(ambiguous.state.matches,['IT-01','IT-02']);assert.equal(ambiguous.status,'needs_input');
 assert.equal(error.state.matches,null);assert.equal(error.state.searchErrors,2);assert.equal(error.state.stopReason,'search_unavailable');
});
test('a prediction must precede a run; a wrong prediction can be completed',()=>{
 const s=M.fresh();assert.throws(()=>M.run(s,'missing',E),/прогноз/);assert.equal(s.cases.missing.attempts.length,0);
 s.cases.missing.prediction='draft';M.run(s,'missing',E);assert.equal(M.readiness(s)[1],false);
 M.current(s,'missing').explanation='Поиск сработал, но ничего не нашёл в этой памятке.';assert.equal(M.readiness(s)[1],true);
});
test('a repeated experiment retains the first prediction and explanation',()=>{
 const s=M.fresh(),c=s.cases.missing;c.prediction='draft';M.run(s,'missing',E);M.current(s,'missing').explanation='Первое объяснение';c.current=null;c.prediction='human';M.run(s,'missing',E);
 assert.equal(c.attempts.length,2);assert.deepEqual(c.attempts[0],{prediction:'draft',explanation:'Первое объяснение'});
 const restored=M.normalize(JSON.parse(JSON.stringify(s)));assert.deepEqual(restored,s);
});
test('restore validates all blocks before accepting the package and supports the old first-block file',()=>{
 const one=F.fresh(),two=M.fresh(),pack=M.packet(one,two);assert.deepEqual(M.unpack(pack,F),{one,two});
 assert.deepEqual(M.unpack(F.packet(one),F),{one,two:null});
 pack.blocks.two.cases.missing.current=5;assert.throws(()=>M.unpack(pack,F),/Повреждены/);assert.throws(()=>M.unpack({schema:'other'},F),/JSON/);
});
test('restored state cannot inject a result or replace the recorded prediction',()=>{
 const s=M.fresh();s.cases.missing.prediction='human';M.run(s,'missing',E);s.cases.missing.attempts[0].result={sent:true};
 assert.equal(M.normalize(s).cases.missing.attempts[0].result,undefined);
 s.cases.missing.prediction='retry';assert.throws(()=>M.normalize(s),/Повреждены/);
});
test('an untouched export has no fabricated completed experiments or tool journals',()=>{
 const html=M.report(F.fresh(),M.fresh(),E,F);assert.match(html,/Черновик/);assert.equal((html.match(/Опыт не запускался/g)||[]).length,3);assert.doesNotMatch(html,/Вызов 1:/);assert.match(html,/Блоки 3 и 4 не входят в этот промежуточный/);
});
test('combined report includes both blocks, every attempt, escaped text and literal dollar signs',()=>{
 const one=F.fresh(),two=M.fresh();one.goal='Текст $& и <script>first</script>';two.conclusion='Данные $& <img src=x onerror=alert(1)>';
 two.cases.unavailable.prediction='draft';M.run(two,'unavailable',E);M.current(two,'unavailable').explanation='Первый прогноз ошибочен';two.cases.unavailable.current=null;two.cases.unavailable.prediction='retry';M.run(two,'unavailable',E);M.current(two,'unavailable').explanation='Два сбоя не означают отсутствие правила';
 const html=M.report(one,two,E,F);assert.match(html,/Практика 1/);assert.match(html,/Практика 2/);assert.match(html,/Первый прогноз ошибочен/);assert.match(html,/Два сбоя/);assert.match(html,/Текст \$&amp; и &lt;script&gt;/);assert.doesNotMatch(html,/<script>|<img src=x/);assert.equal((html.match(/<body>/g)||[]).length,1);
});
