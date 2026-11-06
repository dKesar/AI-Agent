/* Перенос всей работы между версиями практикума и единый читаемый отчёт. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CourseModel=api;})(globalThis,function(){'use strict';
const STORAGE_KEY='agent-course-snapshot-v1',MAX_FILE_BYTES=16*1024*1024;
const ROUTES={1:['task','observe','roles','experiment','explain','report'],2:['start','missing','ambiguous','unavailable','conclusions','report'],3:['start','permission','budget','outcomes','explain','report'],4:['task','setup','available','unavailable','explain','report']};
function routeFor(block,step){return block===1?'#'+ROUTES[1][step]:'#block'+block+'/'+ROUTES[block][step];}
function envelope(work,activeBlock){return {schema:Object.hasOwn(work,'four')?'agent-practice/course-v3':'agent-practice/course-v2',mode:'scripted-simulation',exportedAt:new Date().toISOString(),...(Number.isInteger(activeBlock)&&activeBlock>=1&&activeBlock<=4?{activeBlock}:{}),blocks:work};}
function packet(work,activeBlock){return envelope(JSON.parse(JSON.stringify(work)),activeBlock);}
function unpack(raw,F,B,T,Q){if(raw?.schema==='agent-practice/course-v3'){if(!Q)throw Error('Для этого файла нужна полная версия практикума.');return {one:F.normalize(raw.blocks?.one),two:B.normalize(raw.blocks?.two),three:T.normalize(raw.blocks?.three),four:Q.normalize(raw.blocks?.four)};}if(raw?.schema==='agent-practice/course-v2')return {one:F.normalize(raw.blocks?.one),two:B.normalize(raw.blocks?.two),three:T.normalize(raw.blocks?.three),...(Q?{four:null}:{})};const legacy=B.unpack(raw,F);return {...legacy,three:null,...(Q?{four:null}:{})};}
function readSnapshot(storage,F,B,T,Q){const raw=storage.getItem(STORAGE_KEY);if(!raw)return null;const packet=JSON.parse(raw);return {blocks:unpack(packet,F,B,T,Q),activeBlock:Number.isInteger(packet.activeBlock)&&packet.activeBlock>=1&&packet.activeBlock<=4?packet.activeBlock:1};}
function writeSnapshot(storage,work,activeBlock){storage.setItem(STORAGE_KEY,JSON.stringify(envelope(work,activeBlock)));}
function readiness(work,E,F,B,T,Q){return [!F.missing(work.one).length,B.readiness(work.two||B.fresh()).slice(1,5).every(Boolean),T.readiness(work.three||T.fresh()).slice(1,5).every(Boolean),...(Q?[Q.readiness(work.four||Q.fresh(),E).every(Boolean)]:[])];}
function report(work, engine, firstModel, secondModel, thirdModel, fourthModel) {
  const first = firstModel.normalize(work.one);
  const escape = firstModel.escape;
  const blocks = [{
    name: 'Устройство помощника',
    done: !firstModel.missing(first).length,
    answer: first.callExplanation || first.goalExplanation,
    details: firstModel.body(first, engine)
  }];
  if (secondModel) {
    const second = secondModel.normalize(work.two);
    blocks.push({
      name: 'Новые ситуации',
      done: secondModel.readiness(second).slice(1, 5).every(Boolean),
      answer: second.conclusion,
      details: secondModel.body(second, engine, false)
    });
  }
  if (thirdModel) {
    const third = thirdModel.normalize(work.three);
    blocks.push({
      name: 'Ограничения',
      done: thirdModel.readiness(third).slice(1, 5).every(Boolean),
      answer: third.success,
      details: thirdModel.body(third, engine, false)
    });
  }
  let checkpoint = '';
  let checkpointDetails = '';
  if (fourthModel) {
    const fourth = fourthModel.normalize(work.four);
    blocks.push({
      name: 'Новая задача',
      done: fourthModel.readiness(fourth, engine).every(Boolean),
      answer: fourth.transfer,
      details: fourthModel.body(fourth, engine, false)
    });
    checkpoint = '<h2>Итоговая проверка</h2>';
    if (fourth.checkpoint.first) {
      checkpoint += `<p>С журналом совпало ${fourthModel.checkpointScore(fourth)} из 4 первых ответов.</p>
        <p class="answer">${escape(fourth.checkpoint.first.reason)}</p>`;
    } else {
      checkpoint += '<p>Новый случай ещё не разобран.</p>';
    }
    checkpointDetails = `<details><summary>Первая попытка и разбор нового случая</summary>
      ${fourthModel.checkpointSummary(fourth)}</details>
      <details><summary>Критерии проверки преподавателем</summary>
      <p>Оцените роли, опору на данные, результат, ограничения и перенос. По каждому критерию поставьте 0 за неверное или отсутствующее объяснение, 1 за частичное объяснение или 2 за обоснованный самостоятельный ответ.</p></details>`;
  }
  const finished = blocks.filter(block => block.done).length;
  const title = fourthModel ? 'Итоговый отчёт по практикуму' : 'Промежуточный отчёт по практикуму';
  const overview = `<main class="report-overview">
    <h1>${title}</h1>
    <p class="report-meta">Участник или код <strong>${escape(first.author || 'Не указан')}</strong></p>
    <p class="report-meta">Заполнено блоков <strong>${finished} из ${blocks.length}</strong></p>
    ${finished < blocks.length ? '<p class="notice">Черновик — есть незавершённые разделы</p>' : ''}
    <h2>Выводы по блокам</h2>
    <ol class="report-blocks">${blocks.map((block, index) => `<li>
      <strong>${index + 1}. ${block.name}</strong>
      <span class="report-state"> · ${block.done ? 'заполнен' : 'нужно дополнить'}</span>
      <p>${escape(block.answer.trim() || 'Вывод пока не записан.')}</p>
    </li>`).join('')}</ol>
    ${checkpoint}
  </main>`;
  const appendix = `<details class="report-appendix">
    <summary>Все ответы, попытки и журналы</summary>
    ${blocks.map((block, index) => `<details><summary>Блок ${index + 1}. ${block.name}</summary>${block.details}</details>`).join('')}
    ${checkpointDetails}
  </details>
  <p class="report-print-help">Раскройте этот раздел перед печатью, чтобы добавить подробности.</p>`;
  return firstModel.reportDocument(title, overview + appendix, true);
}
return {STORAGE_KEY,MAX_FILE_BYTES,ROUTES,routeFor,packet,unpack,readSnapshot,writeSnapshot,readiness,report};
});
