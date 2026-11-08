# EASY 2D — Full decompile & database analysis

**Date:** 2026-11-08
**Source:** `~/workspace/user/files/2D.zip` (1.3 MB) → `Easy2/`
**Analysed for:** rebuild as **Web + mobile** (user's choice)
**Status:** analysis only — no rebuild started, nothing pushed to GitHub.

## 0. Verdict up front

This is a **Myanmar 2D lottery bookkeeping app** for one operator ("dai"):

- **Fighters** = customers/agents who place bets with the operator. The operator takes their bets, keeps a commission, and pays out wins.
- **Owners** = upstream dealers ("di") to whom the operator passes up ("carry") part of the bets — the operator's risk management.
- One **session = one day + AM or PM** draw. All data is keyed by `BetDay` + `AMPM`.
- The operator types bets in a compact **shorthand code language** (`43+`, `//`, `**`, `0+`, `a`, `pz` …) that expands into many 2D numbers — this language is the heart of the app and must be reproduced exactly in the rebuild.
- A live **00–99 board** shows net exposure per number (bets minus carry). Any number over the per-number **limit** is flagged, and the excess is passed up to owners.
- After the draw, **LuckyNo** is entered and results are computed: `win = bet × rate`, `commission = amount × %`, `net = amount − commission − payout`.

**Recovery quality: very good.** This was a .NET 2.0/3.5 VB.NET assembly, which decompiles almost perfectly. 76 files / 44,877 lines of C# were recovered with ILSpy 8.2, including all business logic, all SQL, and all 13 report definitions. The only things lost are: original VB source formatting/comments, the WinForms designer layout (positions/sizes are recoverable from `InitializeComponent`, but the visual polish is not), and the meaning of a few UI labels that only the operator can confirm.

---

## 1. App identity

| Item | Value |
|---|---|
| File | `Easy2/Easy.exe` — PE32, x86, .NET assembly, 1.5 MB |
| Assembly name / title / product | `Easy` / `Simple` / `Simple` (namespace `_Simple`) |
| Assembly version | 1.0.0.0; ClickOnce/manifest version **1.0.0.8** |
| Built | 2020-04-26 (PE timestamp; `.pdb` same day). Copyright 2012 in AssemblyInfo |
| Runtime title | `EASY v.5.5.1 - <day>-<month> <AM/PM>` (set on load; the Change-Date path writes `EASY v.5.0 - …` — version-string inconsistency in the original) |
| Framework | VB.NET WinForms, .NET 2.0/3.5, x86 only |
| Database | `simple.mdb` — Microsoft Access JET4, via `Microsoft.Jet.OLEDB.4.0`, no password, single-user, file next to the EXE |
| Other files in zip | `Easy.exe.config` (connection strings), `Easy.pdb` (860 KB), `Easy.exe.manifest`, `Easy.application` (ClickOnce), `Easy.vshost.*` (debug host — ignore), `Interop.JRO.dll` (Jet compact engine), `simple.tmp` (see §9.4) |
| Language of UI/data | English labels + Myanmar text in message templates (`Template` table) |

**Decompile method:** .NET SDK 8.0.427 + .NET 6 runtime (ILSpy 8.2.0.7535 targets net6.0) → `ilspycmd Easy.exe -o decompiled -p`. Output: 76 files, 2.5 MB, kept at `~/workspace/2d-rebuild/decompiled/` (project file `Easy.csproj` included); the extracted zip is at `~/workspace/2d-rebuild/original/Easy2/`. Database read with `mdbtools` 1.0.0 (`mdb-tables`, `mdb-schema`, `mdb-export`). (Note: the first decompile was done in `/tmp`, which the VM wiped mid-task; it was re-run into the workspace paths above and the counts/formulas were re-verified.)

---

## 2. Tech stack (original)

- **Language:** VB.NET (decompiled to C# by ILSpy; all logic intact, VB idioms visible, e.g. `Interaction.MsgBox`, `Conversions`, `DateAndTime`).
- **UI:** Windows Forms, MDI main form (`MDIMain`), modal dialogs, `DataGridView` grids everywhere, `ReportViewer` + local `.rdlc` reports.
- **Data access:** `System.Data.OleDb` against Jet 4.0. One shared connection (`ModOleDb.con`). **All hand-written SQL is string-concatenated — no parameters anywhere** (SQL-injection-prone, but single-user desktop). Only the typed `TableAdapter`s use `?` parameters.
- **No transactions.** Saves are sequences of individual `INSERT`/`DELETE`/`UPDATE` statements; a failure mid-save leaves partial data (only the current group is rolled back, see §7.3).
- **No network, no sync, no backup.** One Access file on one PC. On every clean exit the DB is compacted in place (see §8.4).
- **Printing:** `ReportViewer` (`.rdlc`, embedded resources) + clipboard text for chat/SMS messages. No Excel/CSV/file export anywhere.

---

## 3. How the business works (end-to-end daily flow)

1. **Start of day/session.** The app opens on `MDIMain` with working date = **today** and session = **AM/PM from the clock**. The operator can move to another date/session via Setup → Change Date.
2. **Enter bets (Fighter side).** On the main screen the operator picks a Fighter (customer no.), types a code + amount (e.g. `43+` `1000`), presses Enter. The code expands into 2D numbers and appears as rows in the Fighter grid (`gF`). Repeat for all customers. F3 focuses the Fighter box.
3. **Enter carry (Owner side).** Same on the right: pick an Owner, type code + amount, rows go into the Owner grid (`gO`). F6 focuses the Owner box. This is the part of the book passed upstream.
4. **Watch the 00–99 board.** Every entry updates the board: each cell = total bet on that number **minus** total carried on it (net exposure). Cells over the limit turn yellow; the over-limit list (`gL`) shows the excess per number.
5. **Pass up the excess.** Over-limit rows are moved from `gL` into the Carry grid (`cmdGo` = all, `cmdGo1` = one row, `cmdGoTens` = rounded up to tens) and then saved as Carry.
6. **Save.** `Save Bet` / `Save Carry` writes the grids to the DB (`BetCode` + `Bet`, `CarryCode` + `Carry`) after a confirm dialog, and copies a text summary to the clipboard (`T=<total>` etc.) for pasting into chat.
7. **Draw.** After the official 2D result, Setup → Lucky No: enter the winning number for AM/PM. The reverse is stored too (`2DNoR`), but **only the exact number pays** (see §7.1).
8. **Results & reports.** Report → Current / Daily / Weekly / Range / Selected: per-person settlement (`Amount`, `WinAmt`, `NetAmount`). The "Now" report is the per-session settlement.
9. **Auto bets.** Recurring bets (`AUTO` menu) are defined once per Fighter as a code like `A3` (letter = weekday+session, number = session count) and materialise into future sessions automatically, skipping closed days and Saturdays.
10. **Exit.** Closing the app compacts `simple.mdb` (Jet compact → `simple.tmp` → rename). No backup is ever made.

### 3.1 The two sides of the book

| Side | People | Entry tables | Detail (per 2D no.) table | Commission (live data) | Rate |
|---|---|---|---|---|---|
| **Bet (Fighter)** — bets taken from customers | Fighter (`FighterNo`, e.g. `1`, `8`, `12`, `00`, `111`) | `BetCode` (one row per typed code) | `Bet` (one row per expanded 2D number) | 15% (all 12 fighters) | 80 (except Fighter `3`: **80250 — data anomaly, see §9.3**) |
| **Carry (Owner)** — bets passed upstream | Owner (`OwnerNo`, e.g. `1`…`5`, `111`) | `CarryCode` | `Carry` | 14% (all 6 owners) | 80 |
| **Hidden book** | same Fighters | `BetCodeHidden` | `BetHidden` | 0 / 0 in the surviving rows | 0 |

Global defaults in `Calc`: **Limit 40000, Commission 16%, Rate 80** (single row; used for the status dashboard and Unit Sales).

---

## 4. Screen map (all 37 forms + 2 modules)

Startup form is `MDIMain` directly — **no login at startup** (see §8.1).

### 4.1 Main screen — `MDIMain` ("EASY")

The main screen **is** the bet-entry screen (not just a menu shell). Layout:

- **Centre: 00–99 board (`g`)** — 11 rows × 20 columns. Even columns hold the number (`00`…`99`), odd columns the net amount for that number. Row 10 = column totals. Cells turn **yellow** when the amount exceeds the limit.
- **Left: Fighter entry** — `cboF` (Fighter no.), `txtNoF` (code), `txtAmtF` (amount), grid `gF` (the current fighter's unsaved codes), `txtTotalF`, `txtCommissionF`, `txtRateF`, buttons Save / Clear / Open (browse) / Hidden (save to hidden book) / Group (limit list).
- **Right: Owner entry** — `cboO`, `txtNoO`, `txtAmtO`, grid `gO`, `txtTotalO`, Save / Clear / Open.
- **Bottom/side: over-limit grid (`gL`)** with `txtTotalL`, and move buttons `cmdGo` (all → carry), `cmdGo1` (one → carry), `cmdGoTens` (→ carry rounded to tens), `cmdBack` / `cmdBack1` (carry → back to limit list).
- **Status grid (`gS`)** — 9 rows: Limit / Times / Sales / Carry / Net Sales / % / Gross Profit / Rate / Net P/L (see §7.4).
- **Week grid (`gW`)**, lucky-number display, date/time labels, `txtLimit` (per-number limit, editable), `chkAutoRefresh` + `Timer1` (auto re-read of `Calc` + status refresh), `Timer2` (clock).
- **Menus:** Setup | Report | System | AUTO | OK Thanks | Close | Template | T =

| Menu | Item | Opens / does |
|---|---|---|
| Setup | Lucky No | `LuckyNo` |
| Setup | Fighter | `Fighter` (master data) |
| Setup | Owner | `Owners` (master data) |
| Setup | Delete | `Delete` (bulk delete) |
| Setup | Change Date | `ChangeDate` (move working day/session; title becomes `EASY v.5.0`) |
| Setup | Unit Sales | `UnitSales` |
| Setup | Close Days | `CloseDays` |
| Report | Current | `ReportNow` |
| Report | Daily | `ReportToday` |
| Report | Weekly | `ReportWeek` (Sun–Sat week) |
| Report | Range | `Range` form → `ReportWeek` |
| Report | Range AMPM | `RangeAMPM` form → rebuilds `bRange`/`cRange` → `ReportRange` |
| Report | Selected | `Selected` form |
| Report | Selected (View Only) | `viewSelected` |
| Report | Up to Date | `RangeUpToDate` form |
| System | About Me | `AboutMe` (pattern cheat-sheet) |
| System | Highlight Color | colour picker → `HighLightColor` table |
| System | Register | `Register` (starts **disabled**) |
| System | Exit | closes app |
| AUTO | — | `AutoCode` |
| OK Thanks | — | copies `OK Thanks` to clipboard |
| Close | — | **no click handler — dead menu item** |
| Template | — | `Template` |
| T = | — | copies `T=` to clipboard |

Keyboard: **F3** = focus Fighter, **F6** = focus Owner. In the code box: **↑** submits the current code+amount, **↓** appends `+` (reverse) and submits, **F3 / `.`** = Save. **F2** in the entry grid opens the Group loader. **Del** in a grid deletes the current row.

### 4.2 Entry forms (the core)

**Bet entry is on `MDIMain`, not on the `Bet` form.** The `Bet` and `Carry` forms are **browse/edit/delete** screens for already-saved bets (see §4.3).

**Fighter entry (`MDIMain.gF`) — the exact flow:**
1. `txtNoF`: allowed characters only `0-9 + - * / . p z space a q n P Z A Q N` (anything else is rejected silently). Enter → focus amount.
2. `txtAmtF`: digits, `/`, `.` only. Empty or `0` → back to the code box, silent.
3. **Space-separated list** (input longer than 4 chars containing a space): split on spaces; each token becomes one grid row. Trailing `+` on the whole input means "also the reverse" — appended to each non-twin token. Amount `a/b`: twin numbers take the first part, others take `a+b` as row total. A 3-char token is displayed as `NN R`.
4. **Single code:** `a-b` (digit-dash-digit) → expanded by `funcLeftRight(a, b)`; otherwise validated/expanded by `ModTran.xInput(code, amount)` → sets `x2DCode` (display code), `x2DTotal` (row total = amount × number of expanded numbers), `vNo[]` (expanded numbers). Invalid → focus back to code box, **no message**.
5. Row added to `gF`: `[0]=seq, [1]=display 2DCode, [2]=amount, [3]=typed code, [4]=x2DTotal, [5]=amount`. Board updated via `gValuePlus` (each expanded number's cell += amount), limit list refreshed (`xLimit()`), total recomputed.
6. **Save (`cmdSaveF_Click`):** requires Fighter + Commission + Rate filled. **First it overwrites the Fighter's master commission/rate in the DB with the on-screen values** (`update fighter set commission=…, rate=…`). Confirm `Are You Sure to Save Bet?`. `GroupID = MAX(GroupID) from betcode + 1` (global). Per grid row: `Sno = MAX(Sno) from betcode + 1`; `INSERT INTO betcode …`; `xCalc(code, amount)` expands to `vNo[]`; one `INSERT INTO bet` per expanded number (same Sno/GroupID). On `xCalc` error: delete that group from `bet`/`betcode`, `Can't Save the Code!`, abort (earlier rows in the same save are **not** rolled back). Clipboard: Fighter `1` gets just `T=<total>`; others get `2DCode=Amount` lines + `` `No.(n)-d.M AM/PM `` + `T=<total>`. Grid cleared; commission/rate boxes reset to 0.
7. **Carry entry (`gO`) is the mirror image** with Owner, `CarryCode`/`Carry`. `cmdSaveO` is the same shape (not read line-by-line; assumed parallel — flag: verify against `cmdSaveF` during rebuild).

**Hidden save (`cmdHidden_Click`):** identical to Save Bet but writes to `betHidden`/`betcodeHidden` after confirm `Are You Sure to Save Bet Hidden?` — a parallel hidden ledger.

### 4.3 Browse / edit forms — `Bet` and `Carry`

Both are 981×535, read-only grids, **no new-entry INSERT**. Left grid = one row per person with total; right grid = that person's codes grouped, each group followed by a **pink subtotal row**; rows with `edited=1` are painted **red**.

- Filters: date picker + AM/PM combo; changing either reloads.
- Click a row → copies that group to clipboard. Double-click → edit popup (code + amount). **Ctrl+LeftClick** (Bet only) → re-price the rest of the group at one amount. **Alt+LeftClick** → group copy + close. **Del** → delete row(s) / delete all for a customer (with confirm).
- Edit (`cmdEditSave`): re-validates via `xInput`, updates `betcode` (`edited=1`), deletes that Sno's `bet` rows, re-inserts the expanded numbers (same Sno/GroupID). **Quirk:** the `betcode` UPDATE runs *before* the `xCalc` error check, so a failed save leaves `betcode` updated but `bet` stale.
- `cmdCopy` → selected rows back into `MDIMain.gF` (Bet) / `gO` (Carry) for re-entry; `cmdCopyToCarry` (Bet only) → into `gO`. `cmdMessageCopy` → clipboard `2DCode=Amount` lines. `cmdGroupCopy` / `cmdAllCopy` / `btnTotalCopy` → clipboard totals. `btnCurrentTotal` / `btnWeeklyTotal` / `btnUpToDate` (Bet only) → settlement text to clipboard (see §7.2).
- **Bet-only `chkHidden`** switches loading to `betHidden`/`betcodeHidden` — but row-delete and edit-save **do not branch on it** and hit the normal tables (bug).
- `cmdPrint` on Bet is `Visible = false` (dead); on Carry it opens `ReportCarryCode`.

### 4.4 Draw & results — `LuckyNo`

- Enter winning number for a date + AM/PM (`txtLuckyNo`, Enter saves). Reverse computed by digit swap (`12`→`21`) and stored as `2DNoR`. Upsert on (`BetDay`, `AmPM`).
- **No numeric/length validation** — a 1-char entry would throw on `Substring(1,1)`.
- **Only on INSERT (not update):** cascade-deletes all *future* auto bets for any auto group containing the winning number (deletes from `AutoCode`, `Auto`, `BetCode`, `Bet`; whole `GroupID`, not just the winning rows; repeated for same-day PM if the draw was AM). Rationale (inferred): once a number has won, its recurring auto-bets stop.
- `cmdCopy` ("Old No"): copies every distinct past winning number into `MDIMain.gF` at `txtAmt` each — non-twins as reverse bets (`NN R`, row total = amount × 2), twins plain.
- Second half of the form maintains the **`AMKno`** list (same shape, separate table). **Bug:** its Delete button runs unqualified `delete from AMKno` — it wipes the whole table.
- No win/pay formula lives in this form (formulas are in the report queries, §7.1).

### 4.5 Limit — `Limit` ("Limit Over", read-only)

- Shows the temp `Limit` table (rebuilt by `MDIMain.cmdGroup` from the `gL` grid): numbers whose **net** total exceeded the limit, ordered: `a/b` split rows first, then `…R` rows, then plain rows, each group with a cyan subtotal row and a yellow grand-total row.
- `cmdCopyToCarry` copies selected rows into `MDIMain.gO`. `cmdPrint` is an **empty method — does nothing**.
- **Apparent bug:** the display loop starts at row index 1, so the first row of each of the three groups is skipped in the grid *and* in the subtotal (may be a decompiler artefact of a 1-based loop — verify during rebuild).

### 4.6 Groups — `Group`

- Maintains named number-pattern packs: `GroupCode` (name) + `Group` (`GroupCode, 2DNo, Amount, Sno`). New name + Enter → confirm `Add New Group?`. Row add/edit/delete, whole-group delete.
- `cmdCopy` replays a group into the main entry grid: sets `MDIMain.txtNoF = <2DNo>`, `txtAmtF = <override amount or row amount>`, fires Enter — **no expansion happens here**; it all goes through `ModTran.xInput`/`xCalc`.
- Stored patterns are verbatim codes (`0+`, `12 R`, `12+`, …). Live data: 61 group codes, 465 group rows.

### 4.7 Templates — `Template`

- Snippet store: `Template (TemplateNo, TemplateName)` — the "name" holds the whole message text (Myanmar + English, e.g. `ထိပ္(10)ကြက္`, `Please Copy`, `KQ BUY`, `Total = `, `*Final*`). 66 rows in live DB.
- Click a row (or Copy button) → text to clipboard, form closes. The form itself never sends anything — it is a copy-paste helper for chat/SMS.
- **Bug:** on an empty table, `MAX(TemplateNo)+1` is NULL → first template inserted as `TemplateNo = 0`.

### 4.8 Auto bets — `AutoCode` (create) and `AutoEdit` (manage)

**`AutoCode`:** define a recurring bet for one Fighter.
- **Code format `A3`:** letter **A–J** + number. The letter encodes weekday + session (`AJ2WeekDay`: A/B=day 1, C/D=day 2, E/F=day 3, G/H=day 4, I/J=day 5; `AJ2AMPM`: A,C,E,G,I = AM, B,D,F,H,J = PM). Start date = Sunday of current week + weekday offset (if today is Saturday, a week is added first); AM → 08:00, PM → 20:00. **The number = session count** (AutoTimes); end = start + 12h × (count−1).
- Entry grid uses the same `txtNoF`/`txtAmtF` engine (amount chars digits/`/`/`.`; space-separated list; trailing `+` reverse handling).
- **Save:** Fighter must exist (`Fighter Not Found?` otherwise); confirm `Are You Sure to Save Auto?`. `AutoGroupID = MAX(AutoGroupID)+1`; base `GroupID = MAX(GroupID) from betcode + 1`. One `AutoCode` header row per grid row (`AutoGroupTotal = RowTotal × AutoTimes`). Then a loop over sessions: advance 12h per session, **skip closed days** (`CloseDays`), **break on Saturday** (no auto bets on Saturdays). Each session inserts an identical pair into `Auto` **and** `BetCode`, then `xCalc` expands into `Bet` rows. On `xCalc` failure: delete that day/session's rows, `Can't Save the Code!`, abort (earlier sessions not rolled back).
- `PasteF`: parses clipboard `no=amt` lines (`,` → `=`, `/` splits, skips lines with letters or the word `Total`).

**`AutoEdit`:** lists `AutoCode` grouped by `AutoGroupID` with pink subtotals; `chkHidePreviousDays` hides ended groups.
- **Delete group:** future-only, keyed to the current session (AM: `BetDay >= today`; PM: `BetDay > today` plus today-PM). Deletes from `Bet`/`BetCode` (via `Auto`→`AutoSno`), then `Auto`, then `AutoCode`. Past sessions' rows are kept. **Quirk:** the PM branch overwrites the first Bet-delete string before executing (possible decompile artefact — verify).
- **Bulk amount edit:** percent `0 < p ≤ 100`, plus/minus radio; rescales each `/`-separated amount part (`part ± part×p/100`) by replaying the row through the entry engine. **No SQL UPDATE was found in this handler — persistence of the percent edit is unverified** (open item).
- Individual row edit replays through the same entry engine.

### 4.9 Master data — `Fighter`, `Owners`, `AddFighter`, `AddOwner`

- `Fighter` / `Owners`: grid (`select * … order by fighterno/ownerno`), add/edit/delete. Note the grid headers are mislabelled `'#','Name','Name','Commission','Rate'` for (Sno, No, Name, Commission, Rate). Save: `insert … values (MAX(Sno)+1, …)` or `update … where sno=…`. Delete with confirm.
- `AddFighter` / `AddOwner`: quick-add dialogs opened from `MDIMain` when an unknown Fighter/Owner number is typed. No prefilled, Rate defaults 0, **no duplicate check**, no validation beyond No non-empty.

### 4.10 Dates, deletion, selection — `ChangeDate`, `CloseDays`, `Delete`, `Selected`, `viewSelected`, `Range*`

- **`ChangeDate`:** date picker + AM/PM combo; `FormClosed` writes back `xBetDay`/`xAMPM`. No validation against `CloseDays`.
- **`CloseDays`:** date picker + Save/Delete + read-only grid. Save inserts the date if absent; delete removes it. **Nothing in the code enforces it as a lock** — it is only consulted by the Auto generator (skip) and recorded nowhere else. Treat as a marker list, not an enforced lock.
- **`Delete`:** 9 radio options — Sales / Carry / Sales, Carry && Lucky No / Lucky No / Fighter / Owner / All Data / Close Days / Auto — plus a date picker and a `chkFromDate` toggle ("Up To" `<=` vs "From" `>=`). After `Are You Sure to Delete?` it deletes e.g. Sales: `delete from bet …`, `delete from betcode …`, `delete from bresult`. **All Data** wipes `bet, betcode, carry, carrycode, bresult, cresult, luckyno, fighter, owner, Auto, AutoCode, AMKNo`. Date-bounded options always wipe the whole `bresult`/`cresult` tables, not just the range. **No backup is taken first.**
- **`Selected`:** Fighter + Owner combos; two Report buttons → `ReportSelectedF` / `ReportSelectedO`.
- **`viewSelected`** ("Selected (Vew Only)" — sic): all-time per-person totals (`select customerno, sum(amount) from bet group by customerno`), click a person → detail with the same NetAmount formula, totals row; negative NetAmount is red for Fighter, colours inverted for Owner. Clicking a detail row copies `All Total=…P=…KQ=…` to clipboard. **Anomaly:** the click handler reads `gT[2]`, `gT[4]`, `gT[7]` but `gT` is defined with only 2 columns — likely throws at runtime (unverified, never run).
- **`Range`:** two date pickers (default today) → opens `ReportWeek` with `iFrom`/`iTo` set (plain date-range version of the weekly report). No SQL of its own.
- **`RangeAMPM`:** From/To dates + From/To AM/PM. Defaults: From = Monday of current week, To = today, From `AM`, To = current session. On Report: **rebuilds the temp tables** (`delete from bRange; delete from cRange; INSERT INTO bRange …; INSERT INTO cRange …` with the §7.1 formula over `BETWEEN iFrom AND iTo`), then trims edges (From=`PM` → delete `iFrom` AM rows; To=`AM` → delete `iTo` PM rows). Opens `ReportRange`.
- **`RangeUpToDate`:** same + a Fighter combo (default `1`); its `INSERT INTO bRange` adds `CustomerNo = '<cboF>'`. **It only deletes `cRange` and never inserts into it — the Owner half of `ReportRangeUpToDate` is always empty** (bug).

### 4.11 Other forms

- **`UnitSales`:** "unit sales" bulk-buy. Loads `Calc` (Limit/Commission/Rate) and per-digit sales for the current session (`select d.[2DNo], (select sum(amount) from bet …) as bAmt … from digit d`), plus a distribution (`select amt, count(amt) from (select [2dno], sum(amount) as amt … group by [2dno]) … group by amt`, row 0 = `100 − Σcounts`, digits with zero sales). Save: new `GroupID = MAX(GroupID)+1`; for each digit whose amount matches a user-entered distribution amount, inserts into `betcode` **and** `bet` with customer `'X'`, commission/rate from `Calc`. Copy → clipboard `Amt->No` lines.
- **`Dummy`** ("Expense"): grid Sno / Particular / Amount; load-only (`select * from expense`). No insert/update/delete code at all. Shown only on a failed `Login` (see §8.1). `Expense` table is empty in the live DB.
- **`AboutMe`:** read-only textbox from the `.resx` resource — a 2D pattern cheat-sheet (`even even + +`, `odd odd - -`, `pair // (00, 11, 22…)`, `brother */ (01, 10, 12, 21…)`, `power ** (05, 50, 16, 61…)`, `zodiac /* (07, 70, 18, 81…)`, `normal dd`, `reverse dd +`, `f-series d /`, `b-series / d`, `break d * …`).
- **`tmpCReport` / `tmpLReport`:** print-preview forms for the carry report and the ledger (00–99 board) respectively; their datasets are `SELECT … FROM tmpCReport ORDER BY Sno` and `SELECT Sno, C1…C20 FROM tmpLReport ORDER BY Sno`.
- **`Register`:** see §8.2. **`Login`:** see §8.1.

---

## 5. The code language (pattern expansion) — the heart of the app

A typed code expands (via `ModTran.xInput` for validation + totals, `ModTran.xCalc` for the number list `vNo[]`) into 2D numbers. `x2DTotal = amount × (number of expanded numbers)` — except reverse/split cases below. `vReverse` = exactly 2 numbers (a number + its reverse); `vOneNo`/`vTwoNo` = the code embeds 1–2 "main" numbers that are **excluded** from the expansion (they are bet separately).

### 5.1 Named patterns (`xInput` switch — verified from code)

| Typed | Display code (`2DCode`) | Count | Numbers |
|---|---|---|---|
| `a` | `S-B` | 10 | 01 12 23 34 45 56 67 78 89 90 |
| `z` | `B-S` | 10 | 09 10 21 32 43 54 65 76 87 98 |
| `q` | `1-SKIP` | 20 | 02 20 13 31 24 42 35 53 46 64 57 75 68 86 79 97 80 08 91 19 |
| `++` | `++` | 25 | both digits even: 00 02 04 06 08 20 22 … 88 |
| `--` | `--` | 25 | both digits odd: 11 13 15 … 99 |
| `+-` | `+-` | 25 | first even, second odd: 01 03 … 89 |
| `-+` | `-+` | 25 | first odd, second even: 10 12 … 98 |
| `//` | `PAR` | 10 | twins: 00 11 22 33 44 55 66 77 88 99 |
| `**` | `POW` | 10 | digit-sum 5: 05 50 16 61 27 72 38 83 49 94 |
| `*/` | `BRT` | 20 | consecutive digits: 01 10 12 21 23 32 34 43 45 54 56 65 67 76 78 87 89 98 90 09 |
| `/*` | `ZOD` | 10 | digit-difference 7: 07 70 18 81 24 42 35 53 69 96 |
| `pz` | `PZ` | 20 | fixed set: 57 68 74 85 92 03 19 20 31 46 75 86 47 58 29 30 91 02 13 64 |
| `+//` | `+//` | 5 | even twins: 00 22 44 66 88 |
| `-//` | `-//` | 5 | odd twins: 11 33 55 77 99 |
| `pn` | `P-N` | 12 | 02 20 24 42 34 43 57 75 79 97 89 98 |
| `2+6` | `2(+)6` | 12 | 02 20 64 46 19 91 31 13 68 86 75 57 |
| `n` | `NAM` | 6 | 07 70 29 92 48 84 |
| `0+2`…`0+9` | `2-SKIP`…`9-SKIP` | 20 | digit pairs with circular digit-difference k, both directions. `0+2`: 02 13 24 35 46 57 68 79 80 91 20 31 42 53 64 75 86 97 08 19. `0+3`: 03 14 25 36 47 58 69 70 81 92 30 41 52 63 74 85 96 07 18 29. `0+4`: 04 15 26 37 48 59 60 71 82 93 40 51 62 73 84 95 06 17 28 39. `0+5`: 05 16 27 38 49 50 61 72 83 94, then the same 10 again (see quirk §11.23). `0+6`: 06 17 28 39 40 51 62 73 84 95 60 71 82 93 04 15 26 37 48 59. `0+7`: 07 18 29 30 41 52 63 74 85 96 70 81 92 03 14 25 36 47 58 69. `0+8`: 08 19 20 31 42 53 64 75 86 97 80 91 02 13 24 35 46 57 68 79. `0+9`: 09 10 21 32 43 54 65 76 87 98 90 01 12 23 34 45 56 67 78 89 |
| `+/0`…`+/9` | `02468/0+`… | 9–10 | all numbers containing digit d where the *other* digit is even. E.g. `+/0` (9): 00 20 40 60 80 02 04 06 08 |
| `-/0`…`-/9` | `13579/0+`… | 9–10 | all numbers containing digit d where the *other* digit is odd |

### 5.2 Digit patterns (`xCalc` / `xCheckValidNo` / `CodeConvertC2N`)

| Typed | Display | Count | Meaning |
|---|---|---|---|
| `NN` (two digits) | `NN` | 1 | the number itself |
| `NN+` / `NN R` | `NN R` | 2 | the number **and its reverse** (`vReverse = true`); `CodeNo = "NN+"` |
| `NN@` | `NN R` (via `xInputReverse`) | 2 | same as `+` (alternate reverse marker) |
| `d+` (single digit + `+`) | `d LP` | 19 | all numbers containing digit `d` in either position (e.g. `0+`: 00–09, 10, 20, …, 90) |
| `d/` | `d F-` | 10 | front series: `d0`…`d9` |
| `/d` | `d B-` | 10 | back series: `0d`…`9d` |
| `d*` | `d BK` | 10 | "break" set for digit `d` — digit-sum sets, e.g. `0*`: 00 19 91 28 82 37 73 46 64 55 |
| `d` (single digit) | — | 10 | same digit-sum ("break") set as `d*` (e.g. `0`: 00 19 91 28 82 37 73 46 64 55) |
| `a-b` (digit-dash-digit) | raw `a-b` kept | varies | `funcLeftRight(a, b)`: digit→related digits table (0→057, 1→168, 2→2749, 3→385, 4→4928, 5→503, 6→619, 7→720, 8→8314, 9→9462); the two digit-sets are crossed to build the number list |
| `NNN…+` (digit string ending `+`, ≥4 chars) | — | n×(n−1) | all ordered pairs of distinct digits from the string (e.g. `123+` → 12 13 21 23 31 32) |

### 5.3 Amount handling

- Plain amount `v` on a pattern of N numbers → each number gets `v`; row total `= v × N`.
- Amount `a/b` (slash-split): **reverse pair only** — first number gets `a`, reverse gets `b` (and row total `= a+b`). In a space-separated list, a twin takes the first part, others take `a+b` as row total.
- In the entry grid, a trailing `+` on a space-separated list doubles the row total for non-twins (`x2DTotal × 2`) and leaves twins at `×1`.
- `xInputReverse(2DCode)` converts a stored display code back to typed form for editing (e.g. `43 R` → `43+`, `PAR` → `//`, `02468/2+` → `+/2`, `… B-` → `/…`, `… F-` → `…/`, `… BK` → `…*`).

### 5.4 Validation

- Code box: only `0-9 + - * / . p z space a q n` (either case) accepted, per character, silent reject.
- Amount box: only digits, `/`, `.`; empty or `0` rejected silently.
- `xInput` returns false (silent focus-back, no message) for unknown codes; `xCalc` sets `vErr = true` on exception → `Can't Save the Code!` (critical MsgBox) and the current group is deleted.
- **No per-number or per-customer maximum is enforced at entry** — the limit is a reporting/flagging mechanism only (§6).

---

## 6. The limit / over-amount system

This is **not** a blocking limit. It is a net-exposure flag + pass-up workflow:

1. **Board cell** for number `NN` = `SUM(Bet.Amount where 2DNo=NN, session) − SUM(Carry.Amount where 2DNo=NN, session)` (from `LoadData`; the same netting is done live by `gValuePlus`/`gValueMinus` as rows are typed/removed). Cells over the limit turn **yellow**.
2. **Limit value** `vLimit` = `Calc.Limit` (live: **40000**), overridable in the `txtLimit` box on the main screen. (Timer1 re-reads `Calc` when auto-refresh is on.)
3. **`xLimit()`** rebuilds the over-limit grid `gL`: every board cell with net amount > limit becomes a row: `No = NN`, `Over = OverHidden = RowTotal = net − limit`, sorted by excess descending.
4. **`xLimitNo2Code()`** merges reverse pairs: if `NN` and its reverse `MM` are both over the limit with **different** excesses → one row, `Over = "a/b"` (excess on NN / excess on MM), `RowTotal = a+b`; if the excesses are **equal** → one row `NN R`, `CodeNo` gets `+`, `RowTotal = 2 × excess`, and the reverse row is removed. (This resolves the `a/b` format seen in the `Limit` table.)
5. **`cmdGroup`** writes the `gL` grid into the `Limit` table (`delete from limit` + one insert per row) and opens the `Limit` form.
6. **Pass-up:** `cmdGo` (all rows) / `cmdGo1` (current row) move `gL` rows into the Carry grid `gO`; `cmdGoTens` rounds each amount **up to the next ten** (with `/` handling: equal rounded parts collapse to a reverse `R` row). `cmdBack` / `cmdBack1` move rows back. The moved rows are then saved as Carry bets.

---

## 7. Business rules & exact formulas

### 7.1 Settlement (the canonical query — `bResult`/`cResult` TableAdapters)

Per BetDay + AMPM + person (CustomerNo for bets, OwnerNo for carry):

```sql
-- inner: totals per person/session
SELECT BetDay, AmPM, CustomerNo,
       SUM(Amount) AS Amount, MAX(Commission) AS Commission, MAX(Rate) AS Rate
FROM Bet GROUP BY BetDay, AmPM, CustomerNo
-- win: exact-number match only
SELECT x.BetDay, x.AmPM, x.CustomerNo, x.[2DNo] AS WinNo, SUM(x.Amount) AS WinAmt
FROM (Bet x INNER JOIN LuckyNo l
      ON x.BetDay = l.BetDay AND x.AmPM = l.AmPM AND x.[2DNo] = l.[2DNo])
GROUP BY x.BetDay, x.AmPM, x.CustomerNo, x.[2DNo]
```

Formulas (same for Carry, with `Carry`/`OwnerNo`/`AMPM`):

| Quantity | Formula |
|---|---|
| `Amount` | `SUM(Amount)` for the person/session |
| `Commission` / `Rate` | `MAX(Commission)` / `MAX(Rate)` over that person's rows that session (assumes uniform per person/session) |
| `WinAmt` | `SUM(Amount)` of rows whose `2DNo` **exactly equals** `LuckyNo.2DNo` for that BetDay+AMPM |
| `CommissionAmount` | `Amount / 100 * Commission` |
| `GrossAmount` (payout) | `WinAmt * Rate` |
| `NetAmount` | `Amount − CommissionAmount` if no win, else `Amount − CommissionAmount − GrossAmount` |

**Key points:**
- `NetAmount` is the **house net** for that person/session (positive = house keeps money; negative = house paid out more than it kept). The per-person clipboard settlement in `Bet` flips the sign (`You = −(Total − WinAmt×Rate − Total×Commission%)`, rounded) — the customer's view.
- The join uses **only `LuckyNo.2DNo`, never `2DNoR`** — the reverse number does **not** win. Reverse bets pay only because entry creates two separate `Bet` rows (number + reverse).
- `Rate` is a **multiplier** (live: 80 → a 1,000 bet on the winner pays 80,000). `Commission` is a **percent** (live: 15% fighters, 14% owners, 16% global default).
- `NetAmount` can be fractional (commission is `Single`): e.g. Fighter `12` PM 2024-04-11: Amount 51,950, WinAmt 250 → Net = 51,950 − 7,792.5 − 20,000 = **24,157.5**. The stored `bRange.NetAmount` column is `Long Integer`, so snapshot tables truncate/round this.
- Query variants: `Fill(BetDay, AMPM)` (current session), `FillBy(BetDay)` (whole day), `FillBy1(BetDay, BetDay)` (`BETWEEN`), `FillBy2(CustomerNo|OwnerNo)` (all dates, one person), `FillBy3()` (`SELECT … FROM bRange`/`cRange` — pre-built snapshots).

### 7.2 Per-person clipboard settlement (`Bet`/`Carry` forms)

Same inputs (`Total = SUM(Amount)`, `Commission = MAX`, `Rate = MAX`, `WinAmt` = joined win sum):
- Bet: `You = −(Total − WinAmt×Rate − Total/100×Commission)`, rounded, shown as `You=(+)…` / `You=(−)…`.
- Carry: same arithmetic **without** the sign flip.
- Weekly/UpToDate variants use `xFrom`/`xTo` (week bounds) and `xUpToDate` = today; **bug:** the UpToDate win subtraction uses `xFrom` where `xUpToDate` was intended, and the Carry current-total query uses `BetDay >=` where Bet uses `=`.

### 7.3 Save rules

- `Sno` = `MAX(Sno) + 1` per detail table (`xGetSno`), taken **per row** at insert time (no identity column, no sequence — concurrent use would collide; single-user app).
- `GroupID` = `MAX(GroupID) + 1` **globally** per save (one save = one group; all rows of that save share it).
- Save **overwrites the Fighter/Owner master commission+rate** with the on-screen values before inserting.
- `BetDateTime` = current time, seconds stripped (`Now` string minus last 6 chars + AM/PM).
- `Edited = 1` is set on any edit via the Bet/Carry forms; edited rows are painted red.
- No transaction: on `xCalc` failure only the current group is deleted; earlier groups in the same save stay saved.

### 7.4 Status dashboard (`xProfit`, grid `gS`, per session)

From `Calc` (Limit / Commission% / Rate) and the session's `Bet`/`Carry`/`LuckyNo`:

| Row | Formula |
|---|---|
| Limit | `Calc.Limit` |
| Times | `NetSales / Limit` (0 decimals) |
| Sales | `SUM(Bet.Amount)` for the session |
| Carry | `SUM(Carry.Amount)` for the session |
| Net Sales | `Sales − Carry` |
| % (Commission) | `NetSales / 100 × Commission%` (rounded 0) |
| Gross Profit | `NetSales − Commission` |
| Rate (payout) | `(SUM(Bet on LuckyNo) − SUM(Carry on LuckyNo)) × Rate`; shown as **0 if Sales = Carry** |
| Net P/L | `GrossProfit − Rate payout`; shown as **0 if Sales = Carry**; **red if GrossProfit < Rate payout** |

### 7.5 Weeks, sessions, dates

- Session = `BetDay` (date only) + `AMPM` (`AM`/`PM`, from the clock at startup; Change Date can override).
- Week = **Sunday–Saturday** (`xLoadTen`: `xFrom = date − DayOfWeek`, `xTo = xFrom + 6 days`). The `Ten` table pre-stores weeks 1–2000 (2012-01-01 → 2050-04-30) for the weekly report.
- Auto bets: 12-hour session steps (08:00 AM / 20:00 PM), **no Saturdays**, skip `CloseDays`.
- Dates in SQL are `#yyyy/M/d#` literals (no zero-padding) or full date-time strings in a few places (inconsistent — Bet's edit-save writes `BetDay` as a full date-time string while loaders use `Y/M/D`).

---

## 8. Security, licensing & login

### 8.1 Login — effectively dead

- `Login.cs` exists (one masked password box, title "Easy Login") but **no form, menu, or startup path opens it** — startup goes straight to `MDIMain`. It looks orphaned in this build.
- Auth would be: `select * from userlogin where userid=1`, plaintext compare of column index 1 against the typed text. **No hashing, no username, no attempt limit** (`vCount` is never incremented, `bTerminate` is always false).
- Wrong password does **not** block the app: after a swallowed empty `try/catch` it hides Login and opens `Dummy` (the Expense form).
- Live credential: `UserLogin` has one row — `UserID=1, Password="9797" (plaintext), Type=9797, UserCode="Q"`. **The rebuild must not carry this over — use proper hashed passwords and roles.**

### 8.2 Activation / licensing — effectively dead

- `ModOleDb.CheckKey()`: CPU ID from WMI `Win32_Processor.ProcessorId`, padded/truncated to 16 hex chars, split into 4×4 hex, each `Convert.ToInt32(chunk, 16)`, concatenated as decimal with no separator → the expected key.
- `CheckRegister()`: compares `ActivationKey.ActivationKey` to `CheckKey()`; on mismatch sets `bRegistered = false` and **increments `ActivationKey.Times`**. **It is never called from any file in the decompile**, and `vTrialTimes` is never compared to any limit — there is no enforced trial expiry.
- `Register` form: shows the CPU ID, user types a key; correct → `update activationkey set activationkey = '<key>'` (no WHERE); wrong → `You Put the Wrong Key!`, on the 3rd wrong attempt `You Put the Wrong Key 3 Times!` and the form closes. **Closing Register quits the whole application** (`FormClosed` calls `con.Close(); EndApp()`), including after a successful activation.
- The Register menu item starts **disabled** and is never re-enabled in the code found.
- Live data: `ActivationKey = "491316451121621"`, `Times = 51` — i.e. this copy ran 51 times while unregistered (counter increments each launch while unregistered, if `CheckRegister` were called).
- **Rebuild decision needed:** drop licensing entirely (recommended — it is dead code and ties the app to one PC's CPU), or replace with a proper account/login.

### 8.3 Other security notes

- No passwords/hashing anywhere; DB file has no password; anyone with the file has all data.
- All SQL is string-concatenated (injection possible from any text field).
- `Delete` form can wipe all data with one confirm and no backup.

### 8.4 Exit / compact (the only "backup")

On clean exit (`MDIMain_FormClosed`): close connection → Jet compact `simple.mdb` → `simple.tmp` (`Jet OLEDB:Engine Type=5`) → delete `simple.mdb` → rename `simple.tmp` → `simple.mdb` → `EndApp()`. Only if no `simple.ldb` lock file exists; otherwise the compact is silently skipped. **There is no backup menu, no export, no copy to another folder.** If the compact is interrupted, the DB can be lost — the rebuild needs real backup/export.

---

## 9. Data model

### 9.1 Tables (35 in `simple.mdb`, JET4) with live row counts

| Table | Rows (mdb) | Purpose |
|---|---|---|
| `Bet` | 1,975 | One row per expanded 2D number bet (detail) |
| `BetCode` | 849 | One row per typed code (header) |
| `BetHidden` / `BetCodeHidden` | 4 / 2 | Hidden-book equivalents (stale 2014 rows) |
| `Carry` | 103 | One row per expanded 2D number passed up |
| `CarryCode` | 59 | One row per typed carry code |
| `Fighter` | 12 | Customers/agents (No, Name, Commission, Rate) |
| `Owner` | 6 | Upstream dealers (No, Name, Commission, Rate) |
| `LuckyNo` | 2 | Draw results (BetDay, AmPM, 2DNo, 2DNoR) |
| `AMKno` | 0 | Second draw-number list (same shape as LuckyNo) |
| `Auto` | 0 | Materialised auto-bet detail rows (empty — no live autos) |
| `AutoCode` | 0 | Auto-bet definitions (empty) |
| `Calc` | 1 | Global defaults: Limit 40000, Commission 16, Rate 80 |
| `CloseDays` | 0 | Closed dates (marker list) |
| `Digit` | 100 | Numbers 00–99, Amount (all 0 in live DB) |
| `Group` | 465 | Named pattern packs (GroupCode, 2DNo, Amount, Sno) |
| `GroupCode` | 61 | Group names (incl. odd saved codes: `*`, `**`, `*/`, `-/`, `/*`, `//`, `/0`…`/9`, `0*`…`9*`, `0/`…`9/`, `0+`…`9+`, `N`, `WN`, `16*500`, `0/pwnn`…) |
| `Limit` | 28 | Temp over-limit list (rebuilt by `cmdGroup`) |
| `Main` | 11 | Snapshot of the 00–99 board (C1…C20 = number/amount pairs × 10, plus totals row) |
| `Reverse` | 45 | Reverse pairs (LNo ↔ RNo, e.g. 01↔10) |
| `Template` | 66 | Message snippets (Myanmar + English) |
| `Ten` | 2,000 | Week table W 1–2000 (2012-01-01 → 2050-04-30) |
| `tmpBet` | 20 | Seed rows for quick entry: PAR twins 00,11,…,99 at 100 (CodeNo `//`) + POW set 05 50 16 61 27 72 38 83 49 94 at 100 (CodeNo `**`) |
| `tmpCarry` | 10 | Seed rows: PAR twins 00,11,…,99 at 50, CodeNo `//` |
| `tmpCReport` | 0 | Temp carry print (2-column layout) |
| `tmpCReportSingleCol` | 0 | Temp carry print (single column) |
| `tmpLReport` | 10 | Temp ledger print (board snapshot, C1…C20) |
| `bResult` / `cResult` | 0 / 0 | Typed-dataset result tables (filled at runtime by the §7.1 query; also the physical tables are empty) |
| `bRange` / `cRange` | 125 / 42 | Pre-built range-report snapshots (stale, from 2020-04) |
| `UserLogin` | 1 | Single login row (plaintext `9797`) |
| `ActivationKey` | 1 | Activation key + trial counter (51) |
| `SystemAdmin` | 1 | `LedgerEdit = 0` |
| `HighLightColor` | 1 | ARGB 255,0,255,255 (cyan highlight) |
| `Expense` | 0 | Expense lines (unused) |
| `~TMPCLP620591` | 0 | Jet temp table (ignore) |

### 9.2 Key schemas (from `mdb-schema`; types are Access/Jet)

- `Bet (BetDay DateTime, AmPM Text(50), BetDateTime Text(50), CustomerNo Text(50), 2DNo Text(50), Amount Long, Commission Single, Rate Long, 2DCode Text(50), CodeNo Text(255), Sno Long, GroupID Long, Edited Long)` — `Carry` identical with `OwnerNo` instead of `CustomerNo`.
- `BetCode (BetDay, AMPM, BetDateTime, CustomerNo, 2DCode Text(50), Amount Text(50), Commission Single, Rate Long, CodeNo, Sno, RowTotal Long, GroupID, Edited, AutoCode Text(255), AutoSNo Long, AutoGroupID Long)` — note `Amount` is **Text** here but **Long** in `Bet`. `CarryCode` is the same shape minus the three `Auto*` columns.
- `Auto (BetDay, AMPM, BetDateTime, CustomerNo, 2DCode, Amount Text(50), Commission, Rate, CodeNo, Sno, RowTotal, GroupID, Edited, AutoCode, AutoSNo, AutoGroupID)`.
- `AutoCode (AutoSno Long, CustomerNo, AutoCode, CodeNo, Amount Text(255), StartBetDay DateTime, StartBetTime Text(50), EndBetDay DateTime, EndBetTime Text(255), BetDateTime Text(50), AutoGroupID Long, AutoGroupTotal Long, CodeNoHidden Text(255))`.
- `Fighter (Sno Long, FighterNo Text(50), FighterName Text(50), Commission Single, Rate Long)`; `Owner` same with `OwnerNo`/`OwnerName` (255).
- `LuckyNo / AMKno (BetDay DateTime, AmPM Text(50), 2DNo Text(50), 2DNoR Text(255))`.
- `Limit (Sno Long, No Text(255), OverHidden Text(255), CodeNo Text(255), RowTotal Long, Over Text(255))`.
- `Group (GroupCode Text(255) NOT NULL, 2DNo Text(255) NOT NULL, Amount Text(255), SNo Long)`; `GroupCode (GroupCode Text(255) NOT NULL)`.
- `bResult (BetDay, AMPM, CustomerNo, BetDateTime, Amount Long, Pay Long, Commission Single, Rate Long, LuckyNo Text(255), LuckyAmt Long)` — physical columns differ from the runtime query columns (WinNo/WinAmt/NetAmount are query aliases); `cResult` mirrors it with `OwnerNo`/`Get`.
- `bRange / cRange (BetDay, AMPM, CustomerNo/OwnerNo, Amount, Commission, Rate, WinNo, WinAmt, NetAmount)` — all Long except Commission (Single).
- `Calc (Limit Long, Commission Single, Rate Long)`; `CloseDays (CloseDay DateTime NOT NULL)`; `Digit (2DNo Text(50), Amount Long)`; `Reverse (LNo Text(50), RNo Text(50))`; `Template (TemplateNo Long NOT NULL, TemplateName Text(255))`; `Ten (W Long, Dfrom DateTime, Dto DateTime)`; `UserLogin (UserID Long NOT NULL, Password Text(255), Type Long, UserCode Text(255))`; `ActivationKey (ActivationKey Text(255), Times Long)`; `SystemAdmin (LedgerEdit Long)`; `HighLightColor (ColorA/R/G/B Long)`; `Expense (Sno Long NOT NULL, Particular Text(255), Amount Long)`; `tmpBet/tmpCarry (2DNo, Amount Long, 2DCode, CodeNo)`; `tmpCReport (Sno Long NOT NULL, 2DCode, Amount, TotalAmount Long, 2DCodeT, AmountT, TotalAmountT Long)`; `tmpLReport (Sno, C1 Text, C2 Long, … C19 Text, C20 Long)`; `Main (C1…C20 Text(50))`.

**No foreign keys, no indexes** (other than the implicit ones mdbtools reports) — relationships are by convention only:
`Bet.Sno = BetCode.Sno` (one code → many numbers); `Bet.GroupID = BetCode.GroupID` (one save = one group); `Auto.AutoSno = AutoCode.AutoSno`; `Auto.AutoGroupID = AutoCode.AutoGroupID`; `Bet.CustomerNo = Fighter.FighterNo`; `Carry.OwnerNo = Owner.OwnerNo`; `Bet.BetDay+AmPM+2DNo = LuckyNo.BetDay+AmPM+2DNo`.

### 9.3 Live data snapshot (verified from `simple.mdb`)

- **All live transactional data is a single day: 2024-04-11.** Bet 1,975 rows (AM 1,222 / PM 753), total **5,192,540** (AM 2,901,140 + PM 2,291,400). Carry 103 rows, total **1,714,760**.
- **Draw 2024-04-11:** AM **62** (reverse 26), PM **82** (reverse 28).
- Win check (formula §7.1): AM bets on 62 = 6,450 → payout 516,000; bets on reverse 26 = 6,150 → **not paid**. PM bets on 82 = 5,750 → payout 460,000; reverse 28 = 6,250 → not paid. Carry had **0** on either winning number.
- Worked example — Fighter `12`: AM 90 rows, 55,000, no win → Net 46,750 (= 55,000 − 15%). PM 142 rows, 51,950, WinAmt 250 → Net 24,157.5 (= 51,950 − 7,792.5 − 20,000).
- Fighters appearing in bets that day: `00, 000, 1, 8, 9, 10, 11, 12` (8 of 12). Owners in carry: `1, 3, 4, 5` (4 of 6).
- **FighterName and OwnerName are all empty** in this DB — people are identified by number only. No personal names, phone numbers, or addresses are present in the data. (Customer numbers are business identifiers, not personal data.)
- `Limit` table (28 rows, stale snapshot): top over-limit number `72` — `OverHidden "2800/2500"`, RowTotal 5300.
- `bRange`/`cRange` are stale snapshots from **2020-04-20/23** (e.g. bRange 2020-04-23 AM Fighter `3`: Amount 24,342, Net 20,447).
- `BetHidden`/`BetCodeHidden` are stale rows from **2014-02-11** (commission/rate 0).
- **Data anomaly:** Fighter `3` has `Rate = 80250` (all others 80) — almost certainly a typo (80 + "250"?). Confirm with the user; do not migrate blindly.
- `Digit.Amount` is 0 for all 100 numbers (the per-number running table is zeroed; the live board is computed from `Bet`/`Carry`, not from `Digit`).
- `tmpBet`/`tmpCarry` hold PAR twins (00, 11, …, 99) at 100 / 50 with CodeNo `//` — seed rows for quick entry.
- `Template` texts are Myanmar/English chat snippets (e.g. `ထိပ္(10)ကြက္` "first 10", `ဘရိတ္(10)ကြက္` "break 10", `အပူး(10)ကြက္` "twins 10", `Please Copy`, `KQ BUY`, `Total = `, `*Final*`, `http://www.settrade.com/settrade/#/home`).

### 9.4 `simple.tmp` — what it is

- Same schema (35 tables, JET4), 1.1 MB, dated **2022-02-13** (vs `simple.mdb` 7.6 MB, 2024-04-14). Different data: `Bet`/`BetCode`/`Carry`/`CarryCode`/`Fighter`/`Owner`/`LuckyNo` are all **0 rows**; reference tables (`Digit`, `Group`, `Limit`, `Reverse`, `Template`, `Ten`, `Main`, `bRange`/`cRange`) are intact; `GroupCode` has 60 rows vs 61 in the MDB.
- Explanation: on clean exit the app compacts `simple.mdb` **into** `simple.tmp` and then renames it over `simple.mdb` — so a leftover `simple.tmp` should not normally exist. This one is a **stale leftover from an earlier (2022) state** — most likely the compact target left behind after an unclean exit, or a blank/template DB from an older install. It is **not a backup** and must **not** be treated as one. The live data is in `simple.mdb` only.
- The 1-row difference in `GroupCode` (60 vs 61) is consistent with it being an older copy.

---

## 10. Reports (all `.rdlc`, embedded resources)

Result reports all use the §7.1 query via `bResult`/`cResult` adapters; code reports use `BetCode`/`CarryCode`; ledger/carry prints use the temp tables.

| Form (menu) | Period / filter | Dataset / query | .rdlc | Columns / totals |
|---|---|---|---|---|
| `ReportNow` (Current) | current session (`xBetDay` + `xAMPM`) | `bResult.Fill(day, AMPM)` + `cResult.Fill(…)` | `rptNow` | Two tables (Fighter, Owner): Bet Date Time, person no., Amount, Lucky No (WinNo), Win Price (WinAmt), Com, Rate, Net Amount (`=Round(NetAmount,0)`); totals `=sum(Amount)`, `=round(sum(NetAmount),0)`. Header typo "Net Amountt" in the .rdlc |
| `ReportToday` (Daily) | whole current day (AM+PM) | `bResult.FillBy(day)` + `cResult.FillBy(…)` | `rptToday` | Same as Now, plus `=sum(WinAmt)` in totals |
| `ReportWeek` (Weekly) | `iFrom`–`iTo` (Sun–Sat week, or plain range from `Range` form) | `bResult.FillBy1(from, to)` + `cResult.FillBy1(…)` | `rptRange` (**not** `rptWeek` — that file exists but no form references it) | Same columns/totals as Range |
| `ReportRange` (Range AMPM) | pre-built `bRange`/`cRange` for `iFrom`–`iTo` (+ AM/PM edge trim) | `FillBy3()` on both adapters; load is deferred via a 1-second `Timer2` (1st tick skipped, 2nd tick fills + refresh) | `rptRange` | Bet Date Time, Amount, Win No, Win Price, Com, Rate, Net Amount; totals `=sum(Amount)`, `=sum(WinAmt)`, `=round(sum(NetAmount),0)`; both tables |
| `ReportRangeUpToDate` (Up to Date) | pre-built range, **single Fighter only** | `FillBy3()`, same Timer2 trick | `rptRangeUpToDate` | Same as Range, header "Fighter" — but the Owner table is bound to `cRange`, which `RangeUpToDate` never populates, so it is always empty (bug) |
| `ReportSelectedF` (Selected) | all dates, one Fighter (`xF`) | `bResult.FillBy2(xF)` only | `rptSelectedF` | Same columns/totals, Fighter table only |
| `ReportSelectedO` (Selected) | all dates, one Owner (`xO`) | `cResult.FillBy2(xO)` only | `rptSelectedO` | Same, Owner table only |
| `ReportBetCode` (from Bet form) | one BetDay + AM/PM + CustomerNo | `BetCode.Fill(day, AMPM, cust)`: `SELECT … FROM BetCode WHERE (BetDay=?) AND (AMPM=?) AND (CustomerNo=?)` | `rptBetCode` | Detail lines: `#` (`=Rownumber("xGroupID")`), No (`ID2DCode`), Amount, BetDateTime; Grand Total `=sum(RowTotal)` |
| `ReportCarryCode` (from Carry form) | one BetDay + AM/PM + OwnerNo | `CarryCode.Fill(day, AMPM, owner)` (a `BetCodeTableAdapter` is also instantiated but never used) | `rptCarryCode` | Same layout as BetCode, header "Carry", title also "Bet by Customer" (copy-paste) |
| `tmpCReport` (Print Carry) | current Carry grid `gO` | `SELECT Sno, [2DCode], Amount, TotalAmount, [2DCodeT], AmountT, TotalAmountT FROM tmpCReport ORDER BY Sno` | `rptCReport` (+ `rptCReportSingleCol` variant) | Two-column carry slip (pairs of rows side by side) |
| `tmpLReport` (Print Ledger) | current 00–99 board | `SELECT Sno, C1…C20 FROM tmpLReport ORDER BY Sno` | `rprLReport` | Full 00–99 ledger board |

Unused/legacy: `rptWeek.rdlc` and `rptRangeAMPM.rdlc` exist on disk but no form references them. The `.rdlc` field lists also contain unused legacy fields (`ID3DCode`, `DRate`, `TRate`, `Edited`) — 3D support was designed but the queries only ever fill the 2D fields.

---

## 11. Quirks, bugs & traps (preserve-or-fix deliberately)

1. **Hidden book:** `betHidden`/`betcodeHidden` are a parallel ledger; Bet's Hidden-mode row-delete and edit-save hit the **normal** tables (bug).
2. **Edit-save ordering:** `betcode`/`carrycode` UPDATE runs *before* the `xCalc` error check — a failed save leaves `betcode` updated but `bet` stale.
3. **No transactions:** a failed multi-row save leaves earlier groups saved; only the current group is deleted on error.
4. **UpToDate win subtraction** uses `xFrom` where `xUpToDate` was intended; Carry's current-total query uses `BetDay >=` where Bet uses `=`.
5. **Carry `LoadDetail`** per-group query has **no betday/ampm filter** (relies on `GroupID` being globally unique).
6. **RangeUpToDate never populates `cRange`** — the Owner half of that report is always empty.
7. **LuckyNo AMK delete** wipes the whole `AMKno` table (unqualified `delete from AMKno`).
8. **Limit display loop** starts at row index 1 — the first row of each of the three groups is skipped in the grid and subtotal (possibly a decompiler artefact — verify).
9. **AutoEdit PM delete branch** overwrites the first Bet-delete string before executing (possible decompile artefact — verify).
10. **AutoEdit bulk percent edit** shows no SQL UPDATE in its handler — whether the change persists is unverified.
11. **Template first-insert** on an empty table would use `TemplateNo = 0` (`MAX()+1` is NULL).
12. **Single-click on the Bet/Carry grid silently copies a group to the clipboard** (easy to trigger accidentally).
13. **Bet edit-save writes `BetDay` as a full date-time string** while loaders use `Y/M/D` (inconsistent date literal formats across the codebase).
14. **`gValuePlus` non-reverse `/` branch SETS the board cell to the first amount instead of adding** (likely bug).
15. **Carry `cmdEditCancel`** doesn't hide the edit popup (relies on the LostFocus handler); Bet's does.
16. **`viewSelected` click handler** reads `gT[2]`, `gT[4]`, `gT[7]` but `gT` has only 2 columns — likely throws at runtime.
17. **Fighter `3` rate = 80250** (data anomaly, §9.3).
18. **`Register` menu starts disabled** and is never re-enabled; `Close` menu item has no handler; Bet's `cmdPrint` is invisible; Limit's `cmdPrint` is an empty method.
19. **CloseDays is not enforced** anywhere except the Auto generator — closing a day does not block entry.
20. **Login is unreachable; activation is never checked** (§8) — the shipped build runs without any login or licence.
21. **Dates:** `#yyyy/M/d#` literals with no zero-padding; `BetDateTime` is a locale-dependent string, not a typed datetime.
22. **`Sno`/`GroupID` are `MAX()+1`** — no identity columns; not safe under concurrency (fine for single-user, must be replaced by proper keys in the rebuild).
23. **`0+5` (5-SKIP) double-counts:** its 20-element expansion list is the same 10 numbers twice (05 16 27 38 49 50 61 72 83 94, repeated) — a reverse of a difference-5 pair is itself a difference-5 pair. The save loop inserts one `Bet` row per list entry, so each of the 10 numbers gets **two** rows of the typed amount (total still = amount × 20).

---

## 12. What could NOT be recovered

- **Original VB source, comments, and the `.sln`/project structure** (only the compiled assembly + PDB names survive; ILSpy output is a faithful reconstruction, not the original).
- **WinForms visual layout** beyond what `InitializeComponent` encodes (positions/sizes/fonts are in the decompile; the exact look, tab order polish, and any runtime-only styling are not).
- **The exact number lists for a few `xCalc`-only branches** (single-digit `d` "break" sets are transcribed in §5.2; the `+/d` / `-/d` sets follow the rule in §5.1). All lists live in `ModTran.xInput`/`xCalc` (`~/workspace/2d-rebuild/decompiled/_Simple/ModTran.cs`) and must be copied verbatim during the rebuild.
- **Whether `cmdSaveO` (Carry save) differs from `cmdSaveF` in any detail** — not read line-by-line; assumed parallel.
- **Whether the AutoEdit percent-edit persists** to the DB (no UPDATE found in the handler).
- **The business meaning of a few UI labels** (`T =`, `OK Thanks`, `AMKno` vs `LuckyNo`, the `Main` board snapshot's purpose beyond printing, `SystemAdmin.LedgerEdit`) — only the operator can confirm.
- **Whether the `Hidden` book is still used** in practice (its rows are from 2014).
- **Runtime behaviour** — the app was never executed (no Windows/.NET Framework here); all findings are from static decompilation + database inspection. A few apparent bugs may be decompiler artefacts; the flagged ones above should be re-checked by running the original or by asking the operator.
- **3D support** — field names (`ID3DCode`, `DRate`, `TRate`) exist in the reports/dataset, but no 3D logic or data was found. It looks designed-but-never-built.

---

## 13. Rebuild notes (for the Web + mobile version)

Decisions the operator (moez) still needs to make — **ask before building**:

1. **Scope:** reproduce all 37 forms, or the core loop first (enter bets/carry → board → limit/pass-up → LuckyNo → settlement reports)? Recommend: core loop first, then Auto/Groups/Templates/UnitSales, then the long tail of reports.
2. **Users/roles:** single operator (like now — no login), or dai + staff with separate logins? The old app has no working login; DO2-Hti's dai/staff + PIN model is a natural fit if he wants one.
3. **Licensing:** drop the CPU-key activation (recommended — it is dead code), or keep some form of it?
4. **Data migration:** import `simple.mdb` (fighters, owners, groups, templates, and the 2024-04-11 day) or start fresh? Note the Fighter `3` rate anomaly (80250) and the empty names.
5. **Hidden book:** keep the `BetHidden` parallel ledger, or drop it?
6. **Limit behaviour:** keep it as flag-only (current behaviour), or make it actually block over-limit entry in the rebuild?
7. **Offline:** the old app is fully offline on one PC. Web + mobile needs a sync story — same pattern as DO2-Hti (local DB + WiFi sync server) or a cloud backend like Web POS (MongoDB)? Decide before building.
8. **The code language is the spec:** §5 is the expansion table the rebuild must implement exactly (including `a-b`/`funcLeftRight`, the `/` split amounts, and the `vOneNo`/`vTwoNo` exclusions). All sets are transcribed in §5; the authoritative source is `~/workspace/2d-rebuild/decompiled/_Simple/ModTran.cs` (`xInput` / `xCalc`).
9. **Formulas to preserve exactly:** §7.1 settlement, §7.4 dashboard, §6 limit merging (`a/b` = excess on number / excess on reverse), and the sign conventions (Bet `You` is flipped, Carry is not).
10. **Clipboard/text outputs are features, not leftovers:** `T=`, `No.(n)-d.M AM/PM`, `2DCode=Amount` lines, `OK Thanks`, templates — the operator pastes these into chat daily. The rebuild needs the same one-tap copy outputs (and the Template snippet store).

### Suggested data model for the rebuild (derived from §9)

`fighters(id, no, name, commission, rate)` · `owners(id, no, name, commission, rate)` · `bets(id, bet_day, session, person_type, person_no, number, amount, commission, rate, code, code_no, sno, group_id, edited)` · `bet_codes(id, bet_day, session, person_type, person_no, display_code, amount, commission, rate, code_no, sno, row_total, group_id, edited, auto_code, auto_sno, auto_group_id)` · `lucky_numbers(bet_day, session, number, number_reverse)` · `auto_codes(…)` + `autos(…)` · `groups / group_codes` · `templates` · `limits` (computed, not stored — or stored snapshot) · `close_days` · `settings(limit, commission, rate)` · `users` (hashed passwords, roles). Keep `sno`/`group_id` as migrated values for history, but use real auto-increment/UUID keys going forward.

---

## Appendix — sources & method

- Input: `~/workspace/user/files/2D.zip` → `Easy2/Easy.exe` (1,572,864 bytes, v1.0.0.8, 2020-04-26), `simple.mdb` (7,618,560 bytes, JET4, 2024-04-14), `simple.tmp` (1,138,688 bytes, 2022-02-13).
- Tools: .NET SDK 8.0.427 + .NET 6.0.36 runtime, ILSpy `ilspycmd` 8.2.0.7535 (`~/workspace/2d-rebuild/decompiled`, 76 files, 44,877 lines); `mdbtools` 1.0.0 (`mdb-tables`, `mdb-schema`, `mdb-export`, `mdb-count`); Python for live-data verification.
- Notes: `apt-get update` hangs in this VM — `mdbtools` was installed from direct `.deb` downloads (`archive.ubuntu.com`, noble `1.0.0+dfsg-1.2ubuntu1`); the .NET SDK was installed with the `dotnet-install` script (note: `/tmp` is a 512 MB tmpfs — the SDK download must use `TMPDIR` under `/home`, and the tar extraction reports benign ownership errors but still installs).
- Per-form analysis was done by three parallel readers (Bet/Carry; LuckyNo/Limit/Group/Template/AutoCode/AutoEdit; MDIMain/reports/login/misc) plus direct reads of `ModTran.cs`, `ModOleDb.cs`, `MDIMain` entry/save/limit/profit code, the typed `TableAdapter` SQL, and the `.rdlc` field lists. Formula checks were verified against the live 2024-04-11 data (§9.3).
- No code was executed; no rebuild was started; nothing was pushed to GitHub.
