/* ตัวทดสอบที่เก็บใบแจ้งซ่อม (หนึ่งใบ = หนึ่งช่อง)
   รันด้วย:  node docs/order-store.test.mjs
   ไม่มี dependency ใดๆ และ "ดึงโค้ดจริงจาก index.html สดทุกครั้งที่รัน" ไม่ได้ก๊อปโค้ดมาวางซ้ำ
   ถ้าใครแก้ index.html จนตรรกะเพี้ยน ตัวทดสอบนี้จะจับได้ทันที ไม่ใช่ไปรู้ตอนโรงงานใช้งานไม่ได้

   ทำไมต้องมี: เหตุการณ์ 14 ก.ย. 2569 (ทั้งระบบส่งใบ/อนุมัติ/มอบหมายงานไม่ได้พร้อมกัน เพราะใบแจ้งซ่อม
   ทุกใบถูกเก็บรวมในช่องเดียวของ Google Sheet ที่รับได้ 50,000 ตัวอักษร) เกิดจากข้อจำกัดที่ไม่มีใคร
   ทดสอบไว้เลย การแก้ครั้งนั้นจึงมาพร้อมตัวทดสอบนี้ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
// ดึงเฉพาะช่วงที่เกี่ยวข้องออกมาจาก index.html โดยใช้บรรทัดหลักเป็นหมุด
function slice(fromMarker, toMarker){
  const a = html.indexOf(fromMarker), b = html.indexOf(toMarker);
  if(a < 0 || b < 0 || b <= a) throw new Error('หาโค้ดใน index.html ไม่เจอ — หมุดเปลี่ยนไปแล้วหรือ? ' + fromMarker);
  return html.slice(a, b);
}
const src = [
  slice("const ORDER_INDEX_KEY = 'orderIndex';", '/* โหลดเฉพาะข้อมูลที่จำเป็นต่อการใช้งานหน้าแรก'),
  slice('const STORE_FAIL_GENERIC', '/* เดิมฟังก์ชันนี้ดูแค่รหัส HTTP'),
  slice('let orderMigrationTried = false;', '/* ก้อนข้อมูลใหญ่/โตเรื่อยๆ'),
].join('\n')
 // ในไฟล์จริง lastStoreSetError เป็นตัวแปรระดับโมดูลที่ storeSet เขียน — ในการทดสอบผูกเข้ากับ err.v แทน
 .replace(/lastStoreSetError/g, 'err.v');

// ===== ชีตจำลอง: คีย์ -> ค่า พร้อมเพดานช่องเหมือน Google Sheets =====
const CELL_LIMIT = 48000;
let KV = new Map();
let getCalls = 0, setCalls = 0;
async function storeGet(k){ getCalls++; if(!KV.has(k)) return null; return JSON.parse(KV.get(k)); }
async function storeSet(k,v){
  setCalls++; err.v='';
  const s = JSON.stringify(v);
  if(s.length > CELL_LIMIT){ err.v='too-large'; return false; }
  KV.set(k,s); return true;
}
const state = { orders: [] };

const err = { v: '' };
const fn = new Function('storeGet','storeSet','state','console','err',
  src + `
  return { loadOrdersFromStore, loadOrdersDelta, migrateOrdersToPerKey, saveOrdersDiff,
           loadOrdersOnce, pollOrders, storeFailMsg, orderKey, clearOrdersStore, ORDER_INDEX_KEY };`);
const api = fn(storeGet, storeSet, state, console, err);

let pass=0, fail=0;
function ok(name, cond, extra){ if(cond){pass++; console.log('  ✓',name);} else {fail++; console.log('  ✗',name, extra??'');} }

function mkOrder(i, histN=11){
  const o = { id:'id-'+i, docNumber:'ST-'+i, status:'PENDING_FM',
    department:'คลังสินค้า', machineCode:'WH-FORK-005', machineName:'รถโฟล์คลิฟท์ไฟฟ้า TOYOTA 8FBN20',
    cause:'ยกงาไม่ขึ้น มีเสียงดังผิดปกติจากปั๊มไฮดรอลิก และมีน้ำมันรั่วซึมบริเวณกระบอกยก',
    approvals:{fm:{status:'approved',by:'สมชาย ยุทธไพศาล',at:new Date().toISOString(),note:'อนุมัติ ให้ดำเนินการซ่อมโดยเร็ว'},
               gm:{status:'approved',by:'วิชัย ธนบดีพาณิชย์',at:new Date().toISOString(),note:'อนุมัติงบประมาณตามที่เสนอ'}},
    assignment:{technicians:['เรืองฤทธิ์ พัดเจริญ (ช่างไฟฟ้า)','ณัฐพงษ์ ศรีสุวรรณ (ช่างกล)'],assignedBy:'อนุชา บำรุงทรัพย์',
                assignedAt:new Date().toISOString(),startDate:'2026-09-14',endDate:'2026-09-16',executionPlan:'ORDER_PARTS',receivedByName:'อนุชา บำรุงทรัพย์'},
    maintRecord:{causeAnalysis:'ซีลกระบอกไฮดรอลิกเสื่อมสภาพจากการใช้งานต่อเนื่อง ทำให้แรงดันตก ยกงาไม่ขึ้น',inspectorOpinion:'REPAIR',
      parts:[{name:'ชุดซีลกระบอกไฮดรอลิก',qty:'1',unit:'ชุด',price:'2500'},{name:'น้ำมันไฮดรอลิก ISO VG46',qty:'20',unit:'ลิตร',price:'1800'}],
      updatedBy:'เรืองฤทธิ์ พัดเจริญ',updatedAt:new Date().toISOString()},
    statusHistory: Array.from({length:histN},(_,n)=>({status:'X',at:new Date().toISOString(),
      note:'รับใบแจ้งซ่อมโดย อนุชา บำรุงทรัพย์ — มอบหมายงานให้ เรืองฤทธิ์ พัดเจริญ (ช่างไฟฟ้า) (กำหนดงาน 14 ก.ย. 2569 - 16 ก.ย. 2569) — การดำเนินงาน: ต้องการสั่งซื้ออุปกรณ์ ครั้งที่ '+n})) };
  return o;
}

console.log('\n[1] ย้ายระบบจากคีย์ orders เดิม (ก้อนที่ล้นช่องไปแล้ว)');
{
  KV = new Map();
  const legacy = Array.from({length:20},(_,i)=>mkOrder(i));
  const blob = JSON.stringify(legacy);
  ok('ก้อนเดิมล้นเพดานจริง ('+blob.length+' > '+CELL_LIMIT+')', blob.length > CELL_LIMIT);
  KV.set('orders', blob);                       // ใส่ตรงๆ เลียนแบบข้อมูลที่ค้างอยู่บนชีต
  ok('เขียนคีย์ orders ไม่ได้แล้วจริง', (await storeSet('orders', legacy)) === false);
  KV.set('orders', blob);
  const list = await api.loadOrdersOnce();
  ok('ย้ายแล้วได้ใบครบ 20 ใบ', Array.isArray(list) && list.length===20, list && list.length);
  ok('มีดัชนี orderIndex', KV.has('orderIndex'));
  ok('มีช่องของแต่ละใบครบ', legacy.every(o=>KV.has('order:'+o.id)));
  ok('คีย์ orders เดิมไม่ถูกแตะ (เป็นข้อมูลสำรอง)', KV.get('orders')===blob);
  // ไม่นับคีย์ 'orders' เดิมที่จงใจใส่ให้ล้นไว้เป็นข้อมูลตั้งต้นของการทดสอบ
  ok('ทุกช่องของที่เก็บใหม่อยู่ใต้เพดาน', [...KV.entries()].filter(([k])=>k!=='orders').every(([k,v])=>v.length<=CELL_LIMIT));
}

console.log('\n[2] อ่านกลับจากที่เก็บใหม่');
{
  const list = await api.loadOrdersFromStore();
  ok('อ่านได้ 20 ใบ', list && list.length===20, list&&list.length);
  state.orders = list;
}

console.log('\n[3] เขียนเฉพาะใบที่เปลี่ยน');
{
  setCalls=0;
  state.orders[5].status='PENDING_GM';
  const okw = await api.saveOrdersDiff(state.orders);
  ok('บันทึกสำเร็จ', okw===true);
  ok('ยิงเขียนแค่ 2 ครั้ง (ตัวใบ+ดัชนี) ไม่ใช่ 20', setCalls===2, setCalls);
  ok('ค่าบนชีตเปลี่ยนจริง', JSON.parse(KV.get('order:id-5')).status==='PENDING_GM');
}

console.log('\n[4] ไม่มีอะไรเปลี่ยน = ไม่ยิงคำขอเลย');
{
  setCalls=0;
  const okw = await api.saveOrdersDiff(state.orders);
  ok('คืน true', okw===true);
  ok('ไม่ยิงเขียนเลย', setCalls===0, setCalls);
}

console.log('\n[5] เพิ่มใบใหม่ (เคสที่พังอยู่ตอนนี้)');
{
  const before = state.orders.length;
  const fresh = mkOrder(999);
  const next = [fresh, ...state.orders];
  const okw = await api.saveOrdersDiff(next);
  ok('ส่งใบใหม่สำเร็จ', okw===true);
  state.orders = next;
  const reread = await api.loadOrdersFromStore();
  ok('อ่านกลับได้ '+(before+1)+' ใบ', reread.length===before+1, reread.length);
  ok('ใบใหม่อยู่หัวรายการ', reread[0].id==='id-999');
}

console.log('\n[6] ขยายถึง 300 ใบ — เพดานเดิมคือ ~12 ใบ');
{
  KV=new Map(); state.orders=[];
  const big = Array.from({length:300},(_,i)=>mkOrder(i));
  ok('ก้อนเดียวจะใหญ่ '+JSON.stringify(big).length+' = ล้นแน่นอน', JSON.stringify(big).length>CELL_LIMIT);
  const okm = await api.migrateOrdersToPerKey(big);
  ok('เก็บแบบใบละช่องสำเร็จ 300 ใบ', okm===true);
  const reread = await api.loadOrdersFromStore();
  ok('อ่านกลับครบ 300 ใบ', reread.length===300, reread&&reread.length);
  ok('ทุกช่องยังอยู่ใต้เพดาน', [...KV.values()].every(v=>v.length<=CELL_LIMIT));
  console.log('    ดัชนี orderIndex ใช้', KV.get('orderIndex').length, 'ตัวอักษร ที่ 300 ใบ');
  state.orders = reread;
}

console.log('\n[7] รอบ poll ดึงเฉพาะใบที่เปลี่ยน');
{
  getCalls=0;
  let r = await api.pollOrders();
  ok('ไม่มีอะไรเปลี่ยน = ยิงอ่านแค่ 1 ครั้ง (ดัชนี)', getCalls===1, getCalls);
  ok('ได้ครบ 300 ใบ', r.length===300, r&&r.length);
  // จำลองอีกเครื่องหนึ่งแก้ใบเดียว
  const other = JSON.parse(KV.get('order:id-7')); other.status='DONE';
  KV.set('order:id-7', JSON.stringify(other));
  const idx = JSON.parse(KV.get('orderIndex'));
  idx.find(e=>e.i==='id-7').r = 'changed1';
  KV.set('orderIndex', JSON.stringify(idx));
  getCalls=0;
  r = await api.pollOrders();
  ok('มี 1 ใบเปลี่ยน = ยิงอ่าน 2 ครั้ง', getCalls===2, getCalls);
  ok('เห็นสถานะใหม่', r.find(o=>o.id==='id-7').status==='DONE');
  ok('ใบอื่นยังอยู่ครบ', r.length===300, r.length);
}

console.log('\n[8] สองคนแก้คนละใบพร้อมกัน ต้องไม่ทับกัน (บั๊กเดิม)');
{
  KV=new Map();
  const base = Array.from({length:5},(_,i)=>mkOrder(i));
  await api.migrateOrdersToPerKey(base);
  const A = await api.loadOrdersFromStore();
  state.orders = A;
  // เครื่อง B แก้ใบ 0 ตรงไปที่ชีต (เลียนแบบอีกคนที่กดพร้อมกัน)
  const b0 = JSON.parse(KV.get('order:id-0')); b0.status='APPROVED_BY_B';
  KV.set('order:id-0', JSON.stringify(b0));
  // เครื่อง A แก้ใบ 3 แล้วบันทึกด้วยสำเนาที่ยังไม่เห็นงานของ B
  A[3].status='ASSIGNED_BY_A';
  await api.saveOrdersDiff(A);
  ok('งานของ A อยู่', JSON.parse(KV.get('order:id-3')).status==='ASSIGNED_BY_A');
  ok('งานของ B ไม่ถูกทับ', JSON.parse(KV.get('order:id-0')).status==='APPROVED_BY_B',
     JSON.parse(KV.get('order:id-0')).status);
}

console.log('\n[9] ใบเดี่ยวที่ยาวเกินเพดาน = ล้มเฉพาะใบนั้น');
{
  KV=new Map(); state.orders=[];
  const small = [mkOrder(1), mkOrder(2)];
  await api.migrateOrdersToPerKey(small);
  state.orders = await api.loadOrdersFromStore();
  state.orders[0].cause = 'x'.repeat(60000);
  const okw = await api.saveOrdersDiff(state.orders);
  ok('รายงานว่าล้มเหลว ไม่ใช่แกล้งว่าสำเร็จ', okw===false);
  ok('ใบอื่นไม่เสียหาย', KV.has('order:id-2'));
}

console.log('\n[10] ข้อความแจ้งผู้ใช้ต้องไม่เถียงกันเอง');
{
  err.v='too-large';
  const m = api.storeFailMsg('มอบหมายงานไม่สำเร็จ (เชื่อมต่อฐานข้อมูลไม่ได้) กรุณาลองใหม่อีกครั้ง');
  console.log('    →', m);
  ok('ไม่มีคำว่า "กรุณาลองใหม่" ปนกับ "กดใหม่ไม่ช่วย"', !m.includes('กรุณาลองใหม่อีกครั้ง'));
  ok('ไม่อ้างว่าเชื่อมต่อไม่ได้', !m.includes('เชื่อมต่อฐานข้อมูลไม่ได้'));
  ok('ยังบอกว่าทำอะไรไม่สำเร็จ', m.startsWith('มอบหมายงานไม่สำเร็จ'));
  ok('บอกว่ากดใหม่ไม่ช่วย', m.includes('กดใหม่ไม่ช่วย'));
  err.v='network';
  const n = api.storeFailMsg('มอบหมายงานไม่สำเร็จ (เชื่อมต่อฐานข้อมูลไม่ได้) กรุณาลองใหม่อีกครั้ง');
  ok('เน็ตหลุดยังบอกให้ลองใหม่ตามเดิม', n.includes('กรุณาลองใหม่อีกครั้ง') && n.includes('เชื่อมต่อฐานข้อมูลไม่ได้'));
}


console.log('\n[11] ปุ่มล้างข้อมูล ต้องล้างจริงแม้กดตอนยังโหลดใบไม่เสร็จ');
{
  KV=new Map(); state.orders=[];
  await api.migrateOrdersToPerKey(Array.from({length:6},(_,i)=>mkOrder(i)));
  // เลียนแบบ "เพิ่งเปิดแอป ยังไม่ได้โหลดใบ" — สมุดบัญชีในเครื่องว่างเปล่า
  const fresh = fn(storeGet, storeSet, state, console, err);
  const cleared = await fresh.clearOrdersStore();
  ok('ล้างสำเร็จ', cleared===true);
  ok('ดัชนีว่างจริง', JSON.parse(KV.get('orderIndex')).length===0);
  const after = await fresh.loadOrdersFromStore();
  ok('อ่านกลับได้ 0 ใบ', Array.isArray(after) && after.length===0, after&&after.length);
}

console.log('\n[12] ย้ายไม่สำเร็จเพราะเน็ตกระตุก ต้องลองใหม่รอบหน้า');
{
  KV=new Map();
  const legacy = Array.from({length:5},(_,i)=>mkOrder(i));
  KV.set('orders', JSON.stringify(legacy));
  // รอบแรก: ทำให้การเขียนพลาดแบบ "เน็ตกระตุก" ทุกคีย์ที่ขึ้นต้นด้วย order
  let blocked = true;
  const flaky = async (k,v)=>{ if(blocked && k.startsWith('order')){ err.v='network'; return false; } return storeSet(k,v); };
  const iso2 = fn(storeGet, flaky, state, console, err);
  let r = await iso2.loadOrdersOnce();
  ok('ยังอ่านใบเดิมได้ทั้ง 5 ใบ แม้ย้ายไม่สำเร็จ', r.length===5, r&&r.length);
  ok('ยังไม่มีดัชนี', !KV.has('orderIndex'));
  blocked = false;
  r = await iso2.loadOrdersOnce();
  ok('รอบถัดไปย้ายสำเร็จเอง ไม่ต้องรีเฟรช', KV.has('orderIndex'));
  ok('ได้ใบครบ 5 ใบ', r.length===5, r&&r.length);
}


console.log('\n[13] เอกสารต้องไม่อ้างถึงไฟล์ที่ไม่มีอยู่จริง');
{
  /* เคยพลาดมาแล้วสองรอบ: Claude.MD อ้างหัวข้อ "Apps Script projects" ที่ไม่เคยมีอยู่จริง
     แล้วต่อมาก็อ้าง docs/main-api.gs ตั้งแต่ก่อนที่ไฟล์นั้นจะถูกสร้าง (กดแล้วเจอ 404)
     การ "ตั้งใจให้มากขึ้น" ไม่เคยกันเรื่องแบบนี้ได้ ต้องมีอะไรคอยจับให้ */
  const repoRoot = path.join(HERE, '..');
  const docs = fs.readdirSync(HERE).filter(f => f.endsWith('.md'))
    .map(f => path.join(HERE, f))
    .concat([path.join(repoRoot, 'Claude.MD')]);
  let missing = [];
  for(const doc of docs){
    const text = fs.readFileSync(doc, 'utf8');
    // จับ path แบบ docs/xxx.yyy ที่อยู่ใน backtick — คือรูปแบบที่ใช้อ้างไฟล์ในเอกสารชุดนี้
    for(const m of text.matchAll(/`(docs\/[A-Za-z0-9._\-]+)`/g)){
      if(!fs.existsSync(path.join(repoRoot, m[1]))) missing.push(path.basename(doc) + ' → ' + m[1]);
    }
  }
  ok('ทุก path ที่เอกสารอ้างถึงมีไฟล์อยู่จริง', missing.length===0, missing.join(', '));
}

console.log(`\n=== ผ่าน ${pass} / ล้มเหลว ${fail} ===`);
process.exit(fail?1:0);
