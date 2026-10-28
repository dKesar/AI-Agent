// Автономная пробная версия: открывается без сервера и установки пакетов.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async name=>(await fs.readFile(path.join(root,'site',name),'utf8')).replace(/\r\n/g,'\n');
const engine=(await read('engine.mjs')).replace(/^export /gm,'');
const data=(await read('source-data.mjs')).replace(/^export /gm,'');
const app=(await read('prototype.mjs')).replace(/^import .*;\n/gm,'');
await fs.writeFile(path.join(root,'site/prototype.js'),`(()=>{\n${engine}\n${data}\n${app}\n})();\n`);
console.log('site/prototype.js rebuilt.');
