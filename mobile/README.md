# EASY 2D — Mobile app

Expo SDK 58 + Expo Router rebuild of the original EASY v5.5.1 VB.NET
2D lottery bookkeeping app, for one operator (no login). Companion to
the analysis in `../ANALYSIS.md` (§3–§7) and the shared core in
`../shared/`.

## Run

```sh
npm install   # use npm, not `npx expo install` (times out in this VM)
npx expo start
npx expo export --platform android   # bundle check
npx expo-doctor                      # dependency/config check
```

Not yet run on a physical phone.

## Screens (Expo Router tabs, `app/`)

| Tab | File | What |
|---|---|---|
| Board | `app/index.tsx` | Date + AM/PM session header (defaults today + clock session), Fighter entry, Owner/Carry entry, live 00–99 board (net = bet − carry, yellow over limit), over-limit list with Pass All / Pass One / Pass Tens, Save Bet / Save Carry (confirm + clipboard text) |
| Lucky | `app/lucky.tsx` | Winning number (exactly 2 digits validated), reverse shown (never wins), upsert per session, past draws |
| Reports | `app/reports.tsx` | Current / Daily / Weekly / Selected tabs, Fighter + Owner settlement tables (`settlePerson`, NetAmount), totals |
| People | `app/people.tsx` | Fighter + Owner lists, edit commission/rate/name, add/delete |
| More | `app/more.tsx` | §7.4 status dashboard, Templates (tap to copy), Groups (tap pack to replay into entry), Backup export/import JSON, §9.3 fixture loader |

## Data

- Persistence: `@react-native-async-storage/async-storage`, one JSON
  document under key `easy2d.db.v1` (`src/types.ts` for the shapes —
  same shapes as the web app: `betCodes`, `bets`, `carryCodes`,
  `carries`, `luckyNos`, `fighters`, `owners`, `settings`, with
  `updatedAt` for sync).
- Seeded on first run from `src/seed.json` (copy of `../seed/seed.json`):
  12 fighters (commission 15%, rate 80 — Fighter 3 is 80, **not** the
  80250 anomaly in the live MDB, see ANALYSIS §9.3), 6 owners (14% / 80),
  Calc limit 40000 / commission 16% / rate 80, 68 templates, 61 groups.
- No transactional bets seeded by default. The §9.3 fixture loader
  (More tab) loads only the worked example — Fighter 12, 2024-04-11:
  AM 55,000 no win (draw 62), PM 51,950 with WinAmt 250 on 82 (draw 82).
  The full 1,975-row day is not in ANALYSIS.md, so it is not faked.

## Shared core — vendored, not reimplemented

Metro cannot reliably resolve `../../shared` TypeScript, so the shared
core is **vendored verbatim** into `src/shared/`:

- `board.ts`, `clipboard.ts`, `expand.ts`, `index.ts`, `seed.ts`,
  `settle.ts`, `types.ts` — copied from `../shared/src/`, excluding
  `*.test.ts`. The expansion/settlement logic is NOT edited here.
  One mechanical adaptation only: the shared files import each other
  as `./types.js` etc. (Node ESM style), which Metro cannot resolve,
  so the `.js` suffix was stripped from relative imports in the
  vendored copies. No logic changed — `diff` against `../shared/src/`
  shows only those import lines.
- **Keep in sync:** when `../shared/src/` changes, re-copy those files
  into `src/shared/` (and re-run the shared tests). The only intended
  difference is the import path (`./shared` instead of the package).

## Save rules (from ANALYSIS §7.3)

- `GroupID = MAX(GroupID) + 1` globally per save; `Sno = MAX(Sno) + 1`
  per row at insert time.
- Save copies a text summary to the clipboard via `expo-clipboard`
  (`clipboardBetText` / `clipboardCarryText`) and also shows it in a
  copyable box on the Board screen.
- Backup export writes a JSON file with `expo-file-system/legacy`
  and shares it with `expo-sharing`; if sharing is unavailable it
  falls back to the OS share sheet with the JSON as text, and there is
  a copy-to-clipboard button as well.
- Versions follow what SDK 58's doctor expects, which differs in two
  places from the `web-pos/expo_mobile` template: async-storage 2.2.0
  (not 3.1.1) and `expo-file-system ~58.0.13` / `expo-sharing ~58.0.22`
  (SDK 58 renumbered those packages); the file-system string API is
  imported from `expo-file-system/legacy` because SDK 58's top-level
  export only has the new `File`/`Directory` API. TypeScript ~6.0.3
  (SDK 58's expected version) as a devDependency; `npx tsc --noEmit`
  is clean. No top-level `splash` key in `app.json` (rejected by the
  SDK 58 config schema).

## Deliberate deviations from the original

- No login (the original's login form was dead code; startup went
  straight to the main screen). No activation/licensing (also dead).
- Save uses the fighter/owner commission+rate stored on the People tab
  at save time; the original overwrote the master record from the entry
  screen's on-screen values.
- Invalid codes show a short hint instead of the original's silent
  focus-back.
- The hidden book (`BetHidden` / `BetCodeHidden`), Auto bets, Close Days,
  Unit Sales, and the `AMKno` second draw list are not implemented —
  same scope as the web app's core loop (enter → board → pass-up →
  LuckyNo → settlement).
- `cmdGoTens` "/" rounding: equal rounded parts collapse to a reverse
  row, per the shared README.
