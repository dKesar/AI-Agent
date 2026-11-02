// Пересобрать браузерный bundle без внешних пакетов. Node.js 20+.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async name=>(await fs.readFile(path.join(root,'site',name),'utf8')).replace(/\r\n/g,'\n');
const engine=(await read('engine.mjs')).replace(/^export /gm,'');
const data=(await read('source-data.mjs')).replace(/^export /gm,'');
const app=(await read('app.mjs')).replace(/^import .*;\n/gm,'');
const bundle=`(()=>{\nconst engine=(()=>{${engine}\nreturn {simulate,validatePolicies,validatePacket,matchesExpectation,STATUSES,TOOLS,VERSION};})();\nconst {simulate,validatePolicies,validatePacket,matchesExpectation,STATUSES,TOOLS,VERSION}=engine;\n${data}\n${app}\n})();\n`;
await fs.writeFile(path.join(root,'site/app.js'),bundle);
console.log('site/app.js rebuilt.');

// Both entry points open the same current course. Legacy UI stays explicit.
const entry=(await fs.readFile(path.join(root,'index.html'),'utf8')).replace(/href="site\//g,'href="./').replace('</head>','<script defer src="./entry.js"></script></head>');
await fs.writeFile(path.join(root,'site/index.html'),entry);
