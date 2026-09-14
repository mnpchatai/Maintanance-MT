/* ตัวทดสอบซอร์ส Apps Script "คำร้องแจ้งซ่อม" (docs/main-api.gs)
   รันด้วย:  node docs/main-api.test.mjs
   ไม่มี dependency ใดๆ และดึงโค้ดจริงจาก docs/main-api.gs สดทุกครั้ง ไม่ได้ก๊อปมาวางซ้ำ

   ทำไมต้องมี: ซอร์สตัวนี้รันอยู่บนเซิร์ฟเวอร์ของ Google เท่านั้น วิธีเดียวที่เคยใช้ตรวจคือ
   "วางแล้วลองกดดู" ซึ่งแปลว่าโรงงานเป็นคนเจอบั๊กแทน ที่ผ่านมาจึงมีของที่ดริฟต์ออกจากกันเงียบๆ
   ได้นาน เช่นฝั่งแอปเปลี่ยนไปเก็บรูปแบบรูปละคีย์ตั้งแต่ 12 ก.ย. แต่หน้าดูรูปฝั่งนี้ยังอ่านแบบเดิม
   ไฟล์นี้จำลอง SpreadsheetApp เท่าที่ซอร์สใช้จริง แล้วรันตรรกะทั้งหมดในเครื่อง */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, 'main-api.gs'), 'utf8');

/* ===================== ตัวจำลอง Google Sheets ===================== */

const BLANK = '';

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(this.sheet._get(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }
  setValues(vals) {
    if (vals.length !== this.numRows) throw new Error('setValues: จำนวนแถวไม่ตรงกับช่วง');
    vals.forEach((line, r) => {
      if (line.length !== this.numCols) throw new Error('setValues: จำนวนคอลัมน์ไม่ตรงกับช่วง');
      line.forEach((v, c) => this.sheet._set(this.row + r, this.col + c, v));
    });
    return this;
  }
  getValue() { return this.sheet._get(this.row, this.col); }
  setValue(v) { this.sheet._set(this.row, this.col, v); return this; }
  clearContent() { return this.clearContents(); }
  clearContents() {
    for (let r = 0; r < this.numRows; r++)
      for (let c = 0; c < this.numCols; c++) this.sheet._set(this.row + r, this.col + c, BLANK);
    return this;
  }
  setDataValidation() { this.sheet.validations.push(this.getA1()); return this; }
  setNumberFormat() { throw new Error('ห้ามใช้ setNumberFormat — ดูหมายเหตุ v3 ในซอร์ส'); }
  getA1() { return `R${this.row}C${this.col}:${this.numRows}x${this.numCols}`; }
  // ต้องคืนรูปแบบ A1 จริงๆ (เช่น "AG4") — onEditDocForm_ เทียบค่านี้กับ DOC_FORM_LOOKUP_CELL ตรงๆ
  getA1Notation() {
    let n = this.col, letters = '';
    while (n > 0) { const rem = (n - 1) % 26; letters = String.fromCharCode(65 + rem) + letters; n = Math.floor((n - 1) / 26); }
    return letters + this.row;
  }
  getSheet() { return this.sheet; }
}

class FakeSheet {
  constructor(ss, name, index) {
    Object.assign(this, { ss, name, index, cells: new Map(), maxCols: 26, maxRows: 1000 });
    this.validations = [];
    this.formatRules = [];
  }
  _key(r, c) { return r + ':' + c; }
  _get(r, c) { const v = this.cells.get(this._key(r, c)); return v === undefined ? BLANK : v; }
  _set(r, c, v) {
    if (c > this.maxCols) throw new Error(`เขียนเกินจำนวนคอลัมน์ของแท็บ (${this.name}: มี ${this.maxCols} เขียนที่ ${c})`);
    this.cells.set(this._key(r, c), v);
  }
  getName() { return this.name; }
  getIndex() { return this.index; }
  getSheetId() { return 1000 + this.index; }
  getMaxColumns() { return this.maxCols; }
  getMaxRows() { return this.maxRows; }
  insertColumnsAfter(after, count) { this.maxCols = Math.max(this.maxCols, after + count); }
  getLastRow() {
    let last = 0;
    for (const [k, v] of this.cells) {
      if (v === BLANK || v === null || v === undefined) continue;
      const r = parseInt(k.split(':')[0], 10);
      if (r > last) last = r;
    }
    return last;
  }
  getLastColumn() {
    let last = 0;
    for (const [k, v] of this.cells) {
      if (v === BLANK || v === null || v === undefined) continue;
      const c = parseInt(k.split(':')[1], 10);
      if (c > last) last = c;
    }
    return last;
  }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const m = a.match(/^([A-Z]+)(\d+)$/);
      if (!m) throw new Error('ตัวจำลองรองรับเฉพาะ A1 เซลล์เดียว: ' + a);
      let col = 0;
      for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
      return new FakeRange(this, parseInt(m[2], 10), col, 1, 1);
    }
    return new FakeRange(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
  }
  getDataRange() { return new FakeRange(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(vals) {
    const r = this.getLastRow() + 1;
    if (vals.length > this.maxCols) this.insertColumnsAfter(this.maxCols, vals.length - this.maxCols);
    vals.forEach((v, i) => this._set(r, i + 1, v));
  }
  deleteRows(start, count) {
    const next = new Map();
    for (const [k, v] of this.cells) {
      const [r, c] = k.split(':').map(Number);
      if (r >= start && r < start + count) continue;
      next.set((r >= start + count ? r - count : r) + ':' + c, v);
    }
    this.cells = next;
  }
  setConditionalFormatRules(rules) { this.formatRules = rules; }
}

class FakeSpreadsheet {
  constructor(id, name) { Object.assign(this, { id, name, sheets: [] }); this.toasts = []; }
  getId() { return this.id; }
  getName() { return this.name; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(name, idx) {
    const sheet = new FakeSheet(this, name, this.sheets.length + 1);
    if (idx === undefined) this.sheets.push(sheet); else this.sheets.splice(idx, 0, sheet);
    this.sheets.forEach((s, i) => { s.index = i + 1; });
    return sheet;
  }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); this.sheets.forEach((x, i) => { x.index = i + 1; }); }
  toast(msg, title) { this.toasts.push({ msg, title }); }
}

function makeEnv(spreadsheetId, webAppUrl) {
  const ss = new FakeSpreadsheet(spreadsheetId, 'ฐานข้อมูลระบบแจ้งซ่อม');
  const chain = () => { const b = {}; ['requireValueInList','setAllowInvalid','whenTextEqualTo','setBackground','setFontColor','setRanges'].forEach(m => { b[m] = () => b; }); b.build = () => ({}); return b; };
  return {
    ss,
    SpreadsheetApp: {
      openById: (id) => { if (id !== spreadsheetId) throw new Error('เปิดชีตผิดไฟล์: ' + id); return ss; },
      getActiveSpreadsheet: () => ss,
      newDataValidation: chain,
      newConditionalFormatRule: chain,
    },
    ScriptApp: { getService: () => ({ getUrl: () => webAppUrl }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (t) => ({ _t: t, setMimeType() { return this; }, getContent() { return this._t; } }),
    },
    HtmlService: {
      createHtmlOutput: (h) => ({ _h: h, setTitle() { return this; }, addMetaTag() { return this; }, getContent() { return this._h; } }),
    },
    Utilities: {
      formatDate: (d, tz, fmt) => {
        const t = new Date(d.getTime() + 7 * 3600 * 1000);   // Asia/Bangkok
        const p = (n) => String(n).padStart(2, '0');
        if (fmt !== 'dd/MM/yyyy HH:mm') throw new Error('ตัวจำลองรองรับเฉพาะรูปแบบที่ซอร์สใช้จริง');
        return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)}/${t.getUTCFullYear()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
      },
    },
  };
}

// โหลดซอร์สเข้าไปในขอบเขตที่มีของจำลองครบ แล้วคืน API ที่ต้องใช้ทดสอบ
function loadApi(env) {
  const factory = new Function(
    'SpreadsheetApp', 'ScriptApp', 'LockService', 'ContentService', 'HtmlService', 'Utilities', 'console',
    SRC + `
    return { doGet, doPost, resyncAll, onEditDocForm_, renderPhotosPage_, findOrderById_,
             syncOrdersSheet_, syncOneOrderRow_, loadOrderPhotos_, setKvValue_, getKvValue_,
             CODE_VERSION, ORDERS_HEADERS, ORDERS_ID_COLUMN, isOrderKey_ };`
  );
  return factory(env.SpreadsheetApp, env.ScriptApp, env.LockService, env.ContentService,
                 env.HtmlService, env.Utilities, console);
}

/* ===================== ตัวช่วยของการทดสอบ ===================== */

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra === undefined ? '' : extra); }
}
const SHEET_ID = '1Zm31RC9ak_plSb19LsgGn8QJn4EkadYOnKUF98dyAwA';
const APP_URL = 'https://script.google.com/macros/s/TEST/exec';
const ORDERS_TAB = 'ใบแจ้งซ่อม';

function mkOrder(n, over) {
  return Object.assign({
    id: 'id-' + n, docNumber: 'ST-' + String(n).padStart(3, '0') + '/26',
    department: 'คลังสินค้า', docType: 'repair',
    machineCode: 'WH-FORK-00' + n, machineName: 'รถโฟล์คลิฟท์ไฟฟ้า',
    cause: 'ยกงาไม่ขึ้น มีเสียงดังจากปั๊มไฮดรอลิก',
    neededDate: '2026-09-16', requestedBy: 'พรทวี แต้มเขียนนอก',
    createdAt: '2026-09-1' + n + 'T06:51:00.000Z', status: 'PENDING_FM',
    photoCount: 0, photosSplit: true,
    approvals: { fm: { status: null, by: '', at: '', note: '' }, gm: { status: null, by: '', at: '', note: '' } },
    assignment: { technicians: [], assignedBy: '', assignedAt: '', startDate: '', endDate: '', executionPlan: '', receivedByName: '' },
    maintRecord: null, verification: null, verificationHistory: [], statusHistory: [],
  }, over || {});
}
function post(api, key, value) {
  return JSON.parse(api.doPost({ postData: { contents: JSON.stringify({ key, value: JSON.stringify(value) }) } }).getContent());
}
function ordersRows(env) {
  const sh = env.ss.getSheetByName(ORDERS_TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, api0.ORDERS_HEADERS.length).getValues();
}
const strip = (v) => String(v).replace(/^'/, '');

// ใช้แค่ดึงค่าคงที่ (ORDERS_HEADERS ฯลฯ) ไม่ได้ผูกกับ env ของเทสต์ไหนเป็นพิเศษ
const api0 = loadApi(makeEnv(SHEET_ID, APP_URL));

/* ===================== การทดสอบ ===================== */

console.log('\n[1] ส่งใบใหม่ (คีย์ order:<id>) → ต่อท้ายแถวในแท็บใบแจ้งซ่อม');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  const o = mkOrder(1);
  const res = post(api, 'order:' + o.id, o);
  ok('doPost ตอบ ok', res.ok === true, JSON.stringify(res));
  const sh = env.ss.getSheetByName(ORDERS_TAB);
  ok('แท็บใบแจ้งซ่อมถูกสร้าง', !!sh);
  const rows = ordersRows(env);
  ok('มี 1 แถว', rows.length === 1, rows.length);
  ok('เลขที่เอกสารถูกต้อง', rows[0][0] === o.docNumber, rows[0][0]);
  ok('สถานะแปลเป็นภาษาไทย', rows[0][8] === 'รออนุมัติ (ผจก.โรงงาน)', rows[0][8]);
  ok('ประเภทเอกสารแปลเป็นภาษาไทย', rows[0][21] === 'ใบแจ้งซ่อม', rows[0][21]);
  ok('คอลัมน์ AD เก็บรหัสอ้างอิงระบบ', rows[0][api.ORDERS_ID_COLUMN - 1] === o.id, rows[0][29]);
  ok('วันที่เป็นข้อความล้วน (มี \' นำหน้า)', String(rows[0][7]).startsWith("'"), rows[0][7]);
  ok('วันที่แปลงเป็น พ.ศ. แล้ว', strip(rows[0][7]).includes('/69'), strip(rows[0][7]));
  ok('หัวตารางมีคอลัมน์ใหม่', sh.getRange(1, api.ORDERS_ID_COLUMN).getValue() === 'รหัสอ้างอิงระบบ');
}

console.log('\n[2] อนุมัติใบเดิม → แก้แถวเดิม ไม่เพิ่มแถวใหม่');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  const a = mkOrder(1), b = mkOrder(2);
  post(api, 'order:' + a.id, a);
  post(api, 'order:' + b.id, b);
  ok('มี 2 แถว', ordersRows(env).length === 2);

  const approved = mkOrder(1, {
    status: 'PENDING_GM',
    approvals: { fm: { status: 'approved', by: 'สมชาย ยุทธไพศาล', at: '2026-09-14T07:00:00.000Z', note: 'อนุมัติ' },
                 gm: { status: null, by: '', at: '', note: '' } }
  });
  post(api, 'order:' + approved.id, approved);
  const rows = ordersRows(env);
  ok('ยังมี 2 แถวเท่าเดิม (ไม่ซ้ำ)', rows.length === 2, rows.length);
  ok('แถวของใบที่อนุมัติเปลี่ยนสถานะแล้ว', rows[0][8] === 'รออนุมัติ (ผจก.ทั่วไป)', rows[0][8]);
  ok('ช่องอนุมัติ ผจก.โรงงาน ถูกเติม', rows[0][9] === 'อนุมัติ', rows[0][9]);
  ok('ใบอีกใบไม่ถูกแตะ', rows[1][0] === b.docNumber && rows[1][8] === 'รออนุมัติ (ผจก.โรงงาน)');
}

console.log('\n[3] ผู้ดูแลกดล้างข้อมูล (orderIndex ว่าง) → แท็บถูกล้าง');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  post(api, 'order:id-1', mkOrder(1));
  post(api, 'order:id-2', mkOrder(2));
  ok('ก่อนล้างมี 2 แถว', ordersRows(env).length === 2);
  post(api, 'orderIndex', []);
  ok('หลังล้างเหลือ 0 แถว', ordersRows(env).length === 0, ordersRows(env).length);
  ok('หัวตารางยังอยู่', env.ss.getSheetByName(ORDERS_TAB).getRange(1, 1).getValue() === 'เลขที่เอกสาร');
}

console.log('\n[4] ดัชนีที่ไม่ว่าง ต้องไม่ไปล้างแท็บทิ้ง');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  post(api, 'order:id-1', mkOrder(1));
  post(api, 'orderIndex', [{ i: 'id-1', r: 'abc' }]);
  ok('แถวยังอยู่ครบ', ordersRows(env).length === 1, ordersRows(env).length);
}

console.log('\n[5] doGet ?key=order&id= อ่านจากช่องของใบนั้นตรงๆ');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  const o = mkOrder(7, { status: 'ASSIGNED' });
  post(api, 'order:' + o.id, o);
  const out = JSON.parse(api.doGet({ parameter: { key: 'order', id: o.id } }).getContent());
  const got = JSON.parse(out.value);
  ok('ได้ใบที่ถูกต้อง', got.id === o.id && got.status === 'ASSIGNED', got && got.id);
  const miss = JSON.parse(api.doGet({ parameter: { key: 'order', id: 'ไม่มีจริง' } }).getContent());
  ok('ใบที่ไม่มี คืน null', miss.value === null, miss.value);
}

console.log('\n[6] ใบเก่าที่ยังไม่ย้ายระบบ ยังอ่านได้จากคีย์ orders เดิม');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  const legacy = mkOrder(9, { id: 'old-9', photosSplit: undefined });
  api.setKvValue_('orders', JSON.stringify([legacy]));
  const out = JSON.parse(api.doGet({ parameter: { key: 'order', id: 'old-9' } }).getContent());
  ok('ถอยไปอ่านคีย์เดิมได้', out.value && JSON.parse(out.value).id === 'old-9');
}

console.log('\n[7] resyncAll สร้างแท็บใหม่จากแถวคีย์ order: ทั้งหมด');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  // ใส่ทั้งของใหม่และคีย์ orders เดิมที่ค้างอยู่ — ของใหม่ต้องชนะ
  api.setKvValue_('order:id-1', JSON.stringify(mkOrder(1)));
  api.setKvValue_('order:id-2', JSON.stringify(mkOrder(2)));
  api.setKvValue_('order:id-3', JSON.stringify(mkOrder(3)));
  api.setKvValue_('orders', JSON.stringify([mkOrder(8, { docNumber: 'ของเก่าไม่ควรโผล่' })]));
  api.resyncAll();
  const rows = ordersRows(env);
  ok('ได้ 3 แถวจากที่เก็บใหม่', rows.length === 3, rows.length);
  ok('ไม่มีข้อมูลจากคีย์เดิมปน', !rows.some(r => String(r[0]).indexOf('ของเก่า') === 0));
  ok('เรียงเก่า→ใหม่ตามเวลาแจ้ง', strip(rows[0][0]) === 'ST-001/26' && strip(rows[2][0]) === 'ST-003/26',
     rows.map(r => strip(r[0])).join(','));
}

console.log('\n[8] หน้าดูรูป: รองรับรูปละคีย์ (photosSplit) — เคสที่พังเงียบมาตั้งแต่ 12 ก.ย.');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  const o = mkOrder(5, { photoCount: 2, photosSplit: true });
  post(api, 'order:' + o.id, o);
  // แอปเขียนรูปผ่าน JSON.stringify(สตริง) ค่าในช่องจึงมีเครื่องหมายคำพูดครอบอยู่
  api.setKvValue_('photos:' + o.id + ':0', JSON.stringify('data:image/jpeg;base64,AAAA'));
  api.setKvValue_('photos:' + o.id + ':1', JSON.stringify('data:image/jpeg;base64,BBBB'));
  const html = api.renderPhotosPage_(o.id).getContent();
  ok('โชว์ครบ 2 รูป', (html.match(/<img /g) || []).length === 2, (html.match(/<img /g) || []).length);
  ok('src ไม่มีเครื่องหมายคำพูดปนมา', html.includes('src="data:image/jpeg;base64,AAAA"'));
  ok('ไม่ขึ้นว่าไม่มีรูป', !html.includes('ไม่มีรูปภาพแนบ'));
  ok('หัวข้อใช้เลขที่เอกสาร', html.includes(o.docNumber));
}

console.log('\n[9] หน้าดูรูป: ใบเก่าแบบอาร์เรย์เดียวยังต้องดูได้เหมือนเดิม');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  const o = mkOrder(6, { id: 'old-6', photoCount: 2, photosSplit: undefined });
  api.setKvValue_('orders', JSON.stringify([o]));
  api.setKvValue_('photos:old-6', JSON.stringify(['data:image/jpeg;base64,CCCC', 'data:image/jpeg;base64,DDDD']));
  const html = api.renderPhotosPage_('old-6').getContent();
  ok('โชว์ครบ 2 รูป', (html.match(/<img /g) || []).length === 2);
  ok('ไม่มีรูป → ขึ้นข้อความว่าง', api.renderPhotosPage_('ไม่มีจริง').getContent().includes('ไม่มีรูปภาพแนบ'));
}

console.log('\n[10] คอลัมน์จำนวนรูปเป็นลิงก์เปิดหน้าดูรูป');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  const o = mkOrder(4, { photoCount: 3 });
  post(api, 'order:' + o.id, o);
  const cell = String(ordersRows(env)[0][20]);
  ok('เป็นสูตร HYPERLINK', cell.startsWith('=HYPERLINK('), cell);
  ok('ลิงก์ชี้ไปหน้าดูรูปของใบนี้', cell.includes('?view=photos&id=' + o.id));
  ok('ข้อความบอกจำนวนรูป', cell.includes('3 รูป'));
}

console.log('\n[11] แท็บเดิมที่กว้าง 29 คอลัมน์ ต้องขยายให้เองโดยไม่ throw');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  const sh = env.ss.insertSheet(ORDERS_TAB);
  sh.maxCols = 29;                                  // แท็บรุ่นก่อน v9
  api.ORDERS_HEADERS.slice(0, 29).forEach((h, i) => sh.getRange(1, i + 1).setValue(h));
  sh.getRange(1, 5).setValue('อาการที่แจ้ง (ตั้งชื่อเอง)');   // ชื่อหัวที่ผู้ใช้แก้เอง
  let threw = null;
  try { post(api, 'order:id-1', mkOrder(1)); } catch (e) { threw = e; }
  ok('ไม่ throw', threw === null, threw && threw.message);
  ok('แท็บกว้างขึ้นเป็น 30 คอลัมน์', sh.getMaxColumns() >= 30, sh.getMaxColumns());
  ok('หัวตารางคอลัมน์ใหม่ถูกเติม', sh.getRange(1, 30).getValue() === 'รหัสอ้างอิงระบบ', sh.getRange(1, 30).getValue());
  ok('ชื่อหัวที่ผู้ใช้ตั้งเองไม่ถูกเขียนทับ', sh.getRange(1, 5).getValue() === 'อาการที่แจ้ง (ตั้งชื่อเอง)', sh.getRange(1, 5).getValue());
  ok('ข้อมูลลงครบ', ordersRows(env).length === 1);
}

console.log('\n[12] แถวเก่าที่ยังไม่มีรหัสอ้างอิง ต้องหาเจอด้วยเลขที่เอกสาร (ไม่สร้างแถวซ้ำ)');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  const o = mkOrder(1);
  const sh = env.ss.insertSheet(ORDERS_TAB);
  sh.maxCols = 29;                                  // แท็บรุ่นก่อน v9
  api.ORDERS_HEADERS.slice(0, 29).forEach((h, i) => sh.getRange(1, i + 1).setValue(h));
  sh.getRange(2, 1).setValue(o.docNumber);          // แถวเก่า: มีแต่เลขที่เอกสาร ไม่มีรหัสอ้างอิง
  sh.getRange(2, 9).setValue('รออนุมัติ (ผจก.โรงงาน)');
  post(api, 'order:' + o.id, Object.assign({}, o, { status: 'PENDING_GM' }));
  const rows = ordersRows(env);
  ok('ยังมีแถวเดียว ไม่สร้างซ้ำ', rows.length === 1, rows.length);
  ok('สถานะถูกอัปเดต', rows[0][8] === 'รออนุมัติ (ผจก.ทั่วไป)', rows[0][8]);
  ok('แถวเก่าได้รหัสอ้างอิงติดไปด้วย', rows[0][29] === o.id, rows[0][29]);
}

console.log('\n[13] ฟอร์มกระดาษ (แท็บเอกสาร) ดึงข้อมูลใบจากที่เก็บใหม่ได้');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  const o = mkOrder(1, {
    status: 'DONE',
    maintRecord: { causeAnalysis: 'ซีลเสื่อม', inspectorOpinion: 'self_repair',
      parts: [{ name: 'ชุดซีล', qty: '1', unit: 'ชุด', price: '2500' }], updatedBy: 'ช่าง', updatedAt: '2026-09-16T03:00:00.000Z' },
    verification: { result: 'pass', by: 'พรทวี แต้มเขียนนอก', at: '2026-09-16T04:00:00.000Z', note: 'ใช้ได้ปกติ' },
  });
  post(api, 'order:' + o.id, o);
  const doc = env.ss.insertSheet('เอกสาร');
  doc.maxCols = 40;
  doc.getRange('AG4').setValue(o.docNumber);
  api.onEditDocForm_({ range: doc.getRange('AG4'), value: o.docNumber });
  ok('ชื่อเครื่องจักรถูกเติม', doc.getRange('AB6').getValue() === o.machineName, doc.getRange('AB6').getValue());
  ok('ผู้แจ้งถูกเติม', doc.getRange('L8').getValue() === o.requestedBy);
  ok('อาการถูกเติม', doc.getRange('B10').getValue() === o.cause);
  ok('ติ๊ก "ซ่อมเอง"', doc.getRange('Y28').getValue() === true);
  ok('ติ๊กผลตรวจรับ "ผ่าน"', doc.getRange('C39').getValue() === true && doc.getRange('C40').getValue() === false);
  ok('รายการอะไหล่ถูกเติม', doc.getRange('D31').getValue() === 'ชุดซีล', doc.getRange('D31').getValue());
  ok('วันที่ปิดงานถูกเติม', String(doc.getRange('AB37').getValue()).includes('16/09/69'), doc.getRange('AB37').getValue());
}

console.log('\n[14] endpoint ตรวจสุขภาพยังทำงาน และรายงานเวอร์ชันใหม่');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  const v = JSON.parse(api.doGet({ parameter: { key: 'version' } }).getContent());
  ok('เวอร์ชันเป็น v9', v.value === api.CODE_VERSION && /^v9-/.test(v.value), v.value);
  const who = JSON.parse(JSON.parse(api.doGet({ parameter: { key: 'whoami' } }).getContent()).value);
  ok('whoami บอก id ของชีตที่ใช้จริง', who.spreadsheetId === SHEET_ID, who.spreadsheetId);
}

console.log('\n[15] คีย์อื่นๆ ต้องไม่ถูกเข้าใจผิดว่าเป็นใบแจ้งซ่อม');
{
  ok("'orderIndex' ไม่ใช่คีย์ของใบ", api0.isOrderKey_('orderIndex') === false);
  ok("'order:abc' เป็นคีย์ของใบ", api0.isOrderKey_('order:abc') === true);
  ok("'orders' ไม่ใช่คีย์ของใบ", api0.isOrderKey_('orders') === false);
  ok("'photos:abc:0' ไม่ใช่คีย์ของใบ", api0.isOrderKey_('photos:abc:0') === false);
}

console.log('\n[16] เขียนใบแจ้งซ่อม 200 ใบ แล้วอัปเดตใบเดียว ต้องไม่ไปแตะใบอื่น');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  for (let i = 1; i <= 200; i++) {
    const o = mkOrder(1, { id: 'id-' + i, docNumber: 'ST-' + String(i).padStart(3, '0') + '/26',
      createdAt: '2026-09-14T' + String(Math.floor(i / 60)).padStart(2, '0') + ':' + String(i % 60).padStart(2, '0') + ':00.000Z' });
    post(api, 'order:' + o.id, o);
  }
  ok('มี 200 แถว', ordersRows(env).length === 200, ordersRows(env).length);
  const before = ordersRows(env).map(r => String(r[8]));
  post(api, 'order:id-100', mkOrder(1, { id: 'id-100', docNumber: 'ST-100/26', status: 'DONE' }));
  const after = ordersRows(env);
  ok('ยังมี 200 แถว', after.length === 200, after.length);
  const changed = after.map((r, i) => String(r[8]) !== before[i] ? i : -1).filter(i => i >= 0);
  ok('มีแถวเดียวที่เปลี่ยน', changed.length === 1, 'เปลี่ยน ' + changed.length + ' แถว');
  ok('แถวที่เปลี่ยนคือใบที่ตั้งใจ', after[changed[0]][0] === 'ST-100/26', after[changed[0]] && after[changed[0]][0]);
  ok('สถานะใหม่ถูกต้อง', after[changed[0]][8] === 'ซ่อมเรียบร้อย', after[changed[0]][8]);
}


console.log('\n[17] การเพิ่มใบต้องไม่ไปลงดรอปดาวน์ใหม่ทั้งตาราง (กันชน lock ตอนย้ายข้อมูล)');
{
  const env = makeEnv(SHEET_ID, APP_URL); const api = loadApi(env);
  for (let i = 1; i <= 30; i++) post(api, 'order:id-' + i, mkOrder(1, { id: 'id-' + i, docNumber: 'ST-' + i + '/26' }));
  const sh = env.ss.getSheetByName(ORDERS_TAB);
  ok('มี 30 แถว', ordersRows(env).length === 30, ordersRows(env).length);
  // 6 คอลัมน์ที่มีดรอปดาวน์ × 30 ใบ = 180 ครั้ง ถ้าลงเฉพาะแถวใหม่
  // ถ้าไล่ทั้งตารางทุกครั้ง จำนวนช่วงจะเท่ากันแต่ "ขนาดช่วง" จะโตขึ้นเรื่อยๆ จึงตรวจที่ขนาดแทน
  const oversized = sh.validations.filter(v => !/:1x1$/.test(v));
  ok('ทุกช่วงที่ลงดรอปดาวน์เป็นแถวเดียว', oversized.length === 0, oversized.slice(0, 3).join(', '));
  // ตรวจว่าแถวสุดท้ายยังได้ดรอปดาวน์จริง (ไม่ใช่ประหยัดจนลืมลง)
  ok('แถวที่ 31 (ใบสุดท้าย) ได้ดรอปดาวน์สถานะ', sh.validations.includes('R31C9:1x1'), sh.validations.slice(-6).join(', '));
}

console.log(`\n=== ผ่าน ${pass} / ล้มเหลว ${fail} ===`);
process.exit(fail ? 1 : 0);
