import { readFileSync } from 'node:fs';
const parsed = JSON.parse(readFileSync('jigyo-content.json','utf8'));
const walk=(n)=>{ if(!n||typeof n!=='object')return;
  if(n.type==='pageTable'){ console.log('\n===== pageTable ====='); console.log(JSON.stringify(n.attrs,null,1).slice(0,2500)); }
  if(n.type==='pageDescTable'){ console.log('\n===== pageDescTable ====='); console.log(JSON.stringify(n.attrs,null,1)); }
  (n.content||[]).forEach(walk);
};
if(parsed.type==='doc') walk(parsed); else if(Array.isArray(parsed.chapters)) parsed.chapters.forEach(ch=>walk(typeof ch.content==='string'?JSON.parse(ch.content):ch.content));
