import assert from 'node:assert/strict';
import {simulate} from '../site/engine.mjs';
let raw='';
for await (const chunk of process.stdin) raw+=chunk;
const cases=JSON.parse(raw);
for(const c of cases) assert.deepEqual(simulate(c.task,c.policies,c.options),c.expected,c.name);
console.log(`PASS: ${cases.length} сценариев — статусы, источники, черновики и полные журналы совпали с Python.`);
