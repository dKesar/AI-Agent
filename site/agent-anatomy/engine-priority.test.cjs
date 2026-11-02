'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runScenario } = require('./engine.js');

test('normal priority remains the default and changes no existing result', () => {
  assert.deepEqual(runScenario('normal'), runScenario('normal', { priority: 'normal' }));
});

test('urgency changes the response deadline, not the rule, tools or actual task', () => {
  const ordinary = runScenario('normal');
  const urgent = runScenario('normal', { priority: 'urgent' });
  assert.equal(urgent.task, ordinary.task);
  assert.equal(urgent.state.policy, 'IT-01');
  assert.deepEqual(urgent.cycles.map(c => c.tool), ['search_policy', 'get_sla', 'prepare_draft']);
  assert.equal(urgent.cycles[1].proposal.args.priority, 'urgent');
  assert.equal(urgent.state.responseHours, 4);
  assert.equal(urgent.status, 'awaiting_review');
  assert.equal(urgent.sent, false);
  assert.match(urgent.cycles[1].observation.description, /Первый ответ.*4 часов/);
  assert.match(urgent.cycles[1].observation.description, /Срок решения вопроса здесь не задан/);
  assert.match(urgent.state.draft, /Срок первого ответа: 4 часа/);
  assert.match(urgent.state.draft, /IT-01/);
});

test('urgent deadline becomes available only after the deadline tool executes', () => {
  const urgent = runScenario('normal', { priority: 'urgent' });
  assert.equal(urgent.cycles[0].before.responseHours, null);
  assert.equal(urgent.cycles[0].after.responseHours, null);
  assert.equal(urgent.cycles[1].before.responseHours, null);
  assert.equal(urgent.cycles[1].after.responseHours, 4);
  assert.equal(urgent.cycles[2].before.responseHours, 4);
  assert.equal(urgent.cycles[2].after.responseHours, 4);
  assert.equal(urgent.cycles[1].after.draft, null);
  assert.match(urgent.cycles[2].after.draft, /4 часа/);
  assert.equal(Object.isFrozen(urgent.cycles[1].after), true);
  const ordinary = runScenario('normal');
  assert.equal(ordinary.state.responseHours, 24, 'an urgent run must not mutate the default run');
});

test('invalid priority is rejected without silently choosing a deadline', () => {
  for (const priority of ['emergency', '', null, 1, {}]) {
    assert.throws(() => runScenario('normal', { priority }), /priority/);
  }
});
