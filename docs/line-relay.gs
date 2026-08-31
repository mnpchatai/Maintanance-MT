/**
 * LineOA MT — LINE relay (Apps Script, standalone project)
 * ============================================================================
 * ไฟล์นี้เป็น "ต้นฉบับสำหรับคัดลอกไปวาง" ในโปรเจกต์ Apps Script ชื่อ "LineOA MT"
 * เท่านั้น ตัวโค้ดที่รันจริงอยู่ในเอดิเตอร์ของ Apps Script ไม่ได้รันจาก repo นี้
 *
 * !! ห้ามใส่ค่า token/secret จริงลงในไฟล์นี้แล้ว commit เด็ดขาด !!
 * ค่าจริงให้ใส่ที่ Apps Script → Project Settings → Script properties
 * (LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET, SPREADSHEET_ID)
 * วิธีนี้ทำให้แก้ token ได้โดยไม่ต้องแก้โค้ด และโค้ดชุดนี้ปลอดภัยพอจะอยู่ใน git
 *
 * แก้ปัญหา: "มีคนทักเข้ามาแล้ว userId ไม่ขึ้นในแท็บ LINE Users"
 * สาเหตุที่โค้ดชุดนี้ปิดไว้ทั้งหมด — ดู docs/line-users-troubleshooting.md
 *   1) เขียนแถวลงชีต "ก่อน" เรียก LINE profile API เสมอ ถ้า token ผิด/หมดอายุ
 *      ก็ยังได้ userId ครบ (เดิม profile พังทั้ง event ก็ตกทั้งยวง = ไม่มีอะไรลงชีต)
 *   2) รับทั้ง follow / message / postback / join / memberJoined ไม่ใช่แค่ follow
 *      (คนที่เป็นเพื่อน OA อยู่แล้วจะไม่มี follow event อีกเลย มีแต่ message)
 *   3) สร้างแท็บ LINE Users + หัวตารางให้อัตโนมัติถ้ายังไม่มี
 *   4) กัน error ทุกจุดไม่ให้ throw ออกไปถึง LINE (ไม่งั้น LINE จะขึ้น failed
 *      แล้วปิด webhook ให้เองเมื่อพังต่อเนื่อง) และบันทึกลงแท็บ Relay Log แทน
 *   5) mirror รายชื่อเข้า KV key "lineUsers" ให้หน้า "กำหนดบทบาทผู้ใช้ LINE
 *      ที่ทักเข้ามา" ในแอปขึ้นเองโดยไม่ต้องก๊อป userId มาวางมือ
 */

/* ============================== CONFIG ============================== */
// อ่านจาก Script properties ก่อน แล้วค่อยตกมาใช้ค่าใน const (เผื่อยังไม่ได้ตั้ง properties)
var PROPS = PropertiesService.getScriptProperties();

// id ของ Google Sheet ที่เป็นฐานข้อมูลของระบบ — ต้องตรงกับ SHEET_URL ใน index.html และกับที่
// สคริปต์ "คำร้องแจ้งซ่อม" v8 ใช้ (ตรวจได้ที่ <API_URL>/exec?key=whoami)
// ค่านี้ไม่ใช่ความลับ (อยู่ใน index.html ที่เปิดสาธารณะอยู่แล้ว) จึงใส่ตรงนี้ได้ เพื่อให้วางโค้ดแล้ว
// ใช้งานได้ทันทีโดยไม่ต้องไปตั้ง Script properties ก่อน
// เดิมค่านี้เป็น '1er3WPCHJmV8_lioD-9gShr5mWDaajvXEYrEaaV-_p-k' ซึ่งเป็นชีตของบัญชีเก่า
// (thtwgot@gmail.com) ที่ย้ายทิ้งไปแล้ว → openById() throw ทุกครั้ง = ต้นเหตุที่ userId
// ไม่เข้าแท็บ LINE Users มาตั้งแต่ 14 ส.ค. 2026 (บั๊กเดียวกับที่สคริปต์ "คำร้องแจ้งซ่อม"
// แก้ไปแล้วใน v8 แต่ไม่มีใครมาแก้ฝั่ง relay)
var FALLBACK_SPREADSHEET_ID = '1Zm31RC9ak_plSb19LsgGn8QJn4EkadYOnKUF98dyAwA';

// สองตัวนี้เป็นความลับจริง — ห้ามใส่ค่าจริงแล้ว commit ให้ตั้งที่ Script properties เท่านั้น
// ไม่ตั้งก็ยังใช้ได้: userId จะเข้าแท็บ LINE Users ครบ แค่ช่อง "ชื่อที่แสดง" จะว่างไว้ก่อน
// (เติมย้อนหลังได้ด้วยการรัน backfillDisplayNames() หลังใส่ token แล้ว)
var FALLBACK_ACCESS_TOKEN   = '';
var FALLBACK_SECRET         = '';

function cfg_(name, fallback){
  var v = PROPS.getProperty(name);
  return (v && String(v).trim()) ? String(v).trim() : fallback;
}
function spreadsheetId_(){ return cfg_('SPREADSHEET_ID', FALLBACK_SPREADSHEET_ID); }
function accessToken_(){ return cfg_('LINE_CHANNEL_ACCESS_TOKEN', FALLBACK_ACCESS_TOKEN); }
function channelSecret_(){ return cfg_('LINE_CHANNEL_SECRET', FALLBACK_SECRET); }

var USERS_SHEET      = 'LINE Users';
var RECIPIENTS_SHEET = 'แจ้งเตือน LINE - ผู้รับ';
var LOG_SHEET        = 'Relay Log';
var KV_SHEET         = 'KV';

/* ============================== ENTRY POINTS ============================== */

/**
 * LINE เรียกที่นี่ (Messaging API → Webhook URL) และแอปก็ POST มาที่นี่เหมือนกัน
 * ต้องตอบ 200 เสมอ ไม่ว่าอะไรจะพัง — ถ้าตอบ error LINE จะ retry แล้วปิด webhook ให้เอง
 */
function doPost(e){
  try{
    if(!e || !e.postData || !e.postData.contents){
      return json_({ ok:false, error:'no post body' });
    }
    var body;
    try{ body = JSON.parse(e.postData.contents); }
    catch(err){ log_('doPost', 'JSON ไม่ถูกต้อง: ' + err); return json_({ ok:false, error:'bad json' }); }

    // --- 1) event จาก LINE (คนทักเข้ามา / กดเพิ่มเพื่อน) ---
    if(body.events){
      var n = 0;
      for(var i = 0; i < body.events.length; i++){
        // แยก try ต่อ event — event เดียวพังต้องไม่ทำให้ event ที่เหลือตกไปด้วย
        try{ if(handleLineEvent_(body.events[i])) n++; }
        catch(err){ log_('event', 'พลาด: ' + err + ' | ' + safeJson_(body.events[i])); }
      }
      return json_({ ok:true, logged:n });
    }

    // --- 2) คำขอส่งแจ้งเตือนจากตัวแอป (index.html) ---
    if(body.message && (body.role || body.userIds)){
      return json_(handleNotifyRequest_(body));
    }

    return json_({ ok:false, error:'unrecognised payload' });
  }catch(err){
    log_('doPost', 'พังทั้งก้อน: ' + err);
    return json_({ ok:false, error:String(err) });
  }
}

/**
 * ใช้ตรวจสุขภาพ relay จากเบราว์เซอร์: <relay-url>/exec?key=selftest
 * บอกได้ทันทีว่า SPREADSHEET_ID เปิดได้ไหม, token ใช้ได้ไหม, LINE Users มีกี่แถว
 */
function doGet(e){
  var key = (e && e.parameter && e.parameter.key) || '';
  if(key === 'selftest') return json_(selfTest_());
  return json_({ ok:true, service:'LineOA MT relay', hint:'ใช้ ?key=selftest เพื่อตรวจการตั้งค่า' });
}

function selfTest_(){
  var r = { ok:true, checks:{} };

  // ตรวจว่าเปิดสเปรดชีตตาม SPREADSHEET_ID ได้จริง (ข้อผิดพลาดยอดฮิตหลังย้ายบัญชี Google)
  var ss = null;
  try{
    ss = SpreadsheetApp.openById(spreadsheetId_());
    r.checks.spreadsheet = { ok:true, name: ss.getName(), id: spreadsheetId_() };
  }catch(err){
    r.ok = false;
    r.checks.spreadsheet = { ok:false, id: spreadsheetId_(),
      error:String(err), fix:'SPREADSHEET_ID ยังชี้ไปที่ชีตเดิม/ชีตที่เข้าไม่ได้ — แก้ที่ Script properties' };
  }

  if(ss){
    var sh = ss.getSheetByName(USERS_SHEET);
    r.checks.usersSheet = sh
      ? { ok:true, rows: Math.max(0, sh.getLastRow() - 1) }
      : { ok:false, error:'ยังไม่มีแท็บ "' + USERS_SHEET + '"', fix:'จะถูกสร้างอัตโนมัติเมื่อมีคนทักเข้ามาครั้งแรก' };
  }

  // ตรวจ token ด้วย endpoint ที่ไม่ต้องใช้ userId
  try{
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', {
      headers:{ Authorization:'Bearer ' + accessToken_() },
      muteHttpExceptions:true
    });
    var code = res.getResponseCode();
    r.checks.accessToken = (code === 200)
      ? { ok:true, bot: safeParse_(res.getContentText()) }
      : { ok:false, httpCode:code, body:res.getContentText().slice(0, 300),
          fix:'LINE_CHANNEL_ACCESS_TOKEN ผิด/หมดอายุ/ยังไม่ได้ตั้ง — ออกใหม่ที่ LINE Developers Console แล้วใส่ใน Script properties',
          note:'ยังไม่ตั้งก็ไม่เป็นไร userId จะเข้าแท็บ LINE Users ครบอยู่แล้ว แค่ชื่อจะว่าง และส่งแจ้งเตือนออกไม่ได้' };
    // จงใจไม่ตั้ง r.ok = false ตรงนี้ — token พังไม่ได้ทำให้การบันทึก userId พังอีกต่อไป
    // ตัวที่ทำให้ ok = false ได้มีแต่ "เปิดชีตไม่ได้" ซึ่งเป็นเรื่องคอขาดบาดตายจริงๆ
  }catch(err){
    r.ok = false;
    r.checks.accessToken = { ok:false, error:String(err) };
  }

  r.checks.channelSecret = { ok: !!channelSecret_() && channelSecret_().indexOf('PUT_') !== 0 };
  return r;
}

/* ============================== LINE EVENTS ============================== */

/** คืน true ถ้าบันทึกผู้ใช้ลงชีตแล้ว */
function handleLineEvent_(ev){
  if(!ev) return false;

  // userId อยู่ที่ source.userId เสมอ ไม่ว่าจะทักมาจากแชทเดี่ยว กลุ่ม หรือห้อง
  var src = ev.source || {};
  var userId = src.userId || '';
  if(!userId){
    // เกิดกับ event ที่ยิงจากกลุ่มโดยผู้ใช้ที่ยังไม่ได้เพิ่ม OA เป็นเพื่อน — ไม่มี userId ให้เก็บ
    log_('event', 'ไม่มี source.userId (type=' + (ev.type || '?') + ', source=' + (src.type || '?') + ')');
    return false;
  }

  // รับทุกชนิด event ที่แปลว่า "คนนี้มีตัวตนและติดต่อเข้ามา"
  // (เดิมดักแค่ follow ทำให้คนที่เป็นเพื่อน OA อยู่ก่อนแล้วทักมาไม่เคยถูกบันทึกเลย)
  var t = ev.type;
  if(t !== 'follow' && t !== 'message' && t !== 'postback' &&
     t !== 'join' && t !== 'memberJoined' && t !== 'unfollow'){
    return false;
  }

  // สำคัญ: เขียน userId ลงชีตก่อน แล้วค่อยไปดึงชื่อ
  // ถ้า token พังหรือ LINE API ล่ม อย่างน้อย userId ก็ยังเข้าชีตครบ
  var row = upsertLineUser_(userId, '', t);

  // ดึงชื่อแบบ best-effort — พังก็ไม่เป็นไร แถวเขียนไปแล้ว
  try{
    var name = fetchDisplayName_(userId);
    if(name) upsertLineUser_(userId, name, t);
  }catch(err){
    log_('profile', 'ดึงชื่อไม่สำเร็จสำหรับ ' + userId + ': ' + err);
  }

  // ให้หน้าตั้งค่าในแอปเห็นรายชื่อเองโดยไม่ต้องก๊อปมือ
  try{ mirrorUsersToKv_(); }
  catch(err){ log_('kv', 'mirror lineUsers ไม่สำเร็จ: ' + err); }

  return !!row;
}

function fetchDisplayName_(userId){
  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + encodeURIComponent(userId), {
    headers:{ Authorization:'Bearer ' + accessToken_() },
    muteHttpExceptions:true
  });
  if(res.getResponseCode() !== 200){
    log_('profile', 'HTTP ' + res.getResponseCode() + ' : ' + res.getContentText().slice(0, 200));
    return '';
  }
  var p = safeParse_(res.getContentText()) || {};
  return p.displayName || '';
}

/**
 * เขียน/อัปเดตผู้ใช้หนึ่งคนในแท็บ LINE Users (คีย์ที่ userId ไม่เพิ่มแถวซ้ำ)
 * สร้างแท็บและหัวตารางให้เองถ้ายังไม่มี
 */
function upsertLineUser_(userId, displayName, eventType){
  var sh = ensureSheet_(USERS_SHEET, ['userId', 'ชื่อที่แสดง', 'ทักเข้ามาล่าสุด', 'event ล่าสุด']);
  if(!sh) return false;

  var last = sh.getLastRow();
  var now = new Date();

  if(last >= 2){
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for(var i = 0; i < ids.length; i++){
      if(String(ids[i][0]).trim() === userId){
        var r = i + 2;
        // เขียนทับชื่อเฉพาะตอนที่ดึงชื่อใหม่มาได้จริง ไม่งั้นเก็บชื่อเดิมไว้
        if(displayName) sh.getRange(r, 2).setValue(displayName);
        sh.getRange(r, 3).setValue(now);
        sh.getRange(r, 4).setValue(eventType || '');
        return true;
      }
    }
  }
  sh.appendRow([userId, displayName || '', now, eventType || '']);
  return true;
}

/**
 * เติมชื่อย้อนหลังให้แถวที่ "ชื่อที่แสดง" ยังว่าง — รันจากปุ่ม Run ในเอดิเตอร์ได้เลย
 * (เลือกฟังก์ชัน backfillDisplayNames จากดรอปดาวน์ข้างปุ่ม Run แล้วกด Run)
 * ใช้ตอนที่ปล่อยให้ relay เก็บ userId ไปก่อนโดยยังไม่ได้ใส่ LINE_CHANNEL_ACCESS_TOKEN
 * ฟังก์ชันนี้ต่างจาก doPost ตรงที่เรียกจากเอดิเตอร์ ไม่ใช่จาก HTTP จึงใช้ Run ได้ปกติ
 */
function backfillDisplayNames(){
  var sh = ensureSheet_(USERS_SHEET, ['userId', 'ชื่อที่แสดง', 'ทักเข้ามาล่าสุด', 'event ล่าสุด']);
  if(!sh || sh.getLastRow() < 2){ console.log('ยังไม่มีข้อมูลในแท็บ ' + USERS_SHEET); return; }

  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  var filled = 0, failed = 0;
  for(var i = 0; i < rows.length; i++){
    var id = String(rows[i][0] || '').trim();
    if(!id || String(rows[i][1] || '').trim()) continue;  // ไม่มี id หรือมีชื่ออยู่แล้ว → ข้าม
    try{
      var name = fetchDisplayName_(id);
      if(name){ sh.getRange(i + 2, 2).setValue(name); filled++; }
      else failed++;
    }catch(err){
      failed++;
      log_('backfill', 'ดึงชื่อไม่สำเร็จสำหรับ ' + id + ': ' + err);
    }
    Utilities.sleep(200);  // กันยิง LINE profile API ถี่เกินจนโดน rate limit
  }
  try{ mirrorUsersToKv_(); }catch(err){ log_('backfill', 'mirror ไม่สำเร็จ: ' + err); }
  var msg = 'เติมชื่อสำเร็จ ' + filled + ' รายการ, ไม่สำเร็จ ' + failed + ' รายการ';
  log_('backfill', msg);
  console.log(msg);
}

/* ============================== KV MIRROR ============================== */

/**
 * คัดลอกแท็บ LINE Users ไปไว้ที่ KV key "lineUsers" (รูปแบบเดียวกับที่ index.html อ่าน)
 * ทำแบบระวัง: ถ้าไม่เจอแท็บ KV หรือรูปแบบไม่ตรง จะข้ามไปเฉยๆ ไม่ไปแก้อะไรมั่ว
 */
function mirrorUsersToKv_(){
  var ss = SpreadsheetApp.openById(spreadsheetId_());
  var users = ss.getSheetByName(USERS_SHEET);
  var kv = ss.getSheetByName(KV_SHEET);
  if(!users || !kv || users.getLastRow() < 2) return;

  var rows = users.getRange(2, 1, users.getLastRow() - 1, 3).getValues();
  var list = [];
  for(var i = 0; i < rows.length; i++){
    var id = String(rows[i][0] || '').trim();
    if(!id) continue;
    list.push({
      userId: id,
      displayName: String(rows[i][1] || '') || '(ไม่ทราบชื่อ)',
      lastSeen: rows[i][2] ? new Date(rows[i][2]).toISOString() : ''
    });
  }
  if(!list.length) return;

  var value = JSON.stringify(list);
  var last = kv.getLastRow();
  if(last >= 1){
    var keys = kv.getRange(1, 1, last, 1).getValues();
    for(var j = 0; j < keys.length; j++){
      if(String(keys[j][0]).trim() === 'lineUsers'){
        kv.getRange(j + 1, 2).setValue(value);
        return;
      }
    }
  }
  kv.appendRow(['lineUsers', value]);
}

/* ============================== OUTGOING PUSH ============================== */

function handleNotifyRequest_(body){
  var ids = [];

  // แอปส่ง userIds มาให้ตรงๆ (มาจากหน้า "กำหนดบทบาทผู้ใช้ LINE ที่ทักเข้ามา")
  if(Array.isArray(body.userIds) && body.userIds.length){
    ids = body.userIds.filter(function(x){ return x && String(x).trim(); });
  }
  // ไม่มีก็ค่อยไปดูตารางผู้รับในชีต
  if(!ids.length && body.role) ids = recipientsForRole_(body.role);

  // ไม่มีผู้รับ = ไม่ส่ง (ตั้งใจ — เดิม fallback เป็น broadcast หาเพื่อนทุกคนใน OA)
  if(!ids.length){
    log_('notify', 'ไม่มีผู้รับสำหรับ role="' + (body.role || '') + '" — ข้ามการส่ง');
    return { ok:true, sent:0, note:'no recipient mapped' };
  }

  var sent = 0;
  for(var i = 0; i < ids.length; i++){
    try{ if(pushTo_(ids[i], body.message)) sent++; }
    catch(err){ log_('notify', 'ส่งไม่สำเร็จถึง ' + ids[i] + ': ' + err); }
  }
  return { ok:true, sent:sent, targets:ids.length };
}

function recipientsForRole_(role){
  var sh = SpreadsheetApp.openById(spreadsheetId_()).getSheetByName(RECIPIENTS_SHEET);
  if(!sh || sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  var out = [];
  for(var i = 0; i < rows.length; i++){
    if(String(rows[i][0]).trim() === String(role).trim()){
      var id = String(rows[i][1] || '').trim();
      if(id) out.push(id);
    }
  }
  return out;
}

function pushTo_(userId, message){
  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method:'post',
    contentType:'application/json',
    headers:{ Authorization:'Bearer ' + accessToken_() },
    payload: JSON.stringify({ to:userId, messages:[{ type:'text', text:String(message).slice(0, 4900) }] }),
    muteHttpExceptions:true
  });
  if(res.getResponseCode() !== 200){
    log_('push', 'HTTP ' + res.getResponseCode() + ' → ' + userId + ' : ' + res.getContentText().slice(0, 200));
    return false;
  }
  return true;
}

/* ============================== HELPERS ============================== */

function ensureSheet_(name, header){
  var ss;
  try{ ss = SpreadsheetApp.openById(spreadsheetId_()); }
  catch(err){
    // ไม่มีที่ให้ log เพราะเปิดสเปรดชีตไม่ได้ — ส่งเข้า Apps Script execution log แทน
    console.error('เปิดสเปรดชีตไม่ได้ (SPREADSHEET_ID=' + spreadsheetId_() + '): ' + err);
    return null;
  }
  var sh = ss.getSheetByName(name);
  if(!sh){
    sh = ss.insertSheet(name);
    if(header && header.length){
      sh.appendRow(header);
      sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    return sh;
  }
  // แท็บมีอยู่แล้ว (เช่น LINE Users เดิมที่มีแค่ 3 คอลัมน์) — เติมหัวตารางเฉพาะช่องที่ "ว่าง"
  // ไม่เขียนทับหัวที่มีข้อความอยู่แล้ว ชื่อหัวเดิมที่ผู้ใช้ตั้งเองจึงไม่ถูกเปลี่ยน
  if(header && header.length && sh.getLastRow() >= 1){
    try{
      var cur = sh.getRange(1, 1, 1, header.length).getValues()[0];
      var changed = false;
      for(var i = 0; i < header.length; i++){
        if(String(cur[i] || '').trim() === '' ){ cur[i] = header[i]; changed = true; }
      }
      if(changed) sh.getRange(1, 1, 1, header.length).setValues([cur]).setFontWeight('bold');
    }catch(err){ /* ซ่อมหัวตารางไม่สำเร็จไม่ใช่เรื่องคอขาดบาดตาย ปล่อยผ่าน */ }
  }
  return sh;
}

/** บันทึกปัญหาลงแท็บ Relay Log — ทำให้ debug ได้โดยไม่ต้องเปิด Apps Script executions */
function log_(scope, message){
  try{
    var sh = ensureSheet_(LOG_SHEET, ['เวลา', 'จุด', 'รายละเอียด']);
    if(sh){
      sh.appendRow([new Date(), scope, String(message).slice(0, 900)]);
      // ตัดให้เหลือ 500 แถวล่าสุด กันชีตบวม
      var last = sh.getLastRow();
      if(last > 501) sh.deleteRows(2, last - 501);
    }
  }catch(err){ console.error('log_ ล้มเหลว: ' + err); }
  console.log('[' + scope + '] ' + message);
}

function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function safeParse_(s){ try{ return JSON.parse(s); }catch(e){ return null; } }
function safeJson_(o){ try{ return JSON.stringify(o).slice(0, 400); }catch(e){ return '<unserialisable>'; } }
