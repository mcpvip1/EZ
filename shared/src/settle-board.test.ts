/**
 * Tests for settlement, board/limit, dashboard, clipboard text, seeds.
 * The worked example is ANALYSIS §9.3 (live data, 2024-04-11).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dashboard,
  roundHalfEven,
  settlePerson,
  settlePersonClipboard,
} from './settle.js';
import {
  computeBoard,
  computeOverLimit,
  mergeOverLimit,
  roundUpToTen,
  btbuyTopUp,
  overTopCrop,
} from './board.js';
import { clipboardBetText, clipboardCarryText, nextGroupNo } from './clipboard.js';
import {
  CALC,
  DIGITS,
  FIGHTERS,
  OWNERS,
  TEMPLATE_SNIPPETS,
} from './seed.js';

test('roundHalfEven (VB/C# Math.Round)', () => {
  assert.equal(roundHalfEven(2.5), 2);
  assert.equal(roundHalfEven(3.5), 4);
  assert.equal(roundHalfEven(24157.5), 24158);
  assert.equal(roundHalfEven(-2.5), -2);
  assert.equal(roundHalfEven(-3.5), -4);
  assert.equal(roundHalfEven(100.4), 100);
  assert.equal(roundHalfEven(100.6), 101);
});

test('worked example §9.3: Fighter 12, 2024-04-11', () => {
  // AM: 55,000, no win -> Net 46,750 (= 55,000 - 15%).
  const am = settlePerson([{ no: '11', amount: 55000 }], '62', 15, 80);
  assert.equal(am.amount, 55000);
  assert.equal(am.winAmt, 0);
  assert.equal(am.commissionAmount, 8250);
  assert.equal(am.grossAmount, 0);
  assert.equal(am.netAmount, 46750);

  // PM: 51,950, WinAmt 250 -> Net 24,157.5 (= 51,950 - 7,792.5 - 20,000).
  const pm = settlePerson(
    [
      { no: '82', amount: 250 },
      { no: '11', amount: 51700 },
    ],
    '82',
    15,
    80,
  );
  assert.equal(pm.amount, 51950);
  assert.equal(pm.winAmt, 250);
  assert.equal(pm.commissionAmount, 7792.5);
  assert.equal(pm.grossAmount, 20000);
  assert.equal(pm.netAmount, 24157.5);
});

test('win is exact-number only; reverse never wins (§9.3 draws)', () => {
  // AM draw 62: bets on 62 = 6,450 -> payout 516,000.
  const amWin = settlePerson([{ no: '62', amount: 6450 }], '62', 15, 80);
  assert.equal(amWin.winAmt, 6450);
  assert.equal(amWin.grossAmount, 516000);
  // Reverse 26 = 6,150 -> not paid.
  const amRev = settlePerson([{ no: '26', amount: 6150 }], '62', 15, 80);
  assert.equal(amRev.winAmt, 0);
  assert.equal(amRev.grossAmount, 0);

  // PM draw 82: bets on 82 = 5,750 -> payout 460,000.
  const pmWin = settlePerson([{ no: '82', amount: 5750 }], '82', 15, 80);
  assert.equal(pmWin.winAmt, 5750);
  assert.equal(pmWin.grossAmount, 460000);
  // Reverse 28 = 6,250 -> not paid.
  const pmRev = settlePerson([{ no: '28', amount: 6250 }], '82', 15, 80);
  assert.equal(pmRev.winAmt, 0);

  // No draw yet: no win.
  assert.equal(settlePerson([{ no: '62', amount: 100 }], null, 15, 80).winAmt, 0);
});

test('settlePersonClipboard: Bet flips sign, Carry does not', () => {
  const noWin = [{ no: '11', amount: 55000 }];
  // Bet: -(55,000 - 0 - 8,250) = -46,750.
  assert.equal(settlePersonClipboard(noWin, '62', 15, 80, 'bet'), 'You=(\u2212)46750');
  // Carry: same arithmetic, no flip.
  assert.equal(settlePersonClipboard(noWin, '62', 15, 80, 'carry'), 'You=(+)46750');

  const pm = [
    { no: '82', amount: 250 },
    { no: '11', amount: 51700 },
  ];
  // Bet: -(51,950 - 20,000 - 7,792.5) = -24,157.5 -> rounded -24,158.
  assert.equal(settlePersonClipboard(pm, '82', 15, 80, 'bet'), 'You=(\u2212)24158');
  assert.equal(settlePersonClipboard(pm, '82', 15, 80, 'carry'), 'You=(+)24158');

  // A winning bet for the customer is positive from their side.
  const win = [{ no: '62', amount: 1000 }];
  assert.equal(settlePersonClipboard(win, '62', 15, 80, 'bet'), 'You=(+)79150');
  assert.equal(settlePersonClipboard(win, '62', 15, 80, 'carry'), 'You=(\u2212)79150');
});

test('computeBoard: cell = SUM(bet) - SUM(carry)', () => {
  const board = computeBoard(
    [
      { no: '62', amount: 1000 },
      { no: '62', amount: 500 },
      { no: '11', amount: 100 },
    ],
    [{ no: '62', amount: 200 }],
  );
  assert.equal(board.length, 100);
  assert.equal(board[62], 1300);
  assert.equal(board[11], 100);
  assert.equal(board[0], 0);
  assert.equal(board[99], 0);
  assert.equal(board.reduce((s, v) => s + v, 0), 1400);
});

test('computeOverLimit: live Limit-table case (72: 2800/2500, total 5300)', () => {
  const board = new Array<number>(100).fill(0);
  board[72] = 42800; // 40000 limit -> over 2800
  board[27] = 42500; // over 2500 (reverse of 72)
  board[50] = 40000; // exactly at limit -> not over
  board[51] = 40001; // over 1
  const rows = computeOverLimit(board, 40000);
  assert.equal(rows.length, 2);
  // Merged reverse pair first (largest excess).
  assert.equal(rows[0].no, '72');
  assert.equal(rows[0].over, '2800/2500');
  assert.equal(rows[0].overHidden, '2800/2500');
  assert.equal(rows[0].rowTotal, 5300);
  assert.equal(rows[0].codeNo, '72');
  assert.equal(rows[1].no, '51');
  assert.equal(rows[1].over, 1);
  assert.equal(rows[1].rowTotal, 1);
});

test('mergeOverLimit: equal excesses -> "NN R", codeNo "+", 2x total', () => {
  const rows = mergeOverLimit([
    { no: '12', over: 5000, overHidden: '5000', rowTotal: 5000, codeNo: '12' },
    { no: '21', over: 5000, overHidden: '5000', rowTotal: 5000, codeNo: '21' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].no, '12 R');
  assert.equal(rows[0].codeNo, '12+');
  assert.equal(rows[0].over, 5000);
  assert.equal(rows[0].rowTotal, 10000);
});

test('mergeOverLimit: twins never merge; survivor is the larger excess', () => {
  const rows = mergeOverLimit([
    { no: '11', over: 5000, overHidden: '5000', rowTotal: 5000, codeNo: '11' },
    { no: '22', over: 5000, overHidden: '5000', rowTotal: 5000, codeNo: '22' },
  ]);
  assert.equal(rows.length, 2);

  const merged = mergeOverLimit([
    { no: '21', over: 100, overHidden: '100', rowTotal: 100, codeNo: '21' },
    { no: '12', over: 900, overHidden: '900', rowTotal: 900, codeNo: '12' },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].no, '12');
  assert.equal(merged[0].over, '900/100');
  assert.equal(merged[0].rowTotal, 1000);
});

test('roundUpToTen (cmdGoTens)', () => {
  assert.equal(roundUpToTen(0), 0);
  assert.equal(roundUpToTen(5), 10);
  assert.equal(roundUpToTen(10), 10);
  assert.equal(roundUpToTen(11), 20);
  assert.equal(roundUpToTen(99), 100);
  assert.equal(roundUpToTen(2800), 2800);
  assert.equal(roundUpToTen(2801), 2810);
});

test('dashboard (§7.4)', () => {
  const d = dashboard(2901140, 800000, 6450, 0, CALC);
  assert.equal(d.limit, 40000);
  assert.equal(d.sales, 2901140);
  assert.equal(d.carry, 800000);
  assert.equal(d.netSales, 2101140);
  assert.equal(d.times, 53); // 2,101,140 / 40,000 = 52.53 -> 53
  assert.equal(d.commissionAmt, 336182); // 2,101,140 / 100 * 16 = 336,182.4
  assert.equal(d.grossProfit, 1764958);
  assert.equal(d.payout, 516000); // 6,450 x 80
  assert.equal(d.netPL, 1248958);
  assert.equal(d.netPLRed, false);

  // Sales == Carry: payout and netPL shown as 0.
  const even = dashboard(100000, 100000, 1000, 0, CALC);
  assert.equal(even.payout, 0);
  assert.equal(even.netPL, 0);
  assert.equal(even.netSales, 0);

  // Red flag when the payout eats the gross profit.
  const red = dashboard(100000, 0, 2000, 0, CALC);
  assert.equal(red.grossProfit, 84000); // 100,000 - 16,000
  assert.equal(red.payout, 160000); // 2,000 x 80
  assert.equal(red.netPL, -76000);
  assert.equal(red.netPLRed, true);
});

test('nextGroupNo: distinct saved groups per person/day/session + 1', () => {
  // MDIMain.cs:7009-7101: `select groupid ... group by groupid`, COUNT + 1.
  const details = [
    { personNo: '12', betDay: '2024-04-11', session: 'AM' as const, groupId: 1 },
    { personNo: '12', betDay: '2024-04-11', session: 'AM' as const, groupId: 1 },
    { personNo: '12', betDay: '2024-04-11', session: 'AM' as const, groupId: 2 },
    // Same person, other session / day / person must not count.
    { personNo: '12', betDay: '2024-04-11', session: 'PM' as const, groupId: 1 },
    { personNo: '12', betDay: '2024-04-12', session: 'AM' as const, groupId: 1 },
    { personNo: '8', betDay: '2024-04-11', session: 'AM' as const, groupId: 1 },
  ];
  assert.equal(nextGroupNo(details, '12', '2024-04-11', 'AM'), 3);
  assert.equal(nextGroupNo(details, '12', '2024-04-11', 'PM'), 2);
  assert.equal(nextGroupNo(details, '8', '2024-04-11', 'AM'), 2);
  assert.equal(nextGroupNo([], '12', '2024-04-11', 'AM'), 1);
  // Non-contiguous groupIds still count distinct groups only.
  assert.equal(
    nextGroupNo(
      [
        { personNo: '12', betDay: '2024-04-11', session: 'AM' as const, groupId: 5 },
        { personNo: '12', betDay: '2024-04-11', session: 'AM' as const, groupId: 9 },
      ],
      '12',
      '2024-04-11',
      'AM',
    ),
    3,
  );
});

test('btbuyTopUp (txtBTbuy_KeyDown): every number below the limit, topped up', () => {
  const board = new Array<number>(100).fill(0);
  board[5] = 39000; // 1000 short of the 40000 limit
  board[7] = 40000; // at the limit -> no row
  board[9] = 41000; // over the limit -> no row
  const rows = btbuyTopUp(board, 40000);
  assert.equal(rows.length, 98); // all except 7 and 9
  assert.deepEqual(rows.find((r) => r.no === '05'), { no: '05', amount: 1000 });
  assert.deepEqual(rows.find((r) => r.no === '00'), { no: '00', amount: 40000 });
  assert.equal(rows.find((r) => r.no === '07'), undefined);
  assert.equal(rows.find((r) => r.no === '09'), undefined);
  // Amounts sum to the top-up needed; feeding them back reaches the limit.
  const topped = [...board];
  rows.forEach((r) => {
    topped[Number(r.no)] += r.amount;
  });
  assert.ok(topped.every((v) => v >= 40000));

  assert.deepEqual(btbuyTopUp(new Array<number>(100).fill(40000), 40000), []);
  assert.deepEqual(btbuyTopUp(new Array<number>(100).fill(0), 0), []);
});

test('overTopCrop (txtOverTopCropQty_KeyDown): the over-limit part only', () => {
  const board = new Array<number>(100).fill(0);
  board[72] = 42800; // over 2800
  board[27] = 42500; // over 2500 (reverse of 72 — returned separately)
  board[50] = 40000; // exactly at limit -> no row
  board[51] = 40001; // over 1
  assert.deepEqual(overTopCrop(board, 40000), [
    { no: '27', amount: 2500 },
    { no: '51', amount: 1 },
    { no: '72', amount: 2800 },
  ]);
  assert.deepEqual(overTopCrop(new Array<number>(100).fill(0), 40000), []);
  assert.deepEqual(overTopCrop(new Array<number>(100).fill(40000), 40000), []);
});

test('clipboardBetText (cmdSaveF_Click)', () => {
  // Fighter "1" gets just the total.
  assert.equal(clipboardBetText([{ displayCode: 'PAR', amountText: '100' }], 1000, '1', '2024-04-11', 'AM', 1), 'T=1000');

  // The `No.(n)` stamp uses TODAY (DateAndTime.Now), not the BetDay.
  const now = new Date();
  const stamp = `${now.getDate()}.${now.getMonth() + 1}`;
  const text = clipboardBetText(
    [
      { displayCode: 'PAR', amountText: '1000' },
      { displayCode: '12 R', amountText: '500' },
    ],
    1500,
    '12',
    '2024-04-11',
    'AM',
    2,
  );
  assert.equal(text, `PAR=1000\r\n12 R=500\r\n\`No.(2)-${stamp} AM\r\nT=1500`);

  const pm = clipboardBetText([], 0, '8', '2024-04-11', 'PM', 3);
  assert.equal(pm, `\`No.(3)-${stamp} PM\r\nT=0`);
});

test('clipboardCarryText (cmdSaveO_Click)', () => {
  const codes = [{ displayCode: 'PAR', amountText: '1000' }];
  // Owner "0": code lines + Total, no No. line, no `Q.
  assert.equal(clipboardCarryText(codes, 1000, '0', '2024-04-11', 'AM', 1), 'PAR=1000\r\nTotal=1000\r\n');

  // Other owners: No. line, Total, and the `Q trailer; stamp is today.
  const now = new Date();
  const stamp = `${now.getDate()}.${now.getMonth() + 1}`;
  assert.equal(
    clipboardCarryText(codes, 1000, '3', '2024-04-11', 'PM', 4),
    `PAR=1000\r\n\`No.(4)-${stamp} PM\r\nTotal=1000\r\n\`Q`,
  );
});

test('seed data matches the live MDB', () => {
  assert.deepEqual(CALC, { limit: 40000, commission: 16, rate: 80 });

  assert.equal(FIGHTERS.length, 12);
  assert.deepEqual(
    FIGHTERS.map((f) => f.no),
    ['1', '8', '9', '10', '11', '12', '00', '000', '111', '222', '41+', '3'],
  );
  for (const f of FIGHTERS) {
    assert.equal(f.commission, 15);
    // Fighter "3" is 80250 in the live DB (anomaly); seeded as 80.
    assert.equal(f.rate, 80);
    assert.equal(f.name, '');
  }

  assert.equal(OWNERS.length, 6);
  assert.deepEqual(
    OWNERS.map((o) => o.no),
    ['1', '2', '3', '4', '5', '111'],
  );
  for (const o of OWNERS) {
    assert.equal(o.commission, 14);
    assert.equal(o.rate, 80);
  }

  assert.equal(DIGITS.length, 100);
  assert.equal(DIGITS[0], '00');
  assert.equal(DIGITS[99], '99');

  // Byte-exact template snippets (TemplateNo 5-9, 11, 21, 24, 55).
  // Expected values are written as \\u escapes copied from the mdb-export
  // dump, so this test verifies seed.ts byte-for-byte against the MDB.
  const expected = [
    '\u1011\u102d\u1015\u1039(10)\u1000\u103c\u1000\u1039',
    '\u1031\u1014\u102c\u1000\u1039(10)\u1000\u103c\u1000\u1039',
    '\u1015\u102b\u101d\u102b(10)\u1000\u103c\u1000\u1039',
    '\u1018\u101b\u102d\u1010\u1039(10)\u1000\u103c\u1000\u1039',
    '\u1014\u1000\u1061\u1010\u1039\u200b(10)\u1000\u103c\u1000\u1039',
    '*Final*',
    'Total = ',
    'KQ BUY',
    'Please Copy',
  ];
  assert.deepEqual(TEMPLATE_SNIPPETS, expected);
  // The zero-width space is really there (U+200B).
  assert.ok(TEMPLATE_SNIPPETS[4].includes('\u200b'));
  assert.equal([...TEMPLATE_SNIPPETS[4]].length, 14);
});
