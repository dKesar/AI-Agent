'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function viewer({hash='',denyHistory=false,fullscreen=false,adapted=true}={}){
 const elements=new Map(),events={},history=[];
 for(const id of ['lecture-slide','lecture-closing','lecture-number','slide-back','slide-forward','slide-error','presenter','fullscreen','viewer-status','slide-count']){
  const listeners={},attrs={src:'./assets/slides/slide-1.png'};
  const node={id,listeners,hidden:['lecture-closing','slide-error','fullscreen'].includes(id),disabled:false,textContent:'',value:'',complete:false,naturalWidth:0,children:[],getAttribute:key=>attrs[key],append(...items){this.children.push(...items);},replaceChildren(...items){this.children=[...items];},addEventListener(key,fn){listeners[key]=fn;}};
  Object.defineProperty(node,'src',{get:()=>attrs.src,set:value=>attrs.src=value});elements.set(id,node);
 }
 const document={title:'',fullscreenEnabled:fullscreen,fullscreenElement:null,getElementById:id=>elements.get(id),createElement:()=>({children:[],append(...items){this.children.push(...items);}}),addEventListener:(key,fn)=>events[key]=fn,exitFullscreen:async()=>{document.fullscreenElement=null;}};
 elements.get('presenter').requestFullscreen=async()=>{document.fullscreenElement=elements.get('presenter');};
 const context=vm.createContext({document,location:{hash},history:{replaceState(_state,_title,value){if(denyHistory)throw Error('File history blocked');history.push(value);}},window:{addEventListener:(key,fn)=>events[key]=fn}});
 if(adapted)vm.runInContext(fs.readFileSync(path.join(__dirname,'lecture-chapter.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'lecture.js'),'utf8'),context);
 return {elements,events,context,history,click:id=>elements.get(id).listeners.click(),key(key,inSelect=false){const event={key,preventDefault(){this.prevented=true;},target:{closest:()=>inSelect?{}:null}};events.keydown(event);return event;}};
}
test('lecture navigation handles all slides, boundaries, direct links and dropdown selection',()=>{
 const app=viewer();assert.equal(app.elements.get('lecture-number').children.length,41);assert.equal(app.elements.get('slide-back').disabled,true);app.click('slide-forward');assert.match(app.elements.get('lecture-slide').src,/slide-2.png$/);app.key('End');assert.equal(app.elements.get('slide-forward').disabled,true);assert.match(app.context.document.title,/41 из 41/);app.key('Home');assert.match(app.elements.get('lecture-slide').src,/slide-1.png$/);
 const select=app.elements.get('lecture-number');select.value='17';select.listeners.change();assert.match(app.elements.get('lecture-slide').src,/slide-17.png$/);assert.equal(viewer({hash:'#slide-999'}).elements.get('slide-forward').disabled,true);
});
test('keyboard selection in a dropdown is not intercepted by slide shortcuts',()=>{
 const app=viewer({hash:'#slide-7'});const event=app.key('ArrowLeft',true);assert.equal(event.prevented,undefined);assert.match(app.elements.get('lecture-slide').src,/slide-7.png$/);
});
test('file-mode history restrictions do not break slide buttons',()=>{
 const app=viewer({denyHistory:true});assert.doesNotThrow(()=>app.click('slide-forward'));assert.match(app.elements.get('lecture-slide').src,/slide-2.png$/);assert.equal(app.context.location.hash,'slide-2');
});
test('missing images show a recovery message and it clears when another slide loads',()=>{
 const app=viewer(),image=app.elements.get('lecture-slide'),error=app.elements.get('slide-error');image.listeners.error();assert.equal(error.hidden,false);app.click('slide-forward');assert.equal(error.hidden,true);image.listeners.load();assert.equal(error.hidden,true);
});
test('unsupported fullscreen is hidden and rejected fullscreen gives an explicit explanation',async()=>{
 assert.equal(viewer().elements.get('fullscreen').hidden,true);const app=viewer({fullscreen:true});assert.equal(app.elements.get('fullscreen').hidden,false);app.elements.get('presenter').requestFullscreen=async()=>{throw Error('Denied');};await app.click('fullscreen');assert.match(app.elements.get('viewer-status').textContent,/не разрешил полный экран/);
});
test('old lecture and practice bookmarks resolve to current pages',()=>{
 const source=fs.readFileSync(path.join(__dirname,'entry.js'),'utf8');for(const [hash,expected] of [['#lecture','./lecture.html'],['#practice','./agent-anatomy/index.html'],['#teacher','./agent-anatomy/guide.html'],['',null]]){let target=null;vm.runInNewContext(source,{location:{hash,replace:value=>target=value}});assert.equal(target,expected);}
});

test('the current closing chapter replaces legacy practice instructions and keeps source images accessible',()=>{
 const app=viewer({hash:'#slide-35'}),image=app.elements.get('lecture-slide'),closing=app.elements.get('lecture-closing');assert.equal(image.hidden,true);assert.equal(closing.hidden,false);assert.match(closing.children[1].textContent,/Самостоятельная практика/);assert.equal(closing.children.find(child=>child.children?.length===4).children.length,4);
 app.key('End');assert.match(closing.children[1].textContent,/Один отчёт/);app.key('Home');assert.equal(image.hidden,false);assert.equal(closing.hidden,true);assert.match(image.src,/slide-1.png$/);
});
