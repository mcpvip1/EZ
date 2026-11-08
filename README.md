# EASY 2D — Faithful Web + Mobile Rebuild (core loop)

Rebuild of the old VB.NET WinForms lottery app **EASY v5.0 / v5.5.1** (Easy.exe,
built 2020-04-26, namespace `_Simple`, Access `simple.mdb`) as a modern
Web + Mobile app. **Separate app from DO2-Hti** — own lane, own data, own
rules. Nothing here was pushed to GitHub.

Source of truth: [ANALYSIS.md](sandbox://workspace/2d-rebuild/ANALYSIS.md)
(full decompile: 76 files / 44,877 lines via ILSpy 8.2) and the decompiled
code in `decompiled/` (authoritative for the code language:
`decompiled/_Simple/ModTran.cs`).

## What was built (core loop first)

| Piece | Location | Status |
|---|---|---|
| Shared core (expansion + settlement + board + clipboard) | `shared/` | ✅ 34/34 tests pass |
| Web app (React + Vite + TS + Tailwind, PWA, IndexedDB) | `web/` | ✅ `npm run build` passes |
| Mobile app (Expo SDK 58 + Expo Router, AsyncStorage) | `mobile/` | ✅ `expo export --platform android` passes, `expo-doctor` 20/20 |
| Sync server (zero-dep Node, WiFi pairing + push/pull) | `server/` | ✅ 32/32 tests pass, port 5199 |
| Real seed data (fighters, owners, templates, groups) | `seed/seed.json` | ✅ extracted from `simple.mdb` |

Core loop, in order, in both web and mobile: enter **Bet (Fighter) /
Carry (Owner)** with the shorthand code language → live **00–99 board**
(bets minus carry, yellow over limit) → **over-limit list** with a/b reverse
merging → **pass excess up to Carry** (all / one / rounded to tens) →
**Save** → enter **LuckyNo** (reverse stored, only the exact number pays) →
**settlement reports** (Current / Daily / Weekly Sun–Sat / Range / Selected
per-Fighter / per-Owner).

## Main screen layout (matches the original EASY main screen)

The web app no longer has a tab bar. Navigation is via the original menu
bar, like the Windows app:

- **Title bar:** `EASY v.5.5.1 - D-M AM/PM` from the working BetDay/session.
- **Menu bar:** Setup | Report | System | AUTO | OK Thanks | Close |
  Template | T =. Setup: Lucky No (Ctrl+L), Fighter (Ctrl+F), Owner
  (Ctrl+O), Delete (Ctrl+D), Change Date (Ctrl+T), Unit Sales, Close Days.
  Report: Current (F9), Daily (F10), Weekly (F11), Range (F12), Range AMPM,
  Selected (F4), Selected (View Only) (Ctrl+F4), Up to Date. System: About
  Me (pattern cheat-sheet), Highlight Color (over-limit cell colour).
  AUTO / Template open Templates & Groups; OK Thanks copies "OK Thanks";
  T = copies "T="; Close returns to the board.
- **Board on top, full width:** 10 columns (00, 10, 20, … 90 across; rows
  01, 11, … down to 09, 19, … 99), each cell = number + net amount, yellow
  when over the limit, plus a **cyan totals row** at the bottom (one total
  per column).
- **Below the board, three columns + status panel:** Fighter entry grid
  (left) with Fighter dropdown, Order, "…" (opens Selected report for that
  fighter); over-limit grid + red ticking clock + Luck checkbox + pass-up
  buttons `>` `<` `>>` `<<` `>>>` + Old No (with amount) + Unit Sales
  (middle); Carry entry grid (right) with Carry checkbox + yellow total +
  Clear above it and Ft/No/Tk row (copy Fighter entry into Carry); status
  panel (Limit editable, Times, Sales, Carry, Net Sales, 16.00 %,
  Gross Profit, Rate, Net P/L) and the AUTO letter map (A=1 … J=0, current
  session letter ringed red) beside it.
- **Bottom bar:** Sales (F3) total + CL, Refr checkbox + saved-count box,
  All, Sort, Carry (F6) total + CL. Refr off = board/dashboard show saved
  data only (unsaved entry rows hidden).
- **Keyboard:** F3 focus Fighter, F6 focus Carry, F9–F12 / F4 reports,
  Ctrl+L/F/O/D/T as in the menus, Esc closes dialogs.
- **People dropdowns** list fighters/owners in the original MDB table
  order (Fighter 1, 8, 9, 10, 11, 12, 00, 000, …) and default to
  Fighter 1 / Owner 1 — IndexedDB key order would have defaulted to
  the odd "00" fighter instead.
- **Phone:** board stays on top (scrolls horizontally if needed) and the
  three columns stack vertically with big touch targets.

## Space / subpath load fix (2026-11-08)

The production build used absolute paths (`/assets/…`, `/manifest.webmanifest`,
`/icon.svg`), which 404 when the app is hosted under a subpath (e.g. a
Space) and left a blank page. Fixed with Vite `base: './'` in
`web/vite.config.ts`, relative manifest/icon hrefs in `web/index.html`,
`start_url: "./"` in `web/public/manifest.webmanifest`, and a scope-relative
service worker in `web/public/sw.js` (registration is relative `sw.js` and
fails silently if the frame blocks it). Verified: `dist/index.html` now
references `./assets/…`, `manifest.webmanifest`, `icon.svg` — no leading
slash anywhere — and the production build loads and renders in a headless
Chromium probe with no console errors (see TEST-GUIDE.md §10).

## What matches the original, exactly

- **Business:** Myanmar 2D, one operator, session = BetDay + AM/PM.
  Fighters = customers/agents (commission 15%, rate 80); Owners = upstream
  dealers (commission 14%, rate 80); global defaults Limit 40000 /
  Commission 16% / Rate 80.
- **Code language (§5 of ANALYSIS.md):** `//` PAR twins, `**` POW,
  `*/` BRT, `/*` ZOD, `++`/`--`/`+-`/`-+` even/odd sets, `a`/`z`/`q`/`pz`/
  `pn`/`n`, `0+2`…`0+9` skip sets, `+/d` / `-/d`, `d+` / `d/` / `/d` /
  `d*` / single-`d` break sets, `NN+` reverse, `a-b` funcLeftRight,
  `a/b` split amounts, space-separated lists with trailing `+` reverse.
  All sets copied verbatim from `ModTran.cs` — see `shared/README.md` for
  the divergences found between `xInput` and `xCalc` (live `xInput`/`xCalc`
  followed; `xInputOriginal` 0+k lists differ and were not used).
- **Formulas (§7):** Amount = SUM; CommissionAmount = Amount/100×Commission;
  GrossAmount = WinAmt×Rate; NetAmount = Amount − CommissionAmount −
  (GrossAmount if won). WinAmt = SUM on **exact** LuckyNo match only —
  reverse bets pay only because entry creates two separate rows. Bet
  clipboard settlement flips sign (`You = −(…)`); Carry does not.
- **Status dashboard (§7.4):** Limit / Times / Sales / Carry / Net Sales /
  % / Gross Profit / Rate payout / Net P/L (0 if Sales = Carry, red if
  GrossProfit < payout).
- **Clipboard outputs as features:** `T=<total>`, `2DCode=Amount` lines,
  `` `No.(n)-d.M AM/PM ``, `OK Thanks`, Template snippets (tap to copy).
- **Verified against the live day (§9.3, 2024-04-11):** Fighter 12 AM
  55,000 no win → Net **46,750**; PM 51,950, WinAmt 250 → Net **24,157.5**;
  AM draw 62: bets on 62 = 6,450 → payout **516,000**; PM draw 82: bets on
  82 = 5,750 → payout **460,000**; reverse bets (26/28) pay nothing.
  Board maths, PAR (`//` → 10 numbers), and the `0+5` double-count quirk
  (same 10 numbers twice, 20 rows — preserved as-is) all verified.
- **Seed data:** 12 fighters, 6 owners, 66 templates, 59 group packs /
  465 rows, extracted from `simple.mdb` into `seed/seed.json`. No
  transactional bets are seeded by default; the §9.3 numbers are available
  only as a test fixture loader in web/mobile.

## Deliberately changed (not silently)

- **No login in the MVP.** The original went straight to `MDIMain`; its
  Login form was unreachable dead code. Dropped.
- **No CPU-key activation / Register.** Dead code in the original; the
  plaintext password `9797` was **not** carried over.
- **Fighter 3 rate = 80, not 80250.** The MDB value 80250 is a data anomaly
  (all others 80); flagged here, not migrated blindly.
- **Hidden book (BetHidden) is OUT of this core build** — later phase.
- **LuckyNo requires exactly 2 digits.** The original crashed on a
  1-character entry (`Substring(1,1)`); fixed.
- **Bugs from ANALYSIS §11 were fixed, not reproduced** (e.g. AMKno
  wipe-all delete, RangeUpToDate empty Owner half, Limit display skipping
  row 0). Where a quirk *is* the business rule (e.g. `0+5` double-count,
  limit as flag-only not blocking) it was preserved and noted.
- **Money is floating-point** in the shared core (commission is `Single`
  in the original too). Net 46,750 can compute as 46749.99999999992
  internally; UIs round for display. If exact-decimal money matters, that
  is a follow-up.
- **Sync merge rule:** no duplicate id, latest `modifiedOn` wins, **server
  wins on an exact tie** (documented in `server/README.md` — different
  from DO2-Hti, where dai wins on a tie).
- **Save uses the People-tab commission/rate stored at save time** in
  mobile (the original overwrote the master from the entry screen);
  invalid codes show a short hint instead of the original's silent reject.

## Known gaps / still missing

- **Verified in a headless Chromium probe 2026-11-08** (desktop 1280px,
  served under a `/easy-2d-test/` subpath like a Space): **20/20 checks
  pass** — menu bar + board + entry grids render with no console errors
  and no failed requests; `//` at 1000 → PAR 10,000, board twins at
  1,000; Save Bet with the "Are You Sure to Save Bet?" confirm; LuckyNo
  11 → payout 80,000 (Net P/L −71,600); §9.3 fixture Verify passes (AM
  Net 46,750, PM Net 24,157.5, draws 62/82); Reports Current shows
  Fighter 12 AM 55,000 / Net 46,750; phone 390px stacks cleanly. Still
  his-side: a real phone/browser, PWA offline reload, real
  clipboard/share-sheet, print inside a Space frame.
- **Web/mobile do not call the sync server yet.** The server is built and
  tested; wiring push/pull into the apps is the next step (payload shapes
  in `server/README.md`; record ids must be globally unique, e.g.
  device-prefixed or `randomUUID()`).
- **Not built (later phases):** Auto bets, Groups management (view/replay
  only for now), Templates management (copy only), AMKno list, Hidden book,
  full print layouts. **Built 2026-11-08 (main-screen redesign):** Unit
  Sales dialog (per-number sales + distribution), Close Days marker list,
  Delete form (date + up-to/from + scope), Change Date dialog, About Me
  cheat-sheet, Highlight Color picker, Reports "Range AMPM" / "Up to Date"
  / "Selected (View Only)", Old No, Refr toggle, Carry checkbox.
- **Clipboard group number `` `No.(n) `` is always 1** in the shared
  helper (the original read it from the DB); the app layer should
  substitute the real per-person sequence.
- **Group replay uses a UI-entered per-code amount (default 1000)** in
  web, because seed pack rows store amount `"1"` in the MDB.
- **Shared-core vendoring:** web imports the shared source via
  `web/src/shared-vendor/` (byte-identical copies — the relative import
  failed under `tsc -b`); mobile vendors into `mobile/src/shared/` with
  only the `.js` import suffixes stripped (Metro requirement). If
  `shared/` changes, re-copy into both places and re-run their builds.
- `node_modules/` and `dist/` folders are local build artefacts (mobile is
  ~424 MB, web ~79 MB, shared ~26 MB with dependencies); the deliverable
  is the source, not those folders.

## Thorough audit — original vs rebuild (2026-11-08)

**Audit first, fixes after review.** Two read-only audits: (1) logic & flow
— every original behaviour in `ANALYSIS.md` (§§4–7, 11) and the decompiled
forms checked against `shared/` + `web/src/` with file/line citations;
(2) UI/UX flow — the original screenshots (`Main.png`, `Report.png`,
`Setup.png`) compared against the rebuild probed live (actual hosted
Space files, desktop 1280px + tablet 820px touch, normal and
IndexedDB-blocked profiles). No code was changed for the audit; a
half-started fix was reverted so the tree is at the last verified build
(`npm run build` passes, shared 34/34). Note: the earlier 20/20 desktop
probe passed mouse-driven checks only — it never drove the keyboard loop
or the Space's confirm shim, which is why the failures below were not
caught then.

### Ranked by daily-use impact (top 10)

1. **Keyboard entry loop broken.** F3/F6/F9–F12/F4 do nothing while focus
   is in any input (`App.tsx` returns early for INPUT/TEXTAREA/SELECT);
   after an Enter-add, focus stays in the Amount box and never returns to
   the code box; Enter in the code box with an empty amount silently does
   nothing (original moves focus to the amount box); original ↑ submits,
   ↓ appends `+` and submits, F3/`.` saves, F2 opens the group loader,
   Del deletes a grid row, F2 opens the inline row editor — none of it
   is implemented. This is the root cause of "can't enter numbers".
2. **No browse / edit / delete of saved bets.** The original `Bet`/`Carry`
   forms (per-person totals, grouped codes with pink subtotals, red edited
   rows, edit popup, Del, click-to-copy, re-price, `You=` settlement) have
   no equivalent — a mistyped saved bet can only be fixed by bulk Delete.
   The per-person `You=(+)…`/`You=(−)…` settlement exists in the shared
   core (`settlePersonClipboard`) but has no UI anywhere.
3. **Save confirm costs 2 clicks and Esc/backdrop can't dismiss it.**
   `window.confirm` is suppressed in the Space frame; the wrapper shim
   shows an in-page dialog on the 1st click (nothing saved) and only the
   OK tap re-runs the save. Same for Save Carry; Delete is a double
   confirm and its dialog stays open after deleting.
4. **Lucky No / Fighter / Owner / Reports / AUTO / Template are full
   pages, not popups.** The board disappears mid-task; Esc does not
   return; Fighter and Owner land on the identical People page with no
   indication of which was chosen; "« Back to Board" is below the fold
   on tablet. Original opens all of these as forms over the main screen.
5. **Dashboard mixes unsaved money by default (Refr ON); Refr OFF hides
   the live board too.** Original `xProfit` reads the DB only and Refr is
   a manual reload, not a visibility toggle.
6. **Clipboard `` `No.(n) `` is always 1.** Original counts distinct
   groups per person/day/session + 1 (`MDIMain.cs:7009–7101`); every
   pasted chat summary after the first save of a session is wrong. The
   stamp date also uses the working BetDay instead of today.
7. **No Auto bets.** The AUTO menu misroutes to the Groups page; no
   create / materialise / manage, no Saturday + CloseDays rules, no
   `PasteF`.
8. **BTbuy top-up and OverTopCrop missing.** Two of the three bulk
   limit operations are gone; only pass-up (All / One / Tens) survives.
9. **Up to Date is the wrong report.** Rebuild: Sunday start, all
   fighters and owners. Original `RangeUpToDate`: Monday start, one
   fighter (default 1).
10. **Unit Sales is view-only.** No Save (customer `'X'` bets) and no
    Copy `Amt->No` lines.

### (a) Logic / flow gaps — deviations (rebuild does it differently)

- **D1** clipboard `No.(n)` always 1 (see #6 above). **D2** dashboard
  includes unsaved rows by default (see #5). **D3** save does not reset
  person / commission / rate to 0 and does not refocus the Fighter box;
  a cancelled save no longer overwrites master rates (original updated
  the master *before* the confirm). **D4** Back (`<` / `<<`) only removes
  passed-up rows; original moves *all* carry rows back. **D5** Up to Date
  wrong report (see #9). **D6** Range AMPM defaults to one day, not
  week-to-date (Mon → today). **D7** reports collapse to one row per
  person — per-session rows and BetDateTime are gone. **D8** default
  session is AM at noon (original: PM; `getHours() < 13`). **D9** group
  replay ignores stored per-row amounts, uses one UI amount (default
  1000) for every code, and appends instead of clearing the grid.
  **D10** Carry checkbox disables the panel; original just flips a
  Ft/Cr label. **D11** Luck checkbox navigates to the Lucky page;
  original checkbox has no handler. **D12** limit input always visible
  and persists on every keystroke with no confirm (original: hidden box,
  confirm into `Calc`). **D13** global Calc commission/rate (16%/80)
  cannot be edited anywhere in the web UI. **D14** single digit `d` and
  `NN@` accepted (original rejects / cannot type them). **D15**
  exclusion display lacks the original's `(-)` formatting (cosmetic).
  **D16** F3 focuses the code box; original focuses the Fighter dropdown.
  **D17** highlight default `#fde047` vs live table cyan (user-fixable
  via the picker). **D18 (closed during the audit):** Carry save parity
  verified line-by-line (`cmdSaveO_Click`, `MDIMain.cs:7654–7863`) —
  parallel to Bet save in every user-visible respect, same D1/D3
  deviations on both sides.

### (a) Logic / flow gaps — missing (no rebuild equivalent)

- **M1** browse/edit/delete of saved bets (see #2). **M2** Auto bets
  (see #7). **M3** keyboard entry flow (see #1). **M4** BTbuy "buy up
  to the limit" bulk top-up. **M5** OverTopCrop cap. **M6** Unit Sales
  save/copy (see #10). **M7** separate Limit form (ordered a/b, then R,
  then plain, with subtotals + grand total + `txtTotalL`). **M8**
  `btnAll` / `btnAll_UMN` rebuild-the-limit-list buttons. **M9**
  Templates: copy-only, no add/edit/delete. **M10** Groups:
  view/replay-only, no add/edit/delete. **M11** LuckyNo: no edit/delete
  of a saved draw; draws only for the working day/session. **M12** AMKno
  second draw list (live table empty). **M13** print layouts: carry
  slip, full 00–99 ledger, per-person code detail (only
  `window.print()` of the Reports page exists). **M14** week grid strip.
  **M15** Delete scopes Close Days + Auto (Close Days live in
  `localStorage`, outside Backup export). **M16** Selected (View Only)
  is a banner on the same tab, not the all-time per-person view with
  click-to-detail and `All Total=` clipboard. **M17** sync server built
  but not wired (no impact under the current standalone local-first
  direction).

### (b) UI/UX flow gaps (probed live)

- **Layout vs screenshots:** Ft/No/Tk row sits *below* the Owner
  dropdown (original: above it); Com % / Rate inputs, the "Codes:…"
  hint line and the Add button are new rows inside both entry panels;
  the middle-column yellow-box strip above the over-limit grid is
  missing and the red clock sits below the list instead; the menu bar
  gains a date label + date picker + AM/PM toggle (duplicating Setup →
  Change Date); Save Bet / Save Carry buttons are new on the main screen
  (original saves by key); the "Last save — copied to clipboard" panel
  sits below the fold after a save.
- **Flow:** Setup/Report items listed in #4 above; Range and Range AMPM
  are functionally identical (same Range tab, same one-day defaults);
  Selected vs Selected (View Only) differ only by an amber banner;
  Esc does not close menu dropdowns; after a save, Com % / Rate stay
  15 / 80 on screen (see D3).
- **Touch/keyboard:** tablet taps work (menu, entry, Add, Save); but at
  820×1180 the columns stack to one and Save Carry sits at Y≈1529 in an
  1180 viewport (document 2054) — Carry + status are below the fold on
  every session. The Luck checkbox navigates away instead of toggling
  (one misclick mid-entry loses the board). One unreproduced console
  error: a single service-worker script 404 on the first desktop run
  (runs 2–4 clean). Phone 390px is out of scope (user will not use the
  phone): noted only that a probe tap on the Fighter Add button was
  intercepted by the amount input / hint paragraph there.

### (c) The three reported failures — root causes

1. **"Can't enter numbers"** — the keyboard loop (#1): Enter in the code
   box with an empty amount does nothing silently; after an Enter-add,
   focus is stranded in Amount; F3/F6/F9–F12 are dead while typing, so
   the operator cannot get back to the code box by keyboard; original
   ↑/↓/`.`/F2 keys are missing. Typing itself works (probe typed into
   both boxes); the loop around typing is what fails.
2. **"Carry to the dai/owner doesn't work"** — no Carry-specific logic
   fault found: `cmdSaveO` parity is verified (D18) and the Carry
   entry/save path mirrors Bet. Likely contributors: the same broken
   keyboard loop (F6 dead while typing, focus stranding) applies to the
   Carry panel; the 2-click shim confirm (first click saves nothing);
   Carry + status below the fold on tablet; the Carry checkbox disabling
   the whole panel when unchecked (original only flipped a label).
3. **"Setup items should be popups"** — confirmed: Lucky No, Fighter and
   Owner navigate to separate pages (only Delete / Change Date /
   Unit Sales / Close Days / About / Highlight are true popups), Esc
   does not return, and Fighter vs Owner land identically.

### What matched (verified)

Code language verbatim from `ModTran.cs` (all named patterns, `0+5`
double-count, list-mode row-total quirk); board = bets − carry with
a/b + `R` over-limit merging; pass-up All/One/Tens; settlement §7.1
and dashboard §7.4 (incl. Sales = Carry zeroing); clipboard texts
except `n`; reports Current/Daily/Weekly/Range/Range AMPM with the §7.1
formula; §9.3 fixture numbers; seed counts (12 fighters, 6 owners, 66
templates, 59 groups / 465 rows); login/activation correctly absent;
Close Days as a marker list only; deliberate fixes (2-digit LuckyNo,
RangeUpToDate Owner half, `gValuePlus` `/` branch).

## Top-10 fix batch — all 10 audit items fixed (2026-11-08)

The user chose "fix everything". All 10 ranked audit gaps were fixed
in `web/` (+ `shared/` where the fix belonged) by three parallel
workers plus an integration pass, then verified with a Playwright probe
(desktop 1280px keyboard-driven + tablet 820px touch, normal and
IndexedDB-blocked profiles, zero console errors). `npm run build`
passes; shared tests 37/37 (was 34; +3 for `nextGroupNo`,
`btbuyTopUp`, `overTopCrop`); §9.3 fixture Verify still passes.

1. **Keyboard entry loop** — F3/F6/F9–F12/F4 and Ctrl+L/F/O/D/T work
   while typing; Enter in an empty-amount code box moves focus to the
   amount box; Enter-add returns focus to the code box; ↑ submits, ↓
   appends `+` and submits, F3/`.` saves, F2 opens the group loader /
   inline row editor, Del deletes a grid row. F3 focuses the Fighter
   dropdown (D16), F6 the Owner dropdown. Both panels.
2. **Browse / edit / delete of saved bets** — new
   `web/src/pages/Browse.tsx` (Report → Browse Bets popup): per-person
   totals, grouped codes with pink subtotals, red edited rows, edit
   popup (re-expands, `edited`), Del (row / Del-all per person),
   click-to-copy, re-price, and the `You=(+)…` / `You=(−)…` settlement
   via `settlePersonClipboard`.
3. **Save confirm** — real in-app `ConfirmDialog` everywhere:
   `window.confirm` is gone from the app (it is suppressed in the Space
   frame and used to cost 2 clicks). One click opens it, OK saves,
   Esc/backdrop dismisses. Delete is a single confirm that closes after
   deleting. (Follow-up fix: the first probe round caught
   `window.confirm` still used by Browse Delete and Auto Save/Delete/Edit
   — all replaced and re-verified, zero native dialogs.)
4. **Popups, not pages** — Lucky No, Fighter, Owner, Reports, AUTO,
   Template, Browse Bets and Backup open as popups over the
   always-mounted board; Esc returns to the board. The People popup
   shows only the side that was chosen (Fighter vs Owner titles differ).
5. **Dashboard saved-only** — unsaved rows never enter Sales/Carry/
   Net P/L; Refr is a manual reload button (no longer a visibility
   toggle); the board is always visible.
6. **Clipboard `No.(n)`** — `nextGroupNo()` counts distinct saved
   groups per person/day/session + 1 (`MDIMain.cs:7009–7101`); the stamp
   date is today, not the working BetDay. (Fighter "1" still gets just
   `T=` — the original's quirk, not a bug.)
7. **Auto bets** — new `web/src/pages/Auto.tsx` + `web/src/lib/auto.ts`:
   create (A3-style codes, Code→No→Amt Enter chain), materialise
   (Saturday breaks the loop, Close Days shift/skip), manage (pink
   subtotals, Hide Previous Days, Edit ±%, Delete future-only),
   `PasteF` (MessagePaste port + manual-paste fallback). Rules live in
   localStorage (`easy2d.auto.v1`); materialising a specific fighter's
   rules switches the Fighter entry to that fighter.
8. **BTbuy / OverTopCrop** — `btbuyTopUp` / `overTopCrop` in
   `shared/src/board.ts`: BTbuy tops every below-limit number up to the
   limit into the Fighter entry; Crop moves every over-limit excess into
   the Carry entry. Buttons sit beside `>>>`.
9. **Up to Date** — Monday start → today, one fighter only (default 1),
   no Owner table; Range / Range AMPM default to week-to-date Mon → today
   (D6); reports show per-session rows with a BetDateTime column (D7).
10. **Unit Sales** — Save writes customer `'X'` bets; Copy produces
    `Amt->No` lines.

Linked deviations fixed in the same batch: D3 (save resets
person/com/rate to 0, refocuses the Fighter/Owner dropdown, master
rates updated before the confirm), D8 (default session PM when hour ≥
13), D9 (group replay uses stored per-row amounts, clears the grid
first), D10 (Carry checkbox flips the Ft/Cr label only), D11 (Luck
checkbox has no handler, navigates nowhere), D12/D13 (Limit/Calc
popup: limit + commission % + rate, confirmed once into Calc),
D14 (single digit `d` and `NN@` rejected), D15 (see note below),
D17 (highlight default cyan `#67e8f9`, still user-changeable).

**D15 note — `1-2` is correct as-is.** `formatDisplayCode` is a
verbatim port of `MDIMain.cs:6898–6907`: a `-` in the first two
characters is preserved by the original, so `1-2` stays `1-2` and `1/`
stays `1 F-`; the `(-)` replacement fires for dashes later in the
string (`1/-2` → `1/ (-) 2`, verified live). A probe once flagged
`1-2` as wrong; it is not — and `12-34` is not a valid code at all
(`expandCode` rejects it), so it can never reach the grid.

**Verification:** probe scripts `/tmp/probeA.mjs`–`/tmp/probeG.mjs`
(worker 4: all 10 items + D3/D8/D10/D11/D12/D13/D14/D17 PASS,
§9.3 OK, 37/37, zero console errors) + `/tmp/probe-fix2.mjs`
(integration re-check, 13/13: D15 cases, Browse row/Del-all in-app
confirms, Auto save in-app confirm, zero native dialogs, zero console
errors). Screenshots `/tmp/probe-*.png`.

**Probe-infra lesson:** always verify the served bundle hash — a stale
copy of `dist` under the probe server's subpath once served the pre-fix
bundle while `dist/index.html` pointed at the new one (the JS filename
in the server log / the probe's request log is the check).

**Next phase (NOT done — M-items):** M7 Limit form, M8
btnAll/btnAll_UMN rebuild-limit buttons, M9/M10 Templates/Groups
add/edit/delete, M11 LuckyNo edit/delete, M12 AMKno, M13 print layouts,
M14 week grid strip, M15 Delete scopes Close Days + Auto, M16 Selected
(View Only) all-time view. Known small notes: `mobile/src/store.tsx`
now passes the 6th `groupNo` arg to the clipboard calls; Auto's
`deriveStartEnd` uses the working BetDay as the reference week
(original used the system date); `App.tsx`'s `autoLetterFor` maps
Sunday→A while `AutoCode` maps A→Monday (pre-existing).

## UI/UX upgrade — review + Myanmar default (2026-11-08)

### Review findings (all screens/flows read before changing anything)
F1 No shared button/dialog/input system: ~6 ad-hoc button styles
(indigo/amber/teal/slate-800/slate-200/red, mixed `rounded`/`rounded-lg`,
`px-3 py-1.5` vs `px-4 py-2` vs `px-4 py-3`), three dialog shells
(`Modal` in Dialogs.tsx; custom fixed overlays in Browse edit/re-price;
UnitSalesDialog's own overlay with no Esc handling), and inconsistent
section padding/radius (`rounded` vs `rounded-2xl`, `p-2` vs `p-4`).
F2 Auto popup has two close buttons: its own header ✕ plus PopupDialog's ✕.
F3 Toasts: one plain string, no success/error distinction, overwritten by
the next toast, fixed 3.5 s.
F4 "Last save — copied to clipboard" panel sits below the fold (after the
bottom bar) on tablet.
F5 Middle-column pass buttons (`>`, `<`, `>>`, `<<`, `>>>`) are glyph-only
with hover tooltips — invisible on touch; BTbuy/Crop are unexplained jargon.
F6 "…" and "Order" buttons are cryptic; Order gives no visible sort state.
F7 Status panel: Net P/L looks like any other row — the number the operator
watches most does not stand out.
F8 Entry hint line is 11 px dense text; validation error ("Invalid code or
amount") does not say what a valid code looks like.
F9 Delete dialog's "From this date (off = Up To this date)" checkbox is a
confusing double negative.
F10 People inline edits save on every keystroke with no feedback.
F11 MenuBar duplicates date controls (date picker + AM/PM toggle) already in
Change Date, and carries a dead disabled "Register" item (original dead code).
F12 Focus ring invisible on most controls — keyboard operators cannot see
where focus is.
F13 Tablet (~820 px): single-column stack puts the Carry panel + Save Carry
+ status panel far below the fold on every session.
F14 Empty states are inconsistent (good in the over-limit list, missing or
terse elsewhere); Lucky's "Old numbers" amount input has no label.
F15 Button labels mix styles ("Save", "Apply", "OK", "Yes, Save") and the
Close menu action shows a confusing toast on the main screen.

### What changed (UI/UX)
- One visual system in `web/src/index.css`: `.btn` (+ `.btn-primary` /
`.btn-amber` / `.btn-teal` / `.btn-dark` / `.btn-danger` / `.btn-ghost` /
`.btn-outline`, `.btn-sm` for dense rows), `.card` / `.card-pad`,
`.input` / `.input-yellow`; tap targets ≥ 44 px; a visible
`:focus-visible` ring on every control.
- One dialog shell: Browse edit/re-price popups and UnitSalesDialog now use
`Modal` (Esc stack + backdrop close); Auto's duplicate ✕ removed.
- Toasts carry a kind (success / error / info) with distinct colours;
error toasts stay visible longer.
- "Last save" panel moved directly under the board (visible after a save)
as a compact bar with a "Copy again" button.
- Pass buttons keep the original glyphs but add a short label under each
(Pass / Back / All / Tens); BTbuy/Crop keep their names with a one-line
explanation under the group.
- "…" became a labelled "Browse" button; Order shows its active sort state.
- Net P/L row is larger, bold, and tinted (green/red by sign).
- Entry hint split into two readable lines; the invalid-code message names
a valid example.
- Delete dialog uses a segmented "Up to this date / From this date" control.
- People inline edits flash a "Saved" chip.
- Dead "Register" menu item removed; Close on the main screen no longer
shows a toast.
- Tablet: the panels grid is 2 columns at `md`, and the visual order at
`md` pairs the two entry panels first (Bet, Carry) with the
over-limit/clock panel and the status panel below them (CSS `order`
only — DOM/tab order and the desktop 4-column order are unchanged), so
Save Carry sits inside the first viewport (probe: top 946 px in a
1000 px viewport, was 1481 px). Save Carry + status are no longer far
below the fold.
- Tap targets: `.btn` is ≥ 44 px; `.btn-sm` is 36 px on desktop but
grows back to 44 px at ≤ 1023 px (menu bar, Order/Browse, row Edit/Del
on tablet); the AM/PM session toggles are 44×44 px. Probe found 0
buttons under 44 px at 820 px.
- Every keyboard shortcut and the in-app confirms work exactly as in the
Top-10 batch (no regressions — verified by probe).

### Myanmar language (default)
- Real i18n: `web/src/i18n/` — `en.ts` (457 keys, the source of truth),
`my.ts` (same 457 keys, same order, natural Burmese), `index.tsx`
(`LanguageProvider`, `useLang`, `t(key, params)` with `{name}`
interpolation, English fallback for any missing Myanmar string). Default
language is Myanmar on first run; the choice persists in localStorage
(`easy2d.lang`); the System menu has a Language section (မြန်မာ /
English, checkmark on the active one).
- Numerals stay Arabic digits 0-9 everywhere (numbers, amounts, dates,
codes) exactly as the original shows them — no Myanmar digits anywhere.
- App title stays "EASY v.5.5.1".
- Glossary (so the user can correct wording): Fighter = ဖိုက်တာ; Owner /
upstream dealer = ဒိုင် (အထက်); Lucky No = ထွက်ဂဏန်း; Commission =
ကော်မရှင်; Sales = ရောင်းရငွေ; Group = အုပ်စု; Amount = ပမာဏ; number =
နံပါတ်, entry code = ကုဒ်. Buttons use the "ရန်" form (သိမ်းရန်, ဖျက်ရန်,
ကူးယူရန်, ထည့်ရန်); confirm questions use "မည်လား".
- Full-translation pass (2026-11-08, 183 keys changed in `my.ts`): every
remaining English UI string is now Myanmar. Before → after: Bet →
ထိုးငွေ; Carry → ပို့ငွေ; Rate → နှုန်း; Limit → ကန့်သတ်ချက်; Limit
button → ပြင်ရန် (new key `status.limitEdit`, added 2026-11-08 — see
probe findings below); Board →
ဇယား; Cell → အကွက်; session → အချိန်ပိုင်း; Net P/L → အသားတင်
အမြတ်/အရှုံး; Auto → အလိုအလျောက်; Template → ပုံစံ; Unit Sales → ယူနစ်
ရောင်းရငွေ; About Me → ကျွန်ုပ်အကြောင်း; Highlight → မီးမောင်းထိုး;
Backup → အရန်သိမ်းခြင်း; Export → ထုတ်ယူရန်; Import → သွင်းရန်; Paste →
ကူးထည့်ရန်; BTbuy → ဖြည့်ဝယ်; Crop → ဖြတ်တောက်; Old No → အရင် နံပါတ်;
CL → ရှင်း; Refr → ပြန်ဖွင့်; Tens → ဆယ်ဂဏန်း; Cr → ပို့ငွေ; Ft →
ဖိုက်တာ; No (strip) → အတန်း; Tk → စုစုပေါင်း; Calc → တွက်ချက်မှု; OK →
ဟုတ်ကဲ့; browser → ဘရောက်ဆာ; build → ဗားရှင်း; web rebuild → ဝက်ဘ်
ပြန်လည်တည်ဆောက်မှု; customer X → ဝယ်သူ X; unit → ယူနစ်; Edit → ပြင်ရန်;
Del → ဖျက်; Re-price → အုပ်စု ဈေးပြန်သတ်မှတ်ရန်; sno → အမှတ်;
BetDateTime → ထည့်ချိန်; WinNo → ပေါက်ဂဏန်း; WinAmt → ပေါက်ငွေ;
NetAmount → အသားတင်; 2DCode → 2D ကုဒ်; CodeNo → ကုဒ်နံပါတ်; RowTotal →
အတန်း စုစုပေါင်း; Sun–Sat → တနင်္ဂနွေမှ စနေအထိ; Up to Date → ယနေ့အထိ;
cyan → စိမ်းပြာ; chat / SMS → စာတိုပေးပို့ရာတွင် သုံးနိုင်သည်.
- Kept in English on purpose (reasons in the comment at the top of
`web/src/i18n/my.ts`): "T =" and "OK Thanks" (the exact clipboard texts
the original copies — translating them would change the pasted data);
"EASY v.5.5.1" / "EASY 2D" (product title); clipboard formats and code
patterns (T= / P= / You=, `Amt->No`, `No=Amt`, `43+`, `//`, `**`, `A–J`,
`2D` — data, not UI); numerals 0-9 (Arabic digits, never Myanmar
digits); AM / PM (session codes, data values); keyboard key names
(Enter, F2, Del, Ctrl+T, F3, F6 — the labels printed on the keys);
"English" (the other language's own name in the language switcher).

### Wording to confirm with the user (Myanmar)
The translator flagged these as uncertain — please correct any that feel
off (the keys are in `web/src/i18n/my.ts`):
1. `board.overTitle` "# No Over" → "# ကျော်နံပါတ်" (coinage for
over-limit numbers).
2. `board.luck` "Luck" → "ကံ".
3. `board.passSelected` / `backOne` / `backAll` → "ပို့ရန်" / "ပြန်ရန်" /
"အားလုံး ပြန်ရန်" (pass-up / take-back wording).
4. `auto.letterHint` odd/even letters → "မ-စာလုံး = AM၊ စုံ-စာလုံး = PM".
5. Full-translation pass (2026-11-08) — the big two first, then the rest:
   - Bet → "ထိုးငွေ", Carry → "ပို့ငွေ" (alternatives: လောင်းငွေ /
   အထက်ပို့ငွေ).
   - Rate → "နှုန်း" (short for the payout rate; alternative: ပေးချေနှုန်း).
   - Net P/L → "အသားတင် အမြတ်/အရှုံး" (long for the status panel;
   alternative: အသားတင်).
   - Limit → "ကန့်သတ်ချက်"; Limit button → "ပြင်ရန်" (short label so
   the status panel fits at 1280 px); session → "အချိန်ပိုင်း".
   - BTbuy → "ဖြည့်ဝယ်", Crop → "ဖြတ်တောက်" (new coinages).
   - CL → "ရှင်း", Refr → "ပြန်ဖွင့်".
   - Cr / Ft / No / Tk strip → "ပို့ငွေ" / "ဖိုက်တာ" / "အတန်း" /
   "စုစုပေါင်း".
   - Unit Sales → "ယူနစ် ရောင်းရငွေ"; About Me → "ကျွန်ုပ်အကြောင်း";
   Paste → "ကူးထည့်"; Auto → "အလိုအလျောက်" (long for the menu bar);
   Template → "ပုံစံ"; OK → "ဟုတ်ကဲ့".
   - DB column headers → "ထည့်ချိန်" / "ပေါက်ဂဏန်း" / "ပေါက်ငွေ" /
   "အသားတင်" / "2D ကုဒ်" / "ကုဒ်နံပါတ်" / "အတန်း စုစုပေါင်း".
6. Kept in English on purpose — confirm: "T =" and "OK Thanks" stay
English because they are the exact clipboard texts the original copies
(translating them would change what gets pasted); "EASY v.5.5.1" stays
as the product title.
7. `browse.errCantSave` "Can't Save the Code!" → "ကုဒ်ကို သိမ်း၍ မရပါ!"
(this is a verbatim MsgBox string from the original — confirm it should
be translated at all; it is translated now).

### Verification (probe `probe-i18n.mjs`, Playwright, 2026-11-08)
`npx tsc --noEmit` clean; `npm run build` passes (59 modules, ~330 kB
JS); shared tests 37/37; probe **18/18 passed, zero console errors,
zero native dialogs** — desktop 1280 px keyboard-driven + tablet 820 px
+ IndexedDB-blocked profile. Default first run is Myanmar everywhere
(menu, board, entry, status, dialogs, reports, toasts) with no English
leftovers outside the glossary (checked against every Latin token in
`my.ts`); switching to English and back swaps everything and persists
across reload; no horizontal overflow at either size; `//` at 1000 →
PAR 10,000; F3 save shows the Myanmar success toast and clears the
preview; F9 report popup opens, Esc closes; §9.3 fixture Verify passes
(both lines "မှန်သည် ✓", draws 62/82) after loading the fixture from
Backup; IndexedDB-blocked renders with the Myanmar fallback notice and
entry still works in-memory. Screenshots in `screenshots/`:
`desktop-main-my.png`, `popup-my.png`, `reports-my.png`,
`tablet-main-my.png`, `desktop-main-en.png`, `idb-blocked-my.png`.
Note: after F3 saves a bet, the Fighter person dropdown shows the
"— pick —" placeholder until reload (the saved selection returns on
reload) — pre-existing save-flow behaviour, not changed in this batch.

### Full-translation verification (probe `probe-i18n-full.mjs`,
Playwright, 2026-11-08, `probe-tools/`)
Independent probe with a **strict whitelist** (Latin tokens from
`my.ts` values + only AM/PM, F-keys/Ctrl+letter, `EASY v.5.5.1`,
`OK Thanks`, `T =`, code patterns, `2D`): every screen and dialog
dumped to `/tmp/i18n-dump/` (32 files). Desktop main, Setup/Report/
System menus, Lucky No, Fighter, Owner, Reports **all tabs** (Current,
Daily, Weekly, Range, Up to Date, Selected) + Range AMPM + Selected
view-only, Browse Bets, Backup, Delete, Change Date, Unit Sales, Close
Days, Limit/Calc, About, Highlight, Save Bet/Carry confirms — **no
disallowed English anywhere in UI chrome**. Tablet 820 px: no
horizontal overflow, 0 buttons overflowing; Ft/No/Tk strip fully
Myanmar in both carry states. §9.3 fixture Verify passes (both lines
"မှန်သည် ✓", draws 62/82); `//` at 1000 → PAR 10,000; Bet/Carry saves
show Myanmar toasts; zero console errors, zero native dialogs;
language switch to English and back persists across reload. New
screenshots: `desktop-main-full-my.png`, `popup-full-my.png`,
`reports-full-my.png`, `tablet-main-full-my.png` (+ extras
`popup-lucky/owner/auto/groups/backup/unitsales/about-my.png`).
- **Finding 1 — desktop 1280 px horizontal overflow (fixed):** the
longer Myanmar labels made the status-panel table 268 px wide inside
its 210 px grid column, so `scrollWidth` was 1331 and the Net P/L
value column was cut off. Fixed by widening the status column to
250 px (`Board.tsx` grid), giving the Limit button its own short label
`status.limitEdit` → "ပြင်ရန်" / "Edit" (`whitespace-nowrap`), and
re-verified: `scrollWidth` = 1280, 0 overflowing elements, 0 console
errors. The Net P/L label wraps to two lines inside the panel — that
is wrapping, not truncation.
- **Finding 2 — AUTO popup footnote showed a storage key (fixed):**
`auto.footer` ended with "သော့ easy2d.auto.v1 အောက်တွင် သိမ်းထားသည်"
— a localStorage key name in user-facing text. Removed the sentence
from both locales (the `{key}` param passed by `Auto.tsx` is now
unused but harmless); re-verified the footer no longer shows it.
- **Finding 3 — English in seeded template data (NOT fixed, needs a
decision):** the Template/Groups popup chrome is fully Myanmar, but
the seeded message-template list copied from the original app contains
English text, e.g. template #19 `"Q" ( ) OK ???`, #27 `NEW OK`, #33
`= OK`, plus `No Break ...`, `*Final*`, `*Q* Chart No`, `Hi`,
`Total =`, `KQ BUY`, `CANCEL`, `Please Copy`, `Please Wait`,
`Computer Teacher 4.11.18`, `http://www.settrade.com/settrade/#/home`.
This is **data** (the operator's own message texts from the original),
not UI labels — translating it would change what the operator sends to
customers. Left as-is; ask the user whether template content is in
scope before touching it.

## How to run

```bash
# Shared core + tests
cd shared && npm install && npm test        # 34/34

# Web (dev on :5174, or preview the production build)
cd web && npm install && npm run build && npm run dev

# Mobile (Expo Go / dev build; needs Node + Expo CLI)
cd mobile && npm install && npx expo start
npx expo export --platform android          # verified bundle
npx expo-doctor                              # 20/20

# Sync server (same WiFi; prints LAN URL + pairing code)
cd server && npm start                       # port 5199 (env PORT)
npm test                                     # 32/32
```

## Layout

```
2d-rebuild/
  ANALYSIS.md            # full decompile report (read this first)
  README.md              # this file
  decompiled/            # ILSpy output (76 files, read-only reference)
  original/Easy2/        # original zip contents (do not modify)
  seed/seed.json         # real seed data extracted from simple.mdb
  shared/                # expansion + settlement + board + clipboard + tests
  web/                   # React + Vite + TS + Tailwind PWA (IndexedDB)
  mobile/                # Expo SDK 58 + Expo Router (AsyncStorage)
  server/                # zero-dep Node sync hub (pairing, push/pull)
```
