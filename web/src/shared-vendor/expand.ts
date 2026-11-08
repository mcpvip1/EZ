/**
 * Shorthand code expansion — the heart of the EASY 2D app.
 *
 * Faithful port of ModTran.xInput (validation + totals) and ModTran.xCalc
 * (expanded number list vNo[]) from
 * ~/workspace/2d-rebuild/decompiled/_Simple/ModTran.cs.
 * The live entry path uses xInput; the save path re-expands with xCalc.
 * Where the two differ, the xCalc expansion list is used (see README §
 * "ModTran divergences").
 *
 * Entry rules (MDIMain.txtNoF_KeyDown / txtAmtF_KeyDown):
 * - code chars allowed: 0-9 + - * / . p z space a q n (either case), lowercased
 *   before processing; anything else is rejected silently -> null.
 * - amount chars: digits / . ; empty or 0 -> null.
 * - amount "a/b" (slash-split) is only meaningful for a reverse pair:
 *   first number gets a, reverse gets b, row total a+b.
 */

import type { ExpandResult, ExpandedNumber } from './types.js';
import { roundHalfEven } from './settle.js';

export function reverseNo(no: string): string {
  if (no.length === 2) return no[1] + no[0];
  return [...no].reverse().join('');
}

export function pad2(n: number | string): string {
  const s = String(n);
  return s.length >= 2 ? s : '0' + s;
}

/* ------------------------------------------------------------------ */
/* Literal pattern tables (copied verbatim from ModTran.xInput/xCalc) */
/* ------------------------------------------------------------------ */

const NAMED: Readonly<Record<string, { display: string; numbers: readonly string[] }>> = {
  a: {
    display: 'S-B',
    numbers: ['01', '12', '23', '34', '45', '56', '67', '78', '89', '90'],
  },
  z: {
    display: 'B-S',
    numbers: ['09', '10', '21', '32', '43', '54', '65', '76', '87', '98'],
  },
  q: {
    display: '1-SKIP',
    numbers: [
      '02', '20', '13', '31', '24', '42', '35', '53', '46', '64',
      '57', '75', '68', '86', '79', '97', '80', '08', '91', '19',
    ],
  },
  '++': {
    display: '++',
    numbers: [
      '00', '02', '04', '06', '08', '20', '22', '24', '26', '28',
      '40', '42', '44', '46', '48', '60', '62', '64', '66', '68',
      '80', '82', '84', '86', '88',
    ],
  },
  '--': {
    display: '--',
    numbers: [
      '11', '13', '15', '17', '19', '31', '33', '35', '37', '39',
      '51', '53', '55', '57', '59', '71', '73', '75', '77', '79',
      '91', '93', '95', '97', '99',
    ],
  },
  '+-': {
    display: '+-',
    numbers: [
      '01', '03', '05', '07', '09', '21', '23', '25', '27', '29',
      '41', '43', '45', '47', '49', '61', '63', '65', '67', '69',
      '81', '83', '85', '87', '89',
    ],
  },
  '-+': {
    display: '-+',
    numbers: [
      '10', '12', '14', '16', '18', '30', '32', '34', '36', '38',
      '50', '52', '54', '56', '58', '70', '72', '74', '76', '78',
      '90', '92', '94', '96', '98',
    ],
  },
  '//': {
    display: 'PAR',
    numbers: ['00', '11', '22', '33', '44', '55', '66', '77', '88', '99'],
  },
  '**': {
    display: 'POW',
    numbers: ['05', '50', '16', '61', '27', '72', '38', '83', '49', '94'],
  },
  '*/': {
    display: 'BRT',
    numbers: [
      '01', '10', '12', '21', '23', '32', '34', '43', '45', '54',
      '56', '65', '67', '76', '78', '87', '89', '98', '90', '09',
    ],
  },
  '/*': {
    display: 'ZOD',
    numbers: ['07', '70', '18', '81', '24', '42', '35', '53', '69', '96'],
  },
  pz: {
    display: 'PZ',
    numbers: [
      '57', '68', '74', '85', '92', '03', '19', '20', '31', '46',
      '75', '86', '47', '58', '29', '30', '91', '02', '13', '64',
    ],
  },
  '+//': { display: '+//', numbers: ['00', '22', '44', '66', '88'] },
  '-//': { display: '-//', numbers: ['11', '33', '55', '77', '99'] },
  pn: {
    display: 'P-N',
    numbers: ['02', '20', '24', '42', '34', '43', '57', '75', '79', '97', '89', '98'],
  },
  '2+6': {
    display: '2(+)6',
    numbers: ['02', '20', '64', '46', '19', '91', '31', '13', '68', '86', '75', '57'],
  },
  n: { display: 'NAM', numbers: ['07', '70', '29', '92', '48', '84'] },
};

/**
 * "Break" sets, copied verbatim from ModTran.xInput (d* switch) and
 * xCheckValidNo. Each set is the digit-sum set for d: pairs whose digits
 * sum to d, then pairs whose digits sum to d+10 (see tests, which verify
 * the digit-sum rule reproduces every list exactly).
 */
export const BREAK_SETS: Readonly<Record<string, readonly string[]>> = {
  '0': ['00', '19', '91', '28', '82', '37', '73', '46', '64', '55'],
  '1': ['01', '10', '29', '92', '38', '83', '47', '74', '56', '65'],
  '2': ['02', '20', '11', '39', '93', '48', '84', '57', '75', '66'],
  '3': ['03', '30', '12', '21', '49', '94', '58', '85', '67', '76'],
  '4': ['04', '40', '13', '31', '22', '59', '95', '68', '86', '77'],
  '5': ['05', '50', '14', '41', '23', '32', '69', '96', '78', '87'],
  '6': ['06', '60', '15', '51', '24', '42', '33', '79', '97', '88'],
  '7': ['07', '70', '16', '61', '25', '52', '34', '43', '89', '98'],
  '8': ['08', '80', '17', '71', '26', '62', '35', '53', '44', '99'],
  '9': ['09', '90', '18', '81', '27', '72', '36', '63', '45', '54'],
};

/** funcLeftRight digit map (ModTran.funcLeftRight). */
export const LEFT_RIGHT_MAP: Readonly<Record<string, string>> = {
  '0': '057',
  '1': '168',
  '2': '2749',
  '3': '385',
  '4': '4928',
  '5': '503',
  '6': '619',
  '7': '720',
  '8': '8314',
  '9': '9462',
};

/* ------------------------------------------------------------------ */
/* Rule-generated sets (verified against the literal lists in tests)  */
/* ------------------------------------------------------------------ */

/**
 * 0+k skip sets: pairs with circular digit-difference k, both directions.
 * First half: (d, (d+k) mod 10) for d = 0..9; second half: the reverses.
 * NOTE the 0+5 quirk: for k=5 the set is closed under reversal, so the
 * 20-element list is the same 10 numbers twice (second half rotated):
 * 05 16 27 38 49 50 61 72 83 94, then 50 61 72 83 94 05 16 27 38 49.
 * The save loop inserts one Bet row per list entry, so each of the 10
 * numbers gets TWO rows of the typed amount (row total still amount x 20).
 */
export function skipSet(k: number): string[] {
  const first: string[] = [];
  for (let d = 0; d <= 9; d++) first.push(`${d}${(d + k) % 10}`);
  return [...first, ...first.map(reverseNo)];
}

/** d+ ("LP"): all 19 numbers containing digit d, in ModTran order. */
export function containingSet(d: string): string[] {
  const out: string[] = [];
  for (let i = 0; i <= 9; i++) out.push(`${d}${i}`);
  for (let i = 0; i <= 9; i++) {
    if (i !== Number(d)) out.push(`${i}${d}`);
  }
  return out;
}

/**
 * +/d (other digit even) and -/d (other digit odd): all numbers containing
 * digit d whose OTHER digit has the given parity, in ModTran order:
 * d as second digit first, then d as first digit, duplicates dropped.
 */
export function slashDigitSet(d: string, parity: 'even' | 'odd'): string[] {
  const want = parity === 'even' ? [0, 2, 4, 6, 8] : [1, 3, 5, 7, 9];
  const out: string[] = [];
  for (const f of want) out.push(`${f}${d}`);
  for (const s of want) {
    const no = `${d}${s}`;
    if (!out.includes(no)) out.push(no);
  }
  return out;
}

/** d/ front series d0..d9; /d back series 0d..9d. */
export function frontSeries(d: string): string[] {
  return Array.from({ length: 10 }, (_, i) => `${d}${i}`);
}
export function backSeries(d: string): string[] {
  return Array.from({ length: 10 }, (_, i) => `${i}${d}`);
}

/** ModTran.CodeConvertC2N: pattern code -> display name. */
export function codeConvertC2N(n: string): string {
  switch (n) {
    case '++':
    case '--':
    case '+-':
    case '-+':
    case '+//':
    case '-//':
      return n;
    case '//':
      return 'PAR';
    case '**':
      return 'POW';
    case '*/':
      return 'BRT';
    case '/*':
      return 'ZOD';
    case 'pz':
      return 'PZ';
    default: {
      if (/^\d\/$/.test(n)) return `${n[0]} F-`;
      if (/^\/\d$/.test(n)) return `${n[1]} B-`;
      if (/^\d\*$/.test(n)) return `${n[0]} BK`;
      if (/^\d\+$/.test(n)) return `${n[0]} LP`;
      return '';
    }
  }
}

/** Pattern list for a 2-char pattern code, as xCheckValidNo builds it. */
function patternList(pattern: string): string[] | null {
  if (pattern in NAMED) return [...NAMED[pattern].numbers];
  if (/^\d\/$/.test(pattern)) return frontSeries(pattern[0]);
  if (/^\/\d$/.test(pattern)) return backSeries(pattern[1]);
  if (/^\d\*$/.test(pattern)) return [...BREAK_SETS[pattern[0]]];
  if (/^\d\+$/.test(pattern)) return containingSet(pattern[0]);
  return null;
}

/* ------------------------------------------------------------------ */
/* Amount parsing                                                     */
/* ------------------------------------------------------------------ */

type ParsedAmount =
  | { kind: 'plain'; value: number }
  | { kind: 'split'; a: number; b: number };

function parseAmount(amountText: string): ParsedAmount | null {
  if (!/^\d+(\.\d+)?(\/\d+(\.\d+)?)?$/.test(amountText)) return null;
  if (amountText.includes('/')) {
    const [a, b] = amountText.split('/').map(Number);
    if (a === 0 && b === 0) return null;
    return { kind: 'split', a, b };
  }
  const value = Number(amountText);
  if (value === 0) return null;
  return { kind: 'plain', value };
}

/* ------------------------------------------------------------------ */
/* Core expansion (xInput order, xCalc lists)                         */
/* ------------------------------------------------------------------ */

interface CoreExpansion {
  displayCode: string;
  codeNo: string;
  numbers: string[];
  isReverse: boolean;
  /** Only the two reverse-pair forms accept a split "a/b" amount. */
  splitOk: boolean;
  /** Row-total multiplier override (NNN+ with repeated digits). */
  totalCount?: number;
}

const OP_CHARS = new Set(['+', '-', '*', '/']);
const isDigit = (c: string): boolean => c >= '0' && c <= '9';

/**
 * Expand a code to its number list, following ModTran.xInput's branch
 * order. Returns null when no branch matches (invalid code).
 */
function expandCore(n: string): CoreExpansion | null {
  // Named patterns (xInput switch).
  if (n in NAMED) {
    return {
      displayCode: NAMED[n].display,
      codeNo: n,
      numbers: [...NAMED[n].numbers],
      isReverse: false,
      splitOk: false,
    };
  }
  // 0+k skip sets.
  const skip = /^0\+([2-9])$/.exec(n);
  if (skip) {
    const k = Number(skip[1]);
    return {
      displayCode: `${k}-SKIP`,
      codeNo: n,
      numbers: skipSet(k),
      isReverse: false,
      splitOk: false,
    };
  }
  // +/d and -/d.
  const slashDigit = /^([+-])\/([0-9])$/.exec(n);
  if (slashDigit) {
    const [, sign, d] = slashDigit;
    return {
      displayCode: `${sign === '+' ? '02468' : '13579'}/${d}+`,
      codeNo: n,
      numbers: slashDigitSet(d, sign === '+' ? 'even' : 'odd'),
      isReverse: false,
      splitOk: false,
    };
  }

  // a-b: digit-dash-digit. MDIMain converts this with funcLeftRight BEFORE
  // calling xInput; the stored CodeNo is the converted "Lset/Rset" string
  // and the display keeps the raw "a-b".
  const dash = /^([0-9])-([0-9])$/.exec(n);
  if (dash) {
    const left = LEFT_RIGHT_MAP[dash[1]];
    const right = LEFT_RIGHT_MAP[dash[2]];
    const numbers: string[] = [];
    for (const a of left) for (const b of right) numbers.push(a + b);
    return {
      displayCode: n,
      codeNo: `${left}/${right}`,
      numbers,
      isReverse: false,
      splitOk: false,
    };
  }

  // Exclusion patterns, len 5 (one excluded number) and len 7 (two).
  // xInput checks: pattern prefix + "-" + numeric exclusion(s); the
  // excluded number(s) must belong to the pattern (xCheckValidNo).
  // The three shapes are: named pattern ("++-12"), digit pattern
  // ("0+-12"), and back-series pattern ("/0-20"). In all three the
  // pattern is the first 2 chars and the exclusions follow the "-".
  const isExclusionShape =
    (n.length === 5 || n.length === 7) &&
    n[2] === '-' &&
    /^\d+$/.test(n.slice(3)) &&
    ((/^(?:\+\+|--|\+-|-\+|\/\/|\*\*|\*\/|\/\*|pz)$/.test(n.slice(0, 2))) ||
      (isDigit(n[0]) && ['+', '-', '*', '/'].includes(n[1])) ||
      (n[0] === '/' && isDigit(n[1])));
  if (isExclusionShape) {
    const pattern = n.slice(0, 2);
    const excluded = n.length === 5 ? [n.slice(3, 5)] : [n.slice(3, 5), n.slice(5, 7)];
    const list = patternList(pattern);
    if (list && excluded.every((e) => list.includes(e))) {
      const numbers = list.filter((no) => !excluded.includes(no));
      return {
        displayCode: codeConvertC2N(pattern) + n.slice(2),
        codeNo: n,
        numbers,
        isReverse: false,
        splitOk: false,
      };
    }
    return null;
  }

  // NN+ reverse pair (xInput len-3 branch, ModTran.cs:991: the third
  // char must be exactly "+"; "NN@" has no branch — "@" only appears
  // in xInputReverse, the clipboard-paste path, never in typed entry).
  const rev = /^([0-9]{2})\+$/.exec(n);
  if (rev) {
    const no = rev[1];
    return {
      displayCode: `${no} R`,
      codeNo: `${no}+`,
      numbers: [no, reverseNo(no)],
      isReverse: true,
      splitOk: true,
    };
  }

  // a/b cross-product branches. xInput: code contains "/", not "//",
  // first and last char not "/". Trailing "+" doubles each pair.
  if (n.length > 2 && n.includes('/') && !n.includes('//')) {
    if (n.endsWith('+')) {
      const body = n.slice(0, -1);
      if (!body.startsWith('/') && !body.endsWith('/')) {
        const [left, right] = body.split('/');
        if (left !== undefined && right !== undefined) {
          const numbers: string[] = [];
          for (const a of left) {
            for (const b of right) {
              numbers.push(a + b);
              if (a !== b) numbers.push(b + a);
            }
          }
          return {
            displayCode: n,
            codeNo: n,
            numbers,
            isReverse: false,
            splitOk: false,
          };
        }
      }
      return null;
    }
    if (!n.startsWith('/') && !n.endsWith('/')) {
      const [left, right] = n.split('/');
      if (left !== undefined && right !== undefined) {
        const numbers: string[] = [];
        for (const a of left) for (const b of right) numbers.push(a + b);
        return { displayCode: n, codeNo: n, numbers, isReverse: false, splitOk: false };
      }
    }
    return null;
  }

  // NNN...++ : all ordered pairs (with repetition) of the digits.
  if (n.length >= 5 && n.endsWith('++') && /^\d+$/.test(n.slice(0, -2))) {
    const digits = n.slice(0, -2).split('');
    const numbers: string[] = [];
    for (const a of digits) for (const b of digits) numbers.push(a + b);
    return { displayCode: n, codeNo: n, numbers, isReverse: false, splitOk: false };
  }

  // NNN...+ : all ordered pairs of DISTINCT digits (positional — repeated
  // input digits can yield duplicate pairs; the row total still counts
  // k*(k-1) pairs, as xInput does).
  if (n.length >= 4 && n.endsWith('+') && /^\d+$/.test(n.slice(0, -1))) {
    const digits = n.slice(0, -1).split('');
    const k = digits.length;
    const numbers: string[] = [];
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        if (digits[i] !== digits[j]) numbers.push(digits[i] + digits[j]);
      }
    }
    return {
      displayCode: n,
      codeNo: n,
      numbers,
      isReverse: false,
      splitOk: false,
      totalCount: k * (k - 1),
    };
  }

  // Two-digit plain number / reverse pair with split amount.
  // (xInput requires neither char to be an operator; digits are required
  // here — see README: the original would also accept e.g. "an", which
  // then crashes its board update, so we reject non-digits.)
  if (n.length === 2 && !OP_CHARS.has(n[0]) && !OP_CHARS.has(n[1])) {
    if (isDigit(n[0]) && isDigit(n[1])) {
      return {
        displayCode: n,
        codeNo: n,
        numbers: [n, reverseNo(n)],
        isReverse: true,
        splitOk: true,
        // Single-number form when the amount is plain; the pair form when
        // it is split. expandCode decides using the amount kind.
        totalCount: 1,
      };
    }
    return null;
  }

  // Digit patterns (xInput default, in order): d/ , /d , d* , d+.
  if (n.length === 2) {
    if (isDigit(n[0]) && n[1] === '/') {
      return { displayCode: `${n[0]} F-`, codeNo: n, numbers: frontSeries(n[0]), isReverse: false, splitOk: false };
    }
    if (n[0] === '/' && isDigit(n[1])) {
      return { displayCode: `${n[1]} B-`, codeNo: n, numbers: backSeries(n[1]), isReverse: false, splitOk: false };
    }
    if (isDigit(n[0]) && n[1] === '*') {
      return { displayCode: `${n[0]} BK`, codeNo: n, numbers: [...BREAK_SETS[n[0]]], isReverse: false, splitOk: false };
    }
    if (isDigit(n[0]) && n[1] === '+') {
      return { displayCode: `${n[0]} LP`, codeNo: n, numbers: containingSet(n[0]), isReverse: false, splitOk: false };
    }
    return null;
  }

  // Single digit: xInput/xCalc have no length-1 branch — a lone digit
  // is rejected by the original (ModTran.cs: the switch has only the
  // named single-char codes a/z/q/n; the default branch needs len 2+).
  // It falls through to null below.

  return null;
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Expand one typed code + amount. Returns null for an invalid code or
 * amount (silent reject, like the original: no message, focus back).
 * amountText may be "1000" or the split form "a/b" (reverse pair only).
 */
export function expandCode(code: string, amountText: string): ExpandResult | null {
  if (typeof code !== 'string' || typeof amountText !== 'string') return null;
  const n = code.trim().toLowerCase();
  const amt = amountText.trim();
  // '@' is not typeable in the original code box (keypress filter) and
  // xInput has no "@" branch, so NN@ is rejected here (see D14).
  if (n === '' || !/^[0-9+\-*/.pz aqn]+$/.test(n)) return null;
  const parsed = parseAmount(amt);
  if (!parsed) return null;

  const core = expandCore(n);
  if (!core) return null;
  // xInput default guard: a "/" code with a "/" amount is invalid.
  if (parsed.kind === 'split' && !core.splitOk) return null;

  if (parsed.kind === 'split') {
    // Reverse pair only: first number gets a, reverse gets b.
    const numbers: ExpandedNumber[] = [
      { no: core.numbers[0], amount: parsed.a },
      { no: core.numbers[1], amount: parsed.b },
    ];
    return {
      displayCode: core.displayCode,
      codeNo: core.codeNo,
      numbers,
      rowTotal: roundHalfEven(parsed.a) + roundHalfEven(parsed.b),
      isReverse: true,
    };
  }

  const v = parsed.value;
  // The two-digit plain branch stores a single number for a plain amount
  // (the pair only exists for a split amount).
  const numbers =
    core.numbers.length === 2 && core.isReverse && core.totalCount === 1
      ? [core.numbers[0]]
      : core.numbers;
  const count = core.totalCount ?? core.numbers.length;
  const rowTotal = core.totalCount === 1 ? roundHalfEven(v) : roundHalfEven(v * count);
  return {
    displayCode: core.displayCode,
    codeNo: core.codeNo,
    numbers: numbers.map((no) => ({ no, amount: v })),
    rowTotal,
    isReverse: numbers.length === 2 && core.isReverse,
  };
}

/**
 * Space-separated list entry (MDIMain entry handler).
 *
 * - Input longer than 4 chars containing a space splits on spaces; each
 *   token becomes one row. Shorter / space-less input is a single code.
 * - Trailing "+" on the whole input means "also the reverse": "+" is
 *   appended to each non-twin token (twin = first two chars equal).
 *   A trailing "+" combined with a split "a/b" amount rejects the entry.
 * - A 3-char token displays as "NN R".
 * - Split amount "a/b": a twin token takes the first part, others take
 *   a+b as row total.
 * - NOTE the list-mode row total is the typed amount (x2 for a reversed
 *   non-twin), NOT amount x number-of-numbers — that is the original's
 *   grid behaviour (its BetCode.RowTotal can be smaller than the sum of
 *   the Bet rows it saves). numbers[] still carries the full expansion
 *   with per-number amounts, so the board/save side stays correct.
 */
export function expandEntryList(input: string, amountText: string): ExpandResult[] {
  if (typeof input !== 'string' || typeof amountText !== 'string') return [];
  const raw = input.trim().toLowerCase();
  const amt = amountText.trim();
  if (raw === '' || !/^[0-9+\-*/.pz aqn ]+$/.test(raw)) return [];
  const parsed = parseAmount(amt);
  if (!parsed) return [];

  const isList = raw.length > 4 && raw.includes(' ');
  if (!isList) {
    const one = expandCode(raw, amt);
    return one ? [one] : [];
  }

  const trailingPlus = raw.endsWith('+');
  if (trailingPlus && amt.includes('/')) return [];
  const core = trailingPlus ? raw.slice(0, -1) : raw;
  const tokens = core.split(' ').filter((t) => t.length > 0);

  return tokens.map((token) => {
    const twin = token.length >= 2 && token[0] === token[1];
    const effective = trailingPlus && !twin ? `${token}+` : token;
    const displayCode =
      effective.length === 3 ? `${effective.slice(0, 2)} R` : effective;
    // Split amount: twin takes the first part, others the whole "a/b".
    const amountForToken =
      parsed.kind === 'split' && twin ? String(parsed.a) : amt;
    const base = expandCode(effective, amountForToken);

    let rowTotal: number;
    if (parsed.kind === 'split') {
      rowTotal = twin
        ? roundHalfEven(parsed.a)
        : roundHalfEven(parsed.a) + roundHalfEven(parsed.b);
    } else {
      rowTotal = roundHalfEven(parsed.value * (trailingPlus && !twin ? 2 : 1));
    }

    if (!base) {
      // The original list path does no per-token validation: the row is
      // added anyway and xCalc simply expands to nothing. Keep the row
      // with an empty number list.
      return {
        displayCode,
        codeNo: effective,
        numbers: [],
        rowTotal,
        isReverse: false,
      };
    }
    return {
      displayCode,
      codeNo: effective,
      numbers: base.numbers,
      rowTotal,
      isReverse: base.isReverse,
    };
  });
}
