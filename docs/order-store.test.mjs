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
  slice('const KV_VALUE_MAX = 48000;', '/* เหตุผลของการเขียนที่ล้มเหลวครั้งล่าสุด'),
  slice('/* ===== ลดจำนวนคำขอ', '/* ===== จบส่วนลดจำนวนคำขอ'),
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
/* จำลอง "เขียนไม่ผ่าน" ได้ (เน็ตกระตุก) — ต้องมีผลกับทั้งการเขียนทีละคีย์และการเขียนเป็นชุด
   ไม่งั้นการทดสอบความทนทานจะจริงแค่กับเส้นทางเดียวแล้วเข้าใจผิดว่าครอบคลุมแล้ว */
let blockWrite = () => false;
// ลำดับคีย์ที่ถูกเขียนจริง — ใช้ตรวจกติกา "ตัวใบก่อน ดัชนีทีหลัง" ที่ห้ามสลับเด็ดขาด
let writeLog = [];
/* เวอร์ชันของ Apps Script ที่ "วางไว้จริง" ในตัวแก้ไข — 10 = วางไฟล์ใหม่แล้ว (รองรับคำขอรวม/เขียนเป็นชุด)
   9 = ยังไม่ได้วาง ฝั่งแอปต้องใช้งานได้เหมือนเดิมทุกอย่าง แค่เปลืองคำขอกว่า */
let serverVersion = 10;
const BUNDLE_MAX_ORDERS_FAKE = 200;
async function storeGet(k){ getCalls++; if(!KV.has(k)) return null; return JSON.parse(KV.get(k)); }
async function storeSet(k,v){
  setCalls++; err.v='';
  if(blockWrite(k)){ err.v='network'; return false; }
  const s = JSON.stringify(v);
  if(s.length > CELL_LIMIT){ err.v='too-large'; return false; }
  writeLog.push(k); KV.set(k,s); return true;
}
const state = { orders: [] };
const err = { v: '' };
const API_URL = 'https://script.google.com/macros/s/TEST/exec';

function jsonRes(obj){
  const text = JSON.stringify(obj);
  return { ok:true, status:200, async json(){ return JSON.parse(text); }, async text(){ return text; } };
}
/* เซิร์ฟเวอร์จำลองสำหรับเส้นทางใหม่ (คำขอรวม/เขียนเป็นชุด) — เดินบนชีตจำลองก้อนเดียวกับ storeGet/storeSet */
async function fakeFetch(url, opts){
  if(opts && opts.method === 'POST'){
    setCalls++;
    const body = JSON.parse(opts.body);
    if(!Array.isArray(body.batch)) throw new Error('เส้นทางนี้ควรถูกเรียกเฉพาะการเขียนเป็นชุดเท่านั้น');
    // ด่านสำคัญ: ฝั่งแอปต้องไม่ยิงคำขอชนิดนี้ไปหาเซิร์ฟเวอร์รุ่นเก่าเด็ดขาด เพราะ doPost รุ่นเก่า
    // จะอ่าน body.key ไม่เจอแล้วเขียนแถวขยะลงแท็บ KV
    if(serverVersion < 10) throw new Error('ยิงคำขอเขียนเป็นชุดไปหาเซิร์ฟเวอร์รุ่นเก่า — ห้ามเกิดขึ้น');
    for(const it of body.batch){
      if(blockWrite(it.key)) return jsonRes({ ok:false, error:'network' });
      if(String(it.value).length > CELL_LIMIT) return jsonRes({ ok:false, error:'too-large' });
      writeLog.push(it.key); KV.set(it.key, it.value);
    }
    return jsonRes({ ok:true, written: body.batch.length });
  }
  getCalls++;
  const u = new URL(url);
  const key = u.searchParams.get('key');
  if(key !== 'bundle') return jsonRes({ value: KV.has(key) ? KV.get(key) : null });
  // รุ่นเก่าไม่รู้จัก key=bundle จึงตอบเหมือนคีย์ที่ไม่มีค่า — ฝั่งแอปใช้จุดนี้ตรวจแล้วถอยไปวิธีเดิม
  if(serverVersion < 10) return jsonRes({ value: null });
  const out = { bundle: 10, kv: {} };
  (u.searchParams.get('keys') || '').split(',').filter(Boolean)
    .forEach(k => { out.kv[k] = KV.has(k) ? KV.get(k) : null; });
  const ord = u.searchParams.get('orders');
  if(ord){
    out.orderIndex = KV.has('orderIndex') ? KV.get('orderIndex') : null;
    let ids = ord === '*'
      ? (out.orderIndex ? JSON.parse(out.orderIndex).map(e => e.i) : [])
      : ord.split(',').filter(Boolean);
    if(ids.length > BUNDLE_MAX_ORDERS_FAKE){ ids = ids.slice(0, BUNDLE_MAX_ORDERS_FAKE); out.more = true; }
    out.orders = {};
    ids.forEach(id => { out.orders[id] = KV.has('order:'+id) ? KV.get('order:'+id) : null; });
  }
  return jsonRes(out);
}
const getUserRoles = async () => ({ roles: [], techNames: [] });

const fn = new Function('storeGet','storeSet','state','console','err','fetch','API_URL','getUserRoles',
  src + `
  return { loadOrdersFromStore, loadOrdersDelta, migrateOrdersToPerKey, saveOrdersDiff,
           loadOrdersOnce, pollOrders, storeFailMsg, orderKey, clearOrdersStore, ORDER_INDEX_KEY,
           storeSetPhases, storeSetMany, fetchOrderBodies, bundleGet, canBatchWrite,
           startBoot, storeGetBoot, bootReady };`);
const newApi = () => fn(storeGet, storeSet, state, console, err, fakeFetch, API_URL, getUserRoles);
const api = newApi();
/* ปลุกให้รู้เวอร์ชันเซิร์ฟเวอร์ก่อนเขียนครั้งแรก — ของจริงทำให้เองตั้งแต่คำขอรวมตอนเปิดแอป (startBoot)
   ถ้าไม่ปลุก การเขียนครั้งแรกของ instance จะยังไม่กล้าใช้ชุด (ปลอดภัยไว้ก่อน) ซึ่งถูกต้องแต่ไม่ใช่
   สภาพจริงที่อยากวัดในเทสต์ส่วนใหญ่ */
const primed = async (a) => { await (a || api).bundleGet({ keys: ['config'] }); return a || api; };

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
  // เดิมยิง 2 ครั้ง (ตัวใบ + ดัชนี) ตอนนี้รวมเป็นชุดเดียว = จับล็อกฝั่งเซิร์ฟเวอร์รอบเดียว
  ok('เขียนกลับด้วยคำขอเดียว ไม่ใช่ 20 (และไม่ใช่ 2)', setCalls===1, setCalls);
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
  const fresh = fn(storeGet, storeSet, state, console, err, fakeFetch, API_URL, getUserRoles);
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
  // ต้องบล็อกทั้งสองเส้นทาง (ทีละคีย์ และเป็นชุด) ไม่งั้นการทดสอบจะจริงแค่เส้นทางเดียว
  let blocked = true;
  blockWrite = (k) => blocked && k.startsWith('order');
  const flaky = async (k,v)=>{ if(blocked && k.startsWith('order')){ err.v='network'; return false; } return storeSet(k,v); };
  const iso2 = fn(storeGet, flaky, state, console, err, fakeFetch, API_URL, getUserRoles);
  let r = await iso2.loadOrdersOnce();
  ok('ยังอ่านใบเดิมได้ทั้ง 5 ใบ แม้ย้ายไม่สำเร็จ', r.length===5, r&&r.length);
  ok('ยังไม่มีดัชนี', !KV.has('orderIndex'));
  blocked = false;
  r = await iso2.loadOrdersOnce();
  ok('รอบถัดไปย้ายสำเร็จเอง ไม่ต้องรีเฟรช', KV.has('orderIndex'));
  ok('ได้ใบครบ 5 ใบ', r.length===5, r&&r.length);
  blockWrite = () => false;
}


/* ===== ตั้งแต่ [14] ลงไป: "จำนวนคำขอ" คือสิ่งที่วัด =====
   ความช้าของระบบนี้ไม่เคยมาจากขนาดข้อมูล แต่มาจากจำนวน execution ของ Apps Script ที่ต้องเข้าคิว
   ภายใต้โควตาของเจ้าของสคริปต์คนเดียว การแก้เพดานช่อง (14 ก.ย.) ทำให้เปิดแอปครั้งหนึ่งกิน
   8 + จำนวนใบ คำขอ = อาการช้ารอบล่าสุด ตัวเลขพวกนี้จึงต้องมีเทสต์จับไว้ ไม่ใช่รู้ตอนโรงงานบ่น */

function seedStore(n){
  KV = new Map(); state.orders = [];
  const seed = Array.from({ length:n }, (_, i) => mkOrder(i));
  seed.forEach(o => KV.set('order:' + o.id, JSON.stringify(o)));
  KV.set('orderIndex', JSON.stringify(seed.map(o => ({ i:o.id, r:'r1' }))));
  KV.set('config', JSON.stringify({ departments:[{ code:'ST', name:'คลังสินค้า' }] }));
  KV.set('counters', JSON.stringify({ ST:{ 26:n } }));
  KV.set('notifications', JSON.stringify([{ id:'n1' }]));
  KV.set('accessRequests', JSON.stringify([{ id:'q1', status:'pending' }]));
  return seed;
}

console.log('\n[14] เปิดแอป: ทุกอย่างที่หน้าจอแรกต้องใช้ มาในคำขอเดียว');
{
  seedStore(30);
  const a = newApi();
  getCalls = 0; setCalls = 0;
  a.startBoot('D-test', true);            // true = เครื่องที่เคยเข้าใช้งานได้แล้ว (มีสำเนาในเครื่อง)
  const list = await a.loadOrdersFromStore();
  const cfg = await a.storeGetBoot('config');
  const counters = await a.storeGetBoot('counters');
  const notifs = await a.storeGetBoot('notifications');
  ok('ได้ใบครบ 30 ใบ', list && list.length === 30, list && list.length);
  ok('ได้ config/counters/แจ้งเตือน จากคำขอเดียวกัน',
     cfg.departments[0].code === 'ST' && counters.ST['26'] === 30 && notifs[0].id === 'n1');
  ok('เปิดแอปทั้งครั้ง = 1 คำขอ (เดิม 8 + 30 ใบ = 38)', getCalls === 1, getCalls);
  ok('ไม่ได้เผลอเขียนอะไรตอนเปิดแอป', setCalls === 0, setCalls);

  // เครื่องที่ยังไม่เคยเข้าใช้งานได้ ไม่ต้องลากใบทั้งระบบมาตั้งแต่คำขอแรก (ปกติจบที่หน้าขอสิทธิ์)
  const guest = newApi();
  getCalls = 0;
  guest.startBoot('D-new', false);
  const gcfg = await guest.storeGetBoot('config');
  ok('ผู้มาใหม่: คำขอเดียวเช่นกัน และไม่มีใบแจ้งซ่อมติดมา', getCalls === 1 && gcfg.departments[0].code === 'ST', getCalls);
  const glist = await guest.loadOrdersFromStore();
  // ขอ "ดัชนี + ตัวใบ" มาพร้อมกันในคำขอเดียว ไม่ใช่ขอดัชนีก่อนแล้วค่อยขอตัวใบ
  ok('ถ้ามีสิทธิ์จริง ค่อยขอใบในคำขอถัดไป (รวม 2 คำขอ)', getCalls === 2 && glist.length === 30, getCalls);
}

console.log('\n[15] ค่าจากคำขอรวมใช้ได้ครั้งเดียว — รอบถัดไปต้องเป็นของสดเสมอ');
{
  seedStore(3);
  const a = newApi();
  a.startBoot('D-test');
  await a.storeGetBoot('counters');
  KV.set('counters', JSON.stringify({ ST:{ 26:99 } }));   // อีกเครื่องหนึ่งเพิ่งแก้
  const again = await a.storeGetBoot('counters');
  ok('ครั้งที่สองไปอ่านของสดจากเซิร์ฟเวอร์ ไม่ใช่ค่าตอนเปิดแอป', again.ST['26'] === 99, JSON.stringify(again));
}

console.log('\n[16] เซิร์ฟเวอร์ที่ยังไม่ได้วางไฟล์ใหม่ (v9): ต้องใช้งานได้ครบเหมือนเดิม');
{
  serverVersion = 9;
  const seed = seedStore(30);
  const a = newApi();
  getCalls = 0; setCalls = 0;
  a.startBoot('D-test');
  const list = await a.loadOrdersFromStore();
  ok('ยังอ่านใบครบ 30 ใบ', list && list.length === 30, list && list.length);
  ok('ถอยไปยิงทีละใบจริง (แพงกว่ามาก แต่ต้องไม่พัง)', getCalls >= 31, getCalls);
  const cfg = await a.storeGetBoot('config');
  ok('config ยังได้จากคำขอเดี่ยว', cfg.departments[0].code === 'ST');

  state.orders = list;
  list[0].status = 'DONE';
  setCalls = 0; writeLog = [];
  // fakeFetch จะ throw ทันทีถ้าฝั่งแอปเผลอยิงคำขอเขียนเป็นชุดไปหาเซิร์ฟเวอร์รุ่นเก่า
  const okw = await a.saveOrdersDiff(list);
  ok('เขียนกลับสำเร็จบนเซิร์ฟเวอร์รุ่นเก่า', okw === true);
  ok('ใช้วิธีเดิม 2 คำขอ (ตัวใบ + ดัชนี)', setCalls === 2, setCalls);
  ok('ลำดับยังถูก: ตัวใบก่อน ดัชนีทีหลัง', writeLog.join(',') === 'order:' + seed[0].id + ',orderIndex', writeLog.join(','));
  serverVersion = 10;
}

console.log('\n[17] รอบ poll: ดัชนีมากับคำขอรวมแล้ว ไม่ต้องขอซ้ำ');
{
  seedStore(30);
  const a = await primed(newApi());
  state.orders = await a.loadOrdersFromStore();
  // จำลองอีกเครื่องแก้สองใบ
  ['id-3','id-8'].forEach(id => {
    const o = JSON.parse(KV.get('order:' + id)); o.status = 'DONE';
    KV.set('order:' + id, JSON.stringify(o));
  });
  const idx = JSON.parse(KV.get('orderIndex'));
  idx.filter(e => e.i === 'id-3' || e.i === 'id-8').forEach(e => { e.r = 'r2'; });
  KV.set('orderIndex', JSON.stringify(idx));

  getCalls = 0;
  const r = await a.pollOrders({ idx });            // ดัชนีมาจากคำขอรวมของรอบ poll แล้ว
  ok('เสียคำขอเดียวสำหรับสองใบที่เปลี่ยน', getCalls === 1, getCalls);
  ok('เห็นสถานะใหม่ทั้งสองใบ', r.filter(o => o.status === 'DONE').length === 2);
  ok('ใบอื่นยังอยู่ครบ', r.length === 30, r.length);

  getCalls = 0;
  const r2 = await a.pollOrders({ idx });
  ok('รอบที่ไม่มีอะไรเปลี่ยน ไม่เสียคำขอเลย', getCalls === 0, getCalls);
  ok('ยังได้ครบ 30 ใบ', r2.length === 30, r2.length);
}

console.log('\n[18] ชุดใหญ่ถูกแบ่งเป็นหลายคำขอ แต่ลำดับที่ห้ามสลับต้องยังถูก');
{
  KV = new Map();
  const a = await primed(newApi());
  const orders = Array.from({ length:30 }, (_, i) => mkOrder(i));
  writeLog = []; setCalls = 0;
  const okm = await a.migrateOrdersToPerKey(orders);
  ok('ย้ายสำเร็จ', okm === true);
  ok('แบ่งเป็นหลายชุดตามเพดาน 25 คีย์ต่อชุด', setCalls === 2, setCalls);
  ok('ดัชนีถูกเขียน "หลัง" ตัวใบครบทุกใบเสมอ',
     writeLog.indexOf('orderIndex') === writeLog.length - 1 && writeLog.length === 31, writeLog.length);
  const reread = await a.loadOrdersFromStore();
  ok('อ่านกลับครบ 30 ใบ', reread.length === 30, reread && reread.length);
}

console.log('\n[19] ค่าที่ยาวเกินเพดานช่อง ต้องถูกปฏิเสธก่อนส่ง แม้อยู่ในชุดใหญ่');
{
  KV = new Map();
  const a = await primed(newApi());
  setCalls = 0;
  const okw = await a.storeSetMany([['a', { n:1 }], ['b', 'x'.repeat(CELL_LIMIT + 1)]]);
  ok('ทั้งชุดถือว่าล้มเหลว', okw === false);
  ok('บอกสาเหตุว่าใหญ่เกินช่อง (กดใหม่ไม่ช่วย)', err.v === 'too-large', err.v);
  ok('ข้อความถึงผู้ใช้ตรงกับสาเหตุจริง', api.storeFailMsg('บันทึกไม่สำเร็จ').includes('Google Sheet รับได้ในช่องเดียว'));
  ok('ไม่ส่งออกไปเลยแม้แต่คำขอเดียว', setCalls === 0, setCalls);
  ok('ไม่มีคีย์ไหนถูกเขียนบางส่วน', !KV.has('a') && !KV.has('b'));
}

console.log('\n[20] เขียนไม่ผ่านกลางชุด ต้องรายงานว่าล้มเหลว ไม่ใช่แกล้งว่าสำเร็จ');
{
  KV = new Map();
  const a = await primed(newApi());
  blockWrite = (k) => k === 'orderIndex';
  const orders = Array.from({ length:3 }, (_, i) => mkOrder(i));
  const okm = await a.migrateOrdersToPerKey(orders);
  ok('คืน false เมื่อเขียนดัชนีไม่ผ่าน', okm === false);
  blockWrite = () => false;
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
      const ref = m[1];
      // ข้ามตัวอย่าง/ตัวแทน ไม่ใช่ชื่อไฟล์จริง เช่น docs/... หรือ docs/<ชื่อไฟล์>
      if(ref.includes('...') || !/\.[A-Za-z0-9]+$/.test(ref)) continue;
      if(!fs.existsSync(path.join(repoRoot, ref))) missing.push(path.basename(doc) + ' → ' + ref);
    }
  }
  ok('ทุก path ที่เอกสารอ้างถึงมีไฟล์อยู่จริง', missing.length===0, missing.join(', '));
}

console.log(`\n=== ผ่าน ${pass} / ล้มเหลว ${fail} ===`);
process.exit(fail?1:0);
