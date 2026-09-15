const CODE_VERSION = 'v10-2026-09-15';

/* v9: ฝั่งแอปเลิกเก็บใบแจ้งซ่อม "ทุกใบรวมกันในคีย์เดียว" แล้ว เพราะคีย์ 'orders' คือช่องเดียว
   ของ Google Sheet ซึ่งรับได้ 50,000 ตัวอักษร ใบที่เดินครบวงจรกินราว 3,700 ตัวอักษร เพดานจริง
   จึงอยู่แค่ราว 12-20 ใบ และเมื่อชนเพดาน ทุกอย่างที่ต้องเขียน orders (ส่งใบใหม่ อนุมัติ มอบหมายงาน
   บันทึกซ่อม ตรวจรับ) ล้มเหลวพร้อมกันทั้งระบบในวินาทีเดียว — คือเหตุการณ์ 14 ก.ย. 2569

   โครงสร้างใหม่ในแท็บ KV:
     orderIndex   →  [{ i:<id>, r:<rev> }, ...]   ดัชนีเล็กๆ ใบละ ~58 ตัวอักษร
     order:<id>   →  อ็อบเจกต์ใบนั้นทั้งใบ         ช่องละใบ (3,700 จาก 48,000 = เหลือที่ 13 เท่า)

   สิ่งที่เปลี่ยนในไฟล์นี้
   1. doPost รู้จักคีย์ order:<id> แล้ว และ "อัปเดตเฉพาะแถวของใบนั้น" ในแท็บใบแจ้งซ่อม
      แทนการล้างแล้วเขียนใหม่ทั้งแท็บทุกครั้งแบบเดิม — เร็วกว่าเดิมมากเมื่อใบสะสมเยอะ
      (เดิมกดอนุมัติหนึ่งครั้ง = เขียนใหม่ทุกแถวในระบบ)
   2. เพิ่มคอลัมน์ท้ายสุด "รหัสอ้างอิงระบบ" (AD) เก็บ order.id ไว้ใช้หาแถวให้ตรงใบ
      ต่อท้ายเท่านั้นตามกติกาเดิม คอลัมน์ A-AC ไม่ขยับ onEditDocForm_ จึงไม่กระทบ
   3. findOrderById_ / doGet('order') อ่านจากช่อง order:<id> ตรงๆ (ถอยไปคีย์เดิมได้ถ้าไม่เจอ)
   4. resyncAll สร้างแท็บใหม่จากแถวคีย์ order: ทั้งหมด
   5. แก้หน้าดูรูป: ตั้งแต่ 12 ก.ย. ฝั่งแอปเก็บรูปแบบ "รูปละคีย์" (photos:<id>:<i>) แล้ว
      แต่หน้านี้ยังอ่านแบบอาร์เรย์เดียวอยู่ ใบใหม่ๆ จึงกดดูรูปแล้วขึ้นว่าไม่มีรูปมาตลอด
      เป็นการดริฟต์แบบเดียวกัน คือฝั่งแอปขยับแล้วฝั่งนี้ไม่ได้ขยับตาม

   คีย์ 'orders' เดิมยังอยู่ครบ ไม่ถูกลบและไม่ถูกเขียนทับ ใช้เป็นข้อมูลสำรองก่อนย้ายระบบ
   และยังเป็นทางถอยให้ใบเก่าที่เปิดจากลิงก์แจ้งเตือนก่อนที่เครื่องไหนจะย้ายข้อมูลให้ */

/* v8: แก้ SPREADSHEET_ID ที่ยังชี้ไปชีตของบัญชีเก่า (1er3WPCH... เจ้าของ thtwgot@gmail.com)
   ทั้งที่ทุกคนย้ายมาแก้ชีตของบัญชีใหม่แล้ว — ทุกอย่างที่ผ่าน getSpreadsheet_() จึงอ่าน/เขียน
   ผิดไฟล์มาตลอด อาการที่เห็นคือ doGet('userRoles') คืน {"roles":[],"techNames":[]} ให้กับ
   รหัสประจำเครื่องที่มีอยู่ในชีตใหม่ชัดๆ ส่วน endpoint อื่นดูปกติหมดเพราะชีตเก่าเป็นสำเนา
   ที่มีข้อมูลก่อนย้ายครบทุกแท็บ

   ระวัง: การที่สคริปต์นี้ผูกอยู่กับชีต (container-bound) ไม่ได้แปลว่ามันอ่านชีตที่ผูกอยู่ —
   getSpreadsheet_() ใช้ openById(SPREADSHEET_ID) เสมอ มีแต่เส้นทาง onEdit เท่านั้นที่ใช้
   getActiveSpreadsheet() (simple trigger เรียก openById ไม่ได้) ดังนั้นถ้าย้ายบัญชี/ก๊อปชีต
   เมื่อไหร่ ต้องมาแก้ค่านี้ทุกครั้ง และเช็คได้เร็วๆ ด้วย <URL>/exec?key=whoami */
const SPREADSHEET_ID = '1Zm31RC9ak_plSb19LsgGn8QJn4EkadYOnKUF98dyAwA';
const KV_SHEET = 'KV';
const ORDERS_SHEET = 'ใบแจ้งซ่อม';
const DEPTS_SHEET = 'แผนก';
const MACHINES_SHEET = 'เครื่องจักร';
const TECHS_SHEET = 'ช่าง';
const NOTIFS_SHEET = 'การแจ้งเตือน';
const PERMISSIONS_SHEET = 'สิทธิ์ผู้ใช้ LINE';
const LINE_RECIPIENTS_SHEET = 'แจ้งเตือน LINE - ผู้รับ';
const ERROR_LOG_SHEET = 'บันทึกข้อผิดพลาด';

// v9: ที่เก็บใบแจ้งซ่อมแบบใบละช่อง — ต้องตรงกับ ORDER_INDEX_KEY/orderKey() ใน index.html
const ORDER_INDEX_KEY = 'orderIndex';
const ORDER_KEY_PREFIX = 'order:';
// 'orderIndex' ไม่มี 'order:' อยู่ข้างใน จึงไม่ถูกจับผิดเป็นคีย์ของใบ
function isOrderKey_(key) { return String(key || '').indexOf(ORDER_KEY_PREFIX) === 0; }

const STATUS_LABEL = {
  PENDING_FM: 'รออนุมัติ (ผจก.โรงงาน)',
  PENDING_GM: 'รออนุมัติ (ผจก.ทั่วไป)',
  NEEDS_INFO_FM: 'ต้องการข้อมูลเพิ่มเติม (ผจก.โรงงาน)',
  NEEDS_INFO_GM: 'ต้องการข้อมูลเพิ่มเติม (ผจก.ทั่วไป)',
  PENDING_ASSIGN: 'รอมอบหมายช่าง',
  ASSIGNED: 'รอดำเนินการ',
  IN_PROGRESS: 'กำลังซ่อม',
  PENDING_VERIFY: 'รอผู้แจ้งตรวจสอบผลการซ่อม',
  DONE: 'ซ่อมเรียบร้อย',
  REJECTED: 'ไม่อนุมัติ'
};
const STATUS_OPTIONS = Object.keys(STATUS_LABEL).map(k => STATUS_LABEL[k]);

const APPROVAL_LABEL = { approved: 'อนุมัติ', rejected: 'ไม่อนุมัติ' };
const APPROVAL_OPTIONS = ['อนุมัติ', 'ไม่อนุมัติ'];

const READ_OPTIONS = ['อ่านแล้ว', 'ยังไม่อ่าน'];

// เลเบล/ตัวเลือกของฟิลด์ใหม่ฝั่ง ผจก.แผนกซ่อมบำรุง — ต้องตรงกับ DOC_TYPES / EXECUTION_PLAN_META /
// INSPECTOR_OPINION_META ใน index.html เป๊ะๆ (คีย์ฝั่ง JS ตรงนี้ = key ที่แอปส่งมา, ค่า = label ที่จะโชว์ในชีต)
const DOC_TYPE_LABEL = { request: 'ใบคำร้อง', repair: 'ใบแจ้งซ่อม' };
const DOC_TYPE_OPTIONS = Object.keys(DOC_TYPE_LABEL).map(k => DOC_TYPE_LABEL[k]);

const EXECUTION_PLAN_LABEL = {
  immediate: 'ดำเนินการได้ทันที',
  need_purchase: 'ต้องการสั่งซื้ออุปกรณ์',
  use_existing: 'ใช้อุปกรณ์ที่มีอยู่'
};
const EXECUTION_PLAN_OPTIONS = Object.keys(EXECUTION_PLAN_LABEL).map(k => EXECUTION_PLAN_LABEL[k]);

const INSPECTOR_OPINION_LABEL = {
  send_repair: 'ส่งซ่อม',
  external: 'เรียกช่างภายนอกมาซ่อม',
  self_repair: 'ซ่อมเอง',
  buy_parts: 'ซื้ออุปกรณ์มาทำเอง'
};
const INSPECTOR_OPINION_OPTIONS = Object.keys(INSPECTOR_OPINION_LABEL).map(k => INSPECTOR_OPINION_LABEL[k]);

const VERIFY_RESULT_LABEL = {
  pass: 'ผ่าน — ใช้งานได้ปกติ',
  fail: 'ไม่ผ่าน — ต้องซ่อมเพิ่มเติม'
};

// สีเดียวกับ status pill ในตัวเว็บแอป
const STATUS_COLORS = {
  'รออนุมัติ (ผจก.โรงงาน)': { bg: '#fbf0dd', color: '#c17f1e' },
  'รออนุมัติ (ผจก.ทั่วไป)': { bg: '#fbf0dd', color: '#c17f1e' },
  'ต้องการข้อมูลเพิ่มเติม (ผจก.โรงงาน)': { bg: '#f1ecf8', color: '#6b4fa0' },
  'ต้องการข้อมูลเพิ่มเติม (ผจก.ทั่วไป)': { bg: '#f1ecf8', color: '#6b4fa0' },
  'รอมอบหมายช่าง':          { bg: '#e4f0f7', color: '#2a6f97' },
  'รอดำเนินการ':            { bg: '#eef0f2', color: '#6b7785' },
  'กำลังซ่อม':              { bg: '#e6ecf1', color: '#1F2C3B' },
  'รอผู้แจ้งตรวจสอบผลการซ่อม': { bg: '#f1ecf8', color: '#6b4fa0' },
  'ซ่อมเรียบร้อย':          { bg: '#e6f3ee', color: '#2F8F6B' },
  'ไม่อนุมัติ':             { bg: '#fbeae8', color: '#B5433A' }
};
const APPROVAL_COLORS = {
  'อนุมัติ':    { bg: '#e6f3ee', color: '#2F8F6B' },
  'ไม่อนุมัติ': { bg: '#fbeae8', color: '#B5433A' }
};
const READ_COLORS = {
  'อ่านแล้ว':   { bg: '#eef0f2', color: '#6b7785' },
  'ยังไม่อ่าน': { bg: '#fbf0dd', color: '#c17f1e' }
};
const DOC_TYPE_COLORS = {
  'ใบคำร้อง':   { bg: '#eef0f2', color: '#6b7785' },
  'ใบแจ้งซ่อม': { bg: '#e4f0f7', color: '#2a6f97' }
};
const EXECUTION_PLAN_COLORS = {
  'ดำเนินการได้ทันที':      { bg: '#e6f3ee', color: '#2F8F6B' },
  'ต้องการสั่งซื้ออุปกรณ์':  { bg: '#fbf0dd', color: '#c17f1e' },
  'ใช้อุปกรณ์ที่มีอยู่':     { bg: '#eef0f2', color: '#6b7785' }
};
const INSPECTOR_OPINION_COLORS = {
  'ส่งซ่อม':                 { bg: '#fbf0dd', color: '#c17f1e' },
  'เรียกช่างภายนอกมาซ่อม':   { bg: '#fbf0dd', color: '#c17f1e' },
  'ซ่อมเอง':                 { bg: '#e6f3ee', color: '#2F8F6B' },
  'ซื้ออุปกรณ์มาทำเอง':      { bg: '#fbf0dd', color: '#c17f1e' }
};

function buildColorRules_(range, colorMap) {
  return Object.keys(colorMap).map(val => {
    const c = colorMap[val];
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(val)
      .setBackground(c.bg)
      .setFontColor(c.color)
      .setRanges([range])
      .build();
  });
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getKvSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(KV_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(KV_SHEET);
    sheet.appendRow(['key', 'value']);
  }
  return sheet;
}

// v7: เดิมฟังก์ชันนี้ใช้ sheet.getDataRange().getValues() ซึ่งดึงคอลัมน์ B (value) มาด้วยทุกแถว —
// สำหรับชีต KV ที่มีคีย์อย่าง photos:<id> (รูปเก็บเป็น base64 data URL ตัวยาวมาก) ยิ่งมีใบแจ้งซ่อม/
// รูปสะสมเยอะขึ้นเรื่อยๆ การอ่าน "ทุกแถวทุกคอลัมน์" แค่เพื่อหาว่าคีย์ที่ต้องการอยู่แถวไหน จะโหลดข้อมูล
// รูปภาพทั้งหมดในระบบเข้าหน่วยความจำทุกครั้งที่มีการเรียก getKvValue_/setKvValue_ (ทุก storeGet/storeSet
// จากแอป รวมถึง userRoles/accessRequests ที่ไม่เกี่ยวกับรูปเลยก็โดนลากมาด้วย) นี่คือสาเหตุหลักที่คิดว่า
// ทำให้การขอสิทธิ์เข้าใช้งานช้าลงเรื่อยๆ ตามข้อมูลที่สะสม — ตอนนี้อ่านเฉพาะคอลัมน์ A (คีย์) มาค้นหาก่อน
// แล้วค่อยดึงเฉพาะเซลล์ค่า (คอลัมน์ B) ของแถวที่เจอจริงๆ ทีหลัง (ดู getKvValue_/setKvValue_) ไม่โหลด
// ค่าของแถวอื่นที่ไม่เกี่ยวข้องเข้ามาเลย
function findRow_(sheet, key) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < keys.length; i++) {
    if (keys[i][0] === key) return i + 2;
  }
  return -1;
}

function getKvValue_(key) {
  const sheet = getKvSheet_();
  const row = findRow_(sheet, key);
  return row === -1 ? null : sheet.getRange(row, 2).getValue();
}

function setKvValue_(key, value) {
  const sheet = getKvSheet_();
  const row = findRow_(sheet, key);
  if (row === -1) sheet.appendRow([key, value]);
  else sheet.getRange(row, 2).setValue(value);
}

/* ---------- v10: อ่าน/เขียน "หลายคีย์" ในการรันครั้งเดียว ----------
   ทุก storeGet/storeSet หนึ่งครั้ง = หนึ่ง execution ของ Apps Script และ Web App ที่ deploy แบบ
   Execute as: Me รันคำขอของผู้ใช้ทุกคนภายใต้โควตา concurrency ของเจ้าของสคริปต์คนเดียว
   ตัวเลขที่เป็นคอขวดจริงจึงคือ "จำนวนคำขอ" ไม่ใช่ขนาดข้อมูล

   ตั้งแต่ย้ายมาเก็บใบละช่อง (v9) การเปิดแอปหนึ่งครั้งต้องยิง 8 + จำนวนใบ คำขอ (ดัชนีหนึ่ง แล้วใบละหนึ่ง)
   30 ใบ = 38 execution ต่อการเปิดหนึ่งครั้ง และการกดส่งหนึ่งครั้งกิน 7 + จำนวนรูป execution
   ซึ่งทุกตัวต้องรอ LockService ตัวเดียวกันทีละตัว = อาการ "โหลดช้า/ส่งช้า" ที่กลับมาอีกครั้ง

   สองฟังก์ชันนี้คือฐานของทางแก้: อ่านคอลัมน์คีย์ (A) รอบเดียวแล้วหยิบเฉพาะช่องค่าที่ต้องใช้
   แถวที่ติดกันจะถูกอ่านรวดเดียว (ปกติแถวของใบถูกต่อท้ายพร้อมกันตอนย้ายระบบ จึงติดกันเกือบทั้งหมด)
   ห้ามกลับไปใช้ getDataRange().getValues() เด็ดขาด — มันลากค่าคอลัมน์ B ของทุกแถวรวมถึงรูป base64
   ทั้งระบบเข้าหน่วยความจำ ซึ่งเคยเป็นต้นเหตุความช้ามาแล้วครั้งหนึ่ง (ดูหมายเหตุ v7 เหนือ findRow_) */
function kvKeyRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const rows = new Map();
  if (lastRow < 2) return { rows: rows, lastRow: lastRow };
  const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i][0];
    if (k === '' || k === null || k === undefined) continue;
    // แถวแรกที่เจอชนะ — ต้องตรงกับ findRow_ เป๊ะ ไม่งั้นอ่านกับเขียนจะไปคนละแถวเมื่อมีคีย์ซ้ำค้างอยู่
    if (!rows.has(k)) rows.set(k, i + 2);
  }
  return { rows: rows, lastRow: lastRow };
}

// คืน Map(คีย์ -> ค่าดิบ) ค่า null = ไม่มีคีย์นั้น (ความหมายเดียวกับ getKvValue_)
function kvValuesWith_(sheet, rowOf, keys) {
  const out = new Map();
  if (!keys || !keys.length) return out;
  const picks = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (!k || out.has(k)) continue;
    out.set(k, null);
    const row = rowOf.get(k);
    if (row) picks.push({ key: k, row: row });
  }
  picks.sort(function (a, b) { return a.row - b.row; });
  let i = 0;
  while (i < picks.length) {
    let j = i;
    while (j + 1 < picks.length && picks[j + 1].row === picks[j].row + 1) j++;
    const vals = sheet.getRange(picks[i].row, 2, j - i + 1, 1).getValues();
    for (let n = i; n <= j; n++) out.set(picks[n].key, vals[n - i][0]);
    i = j + 1;
  }
  return out;
}

function getKvValues_(keys) {
  const sheet = getKvSheet_();
  return kvValuesWith_(sheet, kvKeyRows_(sheet).rows, keys);
}

/* เขียนหลายคีย์รวดเดียว — คีย์ที่มีอยู่แล้วเขียนทับช่องเดิม คีย์ใหม่ต่อท้ายเป็นบล็อกเดียว
   pairs = [{ key, value }, ...] ค่าที่ส่งมาต้องเป็นสตริงพร้อมเขียนแล้ว (ฝั่งแอป JSON.stringify มาให้) */
function setKvValues_(pairs) {
  if (!pairs || !pairs.length) return;
  const sheet = getKvSheet_();
  const info = kvKeyRows_(sheet);
  const appends = [];
  const appendAt = new Map();   // คีย์เดิมที่มาซ้ำในชุดเดียวกันต้องลงแถวเดียว ไม่ใช่งอกสองแถว
  for (let i = 0; i < pairs.length; i++) {
    const key = pairs[i].key;
    const value = pairs[i].value;
    const row = info.rows.get(key);
    if (row) { sheet.getRange(row, 2).setValue(value); continue; }
    if (appendAt.has(key)) { appends[appendAt.get(key)][1] = value; continue; }
    appendAt.set(key, appends.length);
    appends.push([key, value]);
  }
  if (!appends.length) return;
  const start = Math.max(info.lastRow, 1) + 1;
  const need = start + appends.length - 1;
  // ต่อท้ายทีเดียวด้วย setValues ต้องมีแถวรองรับก่อน (appendRow ขยายให้เอง แต่ setValues ไม่ขยาย)
  if (sheet.getMaxRows() < need) sheet.insertRowsAfter(sheet.getMaxRows(), need - sheet.getMaxRows());
  sheet.getRange(start, 1, appends.length, 2).setValues(appends);
}

function getOrCreateSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  return sheet;
}

/* บันทึกเหตุการณ์/ข้อผิดพลาดไว้ในแท็บ "บันทึกข้อผิดพลาด" แทนการปล่อยให้เงียบหายไปทั้งหมด
   ตัดรายการเก่าทิ้งเมื่อเกิน 300 แถว กันไม่ให้แท็บนี้โตไม่มีที่สิ้นสุด */
function logSyncError_(context, err) {
  try {
    const sheet = getOrCreateSheet_(ERROR_LOG_SHEET, ['เวลา', 'บริบท', 'ข้อความ']);
    sheet.appendRow([new Date(), context, (err && err.message) ? err.message : String(err)]);
    const maxRows = 300;
    const lastRow = sheet.getLastRow();
    if (lastRow - 1 > maxRows) {
      sheet.deleteRows(2, lastRow - 1 - maxRows);
    }
  } catch (e) { /* การ log เองต้องไม่ throw ซ้ำ ไม่งั้นจะพังตัวการทำงานหลักไปด้วย */ }
}

/* ---------- การเขียนแท็บสำเนา (ใบแจ้งซ่อม/การแจ้งเตือน/config) ----------

   v3: เลิกใช้ setNumberFormat('@') โดยสิ้นเชิง — ตัวนั้นคือต้นเหตุ error
   "ตั้งค่ารูปแบบตัวเลขของเซลล์ในคอลัมน์ที่มีการจัดประเภทไม่ได้" เมื่อแท็บถูกแปลงเป็น
   "ตาราง (Table)" หรือคอลัมน์ถูกกำหนดประเภทไว้ ซึ่งทำให้การซิงก์ล้มทั้งกระดาน
   วิธีใหม่: ใส่เครื่องหมาย ' (apostrophe) นำหน้าค่าในคอลัมน์วันที่แทน — Google Sheets
   จะเก็บเป็นข้อความล้วนเสมอ (ไม่โชว์เครื่องหมาย) ไม่มีทาง auto-parse เป็นปี ค.ศ. 1969
   และไม่มี API ไหนที่จะ throw ได้อีก

   v4: เลิกล้างแถวหัวตาราง (แถว 1) ตอนซิงก์ — ล้าง/เขียนเฉพาะแถว 2 ลงไป และจะเขียน
   หัวตารางก็ต่อเมื่อแถว 1 ว่างทั้งแถว หรือยังเป็นชื่อ default ของ "ตาราง (Table)"
   ("คอลัมน์ 1"/"Column 1" ...) เท่านั้น → ครอบแท็บด้วย Table ได้โดยชื่อคอลัมน์ไม่ถูก
   รีเซ็ตทุกครั้งที่มีใบแจ้งซ่อมใหม่ และชื่อหัวที่ผู้ใช้ตั้งเองจะคงอยู่ถาวร
   พร้อมกันนี้เปลี่ยนลำดับการเขียน ใบแจ้งซ่อม/การแจ้งเตือน เป็นเก่า→ใหม่
   รายการใหม่จึงไปต่อท้ายแถวล่างสุดแทนการแทรกขึ้นบนสุด

   เผื่อเหนียว: ถ้าการเขียนยัง throw ด้วยเหตุอื่นใดก็ตาม → ลบแท็บทิ้งสร้างใหม่สดๆ
   (rebuildSheet_) แล้วเขียนซ้ำ — แท็บใหม่ไม่มีการจัดประเภท/Table ติดมา เขียนได้แน่นอน

   v5: เพิ่มคอลัมน์ท้ายตาราง (V เป็นต้นไป) สำหรับฟิลด์ใหม่ฝั่ง ผจก.แผนกซ่อมบำรุงกับผู้แจ้งซ่อม
   (ประเภทเอกสาร, ผู้รับใบแจ้งซ่อม, การดำเนินงาน, บันทึกซ่อมบำรุง, ผลตรวจสอบ) — จงใจต่อท้าย
   ไม่แทรกคั่นกลาง เพื่อไม่ให้ตำแหน่งคอลัมน์ A-U เดิมขยับ (onEditDocForm_ อ้างอิงตำแหน่ง
   แถวแบบตายตัวจากชีตนี้ไปเติมฟอร์มกระดาษในแท็บ "เอกสาร")

   v6: คอลัมน์ "จำนวนรูปภาพ" (U) กลายเป็นลิงก์ HYPERLINK ไปหน้าเว็บ (ดู renderPhotosPage_
   + doGet's ?view=photos&id=... ด้านล่าง) ที่แสดงรูปทั้งหมดของใบแจ้งซ่อมนั้นในหน้าเดียว
   แทนที่จะโชว์แค่ตัวเลขจำนวนรูปเฉยๆ — ไม่กระทบตำแหน่งคอลัมน์เดิม แค่เปลี่ยนค่าที่เขียนลงไป */

function clearAndWriteSheet_(name, headers, rows, textColumns) {
  const prepped = prepTextColumns_(rows, textColumns);
  try {
    writeSheet_(getOrCreateSheet_(name, headers), headers, prepped);
  } catch (err) {
    logSyncError_('rebuildSheet:' + name, err);
    writeSheet_(rebuildSheet_(name, headers), headers, prepped);
  }
}

/* เติม ' นำหน้าค่าในคอลัมน์ (1-based) ที่ต้องเก็บเป็นข้อความล้วน เพื่อกัน Sheets
   auto-parse สตริงวันที่ พ.ศ. 2 หลัก (เช่น "31/07/69") เป็นวันที่ปี ค.ศ. 1969 */
function prepTextColumns_(rows, textColumns) {
  if (!textColumns || !textColumns.length || !rows.length) return rows;
  return rows.map(r => {
    const copy = r.slice();
    textColumns.forEach(col => {
      const v = copy[col - 1];
      if (v !== '' && v !== null && v !== undefined) copy[col - 1] = "'" + v;
    });
    return copy;
  });
}

/* แถวหัวตาราง (แถว 1) จะถูกเขียนก็ต่อเมื่อว่างทั้งแถว หรือยังเป็นชื่อ default ของ
   "ตาราง (Table)" ("คอลัมน์ 1"/"Column 1") — ชื่อหัวที่ผู้ใช้ตั้งเองจะไม่ถูกแตะเลย */
function headersNeedRepair_(sheet, headers) {
  if (sheet.getLastRow() === 0) return true;
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (current.every(v => String(v).trim() === '')) return true;
  return /^(คอลัมน์|Column)\s*\d+$/i.test(String(current[0]).trim());
}

/* v9: กันกรณีแท็บมีคอลัมน์น้อยกว่าที่จะเขียน — เกิดขึ้นทุกครั้งที่เพิ่มคอลัมน์ใหม่ต่อท้าย
   (แท็บเดิมกว้าง 29 คอลัมน์ แต่ v9 เขียน 30) ถ้าไม่ขยายก่อน setValues จะ throw ทั้งรอบ */
function ensureColumns_(sheet, needed) {
  const have = sheet.getMaxColumns();
  if (have < needed) sheet.insertColumnsAfter(have, needed - have);
}

/* v9: เติมชื่อหัวตารางเฉพาะช่องที่ "ว่างอยู่จริง" เท่านั้น
   headersNeedRepair_ เขียนหัวตารางใหม่ทั้งแถวก็ต่อเมื่อแถว 1 ว่างทั้งแถวหรือเป็นชื่อ default
   ซึ่งแปลว่าแท็บที่ใช้งานอยู่จะ "ไม่มีวัน" ได้ชื่อของคอลัมน์ที่เพิ่มใหม่เลย (ข้อมูลมี 30 ช่อง
   แต่หัวตารางค้างที่ 29) — ตรงนี้จึงเติมให้เฉพาะช่องว่าง ชื่อที่ผู้ใช้ตั้งเองไม่ถูกแตะ */
function ensureTrailingHeaders_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  for (let i = 0; i < headers.length; i++) {
    if (String(current[i]).trim() === '') sheet.getRange(1, i + 1).setValue(headers[i]);
  }
}

function writeSheet_(sheet, headers, rows) {
  ensureColumns_(sheet, headers.length);
  if (headersNeedRepair_(sheet, headers)) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    ensureTrailingHeaders_(sheet, headers);
  }
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getMaxColumns()).clearContents();
  }
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

/* ลบแท็บชื่อ name ทิ้งแล้วสร้างใหม่ที่ตำแหน่งเดิม (พร้อมหัวตาราง) เพื่อล้าง
   "การจัดประเภทคอลัมน์"/"ตาราง (Table)" ที่ค้างอยู่ซึ่งบล็อกการเขียน
   ใช้เฉพาะแท็บที่แอปเป็นเจ้าของข้อมูล — ปลอดภัยเพราะข้อมูลจริงอยู่ใน KV
   (ข้อแลกเปลี่ยน: ถ้าแท็บถูกครอบด้วย Table อยู่ Table จะหายไปด้วย —
   เกิดเฉพาะกรณีการเขียนปกติ throw ซึ่งถูกบันทึกลง "บันทึกข้อผิดพลาด" เสมอ) */
function rebuildSheet_(name, headers) {
  const ss = getSpreadsheet_();
  const old = ss.getSheetByName(name);
  let idx = 0;
  if (old) { idx = old.getIndex(); ss.deleteSheet(old); }
  const sheet = ss.insertSheet(name, Math.max(idx - 1, 0));
  sheet.appendRow(headers);
  return sheet;
}

/* ---------- แปลงวันเวลาดิบ (ISO UTC) ให้อ่านง่ายแบบไทย ตรงกับหน้าเว็บแอป ---------- */

function formatDateTime_(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const parts = Utilities.formatDate(d, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm').split(/[\/ :]/);
    const yy = String((parseInt(parts[2], 10) + 543) % 100).padStart(2, '0');
    return parts[0] + '/' + parts[1] + '/' + yy + ' ' + parts[3] + ':' + parts[4];
  } catch (e) { return isoString; }
}

function formatDateOnly_(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String((d.getFullYear() + 543) % 100).padStart(2, '0');
    return dd + '/' + mm + '/' + yy;
  } catch (e) { return dateStr; }
}

/* ---------- ฟอร์แมตฟิลด์ใหม่ของ ผจก.แผนกซ่อมบำรุง / ผู้แจ้งซ่อม ให้เป็นข้อความอ่านง่ายในชีต ---------- */

// รายการอะไหล่/วัสดุที่ใช้ (order.maintRecord.parts[]) → รวมเป็นข้อความหลายบรรทัดในเซลล์เดียว
function formatParts_(parts) {
  if (!parts || !parts.length) return '';
  return parts.map((p, i) => {
    const bits = [p.name];
    if (p.qty || p.unit) bits.push('จำนวน ' + [p.qty, p.unit].filter(Boolean).join(' '));
    if (p.price) bits.push('ราคา ' + p.price + ' บาท');
    if (p.shop) bits.push('ร้าน ' + p.shop);
    if (p.note) bits.push('หมายเหตุ ' + p.note);
    return (i + 1) + '. ' + bits.filter(Boolean).join(' / ');
  }).join('\n');
}

// ประวัติรอบที่ผู้แจ้งตรวจสอบแล้ว "ไม่ผ่าน" (order.verificationHistory[]) → หลายบรรทัดในเซลล์เดียว
function formatVerificationHistory_(history) {
  if (!history || !history.length) return '';
  return history.map(v => formatDateTime_(v.at) + ' — ไม่ผ่าน: ' + (v.note || '')).join('\n');
}

/* ---------- แผนก / เครื่องจักร / ช่าง: Sheet เป็นต้นฉบับข้อมูลจริง (bidirectional) ---------- */

function readDepts_() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(DEPTS_SHEET);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const code = data[i][0];
    if (code) out.push({ code: String(code).trim(), name: String(data[i][1] || code).trim() });
  }
  return out;
}

function readMachines_() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(MACHINES_SHEET);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const code = data[i][0];
    if (code) out.push({ code: String(code).trim(), name: String(data[i][1] || '').trim(), dept: String(data[i][2] || '').trim() });
  }
  return out;
}

function readTechs_() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(TECHS_SHEET);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const name = data[i][0];
    if (name) out.push(String(name).trim());
  }
  return out;
}

function writeConfigSheets_(config) {
  clearAndWriteSheet_(DEPTS_SHEET, ['รหัส', 'ชื่อแผนก'], (config.departments || []).map(d => [d.code, d.name]));
  clearAndWriteSheet_(MACHINES_SHEET, ['รหัสเครื่อง', 'ชื่อเครื่องจักร', 'แผนก'], (config.machines || []).map(m => [m.code, m.name, m.dept]));
  clearAndWriteSheet_(TECHS_SHEET, ['ชื่อช่าง'], (config.technicians || []).map(t => [t]));
}

/* ---------- สิทธิ์ผู้ใช้ LINE: userId -> บทบาท (1 คนมีได้หลายบทบาท, admin แก้ไขในชีตตรงๆ)
   คอลัมน์ที่ 3 "ชื่อ" เป็นข้อความอิสระทุกแถว (ไว้ให้แอดมินดูว่าใครเป็นใคร) แต่แอปจะ
   อ่านค่านี้จริงเฉพาะแถวที่บทบาท = tech เพื่อผูกบัญชีนั้นเข้ากับชื่อในแท็บ "ช่าง"
   (ต้องพิมพ์ให้ตรงกันทุกตัวอักษร) — ทำให้แอปรู้ว่าล็อกอินนี้คือช่างคนไหน
   1 userId อาจมีหลายแถวบทบาท tech ได้ จึงคืนค่าเป็น techNames (อาเรย์)

   แม้ชื่อแท็บจะยังเป็น "สิทธิ์ผู้ใช้ LINE" แต่ตั้งแต่เลิกใช้ LINE LIFF แล้ว คอลัมน์ userId
   เก็บ "รหัสประจำเครื่อง" รูปแบบ D-<สุ่ม> ที่แอปสร้างให้ ไม่ใช่ LINE userId อีกต่อไป
   ตรงนี้ไม่ได้กรองรูปแบบใดๆ ทั้งสิ้น — เทียบสตริงตรงๆ แถว U... เก่าจึงยังอยู่ได้เฉยๆ

   v8: เลิกใช้ getOrCreateSheet_ ตรงนี้ — ของเดิมถ้าหาแท็บไม่เจอจะ "สร้างแท็บเปล่าให้"
   แล้วคืน roles ว่าง = กลบปัญหาไว้เงียบๆ แถมทำให้การเช็คสิทธิ์ (ซึ่งควรเป็น read-only)
   ไปเขียนอะไรทิ้งไว้ในไฟล์ที่อาจเป็นไฟล์ผิด ตอนนี้อ่านอย่างเดียว ไม่สร้างอะไรเพิ่ม
   และ normalize บทบาทเป็นตัวพิมพ์เล็ก + ตัดค่าซ้ำ เผื่อพิมพ์ Admin/ADMIN ในชีต ---------- */

function readUserRoles_(userId) {
  const want = String(userId == null ? '' : userId).trim();
  const roles = [];
  const techNames = [];
  if (!want) return { roles: roles, techNames: techNames };

  const sheet = getSpreadsheet_().getSheetByName(PERMISSIONS_SHEET);
  if (!sheet) return { roles: roles, techNames: techNames };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== want || !data[i][1]) continue;
    const role = String(data[i][1]).trim().toLowerCase();
    if (role && roles.indexOf(role) === -1) roles.push(role);
    if (role === 'tech' && data[i][2]) {
      const name = String(data[i][2]).trim();
      if (name && techNames.indexOf(name) === -1) techNames.push(name);
    }
  }
  return { roles: roles, techNames: techNames };
}

/* ---------- แจ้งเตือน LINE - ผู้รับ: อ่านอย่างเดียวส่งให้ฝั่งเว็บเลือกตอนอนุมัติคำขอสิทธิ์
   (แท็บนี้ผู้ดูแลพิมพ์เองด้วยมือ ใช้อยู่แล้วโดยสคริปต์ "LineOA MT" ตอนส่งข้อความจริง —
   endpoint นี้แค่ให้เว็บแอปอ่านมาโชว์เป็นตัวเลือก ไม่ได้เขียนอะไรกลับไปที่แท็บนี้เลย) ---------- */
function readLineRecipients_() {
  const sheet = getSpreadsheet_().getSheetByName(LINE_RECIPIENTS_SHEET);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const role = String(data[i][0] || '').trim();
    const userId = String(data[i][1] || '').trim();
    if (!role || !userId) continue;
    out.push({ role: role, userId: userId, name: String(data[i][2] || '').trim() });
  }
  return out;
}

/* ---------- ใบแจ้งซ่อม / การแจ้งเตือน: แอปเป็นเจ้าของข้อมูล, Sheet เป็นสำเนาแสดงผล ---------- */

/* หัวตารางของแท็บ "ใบแจ้งซ่อม"
   v9: เพิ่มคอลัมน์ที่ 30 (AD) "รหัสอ้างอิงระบบ" เก็บ order.id ไว้ — จำเป็นเพราะตอนนี้เขียนทีละแถว
   จึงต้องหาให้เจอว่าใบนี้อยู่แถวไหน เลขที่เอกสารใช้แทนได้ไม่สนิท (ใบเก่าบางใบเก็บคนละรูปแบบ
   ดู findOrderRowByDocNumber_) ต่อท้ายเท่านั้นตามกติกาเดิม A-AC ไม่ขยับ */
const ORDERS_HEADERS = [
  'เลขที่เอกสาร', 'แผนก', 'รหัสเครื่องจักร', 'ชื่อเครื่องจักร', 'อาการ/สาเหตุ', 'วันที่ต้องการใช้งาน', 'ผู้แจ้ง', 'แจ้งเมื่อ', 'สถานะ', 'อนุมัติผจก.โรงงาน', 'โดย/เมื่อ (ผจก.โรงงาน)', 'หมายเหตุ (ผจก.โรงงาน)', 'อนุมัติผจก.ทั่วไป', 'โดย/เมื่อ (ผจก.ทั่วไป)', 'หมายเหตุ (ผจก.ทั่วไป)', 'ช่างผู้รับผิดชอบ', 'วันที่เริ่มงาน', 'วันที่คาดว่าจะเสร็จ', 'มอบหมายโดย', 'มอบหมายเมื่อ', 'จำนวนรูปภาพ',
  // --- v5: ฟิลด์ใหม่ (ต่อท้ายเท่านั้น — ห้ามแทรกคั่นกลาง ดูหมายเหตุด้านบน) ---
  'ประเภทเอกสาร', 'ผู้รับใบแจ้งซ่อม', 'การดำเนินงาน', 'วิเคราะห์สาเหตุ/อาการที่ชำรุด', 'ความคิดเห็นของช่างผู้ตรวจสอบ', 'รายการอะไหล่/วัสดุที่ใช้', 'ผลการตรวจสอบของผู้แจ้ง (ล่าสุด)', 'ประวัติตรวจสอบไม่ผ่าน',
  // --- v9 ---
  'รหัสอ้างอิงระบบ'
];
/* F(6) วันที่ต้องการใช้งาน, H(8) แจ้งเมื่อ, K(11)/N(14) โดย/เมื่อ, Q(17) วันที่เริ่มงาน,
   R(18) วันที่คาดว่าจะเสร็จ, T(20) มอบหมายเมื่อ, AB(28) ผลตรวจสอบล่าสุด, AC(29) ประวัติตรวจสอบไม่ผ่าน
   — คอลัมน์สตริงวันที่แบบไทย (หรือมีวันที่แบบไทยฝังอยู่) เก็บเป็นข้อความล้วนทั้งหมด
   (U/21 "จำนวนรูปภาพ" เป็นสูตร HYPERLINK หรือตัวเลขล้วน และ AD/30 เป็นรหัสอ้างอิง จึงไม่อยู่ในลิสต์นี้) */
const ORDERS_TEXT_COLUMNS = [6, 8, 11, 14, 17, 18, 20, 28, 29];
const ORDERS_ID_COLUMN = 30;

/* ข้อมูลประกอบที่ใช้ร่วมกันทุกแถว (ตารางค้นหาเครื่องจักรสำหรับสูตร HYPERLINK + URL ของ deployment)
   แยกออกมาเพื่อให้สร้างครั้งเดียวแล้วใช้ได้ทั้งตอนเขียนทั้งแท็บและตอนเขียนทีละแถว */
function ordersRowContext_() {
  const machinesSheet = getSpreadsheet_().getSheetByName(MACHINES_SHEET);
  const machineRowByCode = {};
  let machinesGid = null;
  if (machinesSheet) {
    machinesGid = machinesSheet.getSheetId();
    const data = machinesSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const code = data[i][0];
      if (code) machineRowByCode[code] = i + 1;
    }
  }
  // v6: URL ของ deployment ปัจจุบัน ใช้สร้างลิงก์ดูรูปภาพ (ว่างได้ถ้ารันนอกบริบท Web App —
  // ตอนนั้นคอลัมน์รูปภาพจะกลับไปโชว์แค่ตัวเลขจำนวนรูปเหมือนเดิม ไม่ throw)
  return { machineRowByCode: machineRowByCode, machinesGid: machinesGid, webAppUrl: ScriptApp.getService().getUrl() || '' };
}

// แปลงใบแจ้งซ่อมหนึ่งใบเป็นแถวของแท็บ (ความยาวต้องเท่ากับ ORDERS_HEADERS เสมอ)
function buildOrderRow_(o, ctx) {
  let machineCodeCell = o.machineCode;
  if (ctx.machinesGid !== null && ctx.machineRowByCode[o.machineCode]) {
    machineCodeCell = '=HYPERLINK("#gid=' + ctx.machinesGid + '&range=A' + ctx.machineRowByCode[o.machineCode] + '","' + o.machineCode + '")';
  }
  // รองรับทั้งข้อมูลเก่า (assignment.technician เดี่ยว) และใหม่ (assignment.technicians หลายคน)
  const techsList = o.assignment && o.assignment.technicians && o.assignment.technicians.length
    ? o.assignment.technicians.join(', ')
    : (o.assignment ? (o.assignment.technician || '') : '');

  const photoCount = o.photoCount || 0;
  // v6: ถ้ามีรูปและรู้ URL ของ deployment → ทำเป็นลิงก์เปิดหน้าเว็บที่โชว์รูปทั้งหมดในลิงก์เดียว
  // (renderPhotosPage_ รองรับทั้งรูปละคีย์แบบใหม่และอาร์เรย์เดียวแบบเก่า) ไม่มีรูป/ไม่รู้ URL → ตัวเลขเฉยๆ
  const photoCell = (photoCount && ctx.webAppUrl)
    ? '=HYPERLINK("' + ctx.webAppUrl + '?view=photos&id=' + o.id + '","' + photoCount + ' รูป (ดูรูป)")'
    : photoCount;

  const docTypeLabel = o.docType ? (DOC_TYPE_LABEL[o.docType] || o.docType) : '';
  const receivedByName = o.assignment ? (o.assignment.receivedByName || '') : '';
  const executionPlanLabel = o.assignment && o.assignment.executionPlan
    ? (EXECUTION_PLAN_LABEL[o.assignment.executionPlan] || o.assignment.executionPlan) : '';
  const causeAnalysis = o.maintRecord ? (o.maintRecord.causeAnalysis || '') : '';
  const inspectorOpinionLabel = o.maintRecord && o.maintRecord.inspectorOpinion
    ? (INSPECTOR_OPINION_LABEL[o.maintRecord.inspectorOpinion] || o.maintRecord.inspectorOpinion) : '';
  const partsText = formatParts_(o.maintRecord ? o.maintRecord.parts : []);
  const verifyText = o.verification
    ? (VERIFY_RESULT_LABEL[o.verification.result] || o.verification.result)
      + (o.verification.note ? ' — ' + o.verification.note : '')
      + (o.verification.at ? ' (' + formatDateTime_(o.verification.at) + ')' : '')
    : '';
  const verifyHistoryText = formatVerificationHistory_(o.verificationHistory);

  return [
    o.docNumber, o.department, machineCodeCell, o.machineName, o.cause, formatDateOnly_(o.neededDate),
    o.requestedBy, formatDateTime_(o.createdAt), STATUS_LABEL[o.status] || o.status,
    o.approvals && o.approvals.fm ? (APPROVAL_LABEL[o.approvals.fm.status] || '') : '',
    o.approvals && o.approvals.fm ? [o.approvals.fm.by, formatDateTime_(o.approvals.fm.at)].filter(Boolean).join(' / ') : '',
    o.approvals && o.approvals.fm ? o.approvals.fm.note : '',
    o.approvals && o.approvals.gm ? (APPROVAL_LABEL[o.approvals.gm.status] || '') : '',
    o.approvals && o.approvals.gm ? [o.approvals.gm.by, formatDateTime_(o.approvals.gm.at)].filter(Boolean).join(' / ') : '',
    o.approvals && o.approvals.gm ? o.approvals.gm.note : '',
    techsList,
    o.assignment ? formatDateOnly_(o.assignment.startDate) : '',
    o.assignment ? formatDateOnly_(o.assignment.endDate) : '',
    o.assignment ? o.assignment.assignedBy : '',
    o.assignment ? formatDateTime_(o.assignment.assignedAt) : '',
    photoCell,
    // --- v5 ---
    docTypeLabel, receivedByName, executionPlanLabel, causeAnalysis, inspectorOpinionLabel, partsText, verifyText, verifyHistoryText,
    // --- v9 ---
    o.id || ''
  ];
}

// เขียนทั้งแท็บใหม่ทั้งหมด — ใช้เฉพาะตอน resyncAll, ตอนล้างข้อมูล และเส้นทางคีย์ 'orders' เดิม
function syncOrdersSheet_(orders) {
  const ctx = ordersRowContext_();
  // เรียงเก่า→ใหม่ตามเวลาแจ้ง เพื่อให้ใบแจ้งซ่อมใหม่ต่อท้ายแถวล่างสุดของชีต
  const sorted = (orders || []).slice().sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const rows = sorted.map(o => buildOrderRow_(o, ctx));
  clearAndWriteSheet_(ORDERS_SHEET, ORDERS_HEADERS, rows, ORDERS_TEXT_COLUMNS);
  try {
    applyOrdersDropdowns_(rows.length);
    applyOrdersColors_(rows.length);
  } catch (e) { logSyncError_('ordersFormatting', e); }
}

/* v9: อัปเดต "เฉพาะแถวของใบนี้" แทนการล้างแล้วเขียนใหม่ทั้งแท็บ
   เดิมการกดอนุมัติหนึ่งครั้ง = เขียนทุกแถวในระบบใหม่หมด ยิ่งใบเยอะยิ่งช้าแบบทบต้น
   ตอนนี้แอปส่งมาทีละใบอยู่แล้ว (คีย์ order:<id>) จึงเขียนแค่แถวเดียวพอ
   ใบใหม่ที่ยังไม่มีแถว → ต่อท้ายแถวล่างสุด ซึ่งตรงกับการเรียงเก่า→ใหม่ของแท็บนี้พอดี */
function syncOneOrderRow_(order) {
  if (!order || !order.id) return;
  const sheet = getOrCreateSheet_(ORDERS_SHEET, ORDERS_HEADERS);
  ensureColumns_(sheet, ORDERS_HEADERS.length);
  ensureTrailingHeaders_(sheet, ORDERS_HEADERS);
  const row = prepTextColumns_([buildOrderRow_(order, ordersRowContext_())], ORDERS_TEXT_COLUMNS)[0];

  const found = findOrderSheetRow_(sheet, order.id, order.docNumber);
  if (found > 0) {
    sheet.getRange(found, 1, 1, row.length).setValues([row]);
    return;   // แถวเดิมมีดรอปดาวน์/สีอยู่แล้ว ไม่ต้องลงรูปแบบซ้ำ
  }
  const newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 1, 1, row.length).setValues([row]);
  try {
    applyOrdersDropdowns_(1, newRow);              // ดรอปดาวน์: เฉพาะแถวที่เพิ่งเพิ่ม
    applyOrdersColors_(sheet.getLastRow() - 1);    // สี: setConditionalFormatRules แทนที่กฎเดิมทั้งหมด จึงต้องครอบทั้งช่วง
  } catch (e) { logSyncError_('ordersFormatting', e); }
}

/* หาว่าใบนี้อยู่แถวไหนของแท็บ — ดูจาก "รหัสอ้างอิงระบบ" (AD) ก่อน
   ไม่เจอค่อยถอยไปเทียบเลขที่เอกสาร (A) สำหรับแถวเก่าที่เขียนไว้ก่อนมีคอลัมน์ AD
   คืน -1 เมื่อไม่พบ = ใบใหม่ ต้องต่อท้าย */
function findOrderSheetRow_(sheet, orderId, docNumber) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  if (orderId && sheet.getMaxColumns() >= ORDERS_ID_COLUMN) {
    const ids = sheet.getRange(2, ORDERS_ID_COLUMN, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === orderId) return i + 2;
    }
  }
  if (docNumber) {
    const docs = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const want = String(docNumber).trim().toUpperCase();
    for (let i = 0; i < docs.length; i++) {
      if (String(docs[i][0]).trim().toUpperCase() === want) return i + 2;
    }
  }
  return -1;
}

/* คอลัมน์ที่เป็นค่าจำกัดตัวเลือก (enum) ทำเป็นเมนูแบบเลื่อนลง:
   I สถานะ, J/M อนุมัติผจก.โรงงาน/ทั่วไป, V ประเภทเอกสาร, X การดำเนินงาน, Z ความคิดเห็นของช่างผู้ตรวจสอบ
   ส่วน K/L/N/W/Y/AA/AB/AC เป็นข้อความอิสระ (ชื่อ-เวลา/หมายเหตุ/บันทึกยาว) จึงไม่ทำเป็นดรอปดาวน์ */
function applyOrdersDropdowns_(rowCount, startRow) {
  const sheet = getSpreadsheet_().getSheetByName(ORDERS_SHEET);
  if (!sheet || rowCount < 1) return;
  /* v9: ลงดรอปดาวน์เฉพาะช่วงที่ต้องการได้ ไม่ต้องไล่ทั้งตารางทุกครั้ง
     ตอนย้ายข้อมูลครั้งแรกจะมีใบไหลเข้ามารัวๆ ทีละใบ ถ้าแต่ละใบไปลงรูปแบบใหม่ทั้งตาราง
     คำขอที่ต่อคิวรอ LockService อยู่จะรอเกิน waitLock(10000) แล้วล้มทั้งรอบ */
  const first = startRow || 2;

  const statusRule = SpreadsheetApp.newDataValidation().requireValueInList(STATUS_OPTIONS, true).setAllowInvalid(true).build();
  const approvalRule = SpreadsheetApp.newDataValidation().requireValueInList(APPROVAL_OPTIONS, true).setAllowInvalid(true).build();
  const docTypeRule = SpreadsheetApp.newDataValidation().requireValueInList(DOC_TYPE_OPTIONS, true).setAllowInvalid(true).build();
  const executionPlanRule = SpreadsheetApp.newDataValidation().requireValueInList(EXECUTION_PLAN_OPTIONS, true).setAllowInvalid(true).build();
  const inspectorOpinionRule = SpreadsheetApp.newDataValidation().requireValueInList(INSPECTOR_OPINION_OPTIONS, true).setAllowInvalid(true).build();

  sheet.getRange(first, 9, rowCount, 1).setDataValidation(statusRule);    // I: สถานะ
  sheet.getRange(first, 10, rowCount, 1).setDataValidation(approvalRule); // J: อนุมัติผจก.โรงงาน
  sheet.getRange(first, 13, rowCount, 1).setDataValidation(approvalRule); // M: อนุมัติผจก.ทั่วไป
  sheet.getRange(first, 22, rowCount, 1).setDataValidation(docTypeRule);          // V: ประเภทเอกสาร
  sheet.getRange(first, 24, rowCount, 1).setDataValidation(executionPlanRule);    // X: การดำเนินงาน
  sheet.getRange(first, 26, rowCount, 1).setDataValidation(inspectorOpinionRule); // Z: ความคิดเห็นของช่างผู้ตรวจสอบ
}

function applyOrdersColors_(rowCount) {
  const sheet = getSpreadsheet_().getSheetByName(ORDERS_SHEET);
  if (!sheet || rowCount < 1) return;
  const rules = []
    .concat(buildColorRules_(sheet.getRange(2, 9, rowCount, 1), STATUS_COLORS))    // I
    .concat(buildColorRules_(sheet.getRange(2, 10, rowCount, 1), APPROVAL_COLORS)) // J
    .concat(buildColorRules_(sheet.getRange(2, 13, rowCount, 1), APPROVAL_COLORS)) // M
    .concat(buildColorRules_(sheet.getRange(2, 22, rowCount, 1), DOC_TYPE_COLORS))         // V
    .concat(buildColorRules_(sheet.getRange(2, 24, rowCount, 1), EXECUTION_PLAN_COLORS))   // X
    .concat(buildColorRules_(sheet.getRange(2, 26, rowCount, 1), INSPECTOR_OPINION_COLORS)); // Z
  sheet.setConditionalFormatRules(rules);
}

function syncNotificationsSheet_(notifs) {
  const headers = ['บทบาทผู้รับ', 'เลขที่เอกสาร', 'ข้อความ', 'เมื่อ', 'อ่านแล้ว'];
  // เรียงเก่า→ใหม่เช่นเดียวกับใบแจ้งซ่อม — รายการใหม่ต่อท้ายแถวล่างสุด
  const sorted = (notifs || []).slice().sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const rows = sorted.map(n => [n.toRole, n.docNumber, n.message, formatDateTime_(n.createdAt), n.read ? 'อ่านแล้ว' : 'ยังไม่อ่าน']);
  // D(4) เมื่อ — สตริงวันที่แบบไทย เก็บเป็นข้อความล้วนเช่นกัน
  clearAndWriteSheet_(NOTIFS_SHEET, headers, rows, [4]);
  try {
    applyNotificationsDropdowns_(rows.length);
    applyNotificationsColors_(rows.length);
  } catch (e) { logSyncError_('notifsFormatting', e); }
}

// คอลัมน์ E (อ่านแล้ว) เป็นค่าจำกัดตัวเลือก จึงทำเป็นเมนูแบบเลื่อนลง
function applyNotificationsDropdowns_(rowCount) {
  const sheet = getSpreadsheet_().getSheetByName(NOTIFS_SHEET);
  if (!sheet || rowCount < 1) return;
  const readRule = SpreadsheetApp.newDataValidation().requireValueInList(READ_OPTIONS, true).setAllowInvalid(true).build();
  sheet.getRange(2, 5, rowCount, 1).setDataValidation(readRule); // E: อ่านแล้ว
}

function applyNotificationsColors_(rowCount) {
  const sheet = getSpreadsheet_().getSheetByName(NOTIFS_SHEET);
  if (!sheet || rowCount < 1) return;
  sheet.setConditionalFormatRules(buildColorRules_(sheet.getRange(2, 5, rowCount, 1), READ_COLORS)); // E
}

/* ---------- v6: หน้าเว็บดูรูปภาพประกอบ (ทุกรูปของใบแจ้งซ่อมเดียวกัน แสดงในลิงก์เดียว) ---------- */

/* คืนใบแจ้งซ่อมใบเดียวจาก orderId
   v9: อ่านจากช่องของใบนั้นตรงๆ (order:<id>) — เร็วกว่าเดิมมากเพราะไม่ต้องลากใบทั้งระบบมา parse
   ถ้าไม่มีช่องนั้น = ใบเก่าที่ยังไม่ถูกย้ายระบบ ค่อยถอยไปค้นในคีย์ 'orders' เดิมซึ่งยังอ่านได้
   (เขียนไม่ได้แล้วเพราะล้นเพดานช่อง แต่การอ่านไม่เกี่ยวกับเพดาน) */
function findOrderById_(orderId) {
  if (!orderId) return null;
  try {
    const raw = getKvValue_(ORDER_KEY_PREFIX + orderId);
    if (raw) {
      const one = JSON.parse(raw);
      if (one && one.id) return one;
    }
  } catch (e) { logSyncError_('findOrderById_:' + orderId, e); }
  try {
    const legacy = getKvValue_('orders');
    if (!legacy) return null;
    const orders = JSON.parse(legacy);
    return orders.find(function (o) { return o.id === orderId; }) || null;
  } catch (e) { return null; }
}

/* รูปภาพของใบแจ้งซ่อม — รองรับทั้งสองรูปแบบ
   ใหม่ (ตั้งแต่ 12 ก.ย. 2569): รูปละคีย์ photos:<id>:<ดัชนี> ใบไหนใช้แบบนี้ดูได้จากธง photosSplit
   เก่า: ทุกรูปของใบเป็นอาร์เรย์เดียวในคีย์ photos:<id>
   ค่าที่แอปเขียนลง KV ผ่าน JSON.stringify เสมอ รูปเดี่ยวจึงถูกเก็บเป็นสตริงที่มีเครื่องหมายคำพูด
   ครอบอยู่ ต้อง JSON.parse ก่อนเอาไปใส่ src ไม่งั้นจะได้ data URL ที่มี " ติดหัวท้ายแล้วรูปไม่ขึ้น */
function loadOrderPhotos_(orderId, order) {
  const out = [];
  if (order && order.photosSplit) {
    const n = order.photoCount || 0;
    for (let i = 0; i < n; i++) {
      const raw = getKvValue_('photos:' + orderId + ':' + i);
      if (!raw) continue;
      try {
        const src = JSON.parse(raw);
        if (typeof src === 'string' && src) out.push(src);
      } catch (e) { /* แถวเดียวเสียไม่ควรทำให้ทั้งหน้าว่างเปล่า */ }
    }
    return out;
  }
  try {
    const raw = getKvValue_('photos:' + orderId);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(function (x) { return typeof x === 'string' && x; }) : [];
  } catch (e) { return []; }
}

function renderPhotosPage_(orderId) {
  if (!orderId) {
    return HtmlService.createHtmlOutput(
      '<body style="font-family:sans-serif;padding:40px;text-align:center;color:#6b7785;">ไม่พบเลขที่อ้างอิงรูปภาพ</body>'
    );
  }

  // ต้องรู้จักใบก่อน ถึงจะรู้ว่ารูปของใบนี้เก็บแบบไหน (ดู loadOrderPhotos_)
  const order = findOrderById_(orderId);
  const photos = loadOrderPhotos_(orderId, order);
  const title = order ? ('รูปภาพประกอบ — ' + order.docNumber) : 'รูปภาพประกอบใบแจ้งซ่อม';

  const imgTags = photos.map(function (src, i) {
    return '<img src="' + src + '" alt="รูปที่ ' + (i + 1) + '">';
  }).join('\n');

  const html = '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>' + title + '</title>' +
    '<style>' +
    'body{font-family:"Sarabun","Segoe UI",sans-serif;max-width:680px;margin:0 auto;padding:20px 16px 60px;background:#F5F2EA;color:#232323;}' +
    'h2{color:#1F2C3B;font-size:18px;margin:0 0 4px;}' +
    'p.sub{color:#6b7785;font-size:13px;margin:0 0 20px;}' +
    'img{width:100%;display:block;border-radius:9px;margin-bottom:16px;box-shadow:0 1px 4px rgba(31,44,59,.15);}' +
    '.empty{color:#6b7785;text-align:center;padding:60px 20px;}' +
    '</style></head><body>' +
    '<h2>' + title + '</h2>' +
    '<p class="sub">' + (photos.length ? photos.length + ' รูป' : '') + '</p>' +
    (photos.length ? imgTags : '<div class="empty">ไม่มีรูปภาพแนบ</div>') +
    '</body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------- Web app entry points ---------- */

/* ---------- v10: คำขอรวม (bundle) — ข้อมูลหลายชุดในการรันครั้งเดียว ----------
   <URL>?key=bundle&keys=<คีย์คั่นด้วยจุลภาค>&userId=<รหัสประจำเครื่อง>&orders=*|<id,id,...>

   ทำไมต้องมี: ฝั่งแอปต้องใช้ข้อมูลหลายชุดพร้อมกันเสมอ (สิทธิ์ + config + ใบแจ้งซ่อม + แจ้งเตือน +
   คำขอสิทธิ์) เดิมยิงคนละคำขอ = คนละ execution และตั้งแต่เก็บใบละช่อง ยังต้องยิงเพิ่มใบละหนึ่งอีก
   เปิดแอปครั้งเดียวจึงกิน 8 + จำนวนใบ execution ทั้งที่ข้อมูลทั้งหมดนั้นอ่านจากชีตเดียวกันรอบเดียวได้

   คีย์พิเศษที่ไม่ได้อยู่ในแท็บ KV ตรงๆ ใส่ปนมาใน keys= ได้เลย ฝั่งนี้รู้จักเอง:
     config          → ประกอบสดจากแท็บ แผนก/เครื่องจักร/ช่าง (+ lineWebhooks ใน KV)
     userRoles       → ค้นจากแท็บสิทธิ์ผู้ใช้ LINE ด้วย userId ที่ส่งมา
     lineRecipients  → อ่านจากแท็บ "แจ้งเตือน LINE - ผู้รับ"

   รูปแบบคำตอบ — ทุกค่าเป็น "สตริงดิบที่ยังไม่ parse" เหมือนที่ storeGet ได้จาก doGet ปกติเป๊ะ
   เพื่อไม่ให้ชั้นขนส่งไปแตะความหมายของข้อมูล (null = ไม่มีคีย์นั้นจริงๆ):
     { bundle:10, kv:{ <key>:<raw|null> }, orderIndex:<raw|null>, orders:{ <id>:<raw|null> }, more:true? }

   เวอร์ชันเก่า (v9 ลงไป) ไม่รู้จัก key=bundle จะตอบ {"value":null} ซึ่งไม่มีฟิลด์ bundle
   ฝั่งแอปใช้จุดนี้ตรวจเองว่าเซิร์ฟเวอร์ยังไม่ได้อัปเดต แล้วถอยไปยิงทีละคีย์แบบเดิมทั้ง session
   (สำคัญมาก: ไฟล์นี้ต้องเอาไปวางในตัวแก้ไข Apps Script ด้วยมือ ระหว่างที่ยังไม่วาง แอปต้องใช้งานได้ปกติ) */
const BUNDLE_VERSION = 10;
/* เพดานของคำขอรวมหนึ่งครั้ง — กันคำตอบก้อนเดียวใหญ่เกินจนช้ากว่าเดิมบนมือถือ 4G
   เกินเพดานจะตอบ more:true แล้วฝั่งแอปขอส่วนที่เหลือต่อเป็นคำขอถัดไป (ไม่ใช่ข้อมูลหาย) */
const BUNDLE_MAX_ORDERS = 200;
const BUNDLE_MAX_CHARS = 2000000;

function buildConfig_() {
  return {
    departments: readDepts_(),
    machines: readMachines_(),
    technicians: readTechs_(),
    lineWebhooks: JSON.parse(getKvValue_('lineWebhooks') || '{}')
  };
}

function buildBundle_(params) {
  const p = params || {};
  const out = { bundle: BUNDLE_VERSION, kv: {} };
  const asked = String(p.keys || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  const ordersParam = String(p.orders == null ? '' : p.orders).trim();

  const plain = [];
  let wantConfig = false, wantRoles = false, wantRecipients = false;
  for (let i = 0; i < asked.length; i++) {
    const k = asked[i];
    if (k === 'config') { wantConfig = true; continue; }
    if (k === 'userRoles') { wantRoles = true; continue; }
    if (k === 'lineRecipients') { wantRecipients = true; continue; }
    plain.push(k);
  }
  // lineWebhooks ถูกใช้ประกอบ config อยู่แล้ว ส่วน orderIndex ต้องอ่านเมื่อขอใบมาด้วย
  if (ordersParam) plain.push(ORDER_INDEX_KEY);

  const sheet = getKvSheet_();
  const rowOf = kvKeyRows_(sheet).rows;
  const vals = kvValuesWith_(sheet, rowOf, plain);
  asked.forEach(function (k) {
    if (k === 'config' || k === 'userRoles' || k === 'lineRecipients') return;
    const v = vals.get(k);
    out.kv[k] = (v === undefined || v === null || v === '') ? null : v;
  });

  if (wantConfig) out.kv.config = JSON.stringify(buildConfig_());
  if (wantRoles) out.kv.userRoles = JSON.stringify(readUserRoles_(String(p.userId || '').trim()));
  if (wantRecipients) out.kv.lineRecipients = JSON.stringify(readLineRecipients_());

  if (!ordersParam) return out;

  const idxRaw = vals.get(ORDER_INDEX_KEY);
  out.orderIndex = (idxRaw === undefined || idxRaw === '') ? null : idxRaw;
  let ids = [];
  if (ordersParam === '*') {
    try {
      const idx = out.orderIndex ? JSON.parse(out.orderIndex) : [];
      if (Array.isArray(idx)) ids = idx.map(function (e) { return e && e.i; }).filter(Boolean);
    } catch (e) { logSyncError_('buildBundle_:orderIndex', e); }
  } else {
    ids = ordersParam.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  if (ids.length > BUNDLE_MAX_ORDERS) { ids = ids.slice(0, BUNDLE_MAX_ORDERS); out.more = true; }

  const bodies = kvValuesWith_(sheet, rowOf, ids.map(function (id) { return ORDER_KEY_PREFIX + id; }));
  out.orders = {};
  let total = 0;
  for (let i = 0; i < ids.length; i++) {
    const raw = bodies.get(ORDER_KEY_PREFIX + ids[i]);
    // ต้องเช็ค null ด้วย ไม่ใช่แค่ undefined — String(null) ได้สตริง "null" ซึ่งฝั่งแอปจะ parse
    // ออกมาเป็นค่า null ที่ "อ่านสำเร็จ" แทนที่จะเป็น "ไม่มีช่องนี้" คนละความหมายกันคนละเรื่อง
    const text = (raw === undefined || raw === null || raw === '') ? null : String(raw);
    if (total >= BUNDLE_MAX_CHARS) { out.more = true; break; }
    out.orders[ids[i]] = text;
    total += text ? text.length : 0;
  }
  return out;
}

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const key = params.key || null;

  // <URL>?view=photos&id=<orderId> — หน้าเว็บโชว์รูปภาพทั้งหมดของใบแจ้งซ่อมนั้นในลิงก์เดียว
  // (ลิงก์นี้คือสิ่งที่คอลัมน์ "จำนวนรูปภาพ" ในชีตพาไปหา ดู syncOrdersSheet_)
  if (params.view === 'photos') {
    return renderPhotosPage_((params.id || '').trim());
  }

  // เปิด <URL>?key=version ในเบราว์เซอร์ เพื่อเช็คว่า deployment นี้รันโค้ดเวอร์ชันไหน
  if (key === 'version') {
    return ContentService.createTextOutput(JSON.stringify({ value: CODE_VERSION }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // v8: <URL>?key=whoami — บอกว่า deployment นี้อ่าน/เขียน "ชีตไฟล์ไหน" จริงๆ
  // เอาไว้จับกรณี SPREADSHEET_ID ชี้ผิดไฟล์ (ย้ายบัญชี/ก๊อปชีต) ซึ่งอาการจะเนียนมาก:
  // ทุก endpoint ตอบได้ปกติ แต่ข้อมูลที่แก้ในชีตที่เปิดอยู่กลับไม่มีผลอะไรเลย
  if (key === 'whoami') {
    const ss = getSpreadsheet_();
    return ContentService.createTextOutput(JSON.stringify({
      value: JSON.stringify({
        version: CODE_VERSION,
        spreadsheetId: ss.getId(),
        spreadsheetName: ss.getName()
      })
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (key === 'config') {
    return ContentService.createTextOutput(JSON.stringify({ value: JSON.stringify(buildConfig_()) }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // v10: คำขอรวม — ดู buildBundle_ (ของเดิมทุก endpoint ยังทำงานเหมือนเดิมทุกประการ)
  if (key === 'bundle') {
    return ContentService.createTextOutput(JSON.stringify(buildBundle_(params)))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (key === 'userRoles') {
    const userId = (params.userId || '').trim();
    // v8: ไม่มี userId ก็ต้องคืนรูปแบบเดียวกับตอนมี (roles + techNames) — ของเดิมคืน techName
    // เดี่ยวซึ่งไม่ตรงกับที่ฝั่งแอปอ่าน
    const result = userId ? readUserRoles_(userId) : { roles: [], techNames: [] };
    return ContentService.createTextOutput(JSON.stringify({ value: JSON.stringify(result) }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (key === 'lineRecipients') {
    return ContentService.createTextOutput(JSON.stringify({ value: JSON.stringify(readLineRecipients_()) }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // <URL>?key=order&id=<orderId> — คืนใบแจ้งซ่อมใบเดียว (กรองจาก KV!orders ฝั่งเซิร์ฟเวอร์)
  // ใช้ตอนเปิดแอปจากลิงก์แจ้งเตือน LINE โดยตรง ให้เห็นหน้ารายละเอียดไวๆ โดยไม่ต้องโหลด orders ทั้งหมดก่อน
  if (key === 'order') {
    const orderId = (params.id || '').trim();
    const found = orderId ? findOrderById_(orderId) : null;
    return ContentService.createTextOutput(JSON.stringify({ value: found ? JSON.stringify(found) : null }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const value = key ? getKvValue_(key) : null;
  return ContentService.createTextOutput(JSON.stringify({ value: value || null }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* v10: "เขียนหนึ่งคีย์" ถูกแยกออกมาเป็นสองท่อนเพื่อให้เส้นทางคีย์เดียวกับเส้นทางชุดหลายคีย์
   ใช้ตรรกะก้อนเดียวกันเป๊ะ ไม่มีวันดริฟต์ออกจากกัน (บทเรียนซ้ำของโปรเจกต์นี้คือของสองฝั่งที่
   "ควรจะเหมือนกัน" แต่ไม่มีอะไรบังคับ สุดท้ายมันต่างกันเงียบๆ แล้วไปโผล่หน้างาน) */
function writeConfigValue_(value) {
  const config = JSON.parse(value);
  writeConfigSheets_(config);
  setKvValue_('lineWebhooks', JSON.stringify(config.lineWebhooks || {}));
}

function mirrorKvWrite_(key, value) {
  try {
    /* v9: แอปเขียนใบแจ้งซ่อมมาทีละใบแล้ว (order:<id>) จึงอัปเดตแค่แถวของใบนั้น
       ส่วนคีย์ 'orders' เดิมยังรับไว้เผื่อมีอะไรเขียนมา แต่ฝั่งแอปไม่เขียนแล้ว */
    if (isOrderKey_(key)) {
      const one = value ? JSON.parse(value) : null;
      // ค่า null = ช่องของใบที่ถูกลบออกจากดัชนีแล้ว ข้ามไป การล้างแถวจัดการที่ orderIndex
      if (one && one.id) syncOneOrderRow_(one);
    } else if (key === ORDER_INDEX_KEY) {
      /* ดัชนีว่าง = ผู้ดูแลกดล้างข้อมูลทั้งระบบ (ฝั่งแอปเขียนดัชนีว่างก่อนเสมอ แล้วค่อยล้างช่องของแต่ละใบ)
         เป็นจังหวะเดียวที่รู้ได้ว่า "ใบหายไปแล้ว" จึงล้างแท็บที่นี่
         ดัชนีที่ไม่ว่างไม่ต้องทำอะไร เพราะแต่ละใบซิงก์ผ่านคีย์ order:<id> ของตัวเองอยู่แล้ว */
      const idx = value ? JSON.parse(value) : null;
      if (Array.isArray(idx) && idx.length === 0) syncOrdersSheet_([]);
    } else if (key === 'orders') {
      syncOrdersSheet_(JSON.parse(value));
    } else if (key === 'notifications') {
      syncNotificationsSheet_(JSON.parse(value));
    }
  } catch (syncErr) {
    // mirror sync failing shouldn't break saving — but log it so it's not a silent, undebuggable drift
    logSyncError_('doPost:' + key, syncErr);
  }
}

function doPost(e) {
  if (!e || !e.postData) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'no request data' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const body = JSON.parse(e.postData.contents);

  /* v10: ชุดคำสั่งเขียนหลายคีย์ในการรันครั้งเดียว — { batch:[{key,value}, ...] }
     เหตุผลเดียวกับคำขอรวมฝั่งอ่าน แต่ฝั่งเขียนสำคัญกว่าอีก เพราะทุกการเขียนต้องเข้าคิว
     LockService ตัวเดียวกันของทั้งระบบ การกดส่งใบหนึ่งครั้งเดิมจับ-ปล่อยล็อก 5-8 รอบ
     (ตัวใบ + ดัชนี + counters + รูปทีละรูป + แจ้งเตือน) ตอนนี้เหลือรอบเดียว
     ล็อกนานขึ้นต่อครั้งจึงรอได้นานขึ้น (30 วิ) แต่จำนวนครั้งที่ต้องแย่งกันน้อยลงมาก */
  if (Array.isArray(body.batch)) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const pairs = [];
      for (let i = 0; i < body.batch.length; i++) {
        const item = body.batch[i] || {};
        if (!item.key) continue;
        // config ไม่ได้เก็บเป็นช่องเดียวใน KV (แตกเป็นแถวในสามแท็บ) จึงต้องไปทางของมันเอง
        if (item.key === 'config') { writeConfigValue_(item.value); continue; }
        pairs.push({ key: item.key, value: item.value });
      }
      // เขียนช่องใน KV ให้ครบก่อน แล้วค่อยไล่อัปเดตแท็บสำเนา — ข้อมูลตัวจริงต้องลงให้ได้ก่อนเสมอ
      // ถ้าสลับลำดับ แล้วการซิงก์แท็บพังกลางทาง จะเหลือแท็บที่อัปเดตแล้วแต่ข้อมูลจริงยังไม่ลง
      setKvValues_(pairs);
      for (let i = 0; i < pairs.length; i++) mirrorKvWrite_(pairs[i].key, pairs[i].value);
    } finally {
      lock.releaseLock();
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, written: body.batch.length }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const key = body.key;
  const value = body.value;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (key === 'config') {
      writeConfigValue_(value);
    } else {
      setKvValue_(key, value);
      mirrorKvWrite_(key, value);
    }
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function resyncAll() {
  // ประทับตราเวอร์ชันลง log ทุกครั้งที่รัน — เพื่อพิสูจน์ว่าโค้ดตัวไหนกำลังรันอยู่จริง
  // v8: ประทับ id ของชีตที่ใช้จริงลงไปด้วย จะได้เห็นทันทีถ้า SPREADSHEET_ID ชี้ผิดไฟล์
  logSyncError_('resyncAll:start', 'โค้ดเวอร์ชัน ' + CODE_VERSION + ' · ชีต ' + getSpreadsheet_().getId());
  /* อ่านทั้งแท็บ KV รวดเดียว — หนักเพราะลากค่าของคีย์รูปภาพมาด้วย แต่ฟังก์ชันนี้เป็นงานที่สั่งมือ
     นานๆ ครั้ง ไม่ได้อยู่ในเส้นทางที่ผู้ใช้ต้องรอ จึงแลกความง่ายกับความเร็วตรงนี้ได้
     (เส้นทางปกติของผู้ใช้ไม่เคยอ่านทั้งแท็บ ดู findRow_) */
  const kvSheet = getKvSheet_();
  const data = kvSheet.getDataRange().getValues();
  const orders = [];
  let legacyOrders = null, notifs = null;
  for (let i = 1; i < data.length; i++) {
    const key = data[i][0], value = data[i][1];
    if (!value) continue;
    try {
      if (isOrderKey_(key)) {
        const one = JSON.parse(value);
        if (one && one.id) orders.push(one);
      }
      else if (key === 'orders') legacyOrders = value;
      else if (key === 'notifications') notifs = value;
    } catch (e) { logSyncError_('resyncAll:' + key, e); }
  }
  try {
    // ที่เก็บใหม่ชนะเสมอถ้ามีข้อมูล — คีย์ 'orders' เดิมเป็นแค่ข้อมูลสำรองก่อนย้ายระบบ
    if (orders.length) syncOrdersSheet_(orders);
    else if (legacyOrders) syncOrdersSheet_(JSON.parse(legacyOrders));
  } catch (e) { logSyncError_('resyncAll:orders', e); }
  try {
    if (notifs) syncNotificationsSheet_(JSON.parse(notifs));
  } catch (e) { logSyncError_('resyncAll:notifications', e); }
  logSyncError_('resyncAll:done', 'เสร็จสิ้น (' + CODE_VERSION + ') · ใบแจ้งซ่อม ' + (orders.length || 0) + ' ใบจากที่เก็บใหม่');
}

const DOC_FORM_SHEET_NAME = 'เอกสาร';
const DOC_FORM_LOOKUP_CELL = 'AG4';
const DOC_FORM_ORDER_SHEET_NAME = 'ใบแจ้งซ่อม';

// ปรับ mapping ตรงนี้ถ้าตำแหน่งเซลล์ปลายทางเปลี่ยน
const DOC_FORM_FIELD_MAP = {
  machineName: 'AB6',  // คอลัม D (ชื่อเครื่องจักร)
  machineCode: 'AB7',  // คอลัม C (รหัสเครื่องจักร)
  reportedAt:  'F7',   // คอลัม H (แจ้งเมื่อ)
  neededDate:  'P7',   // คอลัม F (วันที่ต้องการใช้งาน)
  requestedBy: 'L8',   // คอลัม G (ผู้แจ้ง)
  dept:        'X8',   // คอลัม B (แผนก)
  cause:       'B10',   // คอลัม E (อาการ/สาเหตุ) — เซลล์ merge B10:AJ14 เขียนที่มุมบนซ้ายเท่านั้น
  fmDate:      'B20',  // คอลัม K (โดย/เมื่อ ผจก.โรงงาน) — ตัดมาแค่ dd/mm/yy
  gmDate:      'T20',  // คอลัม N (โดย/เมื่อ ผจก.ทั่วไป) — ตัดมาแค่ dd/mm/yy
};

// checkbox ทุกจุดในฟอร์ม — เทียบค่าจากคอลัมน์ J (อนุมัติผจก.โรงงาน), V (ประเภทเอกสาร),
// X (การดำเนินงาน), Z (ความคิดเห็นของช่างผู้ตรวจสอบ) ของชีต "ใบแจ้งซ่อม"
// และ C39/C40 เทียบจาก order.verification.result ที่ดึงตรงจาก KV!orders
const DOC_FORM_CHECKBOX_CELLS = [
  'B6', 'G6', 'K15', 'U15', 'U23', 'U24', 'U25', 'L28', 'Q28', 'Y28', 'AC28', 'C39', 'C40'
];

// ตารางรายการอะไหล่/วัสดุ (แถว 31-34) — ฟอร์มมีที่ว่างให้แค่ 4 แถว ถ้า order มีอะไหล่เกิน 4
// รายการ รายการที่ 5 ขึ้นไปจะไม่ถูกเติม (ไม่มีที่ในฟอร์มกระดาษให้ขยาย)
const DOC_FORM_PARTS_ROWS = [31, 32, 33, 34];
const DOC_FORM_PARTS_COLS = { no: 'B', name: 'D', qty: 'T', unit: 'X', price: 'Z', shop: 'AC', note: 'AG' };

// วันที่ในกล่อง "ช่างผู้ดำเนินการงาน / ส่งมอบงาน / รับมอบงาน / รับทราบ" — ลงชื่อเว้นว่างให้เซ็นมือ
// เติมแค่วันที่ด้วย order.verification.at (วันที่ผู้แจ้งยืนยันผลซ่อม) เพราะเป็นวันที่ "ปิดงาน"
// เดียวที่แอปบันทึกไว้แน่นอน ยังไม่มีวันที่แยกรายขั้นตอนของแต่ละกล่องจริงๆ
// ค่าตั้งต้น (blank) เก็บไว้คืนกลับตอนไม่มีข้อมูล/ล้างฟอร์ม
const DOC_FORM_SIGNOFF_DATE_CELLS = {
  AB37: 'วันที่ ______ / ______ / ______',
  K40:  'วันที่ _______ / _______ / _______',
  T40:  'วันที่ _______ / _______ / _______',
  AB40: 'วันที่ _______ / _______ / _______'
};

function setDocFormCheckboxes_(sheet, docTypeLabel, fmApprovalLabel, executionPlanLabel, inspectorOpinionLabel, verifyResult) {
  sheet.getRange('B6').setValue(docTypeLabel === DOC_TYPE_LABEL.request);
  sheet.getRange('G6').setValue(docTypeLabel === DOC_TYPE_LABEL.repair);

  sheet.getRange('K15').setValue(fmApprovalLabel === APPROVAL_LABEL.approved);
  sheet.getRange('U15').setValue(fmApprovalLabel === APPROVAL_LABEL.rejected);

  sheet.getRange('U23').setValue(executionPlanLabel === EXECUTION_PLAN_LABEL.immediate);
  sheet.getRange('U24').setValue(executionPlanLabel === EXECUTION_PLAN_LABEL.need_purchase);
  sheet.getRange('U25').setValue(executionPlanLabel === EXECUTION_PLAN_LABEL.use_existing);

  sheet.getRange('L28').setValue(inspectorOpinionLabel === INSPECTOR_OPINION_LABEL.send_repair);
  sheet.getRange('Q28').setValue(inspectorOpinionLabel === INSPECTOR_OPINION_LABEL.external);
  sheet.getRange('Y28').setValue(inspectorOpinionLabel === INSPECTOR_OPINION_LABEL.self_repair);
  sheet.getRange('AC28').setValue(inspectorOpinionLabel === INSPECTOR_OPINION_LABEL.buy_parts);

  sheet.getRange('C39').setValue(verifyResult === 'pass');
  sheet.getRange('C40').setValue(verifyResult === 'fail');
}

function setDocFormParts_(sheet, parts) {
  const list = parts || [];
  const c = DOC_FORM_PARTS_COLS;
  DOC_FORM_PARTS_ROWS.forEach(function (rowNum, i) {
    const p = list[i];
    sheet.getRange(c.no + rowNum).setValue(p ? (i + 1) : '');
    sheet.getRange(c.name + rowNum).setValue(p ? (p.name || '') : '');
    sheet.getRange(c.qty + rowNum).setValue(p ? (p.qty || '') : '');
    sheet.getRange(c.unit + rowNum).setValue(p ? (p.unit || '') : '');
    sheet.getRange(c.price + rowNum).setValue(p ? (p.price || '') : '');
    sheet.getRange(c.shop + rowNum).setValue(p ? (p.shop || '') : '');
    sheet.getRange(c.note + rowNum).setValue(p ? (p.note || '') : '');
  });
}

function formatDdMmYyFromIso_(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String((d.getFullYear() + 543) % 100).padStart(2, '0');
    return dd + '/' + mm + '/' + yy;
  } catch (e) { return ''; }
}

function setDocFormSignoffDates_(sheet, ddmmyy) {
  Object.keys(DOC_FORM_SIGNOFF_DATE_CELLS).forEach(function (a1) {
    const blank = DOC_FORM_SIGNOFF_DATE_CELLS[a1];
    sheet.getRange(a1).setValue(ddmmyy ? ('วันที่ ' + ddmmyy) : blank);
  });
}

/* อ่านค่าคีย์เดียวจากแท็บ KV ผ่านชีตที่เปิดอยู่ (getActiveSpreadsheet)
   ห้ามใช้ getKvValue_ ตรงนี้ — onEdit เป็น simple trigger ถูกจำกัดสิทธิ์ไม่ให้เปิดสเปรดชีตด้วย openById
   v9: อ่านเฉพาะคอลัมน์ A มาหาแถวก่อน แล้วค่อยดึงค่าเซลล์เดียว (หลักเดียวกับ findRow_)
   ของเดิมใช้ getDataRange() ซึ่งลากค่าของทุกคีย์รวมถึงรูป base64 ทั้งระบบเข้ามา ทุกครั้งที่มีคนพิมพ์
   เลขที่เอกสารลงฟอร์ม — ยิ่งรูปสะสมเยอะยิ่งช้า และ simple trigger มีเวลาจำกัดกว่าปกติด้วย */
function readKvValueActive_(kv, key) {
  const lastRow = kv.getLastRow();
  if (lastRow < 2) return null;
  const keys = kv.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < keys.length; i++) {
    if (keys[i][0] === key) return kv.getRange(i + 2, 2).getValue();
  }
  return null;
}

/* ดึงใบแจ้งซ่อมเต็มใบมาเติมฟอร์มกระดาษ
   v9: ใช้ "รหัสอ้างอิงระบบ" (คอลัมน์ AD ของแท็บใบแจ้งซ่อม) อ่านช่อง order:<id> ตรงๆ
   ถ้าแถวนั้นยังไม่มีรหัส (ใบเก่าที่เขียนไว้ก่อนมีคอลัมน์นี้) ค่อยถอยไปค้นในคีย์ 'orders' เดิม */
function findOrderForDocForm_(docNumber, orderId) {
  try {
    const kv = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KV_SHEET);
    if (!kv) return null;
    if (orderId) {
      const raw = readKvValueActive_(kv, ORDER_KEY_PREFIX + orderId);
      if (raw) {
        try {
          const one = JSON.parse(raw);
          if (one && one.id) return one;
        } catch (e) { /* ค่าเสีย — ตกไปใช้ทางถอยด้านล่าง */ }
      }
    }
    const legacy = readKvValueActive_(kv, 'orders');
    if (!legacy) return null;
    const orders = JSON.parse(legacy);
    const target = String(docNumber).toUpperCase();
    return orders.find(function (o) { return String(o.docNumber || '').toUpperCase() === target; }) || null;
  } catch (e) {
    return null;   // เติมฟอร์มไม่ได้ ดีกว่าทำให้การแก้เซลล์ค้าง — ช่องที่เหลือยังเติมจากแท็บได้ตามปกติ
  }
}

function onEdit(e) {
  onEditDocForm_(e);
}

function onEditDocForm_(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== DOC_FORM_SHEET_NAME) return;
  if (e.range.getA1Notation() !== DOC_FORM_LOOKUP_CELL) return;

  const docNumber = String(e.value || '').trim();
  if (!docNumber) { clearDocFormFields_(sheet); return; }

  const row = findOrderRowByDocNumber_(docNumber);
  if (!row) {
    clearDocFormFields_(sheet);
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'ไม่พบเลขที่เอกสาร "' + docNumber + '" ในชีต ' + DOC_FORM_ORDER_SHEET_NAME,
      'ไม่พบข้อมูล', 5);
    return;
  }

  // ดัชนีคอลัมน์อ้างอิงหัวตาราง ใบแจ้งซ่อม:
  // A เลขที่เอกสาร, B แผนก, C รหัสเครื่องจักร, D ชื่อเครื่องจักร, E อาการ/สาเหตุ,
  // F วันที่ต้องการใช้งาน, G ผู้แจ้ง, H แจ้งเมื่อ, I สถานะ, J อนุมัติผจก.โรงงาน,
  // K โดย/เมื่อ(ผจก.โรงงาน), ... N โดย/เมื่อ(ผจก.ทั่วไป), ... V ประเภทเอกสาร,
  // ... X การดำเนินงาน, ... Z ความคิดเห็นของช่างผู้ตรวจสอบ
  const dept                 = row[1];
  const machineCode          = row[2];
  const machineName          = row[3];
  const cause                = row[4];
  const neededDate           = row[5];
  const requestedBy          = row[6];
  const reportedAt           = row[7];
  const fmApprovalLabel      = row[9];
  const fmByAt                = row[10];
  const gmByAt                = row[13];
  const docTypeLabel          = row[21];
  const executionPlanLabel    = row[23];
  const inspectorOpinionLabel = row[25];

  const m = DOC_FORM_FIELD_MAP;
  sheet.getRange(m.machineName).setValue(machineName);
  sheet.getRange(m.machineCode).setValue(machineCode);
  sheet.getRange(m.reportedAt).setValue(reportedAt);
  sheet.getRange(m.neededDate).setValue(neededDate);
  sheet.getRange(m.requestedBy).setValue(requestedBy);
  sheet.getRange(m.dept).setValue(dept);
  sheet.getRange(m.cause).setValue(cause);
  sheet.getRange(m.fmDate).setValue(extractDdMmYy_(fmByAt));
  sheet.getRange(m.gmDate).setValue(extractDdMmYy_(gmByAt));

  // v9: คอลัมน์ AD เก็บ order.id ไว้ ใช้เปิดช่อง order:<id> ได้ตรงใบโดยไม่ต้องค้นทั้งระบบ
  const orderId = row.length >= ORDERS_ID_COLUMN && row[ORDERS_ID_COLUMN - 1]
    ? String(row[ORDERS_ID_COLUMN - 1]).trim() : '';
  const order = findOrderForDocForm_(docNumber, orderId);
  const verifyResult = order && order.verification ? order.verification.result : '';
  const signoffDate = order && order.verification && order.verification.at
    ? formatDdMmYyFromIso_(order.verification.at) : '';

  setDocFormCheckboxes_(sheet, docTypeLabel, fmApprovalLabel, executionPlanLabel, inspectorOpinionLabel, verifyResult);
  setDocFormParts_(sheet, order && order.maintRecord ? order.maintRecord.parts : null);
  setDocFormSignoffDates_(sheet, signoffDate);
}

function extractDdMmYy_(byAtText) {
  if (!byAtText) return '';
  const match = String(byAtText).match(/(\d{2}\/\d{2}\/\d{2})/);
  return match ? match[1] : '';
}

function findOrderRowByDocNumber_(docNumber) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DOC_FORM_ORDER_SHEET_NAME);
  if (!sh) return null;
  const target = docNumber.toUpperCase();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) { // ข้ามแถวหัวตาราง
    const rawDocNumber = String(data[i][0]).trim().toUpperCase(); // เช่น "RB001/26" (ใหม่) หรือ "001/26" (เก่า)
    const dept = String(data[i][1]).trim().toUpperCase();          // เช่น "RB"
    if (rawDocNumber === target) return data[i];           // ใบใหม่: คอลัมน์ A มีรหัสแผนกนำหน้าอยู่แล้ว
    if (dept + rawDocNumber === target) return data[i];    // ใบเก่า: ต้องต่อคอลัมน์ B+A เองถึงจะตรง
  }
  return null;
}

function clearDocFormFields_(sheet) {
  Object.values(DOC_FORM_FIELD_MAP).forEach(a1 => sheet.getRange(a1).clearContent());
  DOC_FORM_CHECKBOX_CELLS.forEach(a1 => sheet.getRange(a1).setValue(false));
  setDocFormParts_(sheet, null);
  setDocFormSignoffDates_(sheet, '');
}
