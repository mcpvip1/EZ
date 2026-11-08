# easy2d-shared

Shared core logic for the EASY 2D lottery rebuild — plain TypeScript, zero
dependencies. This is the single source of truth for the rules that the web
and mobile apps both import; do not duplicate these rules in either app.

Source of truth: `~/workspace/2d-rebuild/ANALYSIS.md` (§5–§7, §9.3) and the
decompiled original, `~/workspace/2d-rebuild/decompiled/_Simple/ModTran.cs`
(`xInput` / `xCalc`) and `MDIMain.cs` (entry, `xLimit`, `xLimitNo2Code`,
`xProfit`, save-clipboard). The live entry path uses `xInput` for
validation/totals and `xCalc` for the expanded number list; where the two
differ, the `xCalc` expansion is used (see "Divergences").

## Build & test

```sh
npm install   # typescript + @types/node (dev only)
npm test      # tsc build, then node --test dist/*.test.js
```

`package.json`: `main`/`types` point at `dist/index.js` / `dist/index.d.ts`.
Tests live next to the source (`src/*.test.ts`, `node:test` + `node:assert`).

## API

| Export | Where | What |
|---|---|---|
| `Session`, `Side`, `ExpandedNumber`, `ExpandResult`, `BetRow`, `SettleResult`, `CalcSettings`, `DashboardResult`, `OverLimitRow`, `ClipboardCode` | `types.ts` | Contract types |
| `expandCode(code, amountText): ExpandResult \| null` | `expand.ts` | Expand one typed code + amount; `null` = invalid (silent reject, like the original) |
| `expandEntryList(input, amountText): ExpandResult[]` | `expand.ts` | Space-separated list entry (see below) |
| `reverseNo(no)`, `pad2(n)` | `expand.ts` | Digit swap (`12`→`21`); zero-pad to 2 digits |
| `settlePerson(rows, luckyNo, commission, rate)` | `settle.ts` | §7.1 settlement: Amount / WinAmt / CommissionAmount / GrossAmount / NetAmount |
| `settlePersonClipboard(rows, luckyNo, commission, rate, side)` | `settle.ts` | `You=(+)…` / `You=(−)…`; Bet flips the sign, Carry does not |
| `dashboard(betTotal, carryTotal, luckyBetWin, luckyCarryWin, calc)` | `settle.ts` | §7.4 status grid + `netPLRed` flag |
| `roundHalfEven(n)` | `settle.ts` | VB/C# `Math.Round` — halves to the even neighbour |
| `computeBoard(betRows, carryRows): number[]` | `board.ts` | Length-100 board, cell = SUM(bet) − SUM(carry) |
| `computeOverLimit(board, limit)` | `board.ts` | Over-limit rows, sorted by excess desc, merged |
| `mergeOverLimit(rows)` | `board.ts` | Reverse-pair merge (`a/b` or `NN R`, see below) |
| `roundUpToTen(n)` | `board.ts` | `cmdGoTens` rounding: 2801→2810, 2800→2800, 5→10 |
| `clipboardBetText(codes, total, personNo, betDay, session)` | `clipboard.ts` | Save clipboard for a Fighter |
| `clipboardCarryText(codes, total, personNo, betDay, session)` | `clipboard.ts` | Save clipboard for an Owner |
| `CALC`, `FIGHTERS`, `OWNERS`, `DIGITS`, `TEMPLATE_SNIPPETS` | `seed.ts` | Seed data from the live `simple.mdb` |

Helpers also exported (used by the tests to cross-check the rule-generated
sets): `BREAK_SETS`, `LEFT_RIGHT_MAP`, `skipSet`, `containingSet`,
`slashDigitSet`, `frontSeries`, `backSeries`, `codeConvertC2N`.

## The code language (expand.ts)

Named patterns (display in brackets): `a` [S-B], `z` [B-S], `q` [1-SKIP],
`++` / `--` / `+-` / `-+` (25 each), `//` [PAR], `**` [POW], `*/` [BRT],
`/*` [ZOD], `pz` [PZ], `+//`, `-//` (5 each), `pn` [P-N], `2+6` [2(+)6],
`n` [NAM], `0+2`…`0+9` [k-SKIP, 20 each], `+/0`…`+/9` [02468/d+],
`-/0`…`-/9` [13579/d+].

Digit patterns: `NN` single; `NN+` / `NN@` reverse pair [NN R];
`d+` [d LP, 19 numbers containing d]; `d/` [d F-, d0–d9]; `/d` [d B-,
0d–9d]; `d*` / single `d` [d BK, digit-sum "break" set, see divergences];
`a-b` cross of the `funcLeftRight` digit sets (e.g. `1-2` → `168/2749`,
12 numbers); `a/b` cross-product (`12/34` → 13,14,23,24) and `a/b+`
(both directions); `NNN…+` ordered pairs of distinct digits
(`123+` → 12,13,21,23,31,32); `NNN…++` all ordered pairs (`123++` →
11,12,13,21,22,23,31,32,33). Exclusion patterns `PATTERN-NN` (len 5) and
`PATTERN-NNMM` (len 7) expand the pattern minus the excluded number(s);
the excluded number(s) must belong to the pattern (`xCheckValidNo`),
otherwise the code is invalid (e.g. `++-22` ok, `++-12` invalid).

Amounts: plain `v` → each number gets `v`, row total `v × N` (banker's
rounded). Split `a/b` is only for reverse pairs: first number `a`,
reverse `b`, total `a+b`; any other code with a split amount is invalid
(the original throws in `ToDouble("a/b")` / hits the `n.Contains("/") &
v.Contains("/")` guard). Empty or `0` amount is invalid. Code chars are
validated against `0-9 + - * / . p z space a q n @` (case-insensitive,
lowercased first).

**The 0+5 quirk, preserved as-is:** `0+5` (5-SKIP) expands to the same 10
numbers twice — `05 16 27 38 49 50 61 72 83 94`, then
`50 61 72 83 94 05 16 27 38 49` — so each number gets **two** Bet rows of
the typed amount (row total still amount × 20). This is the literal list
from `xInput`/`xCalc`, not a bug in this package.

## Space-separated lists (expandEntryList)

Mirrors the `MDIMain` entry handler, including its quirks:

- Only when the input is longer than 4 chars **and** contains a space;
  otherwise it is a single code.
- Trailing `+` on the whole input appends `+` to each non-twin token
  (twin = first two chars equal). A trailing `+` combined with a split
  `a/b` amount rejects the whole entry.
- A 3-char token displays as `NN R`.
- Split amount: a twin token takes the first part, others take `a+b` as
  row total.
- **Row-total quirk:** in list mode the grid row total is the typed
  amount (×2 for a reversed non-twin), **not** amount × number-of-numbers
  — e.g. `//` at 100 has row total 100 while its 10 Bet rows sum to 1000.
  `numbers[]` still carries the full expansion with per-number amounts, so
  the board/save side stays correct. The original's `BetCode.RowTotal` has
  the same mismatch.
- The original list path does no per-token validation; tokens that do not
  expand (e.g. `123`) are kept as rows with an empty number list.

## Settlement, board, limit

- `settlePerson`: win is an **exact** LuckyNo match only — the reverse
  never wins. `NetAmount = Amount − CommissionAmount − GrossAmount`.
  Verified against ANALYSIS §9.3 (Fighter 12, 2024-04-11: AM 55,000 no win
  → 46,750; PM 51,950, WinAmt 250 → 24,157.5; AM draw 62: 6,450 → 516,000;
  PM draw 82: 5,750 → 460,000; reverses 26/28 pay nothing).
- `computeOverLimit` reproduces the live `Limit` table's top row:
  number 72 over `2800/2500`, row total 5300.
- `mergeOverLimit`: different excesses → one row, `over`/`overHidden` =
  `"a/b"`, `rowTotal = a+b`; equal excesses → one row `"NN R"`, `codeNo`
  gets `+`, `rowTotal = 2 × excess`. That is why `OverLimitRow.over` is
  `number | string` (the task's sketch said `number`; the merged `"a/b"`
  form needs the string). Merge order: excess descending, ties by number
  ascending (the original's grid sort leaves ties unspecified).
- `dashboard`: payout and netPL are 0 when sales == carry; `netPLRed` is
  true when grossProfit < payout (compared on the un-zeroed payout, as in
  `xProfit`).

## Clipboard

- Bet (`clipboardBetText`): Fighter `1` gets just `T=<total>`; others get
  `2DCode=Amount` lines + `` `No.(n)-d.M AM/PM `` + `T=<total>`.
- Carry (`clipboardCarryText`): Owner `0` gets the lines + `Total=<total>`
  (+ trailing newline); others get the `` `No. `` line + `Total=<total>` +
  a trailing `` `Q `` line.
- Lines end with `\r\n`, exactly as the original `Clipboard.SetText`.
- `settlePersonClipboard` renders `You=(+)…` / `You=(−)…` (U+2212 minus,
  per the rebuild spec; the original VB code uses ASCII `-`).

## Seeds

`CALC = { limit: 40000, commission: 16, rate: 80 }`. Fighters: 12 rows,
all commission 15 / rate 80; owners: 6 rows, commission 14 / rate 80;
names are empty in the live DB. **Fighter `3` is 80250 in the live DB
(almost certainly a typo for 80) — seeded as 80; do not migrate 80250
blindly.** Templates: only the 9 documented examples (TemplateNo 5–9,
11, 21, 24, 55), byte-verified against the MDB — including the U+200B
zero-width space inside TemplateNo 9's `နကၡတ္(10)ကြက္`. Nothing invented.

## Divergences from ModTran.cs (xInput / xCalc)

Read these before "fixing" anything — each is deliberate and tested:

1. **`xInputOriginal` vs `xInput`:** the `0+k` skip sets differ. The old
   function lists only 10 numbers with total ×6; the live `xInput` (and
   `xCalc`) list 20 numbers with total ×20. We follow the live one.
2. **`xCalc` does not set `x2DTotal`** for `++`/`--`/`+-`/`-+`, `//`,
   `**`, `*/`, `/*`, `pz`, `+//`, `-//` (it only builds `vNo[]`); totals
   come from `xInput`. Our `rowTotal` follows `xInput`.
3. **Single digit `d`:** neither `xInput` nor `xCalc` has a length-1
   branch — a lone digit is rejected by the original. ANALYSIS §5.2/§12
   and the rebuild spec assign it the digit-sum "break" set, so
   `expandCode('0', …)` returns that set. Flagged, not a bug in this port.
4. **`NN@`:** no `@` handling exists in `xInput`/`xCalc` (only
   `xInputReverse` converts display `" @"` → `"+"`, and `@` is not
   typeable in the original code box). The rebuild spec lists `NN@` as a
   reverse form, so we accept it.
5. **Two-char non-digit codes** (e.g. `an`): `xInput`'s 2-char branch
   accepts any two non-operator chars, which then crashes the original's
   board update (`ToDouble("a")`). We require digits and return `null`.
6. **`0+5`:** the list is the same 10 numbers twice (see above) — copied
   verbatim from `xInput`/`xCalc`, including the rotated second half.
7. **`xCalc` single-digit and `NN@`:** no branches (see 3, 4) — the
   expansion lists in `xCalc` otherwise match `xInput` exactly, including
   all break/LP/skip lists (verified by the tests against the literals).
8. **Save-time `vOneNo`/`vTwoNo` exclusions:** `xCalc` returns the *full*
   pattern list and the save/board loops skip the excluded number(s); we
   return the filtered list directly, which is equivalent for consumers.
9. **Rounding:** row totals, dashboard 0-decimal figures and the `You=`
   value use banker's rounding (`roundHalfEven`), matching C#/VB
   `Math.Round` / `FormatNumber`.

## Guesses (things the original leaves to the database or the UI)

- **Clipboard `` `No.(n) `` group number:** the original reads it from
  the DB (count of groups for that person/day/session + 1). This pure
  package has no DB, so `clipboardBetText`/`clipboardCarryText` emit `n =
  1`. The app layer should substitute the real sequence (a future
  revision should take it as a parameter).
- **`betDay` parsing:** ISO `YYYY-MM-DD` preferred; `D/M/YYYY` accepted;
  anything else falls back to `Date` parsing, then today. The original
  uses `DateAndTime.Now` (today), not the working day.
- **`OverLimitRow.over` type:** `number | string` (see above).
- **Merge tie order:** excess desc, then number asc (original unspecified).
- **Negative `You=` sign:** U+2212 `(−)` per the rebuild spec; the
  original uses ASCII `(-)`.
- **`cmdGoTens` "/" rounding** (per-part round-up, equal parts collapse
  to an `R` row) is **not** implemented as a function — only the
  `roundUpToTen` primitive is; the `/` handling lives in the pass-up flow
  the app layer will build on top of `computeOverLimit`.
- `expandCode` lowercases the code (the original lowercases the box) and
  trims both inputs; display codes are the canonical forms from `xInput`.
