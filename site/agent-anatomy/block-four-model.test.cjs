'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('./block-four-model.js'),E=require('./engine.js');
function configured(){const s=M.fresh();s.goal='Предложить подходящую комнату';s.tools=Object.keys(M.TOOLS);s.criterion='proposal';s.checkPlan='Проверить время, шесть мест, проектор и подтверждение';s.setupRecorded=true;return s;}
function run(s,id){s.cases[id].current=null;s.cases[id].prediction='Ожидаю получить данные и проверить все требования.';return M.run(s,id,E);}
test('selected tools execute and the suitable room is proposed without booking',()=>{
 const s=configured(),r=run(s,'available');assert.equal(r.status,'awaiting_review');assert.equal(r.state.selectedRoomId,'ROOM-B');assert.equal(r.criteria.people,6);assert.equal(r.criteria.time,'15:00');assert.equal(r.criteria.projector,true);assert.equal(r.booked,false);assert.equal(r.state.booked,false);assert.deepEqual(r.cycles.map(c=>c.tool),['search_rooms','prepare_booking_draft']);
});
test('free but unsuitable rooms are rejected for distinct requirements',()=>{
 const s=configured(),r=run(s,'unavailable');assert.equal(r.status,'needs_human');assert.equal(r.state.selectedRoomId,null);assert.equal(r.state.draft,null);assert.equal(r.state.stopReason,'no_compatible_room');assert.deepEqual(r.state.rooms.map(room=>[room.capacity,room.projector,room.free]),[[4,true,true],[8,false,true],[10,true,false]]);assert.equal(r.booked,false);
});
test('denied search produces no room data and denied drafting does not create a proposal',()=>{
 const s=configured();s.tools=[];const deniedSearch=run(s,'available');assert.equal(deniedSearch.status,'blocked');assert.equal(deniedSearch.state.rooms,null);assert.equal(deniedSearch.cycles[0].execution,null);s.tools=['search_rooms'];const deniedDraft=run(s,'available');assert.equal(deniedDraft.state.rooms.length,3);assert.equal(deniedDraft.cycles.at(-1).tool,'prepare_booking_draft');assert.equal(deniedDraft.cycles.at(-1).execution,null);assert.equal(deniedDraft.state.draft,null);
});
test('forecasts and setup must be recorded before running, with no fabricated attempts',()=>{
 const s=configured();assert.throws(()=>M.run(s,'available',E),/прогноз/);s.cases.available.prediction='Мой прогноз';s.setupRecorded=false;assert.throws(()=>M.run(s,'available',E),/настройки/);assert.equal(s.cases.available.attempts.length,0);
});
test('each attempt owns its forecast, goal and tool settings, unaffected by later edits',()=>{
 const s=configured();run(s,'available');const a=M.current(s,'available');a.explanation='Первый результат';s.tools=[];s.goal='Изменённая цель';s.checkPlan='Другой план';s.criterion='booked';run(s,'available');assert.equal(a.setup.goal,'Предложить подходящую комнату');assert.equal(a.setup.tools.length,3);assert.equal(a.setup.criterion,'proposal');assert.equal(M.replay('available',a,E).status,'awaiting_review');assert.equal(M.replay('available',M.current(s,'available'),E).status,'blocked');assert.equal(a.explanation,'Первый результат');
});
test('a blocked attempt alone does not complete the planned experiment, but wrong learner judgements are retained',()=>{
 const s=configured();s.tools=[];run(s,'available');M.current(s,'available').assessment='met';M.current(s,'available').explanation='Мой неверный ответ';assert.equal(M.readiness(s,E)[2],false);s.tools=Object.keys(M.TOOLS);for(const c of M.CASES){run(s,c.id);M.current(s,c.id).assessment='met';M.current(s,c.id).explanation='Оценку проверит преподаватель.';}s.transfer='Общее устройство';s.confirmation='Подтверждение человека';assert.equal(M.readiness(s,E).slice(0,5).every(Boolean),true);assert.equal(s.cases.available.attempts[0].explanation,'Мой неверный ответ');
});
test('restore validates tools, pointers and answer shapes and drops injected outcomes',()=>{
 const s=configured();run(s,'available');M.current(s,'available').result={booked:true};const n=M.normalize(s);assert.equal(n.cases.available.attempts[0].result,undefined);assert.deepEqual(M.normalize(M.fresh()),M.fresh());
 for(const mutate of [x=>x.tools.push('book_room'),x=>x.cases.available.current=8,x=>x.cases.available.attempts[0].setup.tools.push('send_email'),x=>x.cases.available.attempts[0].assessment='guessed']){const x=JSON.parse(JSON.stringify(s));mutate(x);assert.throws(()=>M.normalize(x),/Повреждены/);}
});
test('reports contain no unperformed room searches and escape learner text',()=>{
 const empty=M.body(M.fresh(),E);assert.equal((empty.match(/Опыт не запускался/g)||[]).length,2);assert.doesNotMatch(empty,/Вызов 1:|Фактически:/);
 const s=configured();s.goal='Текст $& <script>bad</script>';run(s,'available');const html=M.body(s,E);assert.match(html,/Текст \$&amp; &lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/Комната не забронирована/);
});
