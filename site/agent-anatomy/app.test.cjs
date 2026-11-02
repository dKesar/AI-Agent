'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const engine = require('./engine.js');
const model = require('./lesson-model.js');
const secondModel = require('./block-two-model.js');
const thirdModel = require('./block-three-model.js');
const fourthModel = require('./block-four-model.js');
const courseModel = require('./course-model.js');

// Execute actual UI callbacks. Hooks are injected into this in-memory copy only.
function loadApp({storageFails=false}={}) {
  const events = {}, handlers={}, elements = new Map(), dynamic = new Set(), cached = new Map(), downloads = [];
  function listen(name,fn){(handlers[name]||=[]).push(fn);events[name]=event=>[...handlers[name]].forEach(handle=>handle(event));}
  let activeId = null, screenWrites = 0;
  const staticIds = ['screen','steps','next','previous','step-count','progress-bar','step-help','save-status','notice','restore','skip'];
  function node(id) {
    let content = ''; const attrs = new Map();
    const obj = {id,hidden:false,style:{},dataset:{},textContent:'',value:'',listeners:{},
      classList:{toggle(){}},
      addEventListener(name,fn){this.listeners[name]=fn;},
      setAttribute(name,value){attrs.set(name,String(value));},
      removeAttribute(name){attrs.delete(name);},
      hasAttribute(name){return attrs.has(name);},
      focus(){activeId=id;},scrollIntoView(){},click(){},remove(){}};
    Object.defineProperty(obj,'innerHTML',{get(){return content;},set(value){
      content=value;if(id!=='screen')return;screenWrites++;
      for(const name of dynamic)elements.delete(name);dynamic.clear();
      for(const match of String(value).matchAll(/\bid="([^"]+)"/g)){
        const name=match[1];if(!staticIds.includes(name)){elements.set(name,node(name));dynamic.add(name);}
      }
    }});
    return obj;
  }
  staticIds.forEach(id=>elements.set(id,node(id)));
  const context=vm.createContext({
    BlockOne:model,BlockTwo:secondModel,BlockThree:thirdModel,BlockFour:fourthModel,CourseModel:courseModel,AnatomyLab:engine,
    document:{getElementById:id=>elements.get(id)||null,
      querySelectorAll:()=>[...elements.values()].filter(el=>el.hasAttribute('aria-invalid')),
      addEventListener:listen,
      createElement:()=>({click(){},remove(){}}),body:{append(){}}},
    window:{addEventListener:listen,scrollTo(){}},location:{hash:''},
    localStorage:{getItem:key=>{if(storageFails)throw Error('Storage blocked');return cached.get(key)||null;},setItem:(key,value)=>{if(storageFails)throw Error('Storage blocked');cached.set(key,value);}},
    setTimeout:()=>1,clearTimeout(){},confirm:()=>true,Blob,
    URL:{createObjectURL(blob){downloads.push(blob);return 'blob:test';},revokeObjectURL(){}}
  });
  let secondSource=fs.readFileSync(path.join(__dirname,'block-two-app.js'),'utf8');
  secondSource=secondSource.replace('return {resume};','return {resume,getState:()=>state};');
  vm.runInContext(secondSource,context);
  let thirdSource=fs.readFileSync(path.join(__dirname,'block-three-app.js'),'utf8');
  thirdSource=thirdSource.replace('return {resume};','return {resume,getState:()=>state};');
  vm.runInContext(thirdSource,context);
  let fourthSource=fs.readFileSync(path.join(__dirname,'block-four-app.js'),'utf8');
  fourthSource=fourthSource.replace('return {resume};','return {resume,getState:()=>state};');
  vm.runInContext(fourthSource,context);
  let source=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
  const tail=source.lastIndexOf('render();');assert.ok(tail>=0);
  source=source.slice(0,tail)+'globalThis.__test={getState:()=>state,setState:value=>state=value,render,advance,route,second:()=>secondUI,third:()=>thirdUI,fourth:()=>fourthUI};\n'+source.slice(tail);
  vm.runInContext(source,context);
  return {...context.__test,events,elements,cached,downloads,context,
    get activeId(){return activeId;},get screenWrites(){return screenWrites;},
    clickNext(){events.click({target:{closest:()=>({dataset:{action:'next'}})}});},
    change(id,dataset,value){const target=elements.get(id);assert.ok(target,id+' exists in rendered screen');target.dataset=dataset;target.value=value;events.change({target});},
    input(id,value){const target=elements.get(id);assert.ok(target);target.dataset={field:id};target.value=value;events.input({target});}
  };
}

test('empty goal gives precise notice and focus instead of an inert button',()=>{
  const app=loadApp(),writes=app.screenWrites;app.clickNext();
  assert.equal(app.getState().step,0);
  assert.equal(app.elements.get('notice').hidden,false);
  assert.match(app.elements.get('notice').textContent,/какой результат нужен Ане/);
  assert.equal(app.activeId,'goal');assert.equal(app.screenWrites,writes);
  assert.equal(app.elements.get('next').hasAttribute('disabled'),false);
});

test('typing and selecting preserve the actual form elements under the finger',()=>{
  const app=loadApp(),goal=app.elements.get('goal'),writes=app.screenWrites;
  app.input('goal','Подготовить проверяемый черновик ответа.');
  assert.equal(app.screenWrites,writes);assert.equal(app.elements.get('goal'),goal);
  app.clickNext();app.clickNext();
  const select=app.elements.get('new-fact'),opened=app.screenWrites;
  app.change('new-fact',{fact:'0'},'policy');
  assert.equal(app.elements.get('new-fact'),select);assert.equal(app.screenWrites,opened);
  assert.equal(app.getState().facts[0],'policy');assert.equal(app.elements.get('fact-feedback').hidden,false);
});

test('observation explains the missing answer and permits a recorded mismatch',()=>{
  const app=loadApp(),s=model.fresh();s.step=1;app.setState(s);app.render();app.clickNext();
  assert.equal(app.getState().revealed,1);const writes=app.screenWrites;app.clickNext();
  assert.equal(app.getState().view,0);assert.equal(app.activeId,'new-fact');
  assert.match(app.elements.get('notice').textContent,/какое сведение появилось в этом вызове/);
  assert.equal(app.screenWrites,writes);
  app.change('new-fact',{fact:'0'},'time');
  assert.match(app.elements.get('fact-feedback').innerHTML,/Сравните с результатом/);
  app.clickNext();assert.equal(app.getState().view,1);
  assert.deepEqual(Array.from(app.getState().factAttempts[0]),['time']);
});

test('last observed call has an active transition rather than a disabled completion button',()=>{
  const app=loadApp(),s=model.fresh();s.step=1;s.revealed=3;s.view=2;s.facts=['policy','time','draft'];
  app.setState(s);app.render();assert.match(app.elements.get('next').textContent,/Перейти к ролям/);
  app.clickNext();assert.equal(app.getState().step,2);assert.equal(app.activeId,'page-title');
});

test('roles require entries, but reviewed wrong matching does not force guessing',()=>{
  const app=loadApp(),s=model.fresh();s.step=2;app.setState(s);app.render();app.clickNext();
  assert.equal(app.activeId,'role-0');assert.match(app.elements.get('notice').textContent,/Выберите роль для записи 1/);
  ['execute','proposal','observation','check'].forEach((value,i)=>app.change('role-'+i,{role:String(i)},value));
  const writes=app.screenWrites;app.clickNext();
  assert.equal(app.getState().rolesReviewed,true);assert.equal(app.getState().roleAttempts.length,1);
  assert.equal(app.getState().step,2);assert.equal(app.screenWrites,writes);
  assert.match(app.elements.get('role-feedback').innerHTML,/совпало 0 из 4/);
  assert.equal(app.activeId,'role-feedback');assert.match(app.elements.get('next').textContent,/Перейти к опыту/);
  app.clickNext();assert.equal(app.getState().step,3);
});

test('missing experimental settings produce targeted notices and focus',()=>{
  const app=loadApp(),s=model.fresh();s.step=3;app.setState(s);app.render();app.clickNext();
  assert.equal(app.activeId,'priority');assert.match(app.elements.get('notice').textContent,/смените приоритет/);
  const writes=app.screenWrites;app.change('priority',{field:'priority'},'urgent');
  assert.equal(app.screenWrites,writes);app.clickNext();
  assert.match(app.elements.get('notice').textContent,/Выберите один прогноз/);
  assert.equal(app.activeId,'prediction-group');assert.equal(app.getState().comparison,null);
});

test('urgent experiment records a wrong prediction and the real 4-hour result without rebuilding form',()=>{
  const app=loadApp(),s=model.fresh();s.step=3;s.priority='urgent';s.prediction='policy';app.setState(s);app.render();
  const select=app.elements.get('priority'),writes=app.screenWrites;app.clickNext();
  assert.deepEqual(JSON.parse(JSON.stringify(app.getState().comparison)),{priority:'urgent',prediction:'policy'});
  assert.equal(app.getState().comparisonAttempts.length,1);assert.equal(app.screenWrites,writes);
  assert.equal(app.elements.get('priority'),select);
  assert.match(app.elements.get('experiment-result').innerHTML,/Есть расхождение с прогнозом/);
  assert.match(app.elements.get('experiment-result').innerHTML,/4 <small>часа/);
  assert.match(app.elements.get('experiment-result').innerHTML,/правило IT-01/);
  assert.equal(app.activeId,'experiment-result');app.clickNext();assert.equal(app.getState().step,4);
});

test('explanation validation focuses the first unanswered field',()=>{
  const app=loadApp(),s=model.fresh();s.step=4;app.setState(s);app.render();app.clickNext();
  assert.equal(app.activeId,'callExplanation');
  app.input('callExplanation','Приложение запустило предложенный поиск и вернуло IT-01.');
  app.clickNext();assert.equal(app.activeId,'goalExplanation');
});

test('first-block summary continues the same local page and offers an intermediate report',()=>{
  const app=loadApp(),s=model.fresh();s.step=5;app.setState(s);app.render();
  assert.match(app.elements.get('next').textContent,/Перейти ко второму блоку/);
  assert.match(app.elements.get('screen').innerHTML,/data-action="report"/);
  app.clickNext();assert.equal(app.downloads.length,0);
});

test('second block focuses missing answers, preserves the live textarea and accepts a wrong prediction',()=>{
 const app=loadApp();app.input('goal','Черновик для Ани.');app.context.location.hash='#block2';app.route();app.clickNext();
 const s=app.second().getState();assert.equal(s.step,1);app.clickNext();assert.equal(app.activeId,'prediction-group');
 app.events.change({target:{name:'prediction',value:'draft'}});app.clickNext();assert.equal(s.cases.missing.attempts.length,1);
 const textarea=app.elements.get('explanation'),writes=app.screenWrites;app.input('explanation','Поиск сработал без подходящих записей.');
 assert.equal(app.elements.get('explanation'),textarea);assert.equal(app.screenWrites,writes);
 app.clickNext();assert.equal(s.step,2);assert.equal(s.cases.missing.attempts[0].prediction,'draft');
});

test('both blocks remain in memory and in a backup when browser storage is blocked',async()=>{
 const app=loadApp({storageFails:true});app.input('goal','Моя формулировка сохраняется в памяти.');app.context.location.hash='#block2';app.route();app.clickNext();
 app.events.change({target:{name:'prediction',value:'human'}});app.clickNext();app.input('explanation','Пустой ответ поиска.');
 app.context.location.hash='#task';app.route();assert.equal(app.getState().goal,'Моя формулировка сохраняется в памяти.');
 app.events.click({target:{closest:()=>({dataset:{action:'backup'}})}});
 const packet=JSON.parse(await app.downloads[0].text());assert.equal(packet.schema,'agent-practice/course-v3');assert.equal(packet.blocks.two.cases.missing.attempts[0].explanation,'Пустой ответ поиска.');
 app.context.location.hash='#block2/missing';app.route();assert.equal(app.second().getState().cases.missing.attempts.length,1);
});

test('switching back to block one does not leave second-block listeners handling its fields',()=>{
 const app=loadApp();app.input('goal','Начальная цель');app.context.location.hash='#block2';app.route();app.clickNext();
 app.context.location.hash='#task';app.route();app.input('goal','Исправленная цель');app.clickNext();
 assert.equal(app.getState().step,1);assert.equal(app.getState().goal,'Исправленная цель');assert.equal(app.second().getState().step,1);
});

test('the second-block route continues to block three and retains an intermediate report',async()=>{
 const app=loadApp();app.input('goal','Моя цель первого блока');app.context.location.hash='#block2/start';app.route();app.clickNext();
 for(const c of secondModel.CASES){app.events.change({target:{name:'prediction',value:c.expected}});app.clickNext();app.input('explanation','Моё объяснение: '+c.id);app.clickNext();}
 assert.equal(app.second().getState().step,4);app.clickNext();assert.equal(app.activeId,'conclusion');app.input('conclusion','Пустой результат отличается от ошибки.');app.clickNext();assert.equal(app.activeId,'recovery');app.input('recovery','Снова получить результат поиска.');app.clickNext();
 assert.equal(app.second().getState().step,5);assert.match(app.elements.get('next').textContent,/Перейти к третьему/);
 app.events.click({target:{closest:()=>({dataset:{action:'intermediate-report'}})}});const html=await app.downloads[0].text();assert.match(html,/Моя цель первого блока/);assert.match(html,/Моё объяснение: unavailable/);assert.match(html,/Черновик — есть незавершённые разделы/);
 app.clickNext();assert.equal(app.context.location.hash,'block3');
});

test('third-block forecast validation and typing keep fields stable and retain wrong predictions',()=>{
 const app=loadApp();app.context.location.hash='#block3/start';app.route();app.clickNext();app.clickNext();assert.equal(app.activeId,'prediction-group');
 app.events.change({target:{name:'send-prediction',value:'sent'}});app.clickNext();const s=app.third().getState();assert.equal(s.forbidden.attempts[0].prediction,'sent');
 app.clickNext();assert.equal(app.activeId,'explanation');const field=app.elements.get('explanation'),writes=app.screenWrites;app.input('explanation','Приложение отклонило отправку, черновик готов.');assert.equal(app.screenWrites,writes);assert.equal(app.elements.get('explanation'),field);
 app.clickNext();assert.equal(s.step,2);
});

test('both budget runs are required, use actual selected limits, and preserve earlier evidence',()=>{
 const app=loadApp();app.context.location.hash='#block3/budget';app.route();const s=app.third().getState();
 app.events.change({target:{name:'budget-prediction',value:'ready'}});app.clickNext();assert.equal(s.budget.attempts[0].limit,1);assert.match(app.elements.get('screen').innerHTML,/Лимит исчерпан/);app.input('explanation','Найдено только правило.');app.clickNext();
 assert.equal(s.step,2);assert.equal(s.budget.limit,3);assert.equal(s.budget.current,null);app.clickNext();assert.equal(app.activeId,'prediction-group');
 app.events.change({target:{name:'budget-prediction',value:'ready'}});app.clickNext();assert.equal(s.budget.attempts[1].limit,3);assert.match(app.elements.get('screen').innerHTML,/Черновик с правилом и сроком готов/);app.input('explanation','Черновик готов по двум источникам.');app.clickNext();assert.equal(s.step,3);assert.equal(s.budget.attempts[0].prediction,'ready');assert.equal(s.budget.attempts[0].explanation,'Найдено только правило.');
});

test('wrong reviewed outcome choices can continue to block four with an intermediate report available',async()=>{
 const app=loadApp();app.input('goal','Цель первого блока');app.context.location.hash='#block3/outcomes';app.route();app.clickNext();assert.equal(app.activeId,'verdict-blocked');
 for(const key of ['blocked','one','three'])app.events.change({target:{dataset:{verdict:key},value:key==='one'?'yes':'no'}});
 app.clickNext();assert.match(app.elements.get('verdict-feedback').innerHTML,/совпало 0 из 3/);app.clickNext();assert.equal(app.third().getState().step,4);
 app.clickNext();assert.equal(app.activeId,'boundaries');app.input('boundaries','Разрешение проверяет приложение.');app.input('success','Нужно сопоставить черновик с задачей.');app.clickNext();app.events.click({target:{closest:()=>({dataset:{action:'report-three'}})}});const html=await app.downloads[0].text();assert.match(html,/Цель первого блока/);assert.match(html,/Практика 3/);assert.match(html,/Черновик — есть незавершённые разделы/);assert.match(html,/Опыт не запускался/);app.clickNext();assert.equal(app.context.location.hash,'block4');
});

test('one backup includes all three blocks even when storage is blocked',async()=>{
 const app=loadApp({storageFails:true});app.input('goal','Текст первого блока');app.context.location.hash='#block3/permission';app.route();app.events.change({target:{name:'send-prediction',value:'blocked'}});app.clickNext();app.input('explanation','Текст третьего блока');
 app.events.click({target:{closest:()=>({dataset:{action:'backup'}})}});assert.equal(app.downloads.length,1);const raw=JSON.parse(await app.downloads[0].text());assert.equal(raw.blocks.one.goal,'Текст первого блока');assert.equal(raw.blocks.three.forbidden.attempts[0].explanation,'Текст третьего блока');assert.match(app.elements.get('save-status').textContent,/Автосохранение недоступно/);
 app.context.location.hash='#task';app.route();assert.equal(app.getState().goal,'Текст первого блока');app.context.location.hash='#block3/permission';app.route();assert.equal(app.third().getState().forbidden.attempts.length,1);
});

test('importing an old two-block file in block three retains third-block work',async()=>{
 const app=loadApp();app.context.location.hash='#block3/permission';app.route();app.events.change({target:{name:'send-prediction',value:'blocked'}});app.clickNext();app.input('explanation','Сохранить это объяснение');const incoming=model.fresh();incoming.goal='Цель из старого файла';
 const file={size:100,text:async()=>JSON.stringify(secondModel.packet(incoming,secondModel.fresh()))};
 await app.elements.get('restore').listeners.change({target:{files:[file],value:'file'}});assert.equal(app.context.practiceWork.one.goal,'Цель из старого файла');assert.equal(app.third().getState().forbidden.attempts[0].explanation,'Сохранить это объяснение');assert.match(app.elements.get('notice').textContent,/Работа восстановлена/);
});

function enterFourth(app,tools=Object.keys(fourthModel.TOOLS)){
 app.context.location.hash='#block4/task';app.route();app.input('goal','Предложить комнату для подтверждения');app.clickNext();
 for(const tool of tools)app.events.change({target:{dataset:{tool},checked:true}});
 app.change('criterion',{},'proposal');app.input('checkPlan','Проверить шесть мест, проектор и доступность.');app.clickNext();
}
function explainMeeting(app,text='Объяснение по найденным комнатам.'){
 app.events.change({target:{dataset:{},name:'assessment',value:'not_met'}});app.input('explanation',text);
}
test('fourth-block setup and forecasts give precise focus without recreating typed forms',()=>{
 const app=loadApp();app.context.location.hash='#block4/task';app.route();app.clickNext();assert.equal(app.activeId,'goal');app.input('goal','Новая цель');app.clickNext();app.clickNext();assert.equal(app.activeId,'criterion');app.change('criterion',{},'proposal');app.clickNext();assert.equal(app.activeId,'checkPlan');
 const field=app.elements.get('checkPlan'),writes=app.screenWrites;app.input('checkPlan','План проверки');assert.equal(app.screenWrites,writes);assert.equal(app.elements.get('checkPlan'),field);app.clickNext();app.clickNext();assert.equal(app.activeId,'prediction');
});
test('a denied meeting tool guides back to settings and retains the failed attempt on retry',()=>{
 const app=loadApp();enterFourth(app,['search_rooms']);app.input('prediction','Предложение готово');app.clickNext();const s=app.fourth().getState();assert.match(app.elements.get('screen').innerHTML,/Приложение отклонило действие/);app.clickNext();assert.equal(app.activeId,'assessment-group');explainMeeting(app,'Не разрешена подготовка предложения.');app.clickNext();assert.equal(s.step,1);
 app.events.change({target:{dataset:{tool:'prepare_booking_draft'},checked:true}});app.clickNext();app.input('prediction','Теперь можно подготовить предложение');app.clickNext();assert.match(app.elements.get('screen').innerHTML,/Предложение комнаты готово/);assert.equal(s.cases.available.attempts.length,2);assert.equal(s.cases.available.attempts[0].explanation,'Не разрешена подготовка предложения.');assert.deepEqual(Array.from(s.cases.available.attempts[0].setup.tools),['search_rooms']);
});
test('two meeting datasets and independent explanations produce a single four-block report',async()=>{
 const app=loadApp();app.input('goal','Ответ первого блока');enterFourth(app);const s=app.fourth().getState();
 for(const c of fourthModel.CASES){app.input('prediction','Ожидаю проверить '+c.id);app.clickNext();explainMeeting(app,'Мои выводы '+c.id);app.clickNext();}
 assert.equal(s.step,4);app.clickNext();assert.equal(app.activeId,'transfer');app.input('transfer','Общий цикл предложения, проверки, выполнения и наблюдения.');app.input('confirmation','Подтверждает человек, бронирования не было.');app.clickNext();assert.equal(s.step,5);app.clickNext();const html=await app.downloads[0].text();assert.match(html,/Ответ первого блока/);assert.match(html,/Мои выводы available/);assert.match(html,/Мои выводы unavailable/);assert.match(html,/Практика 4/);assert.match(html,/Черновик — есть незавершённые разделы/);assert.equal(app.downloads.length,1);
});
test('four-block backup works without browser storage and a legacy import preserves meeting attempts',async()=>{
 const app=loadApp({storageFails:true});enterFourth(app);app.input('prediction','Первый прогноз');app.clickNext();explainMeeting(app,'Сохранённое объяснение четвёртого блока');
 app.events.click({target:{closest:()=>({dataset:{action:'backup'}})}});const raw=JSON.parse(await app.downloads[0].text());assert.equal(raw.schema,'agent-practice/course-v3');assert.equal(raw.blocks.four.cases.available.attempts[0].explanation,'Сохранённое объяснение четвёртого блока');
 const incoming=model.fresh();incoming.goal='Старая работа первого блока';await app.elements.get('restore').listeners.change({target:{files:[{size:100,text:async()=>JSON.stringify(model.packet(incoming))}],value:'file'}});assert.equal(app.context.practiceWork.one.goal,'Старая работа первого блока');assert.equal(app.fourth().getState().cases.available.attempts.length,1);assert.match(app.elements.get('save-status').textContent,/Автосохранение недоступно/);
});
