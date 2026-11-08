# EASY 2D sync server — local-only sync hub

Zero-dependency Node server (built-ins only: `http`, `fs`, `crypto`, `os`,
`path`). It is the sync hub for the EASY 2D rebuild — the same role the
DO2-Hti sync server plays for DO2-Hti, but with the EASY 2D data model
(`ANALYSIS.md` §9) and a separate push/pull API.

**No cloud, no fake sync.** The server only runs on the operator's computer
on the local WiFi. If it is off, devices keep their local data and retry
later. It is **not a backup** — copy `data.json` yourself if you need one.

## Run

```sh
node server.js            # default port 5199
PORT=5200 node server.js  # custom port
```

Binds `0.0.0.0` so phones on the same WiFi can reach it. On start it prints
the LAN URL and the current pairing code, e.g.:

```
EASY 2D sync server running on http://192.168.1.5:5199 (also http://localhost:5199)
Pairing code (enter it once on the phone, single-use, 10 min): 482913
```

## Pairing (how a device gets a token)

1. Read the 6-digit code from the server's terminal (or issue a fresh one:
   `POST /pair` — it invalidates any previous unclaimed code).
2. On the device: `POST /pair/claim` with `{ "code": "482913" }` → returns
   `{ "token": "<48 hex chars>" }`. The code is **single-use** and expires
   after **10 minutes**; a used or expired code returns 403.
3. The device stores the token and sends it on every later call, either as
   `Authorization: Bearer <token>` or as `deviceToken` in the JSON body.
   Tokens survive server restarts (kept in `tokens.json`).

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | — | Liveness + per-collection record counts |
| POST | `/pair` | — | Issue a fresh single-use pairing code (10 min) |
| POST | `/pair/claim` | code | Exchange a pairing code for a device token |
| POST | `/push` | token | Upload records; merged by id (see below) |
| GET | `/pull?since=<ISO>` | token | Download records with `modifiedOn` > `since` |
| POST | `/reset` | token | **DEV ONLY** — wipes every collection, no undo |

Every request except `/health`, `/pair`, `/pair/claim` without a valid token
returns `401 { "error": "unauthorized" }`. Unknown paths return 404.
Bad JSON / bad records return 400 with an `error` message.

## Data

One JSON file, `data.json` (gitignored), next to `server.js`:

```json
{
  "collections": {
    "fighters":   { "<id>": { "id": "...", "modifiedOn": "ISO", "updatedAt": "ISO", "...": "..." } },
    "owners":     {},
    "betCodes":   {},
    "bets":       {},
    "carryCodes": {},
    "carries":    {},
    "luckyNos":   {},
    "templates":  {},
    "groups":     {},
    "settings":   {}
  },
  "updatedAt": 1730000000000
}
```

Collections are the EASY 2D tables from `ANALYSIS.md` §9. `settings` holds the
single Calc row (`limit` / `commission` / `rate`, id `"calc"`) and any future
global settings. Every record **must** have a string `id`; `modifiedOn` is an
ISO timestamp (if omitted the server stamps it with the current time);
`updatedAt` is set by the server whenever it stores the record.

## Merge rule

Same id is never duplicated. On push, per record:

- **No record with that id on the server** → inserted.
- **Incoming `modifiedOn` is later** than the server's → replaced.
- **Incoming `modifiedOn` is older, or exactly equal** → skipped; the
  **server copy wins on a tie** (server `modifiedOn >=` client).

This differs from DO2-Hti, where the dai wins on a tie. Clients should
therefore always bump `modifiedOn` when they change a record, and treat a
tie as "server wins — pull and re-apply your change on top if it matters".

## Exact payload shapes

### POST /pair/claim

Request:

```json
{ "code": "482913" }
```

Response `200`:

```json
{ "token": "a3f9c1…(48 hex chars)" }
```

Response `403`: `{ "error": "bad code" }` or `{ "error": "code expired" }`.

### POST /push

Request (token in header or body):

```json
{
  "deviceToken": "a3f9c1…",
  "collections": {
    "fighters": [
      { "id": "f-1", "no": "12", "name": "", "commission": 15, "rate": 80,
        "modifiedOn": "2026-11-08T08:00:00.000Z" }
    ],
    "bets": [
      { "id": "bet-20261108-am-1", "betDay": "2026-11-08", "ampm": "AM",
        "customerNo": "12", "no": "43", "amount": 1000, "commission": 15,
        "rate": 80, "codeNo": "43", "displayCode": "43", "sno": 1,
        "groupId": 1, "modifiedOn": "2026-11-08T08:00:01.000Z" }
    ]
  }
}
```

Only the collections you include are touched; unknown collection names are
rejected with 400. Field names inside a record are the app's own — the server
only requires `id` (string) and `modifiedOn` (ISO); everything else is stored
as-is. Suggested fields per collection (from `ANALYSIS.md` §9.2):

- `fighters`: `id`, `no` (FighterNo), `name`, `commission`, `rate`
- `owners`: `id`, `no` (OwnerNo), `name`, `commission`, `rate`
- `betCodes`: `id`, `betDay`, `ampm`, `customerNo`, `displayCode`, `codeNo`,
  `amount` (text in the original), `rowTotal`, `sno`, `groupId`, `edited`
- `bets`: `id`, `betDay`, `ampm`, `customerNo`, `no` (2DNo), `amount`,
  `commission`, `rate`, `codeNo`, `displayCode`, `sno`, `groupId`, `edited`
- `carryCodes` / `carries`: same shape as `betCodes` / `bets` with `ownerNo`
  instead of `customerNo`
- `luckyNos`: `id`, `betDay`, `ampm`, `no` (2DNo), `noR` (2DNoR, reverse)
- `templates`: `id`, `templateNo`, `text`
- `groups`: `id`, `groupCode`, `no` (2DNo), `amount`, `sno`
- `settings`: `id` (`"calc"`), `limit`, `commission`, `rate`

Response `200`:

```json
{
  "ok": true,
  "merged": {
    "fighters": { "inserted": 1, "replaced": 0, "skipped": 0 },
    "bets":     { "inserted": 1, "replaced": 0, "skipped": 0 }
  },
  "serverTime": "2026-11-08T08:00:02.000Z"
}
```

### GET /pull?since=<ISO timestamp>

```
GET /pull?since=2026-11-08T00:00:00.000Z
Authorization: Bearer a3f9c1…
```

Omit `since` (or pass an invalid value) to pull everything. Response `200`:

```json
{
  "ok": true,
  "collections": {
    "fighters": [ { "id": "f-1", "no": "12", "…": "…" } ],
    "owners": [], "betCodes": [], "bets": [ { "…" : "…" } ],
    "carryCodes": [], "carries": [], "luckyNos": [],
    "templates": [], "groups": [], "settings": []
  },
  "serverTime": "2026-11-08T08:00:02.000Z"
}
```

Only records with `modifiedOn` strictly **after** `since` are returned, in
every collection. A client syncs by pushing its local changes, then pulling
with the `since` of its last successful pull.

### POST /reset (dev only)

```json
{ "deviceToken": "a3f9c1…" }
```

Response: `{ "ok": true, "reset": true }`. Clears **all** collections in
`data.json`. No undo, no backup is taken. Do not expose this server outside
the local WiFi, and never call `/reset` on a live book.

## Test

```sh
npm test   # node test.mjs — spins the server up on a scratch port/data file
```

The test pairs two devices, pushes a fighter + a bet from one, pulls them
from the other, and checks merge behaviour (no duplicates, latest
`modifiedOn` wins, server wins on a tie), auth failures, and `/reset`.
It uses only Node built-ins (`node:http` via `fetch`, `child_process`).

## Files

- `server.js` — the server (zero dependencies)
- `package.json` — `start` / `test` scripts
- `test.mjs` — end-to-end test (see above)
- `data.json` — merged store (created on first write, gitignored)
- `tokens.json` — issued device tokens (created on first pairing, gitignored)
- `.gitignore` — ignores `data.json` and `tokens.json`

## Notes for the web/mobile apps (not yet built in this pass)

- Pair once per device and persist the token locally (e.g. IndexedDB /
  SecureStore). If pairing fails with 403, ask the operator for a fresh code
  from the server terminal (`POST /pair` issues one).
- Sync loop: push local dirty records → pull with last-pull `since` →
  apply pulled records locally with the same merge rule (latest wins,
  server wins on a tie) → save the new `since`.
- If the server is unreachable, keep the changes queued locally and retry
  later; never drop local data because a sync failed.
- `id` values must be globally unique across devices (e.g. prefix with the
  device id, or use `crypto.randomUUID()`), otherwise two devices can
  silently overwrite each other's records with the same id.
