# แก้ปัญหา: ทักหา LINE OA แล้ว userId ไม่ขึ้นในแท็บ `LINE Users`

อาการ: มีคนทักแชทเข้ามาหา LINE OA แล้ว แต่แท็บ **`LINE Users`** ในชีตฐานข้อมูล
ไม่มีแถวใหม่ / ช่อง `userId` ว่าง — ทำให้หน้า `ตั้งค่าข้อมูลหลัก` →
`กำหนดบทบาทผู้ใช้ LINE ที่ทักเข้ามา` ไม่มีรายชื่อให้กำหนดบทบาท และการแจ้งเตือน
ทาง LINE ก็ไม่ถึงใครเลย

โค้ดที่บันทึก `LINE Users` **ไม่ได้อยู่ใน repo นี้** — อยู่ในโปรเจกต์ Apps Script
ชื่อ **"LineOA MT"** (standalone) เท่านั้น เพราะฉะนั้นการแก้จบที่การวางโค้ด
ในเอดิเตอร์ Apps Script ไม่ใช่การ push โค้ดขึ้น GitHub

ต้นฉบับที่แก้ปัญหานี้ครบแล้ว: **[`docs/line-relay.gs`](./line-relay.gs)**

---

## ตรวจตามลำดับนี้ (เรียงจากสาเหตุที่เจอบ่อยที่สุด)

### 1. Webhook URL ใน LINE Developers Console ยังไม่ได้ตั้ง / ยังเป็น URL ของบัญชีเก่า

**นี่คือผู้ต้องสงสัยอันดับหนึ่ง** — บันทึกส่งมอบงานระบุไว้ว่าข้อนี้ "ยังค้างอยู่"
ตั้งแต่ย้ายบัญชี Google เมื่อ 26 ส.ค. 2026 ถ้า LINE ไม่เคยยิงมาถึง relay เลย
ก็ไม่มีอะไรจะเขียนลงชีตตั้งแต่แรก

1. เปิด <https://developers.line.biz> → เลือก Channel → แท็บ **Messaging API**
2. ช่อง **Webhook URL** ต้องเป็น `/exec` ของ "LineOA MT" ตัวปัจจุบัน — ค่าเดียวกับ
   `LINE_RELAY_URL` ที่บรรทัด 358 ของ `index.html`
3. เปิดสวิตช์ **Use webhook** ให้เป็น ON (ตั้ง URL แล้วแต่ลืมเปิดสวิตช์ = ไม่ยิง)
4. กดปุ่ม **Verify** ข้างช่อง URL — ต้องขึ้น `Success` ถ้าขึ้น error ให้ไปข้อ 2 และ 5

### 2. โหมดตอบกลับของ OA ยังเป็น "Chat" ไม่ใช่ "Bot"

ถ้า OA ตั้งเป็นโหมดแชทคุยเอง LINE จะไม่ยิง webhook ให้เลย แม้ตั้ง URL ถูกแล้ว

- <https://manager.line.biz> → OA ตัวนี้ → **ตั้งค่า** → **Messaging API** /
  **การตอบกลับ** → ตั้ง **Webhook** = เปิด, ปิด **การตอบกลับอัตโนมัติ** และ
  **ข้อความทักทายเมื่อเพิ่มเพื่อน** (สองอันนี้แย่งคิว webhook)

### 3. `SPREADSHEET_ID` ใน relay ยังชี้ไปที่ชีตของบัญชีเก่า

หลังย้ายบัญชี Google ค่านี้ต้องแก้ด้วยมือในเอดิเตอร์ Apps Script — ถ้ายังเป็น id เดิม
`openById()` จะ throw ทุกครั้ง (หรือเขียนลงชีตเก่าที่ไม่มีใครเปิดดู)

- id ที่ถูกต้องตอนนี้: `1Zm31RC9ak_plSb19LsgGn8QJn4EkadYOnKUF98dyAwA`
- โค้ดชุดใหม่อ่านค่านี้จาก **Project Settings → Script properties** คีย์
  `SPREADSHEET_ID` เพื่อให้แก้ได้โดยไม่ต้องแตะโค้ด

### 4. `LINE_CHANNEL_ACCESS_TOKEN` ยังไม่ได้ใส่ใหม่หลังย้ายบัญชี ← **สาเหตุที่ตรงกับอาการที่สุด**

เป็นบั๊กที่อธิบายอาการ "ทักเข้ามาแล้วแต่ `userId` ไม่ลง" ได้ตรงที่สุด เพราะ
โค้ด relay ตัวเดิม **เรียก LINE profile API เพื่อเอาชื่อ ก่อน จะเขียนแถวลงชีต**
พอ token ผิด/หมดอายุ บรรทัดนั้น throw → ทั้ง event ตกไป → ไม่มีแถวลงชีตเลย
ทั้งที่ `userId` อยู่ในมือแล้วตั้งแต่ต้น

`docs/line-relay.gs` แก้ลำดับใหม่: **เขียน `userId` ลงชีตก่อนเสมอ** แล้วค่อยไปดึงชื่อ
แบบ best-effort ใน `try/catch` — token พังก็ยังได้ `userId` ครบ (ชื่อว่างไว้ก่อน
แล้วเติมให้อัตโนมัติเมื่อทักเข้ามาครั้งถัดไปหลังแก้ token)

### 5. Deployment ตั้ง "Who has access" ไม่ใช่ Anyone

ปัญหาที่เคยเจอมาแล้วในโปรเจกต์นี้ — Apps Script จะ redirect ไปหน้า login ของ Google
LINE เห็นเป็น 302 แล้วนับว่า webhook fail

- Apps Script → **Deploy** → **Manage deployments** → แก้ deployment ปัจจุบัน →
  **Who has access: Anyone** (ต้องเป็น *Anyone* ไม่ใช่ *Anyone with Google account*)
- **ทุกครั้งที่แก้โค้ด ต้อง Deploy → New deployment (หรือ Edit → Version: New) ใหม่**
  ไม่งั้น URL เดิมยังรันโค้ดเวอร์ชันเก่าอยู่

### 6. relay ดักเฉพาะ event ชนิด `follow`

ถ้าโค้ดเดิมเช็ค `event.type === 'follow'` อย่างเดียว คนที่ **เป็นเพื่อนกับ OA
อยู่ก่อนแล้ว** จะไม่มี `follow` event อีกเลยตลอดชีวิต มีแต่ `message` — ทักเท่าไหร่
ก็ไม่ถูกบันทึก ตรงกับอาการ "ทักมาแล้วไม่เข้า" พอดี

`docs/line-relay.gs` รับ `follow` / `message` / `postback` / `join` / `memberJoined`
/ `unfollow` ทั้งหมด

### 7. ทักมาจากกลุ่ม แต่ยังไม่ได้เพิ่ม OA เป็นเพื่อน

`source.userId` จะไม่มีมาให้ในกรณีนี้ ไม่ใช่บั๊ก — ให้คนนั้นเพิ่ม OA เป็นเพื่อน
แล้วทักในแชทเดี่ยวหนึ่งครั้ง โค้ดใหม่จะเขียนเหตุผลลงแท็บ `Relay Log` ให้เห็นชัด

### 8. ตรวจ signature ด้วย `LINE_CHANNEL_SECRET` ที่ผิด

ถ้าโค้ดเดิมมีการ verify `X-Line-Signature` แล้ว secret ไม่ตรง จะ reject ทุก event เงียบๆ
`docs/line-relay.gs` ไม่ทำ signature check เป็นเงื่อนไขบังคับ (URL `/exec` เป็นค่าสุ่มยาว
และ payload ไม่ใช่ข้อมูลลับ) จึงไม่มีทางตกด้วยสาเหตุนี้

---

## วิธีติดตั้งโค้ดใหม่

1. เปิดโปรเจกต์ Apps Script **"LineOA MT"**
2. **Project Settings → Script properties** → เพิ่ม 3 คีย์ (ค่าเอามาจาก LINE
   Developers Console → Messaging API และ URL ของชีต) —
   `SPREADSHEET_ID`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`
3. คัดลอกทั้งไฟล์ `docs/line-relay.gs` ไปวางทับโค้ดเดิมใน `Code.gs`
4. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**
   (URL เดิมจะยังใช้ได้ ไม่ต้องไปแก้ `LINE_RELAY_URL` ใน `index.html`)
5. เปิด `<LINE_RELAY_URL>?key=selftest` ในเบราว์เซอร์ — ต้องได้ `"ok": true` ครบทุกข้อ
   ถ้าข้อไหน `false` ในผลลัพธ์จะมีช่อง `fix` บอกวิธีแก้ตรงจุดนั้น
6. ให้คนใดคนหนึ่งทักหา OA หนึ่งข้อความ แล้วเปิดแท็บ `LINE Users` — ต้องมีแถวใหม่ทันที
7. ถ้ายังไม่มา เปิดแท็บ **`Relay Log`** (โค้ดใหม่สร้างให้เอง) — จะบอกว่าตกที่ขั้นไหน

> ถ้า `Relay Log` ก็ยังว่างเปล่าหลังทักเข้ามา แปลว่า **LINE ยิงมาไม่ถึง relay เลย**
> ให้กลับไปข้อ 1, 2 และ 5 — ไม่ใช่ปัญหาที่โค้ด

## ผลพลอยได้: หน้าตั้งค่าในแอปจะขึ้นรายชื่อเอง

เดิม relay เขียนลงแท็บ `LINE Users` อย่างเดียว แล้ว admin ต้องก๊อป `userId`
จากชีตมาวางในหน้า `กำหนดบทบาทผู้ใช้ LINE ที่ทักเข้ามา` ด้วยมือ

โค้ดใหม่ mirror รายชื่อเข้า KV key `lineUsers` ให้ด้วยทุกครั้งที่มีคนทักเข้ามา
(`mirrorUsersToKv_()`) — ซึ่งเป็นคีย์ที่ `index.html` อ่านผ่าน `storeGet('lineUsers')`
อยู่แล้ว รายชื่อจึงขึ้นในหน้าตั้งค่าเองโดยไม่ต้องก๊อปวางอีกต่อไป
(ช่องเพิ่มด้วยมือยังอยู่เหมือนเดิม เผื่อกรณีข้อ 7)
