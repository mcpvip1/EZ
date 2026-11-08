/**
 * Tests for the code-expansion engine (expand.ts).
 * Literal lists are copied from ModTran.xInput / xCalc and are used to
 * verify the rule-generated sets (skip, LP, +/-, break) independently.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BREAK_SETS,
  expandCode,
  expandEntryList,
  pad2,
  reverseNo,
  skipSet,
  containingSet,
  slashDigitSet,
} from './expand.js';

const nos = (r: ReturnType<typeof expandCode>): string[] =>
  (r?.numbers ?? []).map((n) => n.no);
const amounts = (r: ReturnType<typeof expandCode>): number[] =>
  (r?.numbers ?? []).map((n) => n.amount);

/* Literal 0+k skip lists from ModTran.xInput (the authority). */
const SKIP_LITERALS: Record<number, string[]> = {
  2: '02 13 24 35 46 57 68 79 80 91 20 31 42 53 64 75 86 97 08 19'.split(' '),
  3: '03 14 25 36 47 58 69 70 81 92 30 41 52 63 74 85 96 07 18 29'.split(' '),
  4: '04 15 26 37 48 59 60 71 82 93 40 51 62 73 84 95 06 17 28 39'.split(' '),
  5: '05 16 27 38 49 50 61 72 83 94 50 61 72 83 94 05 16 27 38 49'.split(' '),
  6: '06 17 28 39 40 51 62 73 84 95 60 71 82 93 04 15 26 37 48 59'.split(' '),
  7: '07 18 29 30 41 52 63 74 85 96 70 81 92 03 14 25 36 47 58 69'.split(' '),
  8: '08 19 20 31 42 53 64 75 86 97 80 91 02 13 24 35 46 57 68 79'.split(' '),
  9: '09 10 21 32 43 54 65 76 87 98 90 01 12 23 34 45 56 67 78 89'.split(' '),
};

/* Literal +/d and -/d lists from ModTran.xInput. */
const SLASH_LITERALS: Record<string, string[]> = {
  '+/0': '00 20 40 60 80 02 04 06 08'.split(' '),
  '+/1': '01 21 41 61 81 10 12 14 16 18'.split(' '),
  '+/2': '02 22 42 62 82 20 24 26 28'.split(' '),
  '+/3': '03 23 43 63 83 30 32 34 36 38'.split(' '),
  '+/4': '04 24 44 64 84 40 42 46 48'.split(' '),
  '+/5': '05 25 45 65 85 50 52 54 56 58'.split(' '),
  '+/6': '06 26 46 66 86 60 62 64 68'.split(' '),
  '+/7': '07 27 47 67 87 70 72 74 76 78'.split(' '),
  '+/8': '08 28 48 68 88 80 82 84 86'.split(' '),
  '+/9': '09 29 49 69 89 90 92 94 96 98'.split(' '),
  '-/0': '10 30 50 70 90 01 03 05 07 09'.split(' '),
  '-/1': '11 31 51 71 91 13 15 17 19'.split(' '),
  '-/2': '12 32 52 72 92 21 23 25 27 29'.split(' '),
  '-/3': '13 33 53 73 93 31 35 37 39'.split(' '),
  '-/4': '14 34 54 74 94 41 43 45 47 49'.split(' '),
  '-/5': '15 35 55 75 95 51 53 57 59'.split(' '),
  '-/6': '16 36 56 76 96 61 63 65 67 69'.split(' '),
  '-/7': '17 37 57 77 97 71 73 75 79'.split(' '),
  '-/8': '18 38 58 78 98 81 83 85 87 89'.split(' '),
  '-/9': '19 39 59 79 99 91 93 95 97'.split(' '),
};

test('helpers: reverseNo and pad2', () => {
  assert.equal(reverseNo('12'), '21');
  assert.equal(reverseNo('05'), '50');
  assert.equal(reverseNo('11'), '11');
  assert.equal(pad2(5), '05');
  assert.equal(pad2('5'), '05');
  assert.equal(pad2(12), '12');
  assert.equal(pad2(0), '00');
});

test('named patterns: PAR, POW, BRT, ZOD', () => {
  const par = expandCode('//', '100');
  assert.equal(par?.displayCode, 'PAR');
  assert.deepEqual(nos(par), ['00', '11', '22', '33', '44', '55', '66', '77', '88', '99']);
  assert.equal(par?.rowTotal, 1000);
  assert.equal(par?.isReverse, false);

  const pow = expandCode('**', '100');
  assert.equal(pow?.displayCode, 'POW');
  assert.deepEqual(nos(pow), ['05', '50', '16', '61', '27', '72', '38', '83', '49', '94']);
  assert.equal(pow?.rowTotal, 1000);

  const brt = expandCode('*/', '100');
  assert.equal(brt?.displayCode, 'BRT');
  assert.equal(nos(brt).length, 20);
  assert.deepEqual(nos(brt).slice(0, 4), ['01', '10', '12', '21']);
  assert.deepEqual(nos(brt).slice(-2), ['90', '09']);
  assert.equal(brt?.rowTotal, 2000);

  const zod = expandCode('/*', '100');
  assert.equal(zod?.displayCode, 'ZOD');
  assert.deepEqual(nos(zod), ['07', '70', '18', '81', '24', '42', '35', '53', '69', '96']);
  assert.equal(zod?.rowTotal, 1000);
});

test('named patterns: a, z, q, ++, +//, -//, pn, 2+6, n, pz', () => {
  const a = expandCode('a', '100');
  assert.equal(a?.displayCode, 'S-B');
  assert.deepEqual(nos(a), ['01', '12', '23', '34', '45', '56', '67', '78', '89', '90']);
  assert.equal(a?.rowTotal, 1000);

  const z = expandCode('z', '100');
  assert.equal(z?.displayCode, 'B-S');
  assert.deepEqual(nos(z), ['09', '10', '21', '32', '43', '54', '65', '76', '87', '98']);

  const q = expandCode('q', '100');
  assert.equal(q?.displayCode, '1-SKIP');
  assert.equal(nos(q).length, 20);
  assert.deepEqual(nos(q).slice(0, 4), ['02', '20', '13', '31']);

  const plusPlus = expandCode('++', '100');
  assert.equal(plusPlus?.displayCode, '++');
  assert.equal(nos(plusPlus).length, 25);
  assert.deepEqual(nos(plusPlus).slice(0, 5), ['00', '02', '04', '06', '08']);
  assert.equal(plusPlus?.rowTotal, 2500);

  assert.deepEqual(nos(expandCode('+//', '100')), ['00', '22', '44', '66', '88']);
  assert.deepEqual(nos(expandCode('-//', '100')), ['11', '33', '55', '77', '99']);

  const pn = expandCode('pn', '100');
  assert.equal(pn?.displayCode, 'P-N');
  assert.deepEqual(nos(pn), ['02', '20', '24', '42', '34', '43', '57', '75', '79', '97', '89', '98']);

  const twoSix = expandCode('2+6', '100');
  assert.equal(twoSix?.displayCode, '2(+)6');
  assert.deepEqual(nos(twoSix), ['02', '20', '64', '46', '19', '91', '31', '13', '68', '86', '75', '57']);

  const n = expandCode('n', '100');
  assert.equal(n?.displayCode, 'NAM');
  assert.deepEqual(nos(n), ['07', '70', '29', '92', '48', '84']);

  const pz = expandCode('pz', '100');
  assert.equal(pz?.displayCode, 'PZ');
  assert.equal(nos(pz).length, 20);
  assert.deepEqual(nos(pz).slice(0, 3), ['57', '68', '74']);

  // Case-insensitive: the original lowercases the code box.
  assert.equal(expandCode('PZ', '100')?.displayCode, 'PZ');
  assert.equal(expandCode('A', '100')?.displayCode, 'S-B');
});

test('skip sets 0+2..0+9 match the literal lists (rule-generated)', () => {
  for (const [k, literal] of Object.entries(SKIP_LITERALS)) {
    assert.deepEqual(skipSet(Number(k)), literal, `0+${k}`);
    const r = expandCode(`0+${k}`, '100');
    assert.equal(r?.displayCode, `${k}-SKIP`);
    assert.deepEqual(nos(r), literal);
    assert.equal(r?.rowTotal, 2000);
  }
});

test('0+5 double-count quirk: same 10 numbers twice, 20 rows', () => {
  const r = expandCode('0+5', '100');
  assert.equal(nos(r).length, 20);
  assert.equal(r?.rowTotal, 2000);
  // Each of the 10 numbers appears exactly twice.
  const counts = new Map<string, number>();
  for (const no of nos(r)) counts.set(no, (counts.get(no) ?? 0) + 1);
  assert.equal(counts.size, 10);
  for (const c of counts.values()) assert.equal(c, 2);
  assert.deepEqual(amounts(r), new Array(20).fill(100));
});

test('+/d and -/d match the literal lists (rule-generated)', () => {
  for (const [code, literal] of Object.entries(SLASH_LITERALS)) {
    const sign = code[0] as '+' | '-';
    const d = code[2];
    assert.deepEqual(slashDigitSet(d, sign === '+' ? 'even' : 'odd'), literal, code);
    const r = expandCode(code, '100');
    assert.deepEqual(nos(r), literal);
    assert.equal(r?.rowTotal, 100 * literal.length);
  }
  assert.equal(expandCode('+/0', '100')?.displayCode, '02468/0+');
  assert.equal(expandCode('-/0', '100')?.displayCode, '13579/0+');
});

test('digit patterns: d+ (LP), d/, /d, d* break', () => {
  const lp = expandCode('0+', '100');
  assert.equal(lp?.displayCode, '0 LP');
  assert.equal(nos(lp).length, 19);
  assert.deepEqual(nos(lp).slice(0, 10), ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09']);
  assert.deepEqual(nos(lp).slice(10), ['10', '20', '30', '40', '50', '60', '70', '80', '90']);
  assert.equal(lp?.rowTotal, 1900);

  const front = expandCode('3/', '100');
  assert.equal(front?.displayCode, '3 F-');
  assert.deepEqual(nos(front), ['30', '31', '32', '33', '34', '35', '36', '37', '38', '39']);

  const back = expandCode('/7', '100');
  assert.equal(back?.displayCode, '7 B-');
  assert.deepEqual(nos(back), ['07', '17', '27', '37', '47', '57', '67', '77', '87', '97']);

  const bk = expandCode('0*', '100');
  assert.equal(bk?.displayCode, '0 BK');
  assert.deepEqual(nos(bk), ['00', '19', '91', '28', '82', '37', '73', '46', '64', '55']);
  assert.equal(bk?.rowTotal, 1000);
});

test('break sets follow the digit-sum rule (d, then d+10)', () => {
  // Independent re-derivation: pairs summing to d, then to d+10.
  const byRule = (d: number): string[] => {
    const out: string[] = [];
    for (const s of [d, d + 10]) {
      if (s > 18) continue;
      for (let a = Math.max(0, s - 9); a <= Math.floor(s / 2); a++) {
        out.push(`${a}${s - a}`);
        if (a !== s - a) out.push(`${s - a}${a}`);
      }
    }
    return out;
  };
  for (let d = 0; d <= 9; d++) {
    assert.deepEqual([...BREAK_SETS[String(d)]], byRule(d), `break ${d}`);
    assert.deepEqual(nos(expandCode(`${d}*`, '100')), byRule(d));
  }
});

test('LP sets follow the containing-digit rule', () => {
  for (let d = 0; d <= 9; d++) {
    const expected: string[] = [];
    for (let i = 0; i <= 9; i++) expected.push(`${d}${i}`);
    for (let i = 0; i <= 9; i++) if (i !== d) expected.push(`${i}${d}`);
    assert.deepEqual(containingSet(String(d)), expected, `LP ${d}`);
  }
});

test('reverse: NN+ (NN@ rejected, D14), plain NN, split a/b amount', () => {
  const r = expandCode('43+', '1000');
  assert.equal(r?.displayCode, '43 R');
  assert.equal(r?.codeNo, '43+');
  assert.deepEqual(r?.numbers, [
    { no: '43', amount: 1000 },
    { no: '34', amount: 1000 },
  ]);
  assert.equal(r?.rowTotal, 2000);
  assert.equal(r?.isReverse, true);

  const plain = expandCode('43', '1000');
  assert.equal(plain?.displayCode, '43');
  assert.deepEqual(plain?.numbers, [{ no: '43', amount: 1000 }]);
  assert.equal(plain?.rowTotal, 1000);
  assert.equal(plain?.isReverse, false);

  const split = expandCode('43', '100/200');
  assert.deepEqual(split?.numbers, [
    { no: '43', amount: 100 },
    { no: '34', amount: 200 },
  ]);
  assert.equal(split?.rowTotal, 300);
  assert.equal(split?.isReverse, true);

  const splitPlus = expandCode('43+', '100/200');
  assert.deepEqual(splitPlus?.numbers, [
    { no: '43', amount: 100 },
    { no: '34', amount: 200 },
  ]);
  assert.equal(splitPlus?.rowTotal, 300);

  // Twin with split amount: two rows on the same number.
  const twin = expandCode('11', '100/200');
  assert.deepEqual(twin?.numbers, [
    { no: '11', amount: 100 },
    { no: '11', amount: 200 },
  ]);
  assert.equal(twin?.rowTotal, 300);

  // Split amount is only for reverse pairs.
  assert.equal(expandCode('//', '100/200'), null);
  assert.equal(expandCode('a', '100/200'), null);
  assert.equal(expandCode('12/34', '100/200'), null);
  assert.equal(expandCode('1-2', '100/200'), null);

  // "NN@" is NOT a reverse marker in typed entry: xInput's len-3
  // branch requires exactly "+" (ModTran.cs:991); "@" only appears in
  // xInputReverse, the clipboard-paste path (D14).
  assert.equal(expandCode('43@', '1000'), null);
});

test('a-b funcLeftRight cross (e.g. 1-2)', () => {
  const r = expandCode('1-2', '1000');
  assert.equal(r?.displayCode, '1-2');
  assert.equal(r?.codeNo, '168/2749');
  assert.deepEqual(nos(r), [
    '12', '17', '14', '19',
    '62', '67', '64', '69',
    '82', '87', '84', '89',
  ]);
  assert.equal(r?.rowTotal, 12000);
  assert.equal(r?.isReverse, false);
});

test('cross-product branches: a/b and a/b+', () => {
  const cross = expandCode('12/34', '1000');
  assert.deepEqual(nos(cross), ['13', '14', '23', '24']);
  assert.equal(cross?.rowTotal, 4000);

  const crossPlus = expandCode('12/34+', '1000');
  assert.deepEqual(nos(crossPlus), ['13', '31', '14', '41', '23', '32', '24', '42']);
  assert.equal(crossPlus?.rowTotal, 8000);
  assert.equal(crossPlus?.displayCode, '12/34+');
});

test('NNN+ and NNN++ digit-string branches', () => {
  const plus = expandCode('123+', '1000');
  assert.deepEqual(nos(plus), ['12', '13', '21', '23', '31', '32']);
  assert.equal(plus?.rowTotal, 6000);

  const plusPlus = expandCode('123++', '1000');
  assert.deepEqual(nos(plusPlus), ['11', '12', '13', '21', '22', '23', '31', '32', '33']);
  assert.equal(plusPlus?.rowTotal, 9000);
});

test('exclusion patterns: vOneNo / vTwoNo', () => {
  const one = expandCode('++-22', '100');
  assert.equal(one?.displayCode, '++-22');
  assert.equal(nos(one).length, 24);
  assert.ok(!nos(one).includes('22'));
  assert.equal(one?.rowTotal, 2400);

  // Excluded number must belong to the pattern (xCheckValidNo).
  assert.equal(expandCode('++-12', '100'), null);
  assert.equal(expandCode('0+-12', '100'), null);

  const par = expandCode('//-11', '100');
  assert.equal(par?.displayCode, 'PAR-11');
  assert.equal(nos(par).length, 9);
  assert.ok(!nos(par).includes('11'));

  const lp = expandCode('0+-01', '100');
  assert.equal(lp?.displayCode, '0 LP-01');
  assert.equal(nos(lp).length, 18);
  assert.ok(!nos(lp).includes('01'));

  const two = expandCode('++-2244', '100');
  assert.equal(nos(two).length, 23);
  assert.ok(!nos(two).includes('22') && !nos(two).includes('44'));
  assert.equal(two?.rowTotal, 2300);
  assert.equal(two?.displayCode, '++-2244');
  assert.equal(expandCode('++-2212', '100'), null);
  assert.equal(expandCode('++-2233', '100'), null); // 33 is not in the ++ list
});

test('single digit is rejected (D14: xInput has no len-1 branch)', () => {
  // ModTran.xInput's switch has only the named single-char codes
  // (a/z/q/n); a lone digit matches no branch and returns false.
  for (const d of ['0', '1', '5', '9']) {
    assert.equal(expandCode(d, '100'), null, `single digit ${d}`);
  }
  // The break sets themselves are still used by the d* patterns.
  assert.deepEqual(nos(expandCode('5*', '100')), [...BREAK_SETS['5']]);
});

test('invalid codes and amounts return null (silent reject)', () => {
  assert.equal(expandCode('', '100'), null);
  assert.equal(expandCode('xx', '100'), null);
  assert.equal(expandCode('12', '0'), null);
  assert.equal(expandCode('12', ''), null);
  assert.equal(expandCode('12', 'abc'), null);
  assert.equal(expandCode('12', '100/200/300'), null);
  assert.equal(expandCode('12', '0/0'), null);
  assert.equal(expandCode('12 34', '100'), null);
  assert.equal(expandCode('12!', '100'), null);
  assert.equal(expandCode('2+7', '100'), null);
  assert.equal(expandCode('an', '100'), null);
  assert.equal(expandCode('0+1', '100'), null);
  assert.equal(expandCode('0+10', '100'), null);
});

/* ------------------------------------------------------------------ */
/* expandEntryList                                                    */
/* ------------------------------------------------------------------ */

test('expandEntryList: space-separated list, one row per token', () => {
  const rows = expandEntryList('12 34', '1000');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.displayCode), ['12', '34']);
  assert.deepEqual(rows[0].numbers, [{ no: '12', amount: 1000 }]);
  assert.deepEqual(rows[1].numbers, [{ no: '34', amount: 1000 }]);
  // List-mode row total is the typed amount, not amount x count.
  assert.deepEqual(rows.map((r) => r.rowTotal), [1000, 1000]);
});

test('expandEntryList: trailing + reverses each non-twin token', () => {
  const rows = expandEntryList('12 34+', '1000');
  assert.deepEqual(rows.map((r) => r.displayCode), ['12 R', '34 R']);
  assert.deepEqual(rows[0].numbers, [
    { no: '12', amount: 1000 },
    { no: '21', amount: 1000 },
  ]);
  assert.deepEqual(rows.map((r) => r.rowTotal), [2000, 2000]);

  const twins = expandEntryList('11 12+', '1000');
  assert.deepEqual(twins.map((r) => r.displayCode), ['11', '12 R']);
  assert.deepEqual(twins.map((r) => r.rowTotal), [1000, 2000]);
  assert.deepEqual(twins[0].numbers, [{ no: '11', amount: 1000 }]);
});

test('expandEntryList: split amount — twin takes first part, others a+b', () => {
  const rows = expandEntryList('12 34', '100/200');
  assert.deepEqual(rows.map((r) => r.rowTotal), [300, 300]);
  assert.deepEqual(rows[0].numbers, [
    { no: '12', amount: 100 },
    { no: '21', amount: 200 },
  ]);

  const twins = expandEntryList('11 12', '100/200');
  assert.deepEqual(twins.map((r) => r.rowTotal), [100, 300]);
  assert.deepEqual(twins[0].numbers, [{ no: '11', amount: 100 }]);

  // Trailing + with a split amount rejects the whole entry.
  assert.deepEqual(expandEntryList('12 34+', '100/200'), []);
});

test('expandEntryList: named token keeps raw display, list row total', () => {
  const rows = expandEntryList('// 43', '100');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].displayCode, '//');
  assert.equal(rows[0].numbers.length, 10);
  assert.equal(rows[0].rowTotal, 100);
  assert.equal(rows[1].displayCode, '43');
  assert.equal(rows[1].rowTotal, 100);
});

test('expandEntryList: non-list input is a single code; bad tokens pass through', () => {
  assert.equal(expandEntryList('12', '1000').length, 1);
  assert.deepEqual(expandEntryList('12 3', '1000'), []);
  const rows = expandEntryList('123 45', '1000');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].displayCode, '12 R');
  assert.deepEqual(rows[0].numbers, []);
  assert.equal(rows[0].rowTotal, 1000);
  assert.equal(rows[1].displayCode, '45');
});
