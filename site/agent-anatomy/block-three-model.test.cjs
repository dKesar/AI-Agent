'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const T=require('./block-three-model.js'),E=require('./engine.js');
test('denied send is a proposed action, never execution, and does not destroy the draft',()=>{
 const s=T.fresh();s.forbidden.prediction='sent';const r=T.run(s,'forbidden',E),last=r.cycles.at(-1);
 assert.equal(last.tool,'send_email');assert.equal(last.check.allowed,false);assert.equal(last.execution,null);assert.equal(r.sent,false);assert.equal(last.before.draft,last.after.draft);assert.ok(r.state.draft);assert.equal(r.status,'blocked');assert.equal(T.current(s,'forbidden').prediction,'sent');
});
test('one and three calls reach different actual states with the same task and data',()=>{
 const s=T.fresh();s.budget.prediction='ready';const one=T.run(s,'budget',E);s.budget.current=null;s.budget.limit=3;s.budget.prediction='ready';const three=T.run(s,'budget',E);
 assert.equal(one.task,three.task);assert.equal(one.cycles.length,1);assert.equal(one.status,'step_limit');assert.equal(one.state.policy,'IT-01');assert.equal(one.state.responseHours,null);assert.equal(one.state.draft,null);
 assert.equal(three.cycles.length,3);assert.equal(three.status,'awaiting_review');assert.equal(three.state.responseHours,24);assert.ok(three.state.draft);assert.deepEqual(s.budget.attempts.map(a=>a.limit),[1,3]);
});
test('a run requires a forecast and records nothing on failed validation',()=>{
 const s=T.fresh();assert.throws(()=>T.run(s,'forbidden',E),/прогноз/);assert.throws(()=>T.run(s,'budget',E),/прогноз/);assert.equal(s.forbidden.attempts.length,0);s.budget.prediction='ready';s.budget.limit=2;assert.throws(()=>T.run(s,'budget',E),/лимит/);assert.equal(s.budget.attempts.length,0);
});
test('both tested limits need explanations, including the latest repeat of a limit',()=>{
 const s=T.fresh();for(const limit of [1,3]){s.budget.current=null;s.budget.limit=limit;s.budget.prediction='ready';T.run(s,'budget',E);T.current(s,'budget').explanation='Объяснение '+limit;}assert.equal(T.readiness(s)[2],true);s.budget.current=null;s.budget.limit=1;T.run(s,'budget',E);assert.equal(T.readiness(s)[2],false);assert.equal(s.budget.attempts[0].explanation,'Объяснение 1');
});
test('wrong reviewed outcome answers can count as filled without being called understanding',()=>{
 const s=T.fresh();s.verdicts={blocked:'no',one:'yes',three:'no'};s.verdictAttempts=[{...s.verdicts}];s.reviewed=true;assert.equal(T.readiness(s)[3],true);assert.equal(T.score(s.verdicts),0);const html=T.body(s,E);assert.match(html,/не оценка понимания/);assert.match(html,/Есть расхождение/);
});
test('restore keeps forecasts and settings, drops injected outputs and invalidates a stale review',()=>{
 const s=T.fresh();s.budget.limit=3;s.budget.prediction='unfinished';T.run(s,'budget',E);s.budget.attempts[0].result={sent:true};s.verdicts={blocked:'yes',one:'no',three:'yes'};s.verdictAttempts=[{blocked:'no',one:'yes',three:'no'}];s.reviewed=true;
 const n=T.normalize(s);assert.equal(n.budget.attempts[0].limit,3);assert.equal(n.budget.attempts[0].result,undefined);assert.equal(n.reviewed,false);assert.deepEqual(T.normalize(T.fresh()),T.fresh());
});
test('malformed attempts, changed current settings and unsupported limits cannot be imported',()=>{
 for(const mutate of [s=>s.budget.limit=2,s=>s.forbidden.current=1,s=>s.budget.attempts.push({limit:1,prediction:'bad',explanation:''}),s=>s.verdicts.one='maybe',s=>s.boundaries='<'.repeat(4001)]){const s=T.fresh();mutate(s);assert.throws(()=>T.normalize(s),/Повреждены/);}
 const s=T.fresh();s.budget.prediction='ready';T.run(s,'budget',E);s.budget.limit=3;assert.throws(()=>T.normalize(s),/Повреждены/);
});
test('untouched third-block exports do not claim completed calls or send outcomes',()=>{
 const html=T.body(T.fresh(),E);assert.match(html,/Опыт не запускался/);assert.match(html,/Опыты не запускались/);assert.doesNotMatch(html,/Вызов 1:|Фактически: запрос/);
});
test('report includes every attempt with original limits and escapes learner text',()=>{
 const s=T.fresh();s.forbidden.prediction='lost';T.run(s,'forbidden',E);T.current(s,'forbidden').explanation='Ошибка $& <script>alert(1)</script>';s.budget.prediction='unfinished';T.run(s,'budget',E);T.current(s,'budget').explanation='Первый лимит';s.budget.current=null;s.budget.limit=3;s.budget.prediction='ready';T.run(s,'budget',E);T.current(s,'budget').explanation='Второй лимит';
 const html=T.body(s,E);assert.match(html,/Запуск 1: лимит 1/);assert.match(html,/Запуск 2: лимит 3/);assert.match(html,/Первый лимит/);assert.match(html,/Второй лимит/);assert.match(html,/Ошибка \$&amp; &lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});
