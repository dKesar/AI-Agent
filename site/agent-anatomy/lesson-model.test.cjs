'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./lesson-model.js');
const engine = require('./engine.js');

function filledWork() {
  const s = model.fresh();
  s.author = 'Участник 7';
  s.goal = 'Подготовить черновик ответа по правилу и указать срок первого ответа.';
  s.revealed = 3;
  s.facts = ['policy', 'time', 'draft'];
  s.factAttempts = [['time', 'policy'], ['time'], ['draft']];
  s.roles = ['proposal', 'check', 'execute', 'observation'];
  s.roleAttempts = [
    ['execute', 'proposal', 'check', 'observation'],
    [...s.roles]
  ];
  s.rolesReviewed = true;
  s.priority = 'urgent';
  s.prediction = 'deadline';
  s.comparisonAttempts = [{ priority: 'urgent', prediction: 'policy' }, { priority: 'urgent', prediction: 'deadline' }];
  s.comparison = { ...s.comparisonAttempts.at(-1) };
  s.callExplanation = 'Предложен поиск. Приложение проверило запрос и выполнило поиск. Получено IT-01.';
  s.goalExplanation = 'Требовался черновик, установка редактора не входила в задачу.';
  s.evidence = 'record';
  return s;
}

test('normalize accepts a fresh work record and preserves the fields needed to resume', () => {
  const fresh = model.fresh();
  assert.deepEqual(model.normalize(fresh), fresh);
  const work = filledWork();
  const restored = model.normalize(model.packet(work).state);
  assert.equal(restored.author, work.author);
  assert.equal(restored.goal, work.goal);
  assert.deepEqual(restored.factAttempts, work.factAttempts);
  assert.deepEqual(restored.roleAttempts, work.roleAttempts);
  assert.deepEqual(restored.comparisonAttempts, work.comparisonAttempts);
  assert.equal(restored.rolesReviewed, true);
});

test('normalize rejects malformed answer structures and invalid option values', () => {
  for (const malformed of [null, {}, { version: 1 }]) {
    assert.throws(() => model.normalize(malformed), /повреждён|другой версии/);
  }
  const mutations = [
    s => { s.author = { name: 'a' }; },
    s => { s.goal = 'a'.repeat(4001); },
    s => { s.facts = null; },
    s => { s.facts = ['policy']; },
    s => { s.facts[0] = 'fabricated'; },
    s => { s.factAttempts[0] = null; },
    s => { s.factAttempts[0] = Array(31).fill('policy'); },
    s => { s.roles = ['proposal']; },
    s => { s.roles[0] = 'sent'; },
    s => { s.roleAttempts = [null]; },
    s => { s.roleAttempts = [['proposal']]; },
    s => { s.roleAttempts = [Array(4).fill('invented')]; },
    s => { s.priority = 'emergency'; },
    s => { s.prediction = 'always_succeeds'; },
    s => { s.evidence = 'hidden_thoughts'; },
    s => { s.comparisonAttempts = [null]; },
    s => { s.comparisonAttempts = [{ priority: 'normal', prediction: 'deadline' }]; },
    s => { s.comparisonAttempts = Array(31).fill({ priority: 'urgent', prediction: 'deadline' }); }
  ];
  for (const mutate of mutations) {
    const work = model.fresh();
    mutate(work);
    assert.throws(() => model.normalize(work), /повреждён|другой версии/, mutate.toString());
  }
});

test('an injected comparison outcome cannot turn an unperformed experiment into a completed one', () => {
  const work = model.fresh();
  work.comparison = { priority: 'urgent', prediction: 'send', outcome: { sent: true, responseHours: 999 } };
  const restored = model.normalize(work);
  assert.equal(restored.comparison, null);
  assert.equal(model.readiness(restored)[3], false);
  assert.match(model.report(restored, engine), /Опыт пока не выполнен/);
});

test('comparison comes from recorded attempts and report replays the real engine result', () => {
  const work = filledWork();
  work.comparison = { priority: 'normal', prediction: 'policy', result: { responseHours: 999, sent: true } };
  work.comparisonAttempts.at(-1).outcome = { responseHours: 999, sent: true };
  const restored = model.normalize(work);
  assert.deepEqual(restored.comparison, { priority: 'urgent', prediction: 'deadline' });
  assert.deepEqual(restored.comparisonAttempts.at(-1), { priority: 'urgent', prediction: 'deadline' });
  const html = model.report(restored, engine);
  assert.match(html, /IT-01/);
  assert.match(html, /с 24 до 4 часов/);
  assert.match(html, /Установка программы и отправка не выполнялись/);
  assert.doesNotMatch(html, /999/);
  assert.equal(engine.runScenario('normal', { priority: 'urgent' }).sent, false);
});

test('review completion needs a recorded review of the current answers', () => {
  const work = filledWork();
  work.roleAttempts = [];
  work.rolesReviewed = true;
  let restored = model.normalize(work);
  assert.equal(restored.rolesReviewed, false);
  assert.equal(model.readiness(restored)[2], false);
  work.roleAttempts = [['execute', 'check', 'proposal', 'observation']];
  restored = model.normalize(work);
  assert.equal(restored.rolesReviewed, false, 'a review of different answers is not a review of the current answers');
});

test('reviewed wrong matching may be submitted without being mislabelled as understanding', () => {
  const work = filledWork();
  work.roles = ['execute', 'proposal', 'observation', 'check'];
  work.roleAttempts = [[...work.roles]];
  work.facts = ['draft', 'policy', 'time'];
  work.factAttempts = [['draft'], ['policy'], ['time']];
  const restored = model.normalize(work);
  assert.equal(restored.rolesReviewed, true);
  assert.equal(model.readiness(restored)[2], true, 'filled and reviewed answers are allowed, even when wrong');
  assert.deepEqual(model.missing(restored), []);
  const html = model.report(restored, engine);
  assert.match(html, /Все обязательные разделы заполнены — для проверки преподавателем/);
  assert.match(html, /Есть расхождение с журналом/);
  assert.match(html, /Это проверка выбранных ответов, не оценка понимания/);
  assert.match(html, /Заполнение разделов и совпадение вариантов не доказывают самостоятельное понимание/);
  assert.doesNotMatch(html, /Вы всё поняли|Вы все поняли|Курс успешно сдан/);
});

test('report keeps first and latest attempts instead of rewriting errors after a correction', () => {
  const work = model.normalize(filledWork());
  const html = model.report(work, engine);
  assert.match(html, /В первой попытке совпало 1 из 4, в последней — 4 из 4/);
  assert.match(html, /Попытки: Срок первого ответа → Найденное правило/);
  assert.match(html, /Прогнозы по попыткам: policy → deadline/);
  assert.equal(work.roleAttempts.length, 2);
  assert.deepEqual(work.factAttempts[0], ['time', 'policy']);
});

test('partial reports explicitly label missing sections and no experiment', () => {
  const work = model.fresh();
  assert.deepEqual(model.missing(work), [0, 1, 2, 3, 4]);
  const html = model.report(work, engine);
  assert.match(html, /Черновик отчёта — есть незавершённые пункты/);
  for (const title of model.STEPS.slice(0, 5)) assert.ok(html.includes(title));
  assert.match(html, /Опыт пока не выполнен/);
  assert.match(html, /Не заполнено/);
  assert.doesNotMatch(html, /Все обязательные разделы заполнены/);
});

test('a report of an unopened observation does not claim the whole baseline was observed', () => {
  const work = model.fresh();
  const html = model.report(work, engine);
  assert.match(html, /Наблюдение пока не выполнено/);
  assert.doesNotMatch(html, /search_policy|get_sla|prepare_draft/);
  assert.doesNotMatch(html, /24 часа|4 часа|Срок первого ответа изменился/);
  assert.doesNotMatch(html, /Для установки рабочего ПО подайте заявку/);
  work.revealed = 1;
  const firstCall = model.report(work, engine);
  assert.match(firstCall, /search_policy/);
  assert.match(firstCall, /Правило: IT-01; срок первого ответа: неизвестен; черновик: не готов/);
  assert.doesNotMatch(firstCall, /get_sla|prepare_draft|24 часа/);
});

test('report itself ignores an injected comparison unless an actual attempt was recorded', () => {
  const work = model.fresh();
  work.comparison = { priority: 'urgent', prediction: 'send', outcome: { sent: true } };
  const html = model.report(work, engine);
  assert.match(html, /Опыт пока не выполнен/);
  assert.doesNotMatch(html, /Срок первого ответа изменился с 24 до 4 часов/);
});

test('report safely escapes arbitrary participant text in every free-text field', () => {
  const work = filledWork();
  const text = '</p><script>alert("x")</script><img src=x onerror=alert(1)>&';
  for (const field of ['author', 'goal', 'callExplanation', 'goalExplanation']) work[field] = text;
  const html = model.report(work, engine);
  assert.doesNotMatch(html, /<script|<img|<\/p><script/);
  assert.equal(html.split(model.escape(text)).length - 1, 4);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
});
