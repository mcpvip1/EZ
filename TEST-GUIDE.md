# EASY 2D — Test guide (core loop)

Test the rebuilt core on your own phone / computer. No login. No server
needed for this test — web and mobile each keep their own local data
for now (sync is not wired yet).

## 1. Web on your computer (fastest test)

On your Mac, in a terminal:

```sh
cd 2d-rebuild/web
npm install
npm run dev
```

Open http://localhost:5174 in the browser.
Or test the production build instead: `npm run build && npm run preview`.

The main screen now looks like the old Windows app: title bar
`EASY v.5.5.1 - D-M AM/PM`, menu bar (Setup | Report | System | AUTO |
OK Thanks | Close | Template | T =), the 00–99 board on top with a cyan
totals row, then Fighter entry (left), over-limit list + red clock +
pass-up buttons (middle), Carry entry (right) and the status panel.
**The app now opens in Myanmar by default** — the menu reads
ဆက်တင် | အစီရင်ခံစာ | စနစ် | AUTO | OK Thanks | ပိတ်ရန် | Template |
T = (see §7 to switch to English). Numbers stay Arabic digits 0-9.
**There is no tab bar any more** — everything is reached from the menu
bar, exactly like the original. Keyboard: F3 Fighter, F6 Carry, F9
Current, F10 Daily, F11 Weekly, F12 Range, F4 Selected, Ctrl+L Lucky,
Ctrl+F Fighter, Ctrl+O Owner, Ctrl+D Delete, Ctrl+T Change Date.
(Note: in some browsers F12 opens DevTools instead — use Report →
Range in that case.)

## 2. Web on your phone

Same WiFi as your Mac. Start the web app as above, then on the phone
open `http://<your-Mac-IP>:5174` (find the IP in System Settings →
Wi-Fi → your network → IP address). The board stays on top and the
three columns stack vertically with big buttons on a phone.

## 3. Mobile app (Expo Go)

```sh
cd 2d-rebuild/mobile
npm install
npx expo start
```

Scan the QR code with the Expo Go app on your phone.
Tabs: Board / Lucky / Reports / People / More.

## 4. The §9.3 fixture check (do this first)

This checks the numbers against your real 2024-04-11 day.

1. Open the web app (or mobile → More tab).
2. Backup → **Load 2024-04-11 test fixture**, then **Verify §9.3 numbers**.
3. Expected results:
   - Fighter 12, AM: Amount 55,000, no win → Net **46,750**
   - Fighter 12, PM: Amount 51,950, WinAmt 250 → Net **24,157.5**
   - AM draw **62**: bets on 62 = 6,450 → payout **516,000**
   - PM draw **82**: bets on 82 = 5,750 → payout **460,000**
   - Reverse bets (26 / 28) pay **nothing**
4. Go to Report → Current (2024-04-11, AM then PM) and check the same
   numbers appear there. (Backup is reached from the "« Back to Board"
   row under any non-board screen.)

## 5. Manual checks (the daily flow)

1. **Keyboard loop (computer — the main way to work):** click the
   Fighter code box, type `43`, press Enter with the amount empty —
   focus must move to the amount box. Type `1000`, Enter — the row is
   added and focus is back in the code box. Press F3 — the Fighter
   dropdown is focused. Press F6 — the Owner dropdown. F9 opens the
   Current report as a popup over the board; Esc returns to the board.
   `↑` submits, `↓` appends `+` and submits, `.` saves, F2 opens the
   row editor, Del deletes the selected grid row.
2. **Board, Fighter entry:** pick Fighter `1`, type code `//` amount
   `1000`, press Enter. The board should show 100 on each twin
   (00 11 22 … 99) and the Fighter grid one row, total 10,000.
3. **Reverse:** type `43+` amount `1000`. Two numbers appear: 43 and 34.
4. **Code sets:** try `**` (10 numbers, digit-sum 5), `a` (10 numbers),
   `0+` (19 numbers containing 0). Each row total = amount × count.
   Try `1/-2` — the grid shows `1/ (-) 2`. Try `1-2` — it stays `1-2`
   (that is how the original shows it). Single `d` and `12@` must be
   refused with "Invalid code".
5. **Board maths:** type a Carry for Owner `1` on the same number —
   the board cell drops by the carry amount (board = bets − carry).
6. **Limit:** open the Limit button (status panel) to change the limit
   (confirmed once). Enter a big bet on one number. The cell turns
   yellow and the number appears in the over-limit list. Tap Pass All —
   it moves into the Carry grid. BTbuy tops every below-limit number up
   to the limit into the Fighter entry; Crop moves the over-limit
   excess into the Carry entry. Save Carry.
7. **Save:** Save Bet — one in-app confirm dialog appears (Esc
   dismisses it, "Yes, Save" saves). A text summary (`T=…`) is copied
   to the clipboard and shown under the board. Save a second group for
   the same fighter — the summary must say `` `No.(2) `` and the date
   must be today. After a save the Fighter dropdown resets to blank.
8. **Browse saved bets:** Report → Browse Bets (popup over the board).
   Pick a fighter — per-person totals, grouped codes with pink
   subtotals, `You=…` settlement. Double-click a row to edit its
   amount (the row turns red); Del deletes a row (one confirm, dialog
   closes). A mistyped saved bet must be fixable here.
9. **LuckyNo:** Setup → Lucky No (or Ctrl+L) as a popup, enter `62`
   for AM. Report → Current should show WinNo 62 and WinAmt for anyone
   who bet 62. Enter `6` (1 digit) — it must refuse, not crash (the old
   app crashed here).
10. **Reports:** Report menu → Current / Daily / Weekly / Range / Range
    AMPM / Selected per-Fighter and per-Owner. Net = Amount − commission
    − payout if won. Report → Up to Date shows Monday → today, one
    fighter only (default 1), no Owner table. Reports show per-session
    rows with a BetDateTime column.
11. **AUTO:** AUTO menu opens the Auto popup (not Groups). Create a rule
    (code `A3`, No `12`, Amt `1000`, Add row, Save Auto with one
    confirm), then Materialise — the row lands in the Fighter entry.
    On a Saturday, or a Close Day, materialise must be blocked.
12. **Unit Sales:** Setup → Unit Sales popup. Type an amount on a
    distribution row, Save — it writes customer `'X'` bets (check in
    Browse). Copy produces `Amt->No` lines.
13. **Templates & Groups:** Template menu opens the Templates & Groups
    popup. Replay a group — the grid is cleared first and each code uses
    its stored amount.
14. **Dashboard:** with an unsaved row in the entry grid, Sales/Carry/
    Net P/L must still show saved-only totals. Refr is a button that
    reloads saved data; the board is always visible.
15. **Setup as popups:** every Setup item (Lucky No, Fighter, Owner,
    Delete, Change Date, Unit Sales, Close Days) opens as a popup over
    the board; Esc closes it. Fighter and Owner popups must look
    different from each other.

## 6. What to tell me back

For each check: pass, or what you saw instead (a screenshot helps).
Especially:
- Anything that looks different from the old EASY app
- Any code that expands wrong, or any number that doesn't match
- Phone layout problems (anything cut off, too small, overlapping)
- Anything missing that you use every day

## 7. Language — Myanmar by default

- The app opens in **Myanmar** the first time. Everything is translated:
  menus, buttons, labels, dialogs, toasts, reports, empty states.
- To switch to English: **System (စနစ်) → English**. To switch back:
  **System → မြန်မာ**. The choice is remembered on that device.
- Numbers stay Arabic digits **0-9** everywhere, exactly like the
  original — no Myanmar digits.
- Only these stay in English on purpose: **"T ="** and **"OK Thanks"**
  (the exact clipboard texts the original copies — translating them
  would change what gets pasted), the product title **"EASY v.5.5.1"**,
  clipboard formats and code patterns (`T=` / `P=` / `You=`, `Amt->No`,
  `43+`, `//`, `**`, `A–J`, `2D`), the **AM / PM** session codes, and
  keyboard key names (Enter, F2, Del, Ctrl+T, F3, F6). Everything else
  the operator sees is Myanmar: Bet → ထိုးငွေ, Carry → ပို့ငွေ, Rate →
  နှုန်း, Limit → ကန့်သတ်ချက် (Limit button → ပြင်ရန်), Board → ဇယား,
  Auto → အလိုအလျောက်,
  Template → ပုံစံ, Net P/L → အသားတင် အမြတ်/အရှုံး, Unit Sales → ယူနစ်
  ရောင်းရငွေ, BTbuy → ဖြည့်ဝယ်, Crop → ဖြတ်တောက်, Backup → အရန်သိမ်းခြင်း.
- If any Myanmar wording feels wrong, tell me the screen and the word —
  the wording list lives in `web/src/i18n/my.ts` and is easy to correct.
  The uncertain wordings are flagged in the README
  ("Wording to confirm with the user").

## Notes

- Default state has **no bets** — only fighters, owners, templates
  and groups are seeded. The fixture loads only when you tap it.
- Fighter 3 rate is **80**, not the 80250 typo in the old database.
- No login, no activation — same as the old app, which went straight
  to the main screen.
- Phone is not used for this app — computer (keyboard) first, tablet
  second.
- Not in this test: Groups/Templates management (view and replay only),
  Hidden book, sync between web and mobile.
- The production build now uses relative asset paths (`base: './'`), so
  it loads when hosted under a subpath (e.g. a Space) instead of a blank
  page. If you ever see a blank page again, check the browser console
  for 404s on `/assets/…` — a leading `/` there means the relative-path
  fix regressed.
