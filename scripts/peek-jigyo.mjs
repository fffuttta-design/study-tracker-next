import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';
const SA = JSON.parse(readFileSync('C:/dev/_secrets/study-tracker-sa.json','utf8'));
admin.initializeApp({ credential: admin.credential.cert(SA) });
const db = admin.firestore();
const ref = (await db.collection('users').listDocuments())[0];
const PID='01719740-2d81-45d7-9bd4-5d7c19001f17';
const snap = await ref.collection('notionPages').doc(PID).get();
console.log('exists=',snap.exists,'title=',snap.data()?.title);
const raw = snap.data().content;
console.log('contentType=',typeof raw,'len=',raw?.length);
let parsed; try{ parsed=typeof raw==='string'?JSON.parse(raw):raw; }catch(e){ console.log('PARSE FAIL',e.message); process.exit(0);}
// 全ページIDセット（参照先の生死確認用）
const all = await ref.collection('notionPages').get();
const alive = new Set(all.docs.map(d=>d.id));
console.log('総ページ',alive.size);
// ノード種の集計＋pageLink参照先
const typeCount={}; const links=[];
const walk=(n,loc)=>{ if(!n||typeof n!=='object'||!n.type)return; typeCount[n.type]=(typeCount[n.type]||0)+1;
  if(n.type==='pageLink'){ links.push({loc,attrs:n.attrs}); }
  if(n.type==='inlineDatabase'||n.type==='pageTable'||n.type==='pageDescTable'){ console.log('DBノード',n.type,'@',loc,'attrs=',JSON.stringify(n.attrs).slice(0,200)); }
  (n.content||[]).forEach((c,i)=>walk(c,loc+'/'+n.type+'['+i+']')); };
if(parsed.type==='doc') walk(parsed,'doc');
else if(Array.isArray(parsed.chapters)) parsed.chapters.forEach((ch,ci)=>{ const cd=typeof ch.content==='string'?JSON.parse(ch.content):ch.content; walk(cd,'章'+ci); });
console.log('\nノード種別:',typeCount);
console.log('\npageLink',links.length,'件 → 参照先の生死:');
links.forEach(l=>{ const a=l.attrs||{}; const id=a.pageId||a.id||a.href||a.targetId; const dead=id&&!alive.has(id); console.log(`  ${dead?'💀DEAD':'  ok '} id=${id}  title="${a.title||a.label||''}"  attrs=${JSON.stringify(a).slice(0,160)}`); });
process.exit(0);
