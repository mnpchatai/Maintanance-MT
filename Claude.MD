ระบบแจ้งซ่อมเครื่องจักร (Maintenance Work Order System)
Single-page Thai-language web app for submitting and tracking machine repair
requests through a multi-step approval workflow (factory manager → general
manager → technician assignment → repair).
Live URLs
App: https://mnpchatai.github.io/Maintanance-MT/ (GitHub Pages,
deploys automatically from `main` — the served file must stay named
`index.html` at the repo root)
Database (Google Sheet):
https://docs.google.com/spreadsheets/d/1Zm31RC9ak_plSb19LsgGn8QJn4EkadYOnKUF98dyAwA/edit
Repo: `mnpchatai/Maintanance-MT` on GitHub

Google account migration (26 Aug 2026) — everything moved from the old
`thtwgot-Kh` GitHub account and its Google account to `mnpchatai@gmail.com`.
The Sheet, both Apps Script projects and the GitHub repo were all recreated
there, so every old `/exec` URL, the old Sheet id and the old Pages URL are
dead. The four URLs that live in code are now `API_URL`, `SHEET_URL`,
`APP_URL` and `LINE_RELAY_URL` at the top of `index.html`. Two things still
have to be redone by hand inside the Apps Script editor on the new account
(they are not in this repo): the LINE relay's `SPREADSHEET_ID` must point at
the new Sheet id above, and `LINE_CHANNEL_ACCESS_TOKEN`/`LINE_CHANNEL_SECRET`
must be re-entered there; the LINE Developers Console → Messaging API →
Webhook URL field must also be repointed at the new relay `/exec` URL.
Architecture
Everything the browser needs is one file: `index.html` (vanilla JS, no
build step, no framework — a hand-rolled `state` object + `render()` that
does `app.innerHTML = ...` on every change). There is no backend server;
persistence and notifications are handled entirely by two separate Google
Apps Script Web Apps, both callable from the browser via `fetch`.
```
index.html (GitHub Pages, static)
   │
   ├─ storeGet/storeSet ──► Apps Script "คำร้องแจ้งซ่อม" (bound to the Sheet)
   │                        reads/writes the Sheet, mirrors readable tables
   │
   └─ tryLineWebhook ──────► Apps Script "LineOA MT" (standalone project)
                              pushes/broadcasts LINE messages
                                    ▲
                                    │
                       LINE ───────┘ (Messaging API webhook events:
                                      follow/message → logs userId to Sheet)
```
Both Apps Script projects live in Google's account, not in this git repo.
Their source is only ever pasted by hand into the Apps Script editor — see
"Apps Script projects" below for the current full source of each, and always
paste the entire file, replacing everything (partial pastes have broken
things before by deleting helper functions).
1. `index.html` — the client
Constants near the top: `API_URL` (main data API), `SHEET_URL` (link
shown in Settings), `APP_URL` (used to build notification deep links) and
`LINE_RELAY_URL` (the "LineOA MT" relay). Update these here and push to
`main` if either Apps Script gets redeployed to a new URL.
`state` is a single global object; `render()` rebuilds `#app` via
`innerHTML` on every change (no virtual DOM).
Login & access control — no LINE login at all. The app used to gate
entry behind LINE LIFF (`liff.init`/`liff.login`). That was removed: the
LINE Login channel sits in "Developing" status, which silently limits
successful logins to the channel's own admin/tester accounts, so every
other employee got either a native `เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ` alert
(Android), a 404 (iOS), or the `access.line.me` email/password form —
a password almost nobody has ever set. Publishing the channel was judged
more trouble than it was worth. Do not reintroduce a LIFF gate unless
that channel is actually published first.
Identity is now a device id: `D-<24 random base36 chars>` generated
on first visit and persisted in `localStorage` under `mtDeviceId`
(`getDeviceId()`). It is a bearer credential — whoever holds the string
holds the access.
A user's roles are the union of two sources (`resolveAccess()`):
the `สิทธิ์ผู้ใช้ LINE` sheet tab (server-side exact-match lookup via
the unchanged `doGet('userRoles', <deviceId>)`), and their own approved
row in the `accessRequests` KV key. Unknown role strings are filtered
against `ROLES` so a typo in the sheet can't white-screen the app.
Unknown visitors are not blocked, they get a "ขอสิทธิ์เข้าใช้งาน"
form (name / department / requested role / note; picking `tech` forces
a technician-name choice so it matches the ช่าง tab exactly). That
writes a `pending` entry to `accessRequests` and fires
`tryLineWebhook('admin', ...)`. They then sit on a waiting screen that
re-checks every 7s and `location.reload()`s itself the moment an admin
approves — no second login, no re-scan, nothing to re-enter.
One screen, not two — คำขอสิทธิ์เข้าใช้งาน is the single place where a
person's **app role** and the **LINE account that receives their role's
notifications** are both set, keyed off the name they typed when they
requested access. The separate กำหนดบทบาทผู้ใช้ LINE ที่ทักเข้ามา section
(and `saveLineUserRole`/`renderLineUserRoles`) was removed for that
reason: it listed the same people again under their LINE display names,
with no way for the app to know which LINE account belonged to which
requester — the app has no LINE login, identity is a device id, so the
pairing was always a manual admin decision and now it is made once, next
to the requester's name. What moved into the คำขอสิทธิ์ card: the manual
"เพิ่ม LINE ด้วยตัวเอง" box (feeds `lineUsers`, so an account that never
messaged the OA can still be picked), and a delete-only
ผู้รับแจ้งเตือนที่กำหนดไว้แบบเดิม table listing whatever is left in the
`lineUserRoles` KV key. That key is still read by
`lineRecipientsForRole`, so old mappings keep working — they just can't
be created any more, and `removeLegacyLineUserRole` exists so an admin
can retire one instead of it being an invisible recipient. Recipients who
never use the app at all (a manager who only wants pings, a technician
with no app access) belong in the `แจ้งเตือน LINE - ผู้รับ` sheet tab.
`admin` approves/rejects in ตั้งค่าข้อมูลหลัก → คำขอสิทธิ์เข้าใช้งาน,
choosing the role to grant (which can differ from the one requested)
and, optionally, the LINE account to bind to that person (`lineUserId`
on the request row). A count badge sits on the settings tab while
requests are pending. An already-approved row can be reopened with
แก้ไขบทบาท, which edits the granted roles, the technician name and the
bound LINE account (`saveAccessRoles`) — that binding is not cosmetic:
`lineRecipientsForRole` treats it as a real recipient, so changing it
changes where that person's role notifications land. The decided-users
table shows each approved user's current binding (`LINE: <name>` /
`ยังไม่ผูก`), and the picker lists everyone the app knows a LINE userId
for (LINE Users tab + `lineUserRoles` + the `แจ้งเตือน LINE - ผู้รับ`
mirror), plus whatever id is already bound, so an existing binding can
never be silently dropped by the dropdown.
`lineLabelFor` renders both names when it knows both — `ชื่อจริง
(ชื่อไลน์)`, e.g. `ฐิติวัชร์ คงรอด (FANG :: 陳俐芳)`. The real name is
whatever an admin typed (the name column of the `แจ้งเตือน LINE - ผู้รับ`
tab, or the legacy `lineUserRoles[id].name`); the parenthesised one is the
LINE profile display name mirrored into `lineUsers`. Before this, the LINE
display name always won, so the picker was a list of nicknames and emoji
(`34_Dao ☀️`, `GODZAG`, `P`) with no way to tell which one was the person
in the request being approved — an easy way to bind the wrong account. The two names are compared
whitespace- and Unicode-insensitive (`sameName_`: NFC, strip spaces/nbsp/
zero-width, casefold) — the same person's name typed into the sheet and set
as their LINE display name usually differs by a doubled space or an
invisible character, and a plain `!==` rendered that as
`อุดม หนานคำ (อุดม หนานคำ)`. A
person known from only one source shows just that name; someone known from
neither, but present in the recipients sheet, still falls back to
`(<บทบาท>)`, and to the raw `userId` as a last resort.
Only a `didHash` (sha256 of the device id) is ever stored server-side,
never the raw id — the whole `accessRequests` list is world-readable
through the open Apps Script endpoint, so storing raw ids would let any
user copy another's credential into `localStorage` and impersonate them.
Keep it that way: the raw device id must stay client-side only.
Bootstrapping the first `admin` is the one manual step: the guest and
waiting screens both expose that browser's own device id with a copy
button, to be pasted by hand into `สิทธิ์ผู้ใช้ LINE` as
`D-... | admin | <name>`.
Device-id durability — the device id is the whole credential, so losing
it looks exactly like "I put my code in the sheet and still can't get in".
It used to live in `localStorage` alone, silently regenerating on any
browser that couldn't keep it (LINE's in-app browser, private windows,
Safari clearing site data), which meant the row an admin had just pasted
into the sheet was already stale. Now `persistDeviceId()` writes it to
`localStorage` + a 365-day cookie + `sessionStorage`, reads it back to
confirm at least one store is durable, and `readStoredDeviceId()` tries
all three in that order — so a surviving store re-seeds the wiped ones.
When nothing is durable (`state.deviceIdPersisted === false`) the guest
screen says so outright and tells the user to reopen the link in Chrome
or Safari, instead of handing out a code that will not survive.
Two follow-ons from the same root cause:
`recheckAccess()` must never `location.reload()` on success. A reload
re-runs `getDeviceId()`, so on a non-durable browser the user was thrown
straight back to the request-access screen holding a *different* code,
seconds after being granted access. It now calls `startApp()` (the
post-auth half of `init()`, split out and guarded by `appStarted`) and
enters the app in place, keeping the in-memory id.
The guest screen has a "ใช้รหัสประจำเครื่องเดิม" box
(`useExistingDeviceId()`) to paste a code that is already in the sheet.
That is the recovery path for a changed browser/device or a wiped store —
without it the only remedy was appending yet another row to the sheet for
the same person, which is how duplicate `D-...` admin rows appeared.
No-admin deadlock and why there isn't one: `admin` is deliberately not
requestable — `renderRequestAccess()` filters it out of the role list and
`submitAccessRequest()` rejects it — so the first `admin` can only come from
a hand-typed sheet row. That row needs nobody's approval, which is exactly
what breaks the "no admin exists, so no one can approve anything" cycle.
Once one admin is in, `renderAccessRequests()`'s role checkboxes iterate
`Object.keys(ROLES)`, `admin` included, so further admins are appointed
in-app and the bootstrap is never needed again. Appoint a second one — a
single admin who loses their device id puts the system back at the
bootstrap step.
The sheet is a complete bypass of the in-app approval flow for *every*
role, not just `admin`, so a stranded queue of pending requests is always
recoverable. The one thing a sheet-only admin cannot do is read a
requester's device id out of the pending request — requests store only
`didHash` by design (see above), so the requester has to send their own
code over. `renderSheetGrantFallback()` on the waiting screen exists for
that: it shows the waiting user their own device id un-collapsed, with a
copy button and instructions to send it to the admin. Keep it out of a
`<details>` — the admin bootstrap box next to it is collapsed and titled
for admins, which is why an ordinary waiting user never found their code.
`resolveAccess()` records `state.lastCheck = { at, serverOk, roles }` so
the guest screen can distinguish "couldn't reach Apps Script" from
"reached it, this code isn't in the sheet". The second message is gated
behind `state.ui.deviceIdTried` so first-time visitors, for whom having no
row is normal, aren't nagged by it.
Focus preservation: because `render()` destroys/recreates every DOM
node, any input that re-renders on `oninput` would normally lose focus
after one keystroke. Fixed via a `data-fid="..."` attribute on such
inputs/textareas; `render()` captures `document.activeElement`'s `data-fid`
cursor position before rebuilding and restores both after. Any new
text input whose `oninput` calls `render()` (directly or via polling) must
get a `data-fid`, or typing into it will break.
Known trap: an `onfocus` handler that unconditionally calls `render()`
creates infinite recursion once focus-restore calls `.focus()` on it
(this happened with the machine-search box — fixed by only calling
`render()` from `onfocus` when the dropdown isn't already showing).
Photo attachments — two buttons, never one. The attach UI used to be a
single `<input type="file" accept="image/*" multiple>` behind a label. On
iOS that is fine: Safari answers it with an action sheet offering
"Take Photo" alongside the library. On Android it is not — Chrome routes
`accept="image/*" multiple` straight into the Android photo picker, which
has no camera entry at all, so Android users could attach from the album
but had no way to shoot a photo. It is now two separate inputs:
`photoCameraInput` (`capture="environment"`, no `multiple`) which forces
the camera intent, and `photoGalleryInput` (`multiple`, no `capture`) for
the album — with the same pair, prefixed `resubmit`, inside the resubmit
box. Do not merge them back into one input, and do not put `capture` on
the gallery input (it would take the album away).
Three smaller traps came with it, all of them Android-side:
The inputs are hidden with `.photo-file-input` (offscreen clip), not
`display:none`, and are opened by `openPhotoPicker()` calling `.click()`
rather than by `label[for]` — some Android WebViews never forward the
label's click to a `display:none` input.
`looksLikeImage()` accepts a file with an empty `type`, falling back to
the filename extension. Cameras on some Android builds hand back a file
with no MIME type at all, and the old `f.type.startsWith('image/')` guard
dropped exactly those — the freshly-taken photo vanished with no error.
`takeFilesFromInput()` clears `input.value` right after reading the
FileList, so shooting a second photo (same filename, `image.jpg`) still
fires `change`.
In-app camera (`openInAppCamera`/`shootInAppCamera`) covers the case none of
the above can fix: LINE's in-app browser on Android does not implement the
camera intent at all, so even `capture="environment"` opens the file manager
— confirmed in the field, which is why `capture` alone was not enough. It
opens a `getUserMedia` preview and draws the frame onto a canvas, bypassing
the system file chooser entirely.
The same dead end exists on desktop, for a different reason: Windows/Mac
browsers ignore `capture` outright, so ถ่ายภาพ used to open the Open-file
dialog every single time — the report was "it jumps into the album by
itself", filmed in Edge on Windows — even though the laptop's webcam was
right there.
Which path the ถ่ายภาพ button takes is decided per device by `takePhoto()`,
via `preferInAppCamera()`: with `getUserMedia` available it returns true for
every non-mobile device (`isMobileDevice()` false) and for Android inside an
in-app browser, so both go straight to the canvas camera. Real
Chrome/Firefox on Android and all of iOS keep the native capture input,
which gives the full system camera app and the better photo. `isIOS()` also
checks `maxTouchPoints` because iPadOS reports itself as `Macintosh` — miss
that and iPads fall to the desktop branch.
Either way the other path stays one tap away: `photoFallbackHint()` renders
the link inverted depending on which one is primary, and worded for what the
tap actually does — on desktop that link is "เลือกไฟล์รูปจากเครื่อง" (a file
dialog), not "เปิดกล้องของเครื่อง". When `getUserMedia` fails (permission
denied, no camera, WebView refuses), the button falls through to the capture
input rather than dead-ending. That attempt is deliberately `quiet` on
mobile, so only a *manual* tap on the hint link surfaces the error toast; on
desktop the fallthrough does toast first, otherwise the file dialog appearing
after ถ่ายภาพ looks like the original bug all over again.
Routing lives in `captureInputOpensCamera()` — true only for a *full*
browser on a phone (Chrome on Android, Safari on iOS), where the capture
input really does launch the camera app and gives the better photo.
Everywhere else — desktop, and any in-app browser — ถ่ายภาพ goes to the
canvas camera, and when that fails it **stops**: it never quietly opens the
file/album picker, on any platform. Falling through is what produced the
original report, twice. The stop sets `state.ui.camBlocked` and
`photoFallbackHint()` swaps in `camBlockedPanel()`, worded per platform
(desktop: how to re-allow the camera, plus a file-picker button; mobile
in-app: open-in-real-browser plus the album workaround).
LINE's Android WebView is the case where *both* paths are dead: it never
implements the camera permission prompt, so `getUserMedia` rejects
(`NotAllowedError`/`NotFoundError`), and `capture` opens the Android photo
picker — filmed in the field, the ถ่ายภาพ button landing straight in the
album. `state.ui.camErr` carries the DOMException name into the panel, so a
screenshot of the panel is enough to diagnose the next report. A successful
`openInAppCamera()` clears both flags.
`externalBrowserUrl()` appends `openExternalBrowser=1` for LINE (LINE hands
that link to the system browser) and builds an `intent://…package=com.android.chrome`
URL for other Android WebViews. It must stay behind an `<a target="_blank">`:
assigning `location.href` would reload the page in the WebView that doesn't
honor it and wipe the half-typed form, which is not persisted anywhere.
`startCamStream()` retries once with a bare `{video:true}` when the detailed
constraints throw — but not on `NotAllowedError`/`SecurityError`, where a
retry cannot help.
**Bump `APP_VERSION` in every deploy that changes `index.html`.**
`checkForUpdate()` re-fetches the file and compares only that constant, so a
shipped fix with an unchanged version leaves every open tab — and every
WebView holding a cached copy — silently running the old code with no
refresh prompt. That is how a fix can be live and still "ยังเหมือนเดิม".
`render()` also prints the running `APP_VERSION` at the foot of the page
(`.app-version`), which is what tells you whether a phone is on the new code
at all before you debug anything else.
`updateCamFlipVisibility()` hides สลับกล้อง when `enumerateDevices()` counts
one camera (typical desktop). It hides only on a successful count — if the
enumeration throws, the button stays, since a phone that can't be enumerated
still has two cameras. It uses `visibility`, not `display`, to keep the
shutter centred in the bar.
`isInAppBrowser()` sniffs the UA for `Line/`, `IAB`, `FBAN`/`FBAV`/`FB_IAB`,
`Instagram`, `MicroMessenger` and the bare Android-WebView marker `; wv)`.
UA sniffing is a heuristic — the hint link is what saves a device the list
misses, so keep it visible.
The overlay markup lives outside `#app` (next to `#toastWrap`) on purpose —
`render()` overwrites `app.innerHTML` wholesale, which would tear out a live
`<video>` mid-shot. `startCamStream()` asks for `1920x1080` as an `ideal`
constraint (never `exact`, which would throw on a camera that can't do it):
the `getUserMedia` default is 640x480, too coarse to read a machine's
nameplate. It needs HTTPS, which GitHub Pages gives us.
Polling: `pollForUpdates()` re-fetches `config`/`orders`/`notifications`/
`accessRequests` and only calls `render()` if something actually changed
(JSON-string diff) — this is how edits made directly in the Sheet
(departments/machines/technicians) show up in the browser without a manual
reload.
It is driven by `startPolling()`, a `setTimeout` chain, **not**
`setInterval`. This matters: every request is one Apps Script execution,
and a Web App deployed *Execute as: Me* runs them all under the owner's
single concurrency budget, so excess requests queue. The old
`setInterval(pollForUpdates, 3000)` fired 4 requests every 3s per open
tab regardless of whether the previous round had returned — a handful of
tabs left open filled the queue faster than it drained, and anyone
*opening* the app then waited behind it (this was the "เปิดแอปรอ 2 นาที"
symptom). Three properties now keep that from recurring, and none of them
should be removed without a replacement:
- `pollInFlight` — a round cannot start until the previous one finished,
  so overlap is structurally impossible.
- adaptive backoff — the next delay is ~4× how long the last round took,
  clamped to `POLL_MIN`..`POLL_MAX` (15s–90s). A slow server means a long
  queue; polling harder makes it worse, so the client backs off and
  recovers on its own.
- `document.hidden` — hidden tabs poll not at all. `visibilitychange`
  resets the delay and polls immediately on return, so the user never
  sees stale data because of it.
`recheckAccess()` (the guest screen's approval watcher) follows the same
in-flight + hidden rules for the same reason.

Local snapshot: `saveSnapshot()`/`applySnapshot()` keep the last good
`config`/`orders`/`notifications`/`counters` plus the resolved roles in
`localStorage` under `mtSnapshot`, so `init()` paints the full app from
disk in ~100ms instead of waiting on the network. The server's answer
always wins: `resolveAccess()` runs regardless, and if it says the device
has no roles the snapshot is cleared and the page reloads into the guest
screen. The snapshot is bound to `deviceId` + `APP_VERSION` and expires
after 7 days.
The snapshot deliberately does **not** set `state.loaded` or
`state.ordersLoaded` — those two flags mean "fetched from the server this
session" and are what gate *writing back* (`persistOrders()`, editing
config on the Settings page). Booting from cache must never unlock a
write, or a stale copy gets mirrored over live Sheet data. Use
`configReady()` (server **or** cache) for anything that merely *displays*
config, and `state.loaded` for anything that edits it.
Related invariant, learned the hard way: `storeGet` returns `undefined`
on a failed fetch and `null` when the key genuinely has no value.
`loadEssential()`/`loadBackground()` must only set `state.loaded`/
`state.ordersLoaded` in the `!== undefined` case. Both previously set them
unconditionally, so a single dropped request left `state.orders = []` and
writes unlocked — one button press then mirrored an empty array over every
saved order.

Deep links from LINE notifications (`?order=<id>&role=<role>`, and
`?view=settings` for the new-access-request alert) must be read at
*script-evaluation* time, not inside `startApp()`. `DEEP_LINK` and the
`state.view`/`state.selectedOrderId` it pins are module-level statements
that run before anything can call `render()`, because `state.view`
defaults to `'new'` — the blank repair-request form. When the parse lived
inside `startApp()` it ran only after `resolveAccess()` had returned, so
every user who tapped a LINE link watched that unrelated form for the
length of an Apps Script round trip (about five seconds in practice)
before the screen jumped to the order they had actually asked for.
Three rules keep that path honest:
- `deepLinkOrderPromise` fires `getOrderById()` at script-evaluation time
  too, so the single-order fetch runs *beside* the auth check instead of
  queueing behind it.
- `openDetail()` paints before awaiting `photos:<id>`, and `startApp()`
  does not `await` it. Otherwise the detail screen waits on a third
  serial round trip and `loadBackground()` waits behind that.
- `openDetail()` is called even when the single-order fetch fails.
  `renderDetail()` shows "กำลังเปิดใบแจ้งซ่อม…" while `!state.ordersLoaded`
  rather than "ไม่พบใบแจ้งซ่อมนี้", so `loadBackground()` can still fill it
  in. The old `else render()` branch stranded those users on the form.
`DEEP_LINK` strips the query string from the address bar as soon as it
reads it, so the no-roles path above must reload with
`location.replace(location.pathname + DEEP_LINK.search)` — a bare
`location.reload()` there drops the link and lands the user on the app's
front page instead of the order they tapped.
CORS gotcha: all `fetch` calls to Apps Script use
`Content-Type: text/plain;charset=utf-8`, never `application/json`.
Apps Script Web Apps don't implement `doOptions`, so a JSON content-type
triggers a CORS preflight that silently fails. The receiving script still
`JSON.parse()`s the body regardless of the declared content type.
2. Apps Script "คำร้องแจ้งซ่อม" (bound to the Sheet) — main data API
Container-bound to the Database spreadsheet (open the Sheet → Extensions →
Apps Script to edit it). Deployed as a Web App (Execute as: Me, Who has
access: Anyone) at the URL in `API_URL`.
Two-tier storage model:
KV sheet (`KV` tab): generic key→JSON-string store. Keys in use:
`orders`, `counters`, `notifications`, `photos:<id>`, `lineWebhooks`,
`accessRequests`, `lineUsers`, `lineUserRoles`. This
is the literal backing store for `storeGet`/`storeSet` in the client for
everything except `config`.
`config` is special and bidirectional: departments/machines/
technicians are not stored as JSON in KV. `doGet('config')` builds the
config object live by reading three separate sheet tabs (แผนก,
เครื่องจักร, ช่าง) directly, and `doPost('config', ...)` writes
those same three tabs. This means those tabs are the real source of
truth — a manager can add/edit/delete rows directly in the Sheet and the
app picks it up within one poll cycle (~7s), no code involved.
Orders/notifications remain app-owned, one-way mirrors: the
ใบแจ้งซ่อม (orders) and การแจ้งเตือน (notifications) tabs are
fully rewritten (`clearContents()` + re-append) every time the app saves
`orders`/`notifications`. This was a deliberate choice — the approval
workflow (who can approve, status transitions, timeline entries) lives in
client JS logic, so letting someone hand-edit a status cell in the Sheet
would desync it from reality. Do not make these bidirectional without
also moving the workflow logic server-side.
The ใบแจ้งซ่อม tab's "รหัสเครื่องจักร" column is a `HYPERLINK()`
formula jumping to the matching row in the เครื่องจักร tab.
Status/approval columns (สถานะ, อนุมัติผจก.โรงงาน, อนุมัติผจก.ทั่วไป)
get a data-validation dropdown + conditional-formatting colors matching
the app's status-pill palette, reapplied on every sync.
Dates are reformatted from raw ISO UTC to Thai Buddhist-calendar
`dd/MM/yy[ HH:mm]` (matching the client's `fmtDate`/`fmtDateTime`) before
being written — raw ISO strings in the Sheet are a past bug, not a
format choice.
`สิทธิ์ผู้ใช้ LINE` tab (columns: `userId | บทบาท | ชื่อ`) — controls
who can log into the app and which role(s) they see. One row per
(userId, role) pair; a person with multiple roles gets multiple rows.
Despite the tab name it is no longer LINE-specific: the `userId`
column now holds whatever identity string the client presents, which
since the LIFF removal (see "Login & access control" above) is a
device id of the form `D-<random>`. Hand-typing a row here is still
the only way to create the first `admin`, and remains a valid way to
grant any role permanently. Old `U...` LINE rows are inert — nothing
presents a LINE userId to `doGet('userRoles')` any more.
The 3rd column (`ชื่อ`) is free-text on every row (handy for the admin to
see who's who at a glance) but the app only reads it on rows where
บทบาท = `tech` — there it must exactly match a name in the ช่าง tab,
since that's what lets the app know which technician a given
`tech`-role LINE login is (used to restrict start/finish-repair actions
to only that person's own assigned orders — see
`assignedTechs(o).includes(state.myTechName)` in `index.html`). On any
other role row the column is purely documentation and can hold whatever
name the admin wants — the app never looks at it. `doGet('userRoles', ...)` returns `{ roles: [...], techName: '...' }` (not a bare array) —
`readUserRoles_()` in the Apps Script reads all 3 columns and only
populates `techName` from a `tech`-role row.
`resyncAll()` — run manually from the Apps Script editor (function
dropdown → `resyncAll` → Run) any time the mirror-writing code changes, to
re-apply formatting/dropdowns/colors to already-saved data. Editing the
code alone never retroactively touches existing sheet rows.
After any code change: Deploy → Manage deployments → edit (pencil) →
Version: New version → Deploy. This keeps the same `/exec` URL. Using
"New deployment" instead mints a new URL, which then has to be updated in
`index.html`'s `API_URL` and pushed to `main`.
Full current source of this script is not stored in this repo (Apps
Script has its own version history — File → see version history in the
Apps Script editor). If picking this up fresh, open the Apps Script editor
from the Sheet to read the live code directly.
3. Apps Script "LineOA MT" (standalone) — LINE relay
Separate, non-Sheet-bound Apps Script project. Deployed as its own Web App
(Execute as: Me, Who has access: Anyone). Its URL gets pasted into two
places:
`developers.line.biz` → the Channel → Messaging API tab → Webhook URL
field (with "Use webhook" switched on) — so LINE calls it on
follow/message events.
The app's own Settings page (`ตั้งค่าข้อมูลหลัก` → LINE Webhook table) —
once per role (fm/gm/maint/requester) — so the browser calls it to send
notifications.
It holds two secrets hardcoded as constants: `LINE_CHANNEL_ACCESS_TOKEN` and
`LINE_CHANNEL_SECRET`. This script must never be committed to this git
repo or shared outside the team — unlike the Sheet-connector script, it
contains live credentials. (If picking this up in a new session: the actual
token/secret values are not recorded here on purpose; ask the user or check
the LINE Developers Console → Messaging API tab if they need to be
rotated/reissued.)
Behavior:
Incoming LINE events (`body.events` present) → logs each sender's
`userId` + display name (fetched via the LINE profile API) into a
`LINE Users` tab in the same Database spreadsheet (reuses
`SPREADSHEET_ID`), so admins can look up who's who.
Outgoing notification requests from the app (`body.role`/`body.message`
present) → looks up recipients for that role in a `แจ้งเตือน LINE - ผู้รับ` tab (columns: บทบาท, userId) and pushes individually via LINE's
push API. No longer broadcasts to every OA friend as a fallback — if
no recipient is mapped for a role (neither via the client-sent `userIds`
nor a row in this sheet tab), the notification for that role is simply
not sent, rather than pinging everyone who's ever friended the OA. This
was a deliberate fix (the broadcast fallback used to fire on every access
request, since `admin` rarely has a mapped recipient) — until a role has
a real recipient mapped, that role's notifications go nowhere, which is
the intended tradeoff over notifying unrelated people.
`body.role` is not limited to the app's named roles (fm/gm/maint/
tech/requester) — `assignTechnician()` in `index.html` sends each
assigned technician's exact name (from the ช่าง tab /
config.technicians) as `role`, so a per-technician personal LINE ping
goes out to every technician on the order the moment it's assigned. To
route that to the right person, add a row per technician to
`แจ้งเตือน LINE - ผู้รับ` with บทบาท = their exact name string and
userId = their LINE userId — same mechanism as the other roles, no
Apps Script changes needed. Until a technician has a row there (or a
`techName` on their approved คำขอสิทธิ์ row with a LINE bound, or a
leftover `lineUserRoles` mapping with that name as `techName`), their
assignment ping simply isn't sent — see the no-broadcast-fallback note above.
(This per-name routing is separate from the `tech` app role below —
`tech` is the role a technician's own LINE account holds to log into
the app; the per-name row is what makes the assignment ping personal.)
`tryLineWebhook(role, message)` in `index.html` no longer requires a
webhook URL configured under that exact `role` key in Settings — it
resolves the target through `lineRelayUrl(role)`, which returns the
`LINE_RELAY_URL` constant when set and only otherwise falls back to
whichever webhook URL is configured in Settings (they're always the same
"LineOA MT" `/exec` URL in practice), so technician names never need
their own row in the Settings → LINE Webhook table.
The constant deliberately wins over the Settings table: the migrated
`lineWebhooks` rows still carry the old account's dead relay URL, and
posting there fails silently. The Settings page shows the URL actually in
use and marks the table as a fallback while the constant is set. To go back
to configuring the relay from Settings, set `LINE_RELAY_URL` to `''`.
`tryLineWebhook` now also posts a `userIds` array alongside
`role`/`message`, resolved client-side by `lineRecipientsForRole` as the
union (deduped) of three sources: the LINE account bound to each approved
row in `accessRequests` (set at approval or later via แก้ไขบทบาท — the
primary way), the `lineUserRoles` KV map (legacy, see below), and the
`lineRecipients` mirror of the hand-typed `แจ้งเตือน LINE - ผู้รับ` tab. The sheet mirror has to be in
that union: the relay skips its own sheet lookup entirely as soon as the
client sends a non-empty `userIds`, so leaving it out would silently drop
recipients who only have a sheet row.
Because any role can be the one that fires a notification, the two
routing keys (`lineUserRoles`, `lineRecipients`) are loaded once per
session for everyone by `loadNotifyRouting()` (called from
`loadBackground`), not only for admins opening Settings. They stay out of
the 3s poll for non-admins — that data barely changes — so this costs two
requests at startup and nothing after. Before this, a non-admin's
notifications always shipped an empty `userIds` and fell through to the
relay's sheet lookup, so in-app mappings were effectively ignored unless
an admin happened to be the sender.
The relay script now honors `userIds`: `handleNotifyRequest_` pushes
to `body.userIds` when it's a non-empty array, skipping the sheet lookup
entirely; only falls back to the `แจ้งเตือน LINE - ผู้รับ` sheet lookup
when the client sent no `userIds`, and no longer broadcasts to every OA
friend if neither source has a recipient (see the note above). This was
a hand-edit made directly in the Apps Script editor, since that code
isn't in this repo.
**Root cause found (2 Sep 2026): nothing ever wrote the `lineRecipients`
KV key, so the hand-typed `แจ้งเตือน LINE - ผู้รับ` rows were silently
dropped from every notification the app could route itself.** The
`userIds` union above names three sources, but `storeGet('lineRecipients')`
read a key no script produced — the relay only mirrored `lineUsers` — so
`state.lineRecipients` was permanently `[]`. Because `handleNotifyRequest_`
skipped its own sheet lookup the moment `userIds` came in non-empty, one
person bound through a คำขอสิทธิ์ row was enough to cut every sheet-only
recipient out of that role. Worse, the person-targeted paths added in #11
(`notifyOrderRequester`, `sendLineToTech`) post **no** `role` at all, so
when `lineIdsForPerson()` came up empty — the normal case, since the sheet
rows were invisible and most people have no LINE bound — the message had
no fallback and was dropped with only a `console.warn`. Requester and
technician notifications, the bulk of the traffic, went dead that day.
Fixed on three fronts, each independently sufficient for part of the
problem:
- `mirrorRecipientsToKv_()` in the relay now writes the `lineRecipients`
  key from the sheet tab, piggybacked on every existing `mirrorUsersToKv_()`
  call site plus `?key=selftest` and a new `?key=sync`, and runnable from
  the editor as `syncRecipientsNow()`. Requires pasting the updated
  `docs/line-relay.gs` and redeploying.
- `alsoSheet:true` on the outgoing payload asks the relay to **merge** its
  sheet rows with the client's `userIds` (deduped) instead of choosing one
  source. An un-redeployed relay ignores the unknown field and behaves as
  before, so this is safe to ship ahead of the paste.
- The person-targeted paths now pass a `fallbackRole` used only when no
  specific LINE id resolves: the technician's own name for `sendLineToTech`
  (still one person — the relay accepts a name as `role`), `requester` for
  `notifyOrderRequester`, which prefixes the message with `(ถึง: <ชื่อ>)`
  so a shared recipient can tell whose order it is. This deliberately
  softens #11: a message reaching an explicitly-configured sheet row beats
  a message reaching nobody, and #11's real guarantee — never broadcasting
  to every OA friend — is untouched. Binding LINE to the คำขอสิทธิ์ row is
  still the right fix and keeps delivery to exactly one person.
These paths run entirely in the app, so they work against the currently
deployed relay with no Apps Script change.

**Diagnosability.** Every send now goes through `postToRelay()`, which
reads the relay's `{ ok, sent, targets }` reply instead of discarding it,
and appends the outcome to `state.lineSendLog` (in-memory, last 30, this
session only). `pushNotification` toasts when a send provably reached
nobody. Settings gained three panels: a real **ส่งข้อความทดสอบ** that walks
the identical path and reports how many messages went out, a per-role
recipient count computed with the same `lineRecipientsForRole()` used for
real sends, and the send log. `sent === 0` and a failed `fetch` are kept
distinct: an Apps Script redirect can make the response unreadable
cross-origin *after* the POST has landed, so that case logs `ok: null`
("ไม่ทราบผล") and never claims a failure.

**Routing-data race.** `loadNotifyRouting()` was fire-and-forget from
`loadBackground()` and had no retry — the 3s poll skips these keys for
non-admins — so a button pressed before it landed, or a single failed
load, left `lineRecipientsForRole()` and `lineIdsForPerson()` with nothing
to match against for the rest of the session. `ensureNotifyRoutingReady()`
memoizes the load, clears the memo when `storeGet` reports failure
(`undefined`, as distinct from an empty result), and is awaited by every
sender.

**Root cause found (31 Aug 2026): the relay's `SPREADSHEET_ID` was still
`1er3WPCHJmV8_lioD-9gShr5mWDaajvXEYrEaaV-_p-k`** — the old
`thtwgot@gmail.com` account's Sheet — while the database moved to
`1Zm31RC9ak...` in the 26 Aug migration. The relay runs as the new account,
so `openById()` threw on every event. This is the *same* bug the
"คำร้องแจ้งซ่อม" script found and fixed in its `v8` (its own comment names
`1er3WPCH...` and `thtwgot@gmail.com`); nobody carried the fix across to the
relay. It matches the evidence exactly: the `LINE Users` tab holds data up to
14 Aug 2026 and nothing after. The `whoami` endpoint on the main script and
`selftest` on the relay both report the Sheet id they actually opened — those
two must always agree.

The relay source now lives in this repo as `docs/line-relay.gs` — a
credential-free file meant to be pasted over `Code.gs` in the "LineOA MT"
editor. `SPREADSHEET_ID` is hardcoded to the correct id (it is not a secret —
`index.html` already publishes it) so a paste-and-deploy is enough to start
logging userIds with no further setup; only `LINE_CHANNEL_ACCESS_TOKEN` and
`LINE_CHANNEL_SECRET` come from Apps Script **Script properties**, and both
are optional for logging — without them userIds still land in `LINE Users`,
just with a blank display name, and `backfillDisplayNames()` (runnable from
the editor's Run button) fills those in later. It
replaces the earlier hand-edited version and fixes the "someone chats in
but their userId never reaches `LINE Users`" bug — see
`docs/line-users-troubleshooting.md` for the full ranked cause list. The
substantive changes over the old relay:
- Appends the `userId` row **before** calling the LINE profile API, with
  the name fetch demoted to a best-effort `try/catch`. The old order meant
  an expired/unre-entered `LINE_CHANNEL_ACCESS_TOKEN` threw mid-event and
  dropped the whole row, even though the `userId` was already in hand.
- Handles `message`/`postback`/`join`/`memberJoined`/`unfollow`, not just
  `follow` — anyone already friends with the OA never emits `follow` again,
  so chatting in could never log them.
- Creates the `LINE Users` tab (and header) on demand, and upserts by
  `userId` instead of appending duplicate rows.
- Never throws out to LINE (LINE disables a webhook that keeps failing);
  every failure is appended to a new `Relay Log` tab in the same Sheet,
  which is the first place to look when a chat doesn't show up.
- `doGet('?key=selftest')` reports whether the Sheet opens, whether the
  access token works, and how many rows `LINE Users` holds. The Settings
  page calls this (see `runLineRelayTest()` in `index.html`) so an admin
  can tell a broken relay apart from a webhook LINE never sent, without
  opening the Apps Script editor. An empty `Relay Log` plus a reachable
  relay means LINE isn't calling it at all — a Console/OA-Manager problem,
  not a code one.
- `ensureSheet_` repairs only *empty* header cells on an existing tab, so the
  pre-existing 3-column `LINE Users` gains the 4th header without renaming the
  columns someone already titled.
- `backfillFollowers()` (Run button) pulls every current OA friend from LINE's
  `/v2/bot/followers/ids` into the tab in one go, for people who chatted while
  the relay was pointed at the dead Sheet. It reads the existing userIds into a
  set first and writes only the ones missing, so existing rows are never
  touched and re-running it is a no-op. LINE gates that endpoint to **verified
  or premium** accounts (403 otherwise) and it only returns people still
  friended — `selftest`'s `checks.followersApi` says up front whether it will
  work. With no API available the only route is a fresh event per person: a
  broadcast asking everyone to reply once, or a rich-menu tap (`postback` is
  one of the handled event types). LINE OA Manager shows chat names but never
  `userId`, so there is nothing to copy by hand.
- `mirrorUsersToKv_()` copies the `LINE Users` tab into the `lineUsers` KV
  key on every event, so the LINE picker in คำขอสิทธิ์เข้าใช้งาน fills
  itself. Previously nothing populated that key and admin had to paste each
  userId in by hand; the manual add box is kept for users with no
  `source.userId` (someone messaging from a group without having friended
  the OA).
Git workflow used throughout this project
Every change so far: branch off `main` → edit `index.html` → commit → push →
`mcp__github__create_pull_request` → `mcp__github__merge_pull_request`
(squash). No long-lived feature branches; each PR is small and merged
immediately. Apps Script changes are never part of a PR — they're pasted by
hand into the Apps Script editor by the user, since that code doesn't live
in git.
Known gotchas (things that already went wrong once)
Apps Script's "Run" button in the editor calling `doGet`/`doPost` directly
will always throw `Cannot read properties of undefined (reading 'parameter')` — there's no real HTTP request behind it, so `e` is
`undefined`. This is expected and harmless; test via a real URL instead
(`.../exec?key=test` in a browser tab), not the Run button. (Both
`doGet`/`doPost` now guard against `e` being undefined anyway.)
A fresh Apps Script deployment with default settings often has "Who has
access" set to something other than "Anyone", which makes anonymous
`fetch` calls get redirected to a Google sign-in page — this shows up in
the browser console as a CORS error ("No Access-Control-Allow-Origin
header"), not as an auth error. Fix: Manage deployments → edit → confirm
"Who has access: Anyone".
Google Sheets' native "dropdown chip" colors (the colored circles you see
when editing a Data Validation rule with Dropdown criteria) cannot be
set via Apps Script — that's a manual, per-option UI action only. The
automatic coloring implemented here uses Conditional Formatting instead
(whole-cell background/text color keyed to exact text match), which is
scriptable and is what actually colors the "ใบแจ้งซ่อม"/"การแจ้งเตือน"
status columns.
The KV sheet lost all its rows once during development (cause unknown —
likely a manual edit while exploring the Sheet UI, not a script bug).
Recovered via File → Version history → Restore. Consider protecting the
`KV` tab (Data → Protect sheets and ranges) if this becomes a recurring
risk.
Relay version handshake (3 Sep 2026)
`docs/line-relay.gs` is a copy-paste master, not running code — every edit to
it is inert until it is pasted into the "LineOA MT" editor and redeployed as a
**New version**. That gap silently broke every notification: the app sent
`userIds`, the deployed relay was older and ignored them, and the app reported
the guess "relay ไม่พบผู้รับ" for what was really a stale deployment. There is
now a handshake: `RELAY_VERSION` in `docs/line-relay.gs` must equal
`RELAY_CODE_VERSION` in `index.html`, the relay echoes `version` on every
reply, and the app warns loudly (send log, `runLineSendTest`, `runLineRelayTest`)
whenever they differ. **Bump both together in the same commit.**
The relay also returns `targets` and `errors[{userId, code, message}]` now, and
`pushTo_` returns `{ok, code, message}` instead of a bare boolean, so the app can
show the chain "แอปหาผู้รับได้ N → relay หาได้ M → LINE รับไป K" plus LINE's own
HTTP code. Never collapse a failure back into a single guessed sentence — the
four causes behind `sent:0` (stale relay, bad token, bad/unfriended `userId`,
no recipients at all) are fixed in four different places. Full runbook:
`docs/line-notify-not-sending.md`.

Where things stood at hand-off
Access control was rebuilt off LINE entirely — see "Login & access
control" under `index.html` above for the whole design and the reasons.
Short version: anyone with the app link can open it in any browser, ask
for access, and an `admin` grants a role in-app; LIFF is gone. The only
remaining manual steps are seeding the first `admin` row in the sheet,
and pasting `docs/line-relay.gs` into the "LineOA MT" editor (it already
honours `userIds` and mirrors followers into the `lineUsers` KV key).
Core workflow (submit → FM approve → GM approve → assign → in-progress →
done), Sheets persistence, near-real-time polling, and the simplified
Settings page are all done and merged to `main`.
LINE integration is mid-setup: OA created, Messaging API enabled, both
Apps Script projects built and deployed, CORS bug fixed. Still open:
finish wiring the LINE Developers Console Webhook URL field, have each
real recipient message the OA once to get logged into `LINE Users`, then
bind each approved user to their LINE account in คำขอสิทธิ์เข้าใช้งาน
(or, for people who never use the app, fill in the
`แจ้งเตือน LINE - ผู้รับ` tab) so every role maps to a real `userId`.
The relay's broadcast-to-everyone fallback was removed (see the "LineOA
MT" section above) — until that mapping exists per role, notifications
for that role simply aren't sent, rather than reaching unrelated people.
Technician assignment now also fires a personal LINE push (see
`assignTechnician()` in `index.html`, keyed by the technician's exact name
as `role`) — needs the same `แจ้งเตือน LINE - ผู้รับ` mapping filled in
per technician once each has messaged the OA and shown up in `LINE Users`.
A job can now be assigned to multiple technicians at once. The assign
screen (maint role, `PENDING_ASSIGN` status) shows one technician picker
per row with a "+ เพิ่มช่าง" button to add more (unlimited, via
`state.ui.assignTechs`/`addAssignTechRow()`/`removeAssignTechRow()`); each
selected technician gets their own personal LINE ping via the same
per-name routing described above. Order data shape changed:
`order.assignment.technician` (single string) → `order.assignment.technicians`
(array of strings). `assignedTechs(o)` in `index.html` reads either shape
so orders assigned before this change still display correctly.
The Apps Script "คำร้องแจ้งซ่อม" mirror code (not in this repo) still
reads the old singular `technician` field for the "ช่างผู้รับผิดชอบ"
column in the ใบแจ้งซ่อม sheet tab — it needs to be updated by hand to
read `technicians` (joined with a comma), with a fallback to the old
`technician` field for historical rows.
Added a dedicated `tech` app role (label "ช่าง") to `ROLES` in
`index.html` — this is the role a technician's own LINE account would
hold in `สิทธิ์ผู้ใช้ LINE` to log into the app themselves (distinct from
the per-name LINE push routing above, which is what makes an
assignment notification personal). `tech` was also added to the
Settings → LINE Webhook role list.
Assigning a job now requires a planned start date and end date
(`assignment.startDate`/`.endDate`, two `<input type="date">` fields on
the `PENDING_ASSIGN` assign screen) — `assignTechnician()` in
`index.html` refuses to save (`toast(..., true)`) if either is blank, or
if the end date is before the start date. Both dates are shown on the
order detail page once assigned, and included in the per-technician
personal LINE ping.
Starting/finishing a repair (`ASSIGNED`→`IN_PROGRESS`→`DONE`) is now
gated on `role==='tech'` AND being one of the order's own assigned
technicians — `maint` only approves and assigns now; the technician
side does the rest, and only for orders assigned to them personally
(`assignedTechs(o).includes(state.myTechName)` in `index.html`).
`state.myTechName` comes from the `ชื่อ` column of `สิทธิ์ผู้ใช้ LINE`
(see above) via `doGet('userRoles', ...)`'s `techName` field — a `tech`
account with no matching row there (or a name that doesn't exactly match
the ช่าง tab) won't see the start/finish buttons on any order.
The "new repair request" page/nav tab is now titled "ใบคำร้อง /
ใบแจ้งซ่อม", and the form has a new required "ประเภทเอกสาร" listbox
(1. ใบคำร้อง / 2. ใบแจ้งซ่อม) shown before the machine-code field, saved
as `order.docType` (`'request'` or `'repair'`) and shown as a small label
on the order list card and detail page (`DOC_TYPES` in `index.html`).
`maint` (ผจก.แผนกซ่อมบำรุง) now records more of the paper work-order
form on assignment: a required receiving-manager name
(`assignment.receivedByName`) and a required "การดำเนินงาน" execution
plan (`assignment.executionPlan`: `immediate`/`need_purchase`/
`use_existing`, see `EXECUTION_PLAN_META`). There's also a separate,
editable-any-time-after-assignment "บันทึกข้อมูลซ่อมบำรุง" record
(`order.maintRecord`: `causeAnalysis`, `inspectorOpinion` — see
`INSPECTOR_OPINION_META` — and a `parts[]` table of
name/qty/unit/price/shop/note) that `maint` fills in and every role can
view read-only once a job is assigned.
The parts table has a second, narrower editor of its own. The person who
knows what was actually fitted — how many, at what price, from which shop —
is the technician holding the spanner, not the manager signing the form, so
a technician assigned to that order can edit `maintRecord.parts` directly
instead of writing it on paper for `maint` to retype. The box therefore has
two edit modes, switched by `state.ui.maintRecordMode`:
* `'full'` (`openMaintRecord()` → `saveMaintRecord()`) — `maint`, so `admin`
  too via `hasRole`. Cause analysis + inspector opinion + parts.
* `'parts'` (`openMaintParts()` → `saveMaintParts()`) — a technician assigned
  to this order (`canEditMaintParts()`, the same test as
  `canUpdateOpinionProgress()` and for the same reason). Renders only the
  parts table; `causeAnalysis`/`inspectorOpinion` are never read from the
  form or written back, and `opinionProgress` is never cleared — switching
  แนวทาง stays `maint`'s decision alone.
Both modes render the same `partsEditor` template, so the two forms cannot
drift apart in columns or buttons. A technician may start the parts list on
an order `maint` has not written anything on yet: the record is created with
both of `maint`'s fields empty, which `progressTrackOf()` ignores (an empty
`inspectorOpinion` does not match `OPINION_STEPS`), so the milestones still
fall back to the assignment's `executionPlan` exactly as before, and the
read-only view shows "ยังไม่ได้บันทึก (ผจก.แผนกซ่อมบำรุง)" for the two empty
fields rather than blanks.
Every parts save stamps `maintRecord.partsUpdatedBy` / `partsUpdatedAt`
(shown as "แก้ไขรายการอะไหล่ล่าสุด" in the read-only view) and appends a
`statusHistory` line naming the editor and the row count — the audit trail is
why parts editing is deliberately *not* gated on order status: parts get
remembered after "ซ่อมเสร็จสิ้น", and `maint` could always edit a closed
order anyway. `saveMaintRecord()` carries an unchanged `partsUpdatedBy`
forward (via `samePartsList()`) so `maint` pressing บันทึก without touching
the table does not silently take credit for the technician's rows.
A technician's save fires `pushNotification('maint', …)` — `maint` owns the
document and does the purchasing, so they need to know the parts changed; the
requester deliberately gets nothing, as there is nothing for them to do about
it. A save that changes nothing writes nothing (no history line, no
notification, no `storeSet`).
Both save paths now check `persistOrders()`'s return value and roll back
`maintRecord`/`opinionProgress`/`statusHistory` when the write failed, the
same way `saveOpinionStep()` does. `saveMaintRecord()` previously ignored it
and reported "บันทึกเรียบร้อย" over a write that never landed.
Following through on the ความคิดเห็นของช่างผู้ตรวจสอบ — picking one of the
four `INSPECTOR_OPINION_META` options used to be the end of it: the record
said "ซื้ออุปกรณ์มาทำเอง" and nothing anywhere said whether the parts had
been ordered, let alone delivered, so the requester had to go and ask.
Each option now carries its own ordered list of milestones (`OPINION_STEPS`
in `index.html`), rendered under the maintenance record as a
"ความคืบหน้า: <แนวทาง> (n/m)" box on the order detail page:
* `send_repair` → เริ่มส่งซ่อม, ซ่อมเสร็จ/รับของกลับ
* `external` → นัดหมายช่างภายนอก, ช่างเข้าดำเนินการ, ช่างซ่อมเสร็จ
* `self_repair` → เริ่มลงมือซ่อมเอง, ซ่อมเองเสร็จ
* `buy_parts` → สั่งของเรียบร้อย, ของมาส่งเรียบร้อย
Each milestone is one button that opens a date (defaulting to today via
`todayLocalIso()` — `toISOString()` is UTC and would offer "yesterday"
between midnight and 07:00 Thai time) plus an optional note, and saves to
`order.opinionProgress` = `{ opinion, steps:{ <key>:{date,note,by,at} } }`
(`saveOpinionStep()`). Milestones must be recorded in order — the button for
a later step doesn't appear until the previous one is recorded, and
`saveOpinionStep()` re-checks that server-side of the UI so a stale tab
can't skip one.
Every save fires `notifyOpinionStep()`: the order's own requester
(`notifyOrderRequester`), the `maint` role (`pushNotification('maint',…)`)
and every assigned technician by name (`sendLineToTech`) — the three
parties who need to know that the machine went out or the parts arrived.
Re-saving an already-recorded milestone is a correction: it keeps the same
step, appends a second `statusHistory` line and prefixes the notification
with `[แก้ไขข้อมูล]` rather than pretending it is new news.
Two deliberate constraints. First, these milestones never touch
`order.status` — the approval/assignment/verify path
(`ASSIGNED` → `IN_PROGRESS` → `PENDING_VERIFY` → `DONE`) is unchanged and
these run alongside it, so nothing in the Apps Script mirror's status
dropdown needs updating for this. Second, `opinionProgress` is stamped with
the `opinion` it was recorded under and read through `opinionProgressOf()`,
which returns `{}` when that no longer matches `maintRecord.inspectorOpinion`
— if `maint` switches แนวทาง later, `saveMaintRecord()` clears the progress
and logs the switch to the timeline instead of showing "สั่งของแล้ว" against
a plan that no longer involves buying anything. Orders written before this
change have no `opinionProgress` key at all and read as "nothing recorded".
Who may press the buttons: `maint` (so `admin` too, via `hasRole`) and a
technician assigned to that order (`canUpdateOpinionProgress()`). Everyone
else sees the same box read-only. `canEditMaintParts()` (the parts table,
above) draws the same line for the same reason — keep the two together if
either ever changes.
Waiting on parts vs. actually being repaired — these milestones deliberately
do NOT gate the technician's "▶ เริ่มดำเนินการซ่อม" / "✓ ซ่อมเสร็จสิ้น"
buttons, because both real-world cases happen: a technician starts on what
they have while the ordered parts are still in transit, and a technician who
genuinely cannot start until the parts land. Blocking the button would break
the first case, and it is the wrong lever anyway — the person who records the
milestone (`maint`) is often not the person holding the spanner, so a
forgotten milestone would stop real work. What the system owes is telling the
two cases apart, which it previously could not: an order sitting at
"กำลังซ่อม" looked identical whether the job was moving or stalled waiting on
a delivery.
So each step carries a `pendingLabel` — what the order is waiting for while
that step is unrecorded (`self_repair` has none; nothing external is
pending). `opinionPendingStep()` returns the first unrecorded step and
`opinionWaitingLabel()` turns it into an amber "⏳ รออุปกรณ์มาส่ง" /
"⏳ รอของกลับจากที่ส่งซ่อม" pill, shown next to the status on the detail head,
inside the technician's own action box (with a line stating outright that the
button is not locked), and on the list card, where it takes priority over the
blue latest-milestone pill (`latestOpinionStep()`) — what a job is stuck on
matters more than what it has finished. It is scoped to `ASSIGNED` and
`IN_PROGRESS` only: an order already out for verification or closed should
not nag about parts.
When the last milestone of a plan is recorded, `notifyOpinionStep()` appends
the next move, worded from the order's own status — `ASSIGNED` gets
"✅ พร้อมเริ่มดำเนินการซ่อมแล้ว" (and the technician alone is told to open the
order and press ▶), `IN_PROGRESS` gets "✅ ของครบแล้ว ช่างดำเนินการซ่อมต่อได้เลย".
Corrections to an already-recorded milestone skip the hint entirely rather
than re-announcing that the parts arrived.
Finishing a repair no longer closes the order directly. `tech`
pressing "ซ่อมเสร็จสิ้น" now moves the order to a new status
`PENDING_VERIFY` ("รอผู้แจ้งตรวจสอบผลการซ่อม") instead of `DONE`. The
`requester` then sees a "ตรวจสอบผลการซ่อม" action box with two choices:
ผ่าน (moves to `DONE`, final) or ไม่ผ่าน (requires a reason —
"ระบุสาเหตุที่ต้องซ่อมเพิ่มเติม" — moves the order back to `ASSIGNED` so
the same technician(s) can re-open it via the normal start/finish flow).
Each fail round is recorded in `order.verificationHistory[]` and the
latest attempt in `order.verification` (`verifyRepair()` in
`index.html`); `maintRecord` stays editable across repeat rounds.
This adds a new order status (`PENDING_VERIFY`) to the set the Apps
Script "คำร้องแจ้งซ่อม" mirror code (not in this repo) writes to the
ใบแจ้งซ่อม sheet tab's status data-validation dropdown + conditional
formatting — that dropdown/color list needs to be updated by hand to
include it, the same way the `technicians` field needed a manual mirror
update.
"ต้องการด่วน" — the ใบคำร้อง/ใบแจ้งซ่อม form has a checkbox under
"5. วันที่ต้องการใช้งาน", saved as the boolean `order.urgent`. It shows as a
red "🚨 ด่วน" pill on the order list card and "🚨 ต้องการด่วน" on the detail
page (`.urgent-pill`/`.check-row` in the stylesheet), is appended to the
order's first timeline entry, and prefixes the ผจก.โรงงาน notification with
`🚨 [ด่วน]` so an urgent job is visible in LINE before anyone opens the app.
Orders created before this change have no `urgent` field at all — every read
goes through `!!o.urgent`, so they render as normal (non-urgent) orders and
need no migration. The Apps Script "คำร้องแจ้งซ่อม" mirror (not in this repo)
does not write this field to the ใบแจ้งซ่อม sheet tab; add a column by hand
there if the urgency needs to be visible in the Sheet as well.
`admin` can edit "วันที่ต้องการใช้งาน" and the ต้องการด่วน flag in place on
the order detail page — a ✎ แก้ไข button next to the date opens a small
inline editor (`openEditNeededDate()`/`cancelEditNeededDate()`/
`saveNeededDate()` in `index.html`, backed by
`state.ui.editNeededFor`/`.editNeededDate`/`.editNeededUrgent`). Before this
the only way to fix a mistyped date was to reject the order and file a new
one, which burned another document number and threw away the approvals
already collected. Notes:
the gate is `state.role === 'admin'`, not `hasRole('admin')`, and it is
deliberately re-evaluated on every render — while an admin is viewing the app
"in the role of" someone else (the role switcher), `state.role` is that other
role and the edit button is correctly hidden;
`saveNeededDate()` appends the change to `order.statusHistory` with the
order's *current* status, so the edit is auditable in ลำดับเหตุการณ์ without
moving the order anywhere in the workflow, and it pings the requester through
`notifyOrderRequester()`;
if `persistOrders()` fails (the Sheet is unreachable) the old date, the old
flag and the timeline entry are all rolled back in memory and the editor stays
open. Do not "optimise" that away — leaving the new value on screen after a
failed write is exactly the "ส่งเรียบร้อยแต่ข้อมูลไม่เข้าชีต" trap that
`submitOrder()` already guards against.
Diagnosing "the code is in the sheet but I still can't get in" — the guest
screen's admin box has a `runConnectionTest()` button that probes
`doGet('userRoles', <this device id>)` and `doGet('accessRequests')` and
prints both raw responses plus a verdict. The three outcomes map to three
different layers, which is the whole point of probing two endpoints rather
than one:
both fail → the Web App is unreachable (usually "Who has access" is not
"Anyone" after a fresh deploy, or `API_URL` points at a stale `/exec`);
`accessRequests` answers but `userRoles` returns `{"value":null}` for an id
that *is* in the sheet → the script's `userRoles` branch or
`readUserRoles_()` is missing, so the request falls through to the generic
KV lookup and finds no `userRoles` row. Re-paste the entire Apps Script
file and redeploy as a new version — this is exactly the partial-paste
failure the Architecture section warns about;
`userRoles` returns roles → the server is fine and the problem is
client-side.
Note the `บันทึกข้อผิดพลาด` tab and the KV rows are migrated historical
data — timestamps there predating the migration prove nothing about
whether the current deployment works. Check the live endpoint, not the tab.
