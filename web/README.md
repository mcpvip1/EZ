# EASY 2D — web app

Faithful web rebuild of the EASY v5.5.1 2D lottery bookkeeping app
(VB.NET WinForms + Access, see `../ANALYSIS.md` §3–§7). React + Vite +
TypeScript + Tailwind 3, offline PWA, IndexedDB local-first, no login
(single operator, as in the original). No backend dependency.

## Run

```sh
npm install
npm run dev      # http://localhost:5174
npm run build    # tsc + vite build -> dist/
npm run preview  # serve the production build
```

## Screens

- **Board** (default): date picker + AM/PM toggle, Fighter (Bet) entry
  left, Owner (Carry) entry right, live 00–99 board centre (cell =
  SUM(bet) − SUM(carry); yellow over the editable limit, default 40000),
  over-limit list with Pass All / Pass One / Pass Rounded-to-Tens /
  Back, Save Bet / Save Carry (confirm dialog, clipboard summary copied
  on save), and the §7.4 status dashboard (Limit / Times / Sales /
  Carry / Net Sales / % / Gross Profit / Rate payout / Net P/L, red if
  negative).
- **LuckyNo**: enter the winning 2D number (exactly 2 digits — the
  original had no validation and would crash on 1 char; fixed here),
  reverse shown and stored but never pays; past draws list; "Old No"
  copies past winners as reverse bets into the Fighter entry.
- **Reports**: Current / Daily / Weekly (Sun–Sat) / Range (from/to +
  AM/PM edges) / Selected (one Fighter or Owner, all dates). Fighter +
  Owner tables: Amount, WinNo, WinAmt, Com, Rate, NetAmount, with
  totals. Print button.
- **People**: Fighter + Owner master data (No, commission %, rate —
  editable inline; add / delete with confirm). Fighter 3 rate is 80;
  the 80250 in the old database was a typo and is not used.
- **Templates & Groups**: tap a template to copy it to the clipboard;
  tap a group pack to replay its codes into the Fighter entry at a
  chosen per-code amount (expansion via the shared `expandCode`).
- **Backup**: Export JSON (all data) / Import JSON (merge by id, latest
  `updatedAt` wins) / "Load 2024-04-11 test fixture" (§9.3 only) /
  "Verify §9.3 numbers".

## Data

- Default state: **no bets**. Only fighters/owners/templates/groups/
  calc are seeded (from `src/seed.json`, a copy of `../seed/seed.json`).
- Storage: IndexedDB database `easy2d` — stores `people`, `codes`
  (BetCode/CarryCode), `details` (Bet/Carry), `lucky`, `templates`,
  `groups`, `settings`. Save writes `GroupID = max+1` and `Sno =
  max+1` per row, `BetDateTime` now, and overwrites the person's master
  commission/rate with the on-screen values, as in the original.
- The §9.3 fixture (Fighter 12 AM 55,000 / PM 51,950 WinAmt 250,
  draws 62/82) loads only on demand into the separate date 2024-04-11.

## Shared core — vendored, not rewritten

The task asked for `import from '../../shared/src/index.ts'`. That
relative import fails under this project's `tsc -b` (TS2307) and also
pulls the shared test files (`node:test` types) into the build. So the
shared source is vendored verbatim into `src/shared-vendor/` (7 files,
byte-identical to `../shared/src/*.ts` — no logic rewritten, no test
files copied). If the shared package changes, re-copy those 7 files.
`vite.config.ts` also allows serving from the parent dir (`fs.allow`).

## Deviations from the original (deliberate)

- **LuckyNo validation**: exactly 2 digits required (original crashed
  on a 1-char entry).
- **No login / activation**: the original's login and CPU-key licensing
  were dead code (plaintext password `9797`); dropped, per ANALYSIS §8.
- **No hidden book, Auto bets, Close Days, Unit Sales, Delete form**:
  not in the assigned scope; the core loop (enter → board → pass-up →
  LuckyNo → reports) is complete.
- **Clipboard `No.(n)` group number**: the shared helper emits `n = 1`
  (see `../shared/README.md`); the real per-person sequence is not
  substituted yet.
- **Save clipboard**: shown in a box under the board as well as copied,
  so a failed clipboard permission is visible.
- **Group replay amount**: seed pack rows store amount `"1"` (a
  placeholder in the old DB); the UI asks for a per-code amount
  (default 1000) instead of replaying at 1.
- **Reports use saved data only** (unsaved entry-grid rows are not
  settled until saved).
