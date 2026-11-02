// Run the actual test files without depending on shell wildcard expansion.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folders=['site','site/agent-anatomy'];
const groups=await Promise.all(folders.map(async folder=>(await fs.readdir(path.join(root,folder))).filter(name=>name.endsWith('.test.cjs')).map(name=>path.join(root,folder,name))));
const files=groups.flat().sort();
if(!files.length)throw Error('No browser test files found.');
const result=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit'});
if(result.error)console.error(result.error.message);
process.exitCode=result.status??1;
