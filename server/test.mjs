// End-to-end test for the EASY 2D sync server. Zero dependencies —
// only Node built-ins (node:child_process, node:fs, node:os, node:path)
// plus the global fetch (Node 18+).
//
// Spins the real server up on a scratch port with scratch data/token
// files (env DATA_FILE / TOKENS_FILE / PORT / PAIR_TTL_MS), then:
//   pair -> claim (two devices) -> push fighter + bet -> pull from the
//   second device -> merge checks (no duplicate, latest wins, server
//   wins on tie) -> auth failures -> expiry -> /reset.
// Usage: npm test   (or: node test.mjs)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5198;
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'easy2d-sync-test-'));
const DATA_FILE = path.join(tmp, 'data.json');
const TOKENS_FILE = path.join(tmp, 'tokens.json');

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, p, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

const server = spawn(process.execPath, [path.join(dir, 'server.js')], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_FILE,
    TOKENS_FILE,
    PAIR_TTL_MS: '1500', // short expiry so the expiry case is testable
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
server.stderr.on('data', (d) => process.stdout.write(`[server:err] ${d}`));

try {
  // Wait for the server to answer /health.
  let up = false;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) {
        up = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await sleep(100);
  }
  check('server starts and /health answers', up);
  if (!up) throw new Error('server did not start');

  console.log('— health');
  const health = await req('GET', '/health');
  check('health ok + app name', health.status === 200 && health.json.ok === true
    && health.json.app === 'EASY 2D sync server', JSON.stringify(health.json));
  check('health counts start at 0', Object.values(health.json.collections || {}).every((n) => n === 0));

  console.log('— auth: no token');
  const noTokenPush = await req('POST', '/push', { collections: {} });
  check('push without token -> 401', noTokenPush.status === 401);
  const noTokenPull = await req('GET', '/pull');
  check('pull without token -> 401', noTokenPull.status === 401);
  const badTokenPull = await req('GET', '/pull', undefined, 'not-a-real-token');
  check('pull with bad token -> 401', badTokenPull.status === 401);

  console.log('— pairing: device A');
  const pairA = await req('POST', '/pair');
  check('POST /pair returns a 6-digit code', pairA.status === 200 && /^\d{6}$/.test(pairA.json.code || ''),
    JSON.stringify(pairA.json));
  const wrongClaim = await req('POST', '/pair/claim', { code: '000000' });
  check('claim with wrong code -> 403', wrongClaim.status === 403);
  const claimA = await req('POST', '/pair/claim', { code: pairA.json.code });
  check('claim with correct code returns a token', claimA.status === 200
    && typeof claimA.json.token === 'string' && claimA.json.token.length >= 32,
    JSON.stringify(claimA.json));
  const tokenA = claimA.json.token;
  const reuseClaim = await req('POST', '/pair/claim', { code: pairA.json.code });
  check('same code claimed twice -> 403 (single-use)', reuseClaim.status === 403);

  console.log('— pairing: expiry');
  const pairExp = await req('POST', '/pair');
  check('second POST /pair returns a fresh code', pairExp.status === 200
    && pairExp.json.code !== pairA.json.code);
  await sleep(1700); // PAIR_TTL_MS is 1500 in this test
  const expiredClaim = await req('POST', '/pair/claim', { code: pairExp.json.code });
  check('expired code -> 403', expiredClaim.status === 403, JSON.stringify(expiredClaim.json));

  console.log('— pairing: device B');
  const pairB = await req('POST', '/pair');
  const claimB = await req('POST', '/pair/claim', { code: pairB.json.code });
  check('device B claims its own code', claimB.status === 200 && typeof claimB.json.token === 'string');
  const tokenB = claimB.json.token;
  check('device A and B tokens differ', tokenA !== tokenB);

  console.log('— push from A, pull from B');
  const T1 = '2026-11-08T08:00:00.000Z';
  const T0 = '2026-11-08T07:00:00.000Z';
  const T2 = '2026-11-08T09:00:00.000Z';
  const fighter = {
    id: 'f-12', no: '12', name: '', commission: 15, rate: 80, modifiedOn: T1,
  };
  const bet = {
    id: 'bet-1', betDay: '2026-11-08', ampm: 'AM', customerNo: '12', no: '43',
    amount: 1000, commission: 15, rate: 80, codeNo: '43', displayCode: '43',
    sno: 1, groupId: 1, modifiedOn: T1,
  };
  const push1 = await req('POST', '/push', { collections: { fighters: [fighter], bets: [bet] } }, tokenA);
  check('push fighter + bet -> 200, both inserted',
    push1.status === 200
    && push1.json.merged.fighters.inserted === 1
    && push1.json.merged.bets.inserted === 1, JSON.stringify(push1.json));
  const pullB = await req('GET', '/pull?since=1970-01-01T00:00:00.000Z', undefined, tokenB);
  check('pull from B sees the fighter', pullB.status === 200
    && pullB.json.collections.fighters.length === 1
    && pullB.json.collections.fighters[0].id === 'f-12'
    && pullB.json.collections.fighters[0].no === '12');
  check('pull from B sees the bet', pullB.json.collections.bets.length === 1
    && pullB.json.collections.bets[0].id === 'bet-1'
    && pullB.json.collections.bets[0].amount === 1000);
  check('pull returns all 10 collections', Object.keys(pullB.json.collections).length === 10);

  console.log('— merge: no duplicate, latest wins, server wins on tie');
  const dupPush = await req('POST', '/push', { collections: { bets: [bet] } }, tokenA);
  check('re-push of identical bet -> skipped, not duplicated',
    dupPush.status === 200 && dupPush.json.merged.bets.skipped === 1
    && dupPush.json.merged.bets.inserted === 0, JSON.stringify(dupPush.json));
  const olderPush = await req('POST', '/push',
    { collections: { fighters: [{ ...fighter, name: 'OLDER', modifiedOn: T0 }] } }, tokenA);
  check('older modifiedOn -> skipped', olderPush.status === 200
    && olderPush.json.merged.fighters.skipped === 1);
  const pullAfterOlder = await req('GET', '/pull?since=1970-01-01T00:00:00.000Z', undefined, tokenB);
  check('older push did not overwrite the fighter',
    pullAfterOlder.json.collections.fighters[0].name === '');
  const newerPush = await req('POST', '/push',
    { collections: { fighters: [{ ...fighter, name: 'NEWER', modifiedOn: T2 }] } }, tokenA);
  check('newer modifiedOn -> replaced', newerPush.status === 200
    && newerPush.json.merged.fighters.replaced === 1);
  const pullAfterNewer = await req('GET', '/pull?since=1970-01-01T00:00:00.000Z', undefined, tokenB);
  check('newer push overwrote the fighter',
    pullAfterNewer.json.collections.fighters[0].name === 'NEWER');
  const tiePush = await req('POST', '/push',
    { collections: { fighters: [{ ...fighter, name: 'TIE', modifiedOn: T2 }] } }, tokenB);
  check('equal modifiedOn -> skipped (server wins on tie)', tiePush.status === 200
    && tiePush.json.merged.fighters.skipped === 1, JSON.stringify(tiePush.json));
  const pullAfterTie = await req('GET', '/pull?since=1970-01-01T00:00:00.000Z', undefined, tokenB);
  check('tie push did not overwrite the fighter',
    pullAfterTie.json.collections.fighters[0].name === 'NEWER');
  check('still exactly 1 fighter and 1 bet (no duplicates)',
    pullAfterTie.json.collections.fighters.length === 1
    && pullAfterTie.json.collections.bets.length === 1);

  console.log('— validation + incremental pull');
  const badCollection = await req('POST', '/push', { collections: { nope: [] } }, tokenA);
  check('unknown collection -> 400', badCollection.status === 400);
  const noId = await req('POST', '/push', { collections: { fighters: [{ no: '99' }] } }, tokenA);
  check('record without id -> 400', noId.status === 400);
  const pullSinceT2 = await req('GET', `/pull?since=${encodeURIComponent(T2)}`, undefined, tokenB);
  check('pull with since=T2 returns nothing newer',
    pullSinceT2.status === 200
    && Object.values(pullSinceT2.json.collections).every((arr) => arr.length === 0),
    JSON.stringify(pullSinceT2.json.collections));
  const stored = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  check('data.json on disk holds the merged records',
    stored.collections.fighters['f-12']?.name === 'NEWER'
    && stored.collections.bets['bet-1']?.amount === 1000);

  console.log('— reset (dev only)');
  const reset = await req('POST', '/reset', { deviceToken: tokenB });
  check('POST /reset -> 200', reset.status === 200 && reset.json.reset === true);
  const pullAfterReset = await req('GET', '/pull', undefined, tokenA);
  check('pull after reset is empty',
    pullAfterReset.status === 200
    && Object.values(pullAfterReset.json.collections).every((arr) => arr.length === 0));
} catch (e) {
  failed++;
  console.log(`  FAIL unexpected error: ${e.message}`);
} finally {
  server.kill('SIGTERM');
  await sleep(300);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
