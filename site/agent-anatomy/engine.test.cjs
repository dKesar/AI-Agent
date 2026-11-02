'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { runScenario, runMeeting, MODE } = require('./engine.js');

test('normal: observations build state before the next proposal', () => {
  const run = runScenario('normal');
  assert.equal(run.mode, 'scripted-simulation');
  assert.equal(run.status, 'awaiting_review');
  assert.deepEqual(run.cycles.map(c => c.tool), ['search_policy', 'get_sla', 'prepare_draft']);
  const [search, hours, draft] = run.cycles;
  assert.equal(search.before.policy, null);
  assert.equal(search.after.policy, 'IT-01');
  assert.equal(search.after.responseHours, null);
  assert.equal(hours.before.policy, 'IT-01');
  assert.equal(hours.after.responseHours, 24);
  assert.equal(hours.after.draft, null);
  assert.match(draft.after.draft, /IT-01/);
  assert.equal(run.sent, false);
  for (const cycle of run.cycles) {
    assert.equal(cycle.check.allowed, true);
    assert.equal(typeof cycle.execution.description, 'string');
    assert.equal(typeof cycle.observation.description, 'string');
  }
});

test('observations and earlier state snapshots cannot be rewritten', () => {
  const run = runScenario('normal');
  assert.throws(() => { run.cycles[0].after.policy = 'FORGED'; }, TypeError);
  assert.throws(() => { run.cycles[1].proposal.args.priority = 'urgent'; }, TypeError);
  assert.throws(() => { run.cycles[0].after.matches.push('FORGED'); }, TypeError);
  assert.notEqual(run.cycles[0].after, run.cycles[1].before);
  assert.deepEqual(run.cycles[0].after, run.cycles[1].before);
  assert.equal(runScenario('normal').state.responseHours, 24);
});

test('missing rule and unavailable tool are distinct outcomes with distinct evidence', () => {
  const missing = runScenario('missing');
  const unavailable = runScenario('unavailable');
  assert.equal(missing.status, 'needs_human');
  assert.equal(unavailable.status, 'needs_human');
  assert.deepEqual(missing.state.matches, []);
  assert.equal(unavailable.state.matches, null);
  assert.equal(missing.state.lastError, null);
  assert.equal(unavailable.state.lastError, 'search_unavailable');
  assert.equal(unavailable.state.searchErrors, 2);
  assert.equal(unavailable.cycles.filter(c => c.tool === 'search_policy').length, 2);
  assert.equal(missing.state.stopReason, 'no_matching_policy');
  assert.equal(unavailable.state.stopReason, 'search_unavailable');
  assert.equal(missing.state.draft, null);
  assert.equal(unavailable.state.draft, null);
});

test('a second matching policy causes clarification rather than a guessed answer', () => {
  const run = runScenario('ambiguous');
  assert.equal(run.status, 'needs_input');
  assert.deepEqual(run.state.matches, ['IT-01', 'IT-02']);
  assert.equal(run.state.policy, null);
  assert.equal(run.state.draft, null);
  assert.equal(run.cycles[1].tool, 'request_clarification');
  assert.match(run.state.clarification, /установить редактор.*восстановить доступ/);
});

test('forbidden proposal is visible but never executed or sent', () => {
  const run = runScenario('forbidden');
  const rejected = run.cycles.at(-1);
  assert.equal(run.status, 'blocked');
  assert.equal(rejected.tool, 'send_email');
  assert.equal(rejected.check.allowed, false);
  assert.equal(rejected.check.reason, 'tool_not_allowed');
  assert.equal(rejected.execution, null);
  assert.equal(rejected.before.draft, rejected.after.draft);
  assert.ok(rejected.before.draft);
  assert.equal(run.sent, false);
  assert.equal(run.state.sent, false);
  assert.equal(run.state.stopReason, 'tool_not_allowed');
});

test('budget stops before the next tool; searching is not a completed draft', () => {
  const one = runScenario('limit');
  assert.equal(one.cycles.length, 1);
  assert.equal(one.status, 'step_limit');
  assert.equal(one.state.policy, 'IT-01');
  assert.equal(one.state.responseHours, null);
  assert.equal(one.state.draft, null);
  const two = runScenario('normal', { maxSteps: 2 });
  assert.equal(two.status, 'step_limit');
  assert.equal(two.state.responseHours, 24);
  assert.equal(two.state.draft, null);
  assert.equal(runScenario('limit', { maxSteps: 3 }).status, 'awaiting_review');
});

test('meeting transfers the mechanism to another task without pretending to book a room', () => {
  const incomplete = runScenario('meeting');
  assert.equal(incomplete.status, 'needs_input');
  assert.equal(incomplete.cycles.length, 1);
  assert.equal(incomplete.cycles[0].tool, 'request_clarification');
  assert.equal(incomplete.state.room, null);
  const complete = runScenario('meeting', { taskComplete: true });
  assert.deepEqual(complete.cycles.map(c => c.tool), ['search_rooms', 'prepare_booking_draft']);
  assert.equal(complete.status, 'awaiting_review');
  assert.equal(complete.state.room, 'Переговорная № 2');
  assert.match(complete.state.draft, /проверьте данные/);
  assert.equal(complete.sent, false);
});

test('invalid parameters fail explicitly', () => {
  assert.throws(() => runScenario('unknown'), TypeError);
  for (const maxSteps of [0, -1, 2.5, 21, '1', Infinity]) {
    assert.throws(() => runScenario('normal', { maxSteps }), RangeError);
  }
  assert.throws(() => runScenario('normal', null), TypeError);
  assert.throws(() => runScenario('meeting', { taskComplete: 'yes' }), TypeError);
});

test('meeting compares capacity, projector and availability before preparing a draft', () => {
  const run = runMeeting();
  assert.equal(run.criteria.people, 6);
  assert.equal(run.criteria.date, '2026-10-29');
  assert.equal(run.status, 'awaiting_review');
  assert.equal(run.cycles[0].after.room, null, 'search returns data rather than claiming a booking');
  assert.equal(run.cycles[0].after.rooms.length, 3);
  assert.equal(run.cycles[1].proposal.args.room_id, 'ROOM-B');
  assert.equal(run.state.selectedRoomId, 'ROOM-B');
  const room = run.state.rooms.find(candidate => candidate.id === run.state.selectedRoomId);
  assert.ok(room.free && room.capacity >= 6 && room.projector);
  assert.equal(run.booked, false);
  assert.equal(run.state.booked, false);
  assert.equal(run.sent, false);
});

test('meeting stops if no room satisfies all requirements; a partial match is not success', () => {
  const run = runMeeting({ equipmentAvailable: false });
  assert.equal(run.status, 'needs_human');
  assert.equal(run.state.draft, null);
  assert.equal(run.state.room, null);
  assert.equal(run.state.stopReason, 'no_compatible_room');
  assert.deepEqual(run.cycles.map(c => c.tool), ['search_rooms', 'escalate_to_human']);
  assert.equal(run.state.rooms[0].free, true, 'some rooms are still free');
  assert.equal(run.state.rooms[0].projector, true, 'one free room still has a projector');
  assert.equal(run.state.rooms[0].capacity, 4, 'but it cannot fit all participants');
  assert.equal(run.state.rooms[1].capacity, 8, 'another room fits participants');
  assert.equal(run.state.rooms[1].projector, false, 'but lacks required equipment');
  assert.equal(run.booked, false);
  assert.throws(() => runMeeting({ equipmentAvailable: 'yes' }), TypeError);
});

test('meeting executes only selected tools; allowing search does not allow drafting', () => {
  const run = runMeeting({ allowedTools: ['search_rooms'] });
  assert.equal(run.status, 'blocked');
  assert.deepEqual(run.allowedTools, ['search_rooms']);
  assert.equal(run.cycles.length, 2);
  assert.equal(run.cycles[0].tool, 'search_rooms');
  assert.equal(run.cycles[0].check.allowed, true);
  assert.ok(run.cycles[0].execution);
  const rejected = run.cycles[1];
  assert.equal(rejected.tool, 'prepare_booking_draft');
  assert.equal(rejected.check.allowed, false);
  assert.equal(rejected.execution, null);
  assert.equal(rejected.before.draft, null);
  assert.equal(rejected.after.draft, null);
  assert.equal(run.state.draft, null);
  assert.equal(run.state.room, null);
  assert.equal(run.booked, false);
  assert.equal(run.sent, false);
});

test('meeting checks search and handoff permissions before either execution', () => {
  const noSearch = runMeeting({ allowedTools: [] });
  assert.equal(noSearch.status, 'blocked');
  assert.equal(noSearch.cycles.length, 1);
  assert.equal(noSearch.cycles[0].execution, null);
  assert.equal(noSearch.state.rooms, null);
  const noHandoff = runMeeting({ equipmentAvailable: false, allowedTools: ['search_rooms', 'prepare_booking_draft'] });
  assert.equal(noHandoff.status, 'blocked');
  assert.equal(noHandoff.cycles.at(-1).tool, 'escalate_to_human');
  assert.equal(noHandoff.cycles.at(-1).execution, null);
  assert.equal(noHandoff.state.stopReason, 'tool_not_allowed');
  assert.throws(() => runMeeting({ allowedTools: ['send_email'] }), TypeError);
  assert.throws(() => runMeeting({ allowedTools: ['search_rooms', 'search_rooms'] }), TypeError);
  assert.throws(() => runMeeting({ allowedTools: 'search_rooms' }), TypeError);
});

test('browser build executes with only an isolated global, no network or document APIs', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8'), context);
  assert.equal(context.AnatomyLab.MODE, MODE);
  const normal = context.AnatomyLab.runScenario('normal');
  assert.equal(normal.status, 'awaiting_review');
  assert.equal(normal.sent, false);
  assert.equal(context.AnatomyLab.runScenario('forbidden').cycles.at(-1).execution, null);
  // A clean sandbox has no fetch, filesystem, document or other side-effect API.
  assert.equal(context.fetch, undefined);
  assert.equal(context.document, undefined);
});
