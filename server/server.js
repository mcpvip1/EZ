// EASY 2D sync server — local-only sync hub for the EASY 2D rebuild.
// Zero dependencies, Node 18+ only (built-ins: http, fs, crypto, os, path).
//
// Pattern follows ~/workspace/do2-hti/sync-server/server.js:
//   - one JSON file store (data.json) holding the merged copy of every record
//   - pairing code printed on start; a device claims it once to get a token
//   - merge rule: same id is never duplicated; latest modifiedOn wins;
//     on an exact tie the SERVER copy wins (its modifiedOn >= client's).
//
// Differences from the DO2-Hti server (deliberate, per the rebuild spec):
//   - DO2-Hti: one POST /sync with {records:[{store, record}]} and dai-wins-on-tie.
//     Here: separate POST /push {collections:{name:[records]}} and
//     GET /pull?since=<ISO>, and the SERVER wins on a tie.
//   - DO2-Hti pairing: one fixed code in pairing.json, claimed any number of
//     times. Here: POST /pair issues a fresh short code, single-use, 10 min
//     expiry; POST /pair/claim exchanges it for a device token.
//   - Collections are the EASY 2D tables (ANALYSIS.md §9), not DO2-Hti stores.
//
// No cloud, no fake sync: if this server is off, devices keep their local
// data and retry later. Nothing here is a backup — copy data.json yourself.
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.DATA_FILE || path.join(dir, 'data.json');
const TOKENS_FILE = process.env.TOKENS_FILE || path.join(dir, 'tokens.json');
const PORT = Number(process.env.PORT || 5199);
// Pairing-code lifetime in ms. Default 10 min; override (e.g. in tests) via env.
const PAIR_TTL_MS = Number(process.env.PAIR_TTL_MS || 10 * 60 * 1000);
const MAX_BODY_BYTES = 20 * 1024 * 1024;

// Collections from ANALYSIS.md §9. `settings` holds the single Calc row
// (limit / commission / rate, id "calc") plus any future global settings.
const COLLECTIONS = [
  'fighters',
  'owners',
  'betCodes',
  'bets',
  'carryCodes',
  'carries',
  'luckyNos',
  'templates',
  'groups',
  'settings',
];

function emptyStore() {
  const collections = {};
  for (const name of COLLECTIONS) collections[name] = {};
  return { collections, updatedAt: Date.now() };
}

function loadData() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!d.collections || typeof d.collections !== 'object') return emptyStore();
    for (const name of COLLECTIONS) {
      if (!d.collections[name] || typeof d.collections[name] !== 'object') d.collections[name] = {};
    }
    return d;
  } catch {
    return emptyStore();
  }
}

function saveData(d) {
  d.updatedAt = Date.now();
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
}

function loadTokens() {
  try {
    const t = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    return Array.isArray(t.tokens) ? t.tokens : [];
  } catch {
    return [];
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify({ tokens }, null, 2));
}

let tokens = loadTokens();

// --- Pairing codes: in-memory only (they expire in 10 min anyway).
// At most one live code at a time; issuing a new one invalidates the old.
let liveCode = null; // { code, expiresAt }
function issuePairingCode() {
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
  liveCode = { code, expiresAt: Date.now() + PAIR_TTL_MS };
  return liveCode;
}
issuePairingCode(); // the code printed on start

// --- Record handling -------------------------------------------------------
function normaliseRecord(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
    throw new Error('each record must be an object');
  }
  if (typeof rec.id !== 'string' || rec.id === '') {
    throw new Error('each record needs a string id');
  }
  const out = { ...rec };
  if (out.modifiedOn === undefined || out.modifiedOn === null) {
    out.modifiedOn = new Date().toISOString();
  } else if (typeof out.modifiedOn === 'number') {
    out.modifiedOn = new Date(out.modifiedOn).toISOString();
  } else if (typeof out.modifiedOn !== 'string' || Number.isNaN(Date.parse(out.modifiedOn))) {
    throw new Error(`record ${rec.id}: modifiedOn must be an ISO timestamp`);
  } else {
    // Canonicalise so string comparison == chronological comparison.
    out.modifiedOn = new Date(out.modifiedOn).toISOString();
  }
  return out;
}

// Merge one record into a collection map.
// Returns 'inserted' | 'replaced' | 'skipped' (older, or tie -> server wins).
function mergeRecord(map, rec, nowIso) {
  const old = map[rec.id];
  if (!old) {
    map[rec.id] = { ...rec, updatedAt: nowIso };
    return 'inserted';
  }
  // Latest modifiedOn wins; on an exact tie the server copy wins
  // (server modifiedOn >= client modifiedOn -> keep server).
  if (rec.modifiedOn > old.modifiedOn) {
    map[rec.id] = { ...rec, updatedAt: nowIso };
    return 'replaced';
  }
  return 'skipped';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => {
      s += c;
      if (s.length > MAX_BODY_BYTES) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch {
        reject(new Error('bad json'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function tokenFrom(req, body) {
  const auth = (req.headers.authorization || '').replace(/^Bearer /i, '');
  if (auth) return auth;
  if (body && typeof body.deviceToken === 'string') return body.deviceToken;
  return '';
}

function lanIPv4() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return 'localhost';
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url, 'http://local');
  try {
    // GET /health — no auth.
    if (req.method === 'GET' && url.pathname === '/health') {
      const data = loadData();
      const counts = {};
      for (const name of COLLECTIONS) counts[name] = Object.keys(data.collections[name]).length;
      send(res, 200, {
        ok: true,
        app: 'EASY 2D sync server',
        version: '1.0.0',
        collections: counts,
        serverTime: new Date().toISOString(),
      });
      return;
    }

    // POST /pair — no auth. Issues a fresh single-use pairing code (10 min),
    // invalidating any previous unclaimed code. The operator reads the code
    // off this computer's screen / terminal and types it on the device.
    if (req.method === 'POST' && url.pathname === '/pair') {
      const c = issuePairingCode();
      send(res, 200, {
        code: c.code,
        expiresAt: new Date(c.expiresAt).toISOString(),
        expiresInSeconds: Math.round(PAIR_TTL_MS / 1000),
      });
      return;
    }

    // POST /pair/claim { code } — no auth (the code IS the auth).
    // Single-use: a claimed or expired code is rejected.
    if (req.method === 'POST' && url.pathname === '/pair/claim') {
      const body = await readBody(req);
      if (!liveCode || body.code !== liveCode.code) {
        send(res, 403, { error: 'bad code' });
        return;
      }
      if (Date.now() > liveCode.expiresAt) {
        liveCode = null;
        send(res, 403, { error: 'code expired' });
        return;
      }
      liveCode = null; // single-use
      const token = crypto.randomBytes(24).toString('hex');
      tokens.push(token);
      saveTokens(tokens);
      send(res, 200, { token });
      return;
    }

    // Everything below needs a valid device token (Bearer header or
    // body.deviceToken). /health, /pair and /pair/claim are the exceptions.
    const body = req.method === 'POST' ? await readBody(req) : {};
    const token = tokenFrom(req, body);
    if (!tokens.includes(token)) {
      send(res, 401, { error: 'unauthorized' });
      return;
    }

    // POST /push { deviceToken?, collections: { name: [records] } }
    if (req.method === 'POST' && url.pathname === '/push') {
      const incoming = body.collections;
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        send(res, 400, { error: 'collections must be an object of name -> [records]' });
        return;
      }
      for (const name of Object.keys(incoming)) {
        if (!COLLECTIONS.includes(name)) {
          send(res, 400, { error: `unknown collection: ${name}`, collections: COLLECTIONS });
          return;
        }
        if (!Array.isArray(incoming[name])) {
          send(res, 400, { error: `collection ${name} must be an array` });
          return;
        }
      }
      const data = loadData();
      const nowIso = new Date().toISOString();
      const merged = {};
      for (const [name, records] of Object.entries(incoming)) {
        let inserted = 0;
        let replaced = 0;
        let skipped = 0;
        for (const raw of records) {
          const rec = normaliseRecord(raw);
          const outcome = mergeRecord(data.collections[name], rec, nowIso);
          if (outcome === 'inserted') inserted++;
          else if (outcome === 'replaced') replaced++;
          else skipped++;
        }
        merged[name] = { inserted, replaced, skipped };
      }
      saveData(data);
      send(res, 200, { ok: true, merged, serverTime: new Date(data.updatedAt).toISOString() });
      return;
    }

    // GET /pull?since=<ISO timestamp>
    // Returns every record with modifiedOn > since, grouped by collection.
    // Omit `since` (or pass an invalid one) to pull everything.
    if (req.method === 'GET' && url.pathname === '/pull') {
      const sinceRaw = url.searchParams.get('since');
      const sinceMs = sinceRaw ? Date.parse(sinceRaw) : 0;
      const since = Number.isNaN(sinceMs) ? 0 : sinceMs;
      const data = loadData();
      const collections = {};
      for (const name of COLLECTIONS) {
        collections[name] = Object.values(data.collections[name]).filter(
          (r) => Date.parse(r.modifiedOn) > since,
        );
      }
      send(res, 200, { ok: true, collections, serverTime: new Date(data.updatedAt).toISOString() });
      return;
    }

    // POST /reset — DEV ONLY. Clears every collection in data.json.
    // There is no undo and no backup is taken: never expose this server
    // outside the local WiFi, and never call /reset on a live book.
    if (req.method === 'POST' && url.pathname === '/reset') {
      saveData(emptyStore());
      send(res, 200, { ok: true, reset: true });
      return;
    }

    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 400, { error: String(e.message || e) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = lanIPv4();
  console.log(`EASY 2D sync server running on http://${ip}:${PORT} (also http://localhost:${PORT})`);
  console.log(`Pairing code (enter it once on the phone, single-use, 10 min): ${liveCode.code}`);
  console.log('Keep this computer on and on the same WiFi. Closing it stops sync; local data stays safe on each device.');
});
