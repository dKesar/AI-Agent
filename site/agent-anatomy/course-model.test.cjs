'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('./lesson-model.js'),B=require('./block-two-model.js'),T=require('./block-three-model.js'),C=require('./course-model.js'),E=require('./engine.js');
const work=()=>({one:F.fresh(),two:B.fresh(),three:T.fresh()});
test('three-block backup is an independent snapshot and restores every block',()=>{
 const w=work();w.one.goal='До сохранения';const packet=C.packet(w);w.one.goal='После сохранения';assert.equal(packet.blocks.one.goal,'До сохранения');assert.deepEqual(C.unpack(packet,F,B,T),packet.blocks);
});
test('first- and two-block legacy files omit newer work instead of supplying empty replacements',()=>{
 const w=work();assert.equal(C.unpack(F.packet(w.one),F,B,T).two,null);assert.equal(C.unpack(F.packet(w.one),F,B,T).three,null);assert.equal(C.unpack(B.packet(w.one,w.two),F,B,T).three,null);
});
test('all imported blocks are validated before any caller can replace current work',()=>{
 const p=C.packet(work());p.blocks.three.budget.limit=0;assert.throws(()=>C.unpack(p,F,B,T),/Повреждены/);assert.throws(()=>C.unpack({schema:'unexpected'},F,B,T),/JSON/);
});
test('an intermediate report has one summary, three blocks and no fake calls',()=>{
 const w=work();w.one.goal='Цель $& <img src=x onerror=x>';const html=C.report(w,E,F,B,T);assert.equal((html.match(/<body>/g)||[]).length,1);assert.equal((html.match(/Практикум: отчёт/g)||[]).length,1);assert.match(html,/Практика 1/);assert.match(html,/Практика 2/);assert.match(html,/Практика 3/);assert.match(html,/промежуточный отчёт содержит только блоки 1–3/);assert.match(html,/Цель \$&amp; &lt;img/);assert.doesNotMatch(html,/<img src=x|Вызов 1:/);assert.match(html,/Черновик — есть незавершённые разделы/);
});

const Q=require('./block-four-model.js');
test('four-block backups restore atomically, while older files leave block four unspecified',()=>{
 const w={...work(),four:Q.fresh()},p=C.packet(w);assert.equal(p.schema,'agent-practice/course-v3');assert.deepEqual(C.unpack(p,F,B,T,Q),w);assert.equal(C.unpack(C.packet(work()),F,B,T,Q).four,null);p.blocks.four.tools=['book_room'];assert.throws(()=>C.unpack(p,F,B,T,Q),/Повреждены/);
});
test('an untouched final report explicitly marks missing work in all four blocks',()=>{
 const html=C.report({...work(),four:Q.fresh()},E,F,B,T,Q);assert.match(html,/Итоговый отчёт по практикуму/);assert.match(html,/Блок 4: нужно дополнить/);assert.match(html,/Практика 4/);assert.match(html,/Черновик — есть незавершённые разделы/);assert.doesNotMatch(html,/в разработке|Вызов 1:/);assert.equal((html.match(/<body>/g)||[]).length,1);
});
test('a fully filled final report includes four independent conclusions and actual meeting trials',()=>{
 const w={...work(),four:Q.fresh()},a=w.one,b=w.two,t=w.three,q=w.four;
 a.goal='Цель';a.revealed=3;a.facts=['policy','time','draft'];a.roles=[...F.ROLE_KEYS];a.roleAttempts=[[...a.roles]];a.rolesReviewed=true;a.comparison={priority:'urgent',prediction:'deadline'};a.comparisonAttempts=[{...a.comparison}];a.callExplanation='Объяснение';a.goalExplanation='Вывод первого';a.evidence='record';
 for(const c of B.CASES){b.cases[c.id].prediction=c.expected;B.run(b,c.id,E);B.current(b,c.id).explanation='Обоснование';}b.conclusion='Вывод второго';b.recovery='Проверить поиск';
 t.forbidden.prediction='blocked';T.run(t,'forbidden',E);T.current(t,'forbidden').explanation='Отказ до выполнения';for(const limit of [1,3]){t.budget.current=null;t.budget.limit=limit;t.budget.prediction='ready';T.run(t,'budget',E);T.current(t,'budget').explanation='Обоснование';}t.verdicts={blocked:'yes',one:'no',three:'yes'};t.verdictAttempts=[{...t.verdicts}];t.reviewed=true;t.boundaries='Проверяет приложение';t.success='Вывод третьего';
 q.goal='Предложить комнату';q.tools=Object.keys(Q.TOOLS);q.criterion='proposal';q.checkPlan='Проверить требования';q.setupRecorded=true;for(const c of Q.CASES){q.cases[c.id].prediction='Мой прогноз';Q.run(q,c.id,E);Q.current(q,c.id).assessment='not_met';Q.current(q,c.id).explanation='Моё объяснение';}q.transfer='Вывод четвёртого $& <img>';q.confirmation='Нужно подтверждение';
 assert.deepEqual(C.readiness(w,E,F,B,T,Q),[true,true,true,true]);const html=C.report(w,E,F,B,T,Q);assert.match(html,/Разделы всех четырёх заданий заполнены/);for(const text of ['Вывод первого','Вывод второго','Вывод третьего','Вывод четвёртого'])assert.match(html,new RegExp(text));assert.match(html,/ROOM-B/);assert.match(html,/Комната не забронирована/);assert.doesNotMatch(html,/<img>/);
});
