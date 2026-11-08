/**
 * EASY 2D web — Auto bets (audit item #7).
 *
 * Source of truth: `AutoCode` (create) and `AutoEdit` (manage) in
 * ~/workspace/2d-rebuild/decompiled/_Simple/, ANALYSIS.md §4.8.
 *
 * Original model
 * --------------
 * An auto bet is one Fighter + one Auto code (`A3`: letter A–J + session
 * count) + one or more code/amount rows. The letter encodes weekday +
 * session (`ModTran.AJ2WeekDay` / `AJ2AMPM`: A/B = day 1, C/D = day 2,
 * E/F = day 3, G/H = day 4, I/J = day 5; odd letters A,C,E,G,I = AM, even
 * = PM). Start = Sunday of the current week + weekday offset (if today is
 * Saturday, a week is added first, so the start is next week's Sunday +
 * offset); AM starts 08:00, PM 20:00; end = start + 12h x (count - 1).
 * The number is the session count (AutoTimes).
 *
 * On Save the original writes one `AutoCode` header row per grid row
 * (AutoGroupTotal = RowTotal x AutoTimes, AutoGroupID = MAX + 1) and then
 * steps 12h per session, inserting an identical pair into `Auto` and
 * `BetCode` and expanding into `Bet` via `xCalc`. Two rules govern the
 * stepping loop, reproduced here in `autoSessions`:
 *   - Skip closed days: while the stepped-to date is in `CloseDays`,
 *     step another 12h (and re-check). Since `CloseDays` is
 *     date-granular, a closed day shifts the whole remaining schedule
 *     forward by a day; the loop still counts it as one of the
 *     AutoTimes sessions, so the rule still produces `times` sessions
 *     unless Saturday ends it first.
 *   - Break on Saturday: if the stepped-to date is a Saturday, the loop
 *     stops entirely — no auto bets on Saturdays, and no later sessions.
 *
 * Web model
 * ---------
 * There is no `Auto`/`AutoCode` table in IndexedDB (the rebuild's db.ts
 * has no such stores, and this worker must not change db.ts), so rules
 * live in localStorage under `AUTO_STORAGE_KEY` — the same precedent as
 * Close Days (`easy2d-closedays` in Dialogs.tsx). Materialising does NOT
 * write bets: `materialiseRules` expands the due rules for the current
 * day/session into concrete `{ no, amount }` rows and hands them to the
 * parent via `onMaterialise`, which adds them to the Fighter entry grid
 * (the parent's save then writes them exactly like a hand-typed bet).
 * Nothing is ever written for a past session and a deleted group simply
 * stops materialising — bets already saved stay saved.
 *
 * Reference date: the original derives the start week from the system
 * date (`DateAndTime.Now`). The web app works on a working BetDay, so
 * `deriveStartEnd` takes that BetDay as the reference instead — a rule
 * created while viewing a day lands in that day's week.
 */
import { expandCode } from '../shared-vendor/index.ts';
import type { Session } from './db';

/** One saved auto-bet rule = one row of the original AutoCode grid. */
export interface AutoRule {
  id: string;
  /** Original AutoGroupID: one Save = one group. */
  groupId: number;
  fighterNo: string;
  /** Original AutoCode, e.g. "A3" (letter + session count). */
  autoCode: string;
  /** The 2D code-language input, lowercased like the original. */
  code: string;
  amountText: string;
  /** Display code from expandCode, e.g. "PAR", "12 R". */
  displayCode: string;
  /** Stored code from expandCode. */
  codeNo: string;
  /** Row total from expandCode. */
  rowTotal: number;
  startDay: string; // YYYY-MM-DD
  startSession: Session;
  endDay: string; // YYYY-MM-DD
  endSession: Session;
  /** Original AutoTimes: the session count from the Auto code. */
  times: number;
  /** Original AutoGroupTotal = rowTotal x times. */
  groupTotal: number;
  createdAt: number;
}

export interface AutoSessionSlot {
  betDay: string; // YYYY-MM-DD
  session: Session;
}

export interface AutoSchedule {
  startDay: string;
  startSession: Session;
  endDay: string;
  endSession: Session;
  times: number;
}

export const AUTO_STORAGE_KEY = 'easy2d.auto.v1';
export const CLOSED_DAYS_KEY = 'easy2d-closedays';

/* ------------------------------------------------------------------ */
/* Dates (local calendar days; never UTC-shifted)                      */
/* ------------------------------------------------------------------ */

function parseISO(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function isSaturdayISO(day: string): boolean {
  const d = parseISO(day);
  return d !== null && d.getDay() === 6;
}

/* ------------------------------------------------------------------ */
/* Persistence (localStorage, like Close Days)                         */
/* ------------------------------------------------------------------ */

export function loadAutoRules(): AutoRule[] {
  try {
    const raw = localStorage.getItem(AUTO_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is AutoRule =>
        !!r && typeof r === 'object' && typeof (r as AutoRule).id === 'string' && typeof (r as AutoRule).code === 'string',
    );
  } catch {
    return [];
  }
}

export function saveAutoRules(rules: AutoRule[]): void {
  localStorage.setItem(AUTO_STORAGE_KEY, JSON.stringify(rules));
}

export function loadClosedDays(): string[] {
  try {
    const raw = localStorage.getItem(CLOSED_DAYS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

export function nextGroupId(rules: AutoRule[]): number {
  return rules.reduce((m, r) => Math.max(m, r.groupId), 0) + 1;
}

export function newAutoId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/* ------------------------------------------------------------------ */
/* Auto code: letter -> weekday offset + session (ModTran)             */
/* ------------------------------------------------------------------ */

/** A/B = day 1, C/D = day 2, E/F = day 3, G/H = day 4, I/J = day 5;
 *  A,C,E,G,I = AM, B,D,F,H,J = PM. */
export function autoLetterInfo(letter: string): { weekdayOffset: number; session: Session } | null {
  const l = letter.toUpperCase();
  const pairs: Array<[string, string]> = [
    ['A', 'B'],
    ['C', 'D'],
    ['E', 'F'],
    ['G', 'H'],
    ['I', 'J'],
  ];
  for (let i = 0; i < pairs.length; i++) {
    const [am, pm] = pairs[i];
    if (l === am) return { weekdayOffset: i + 1, session: 'AM' };
    if (l === pm) return { weekdayOffset: i + 1, session: 'PM' };
  }
  return null;
}

/**
 * `AutoCode.txtCode_KeyDown`: letter A–J + count (e.g. "A3"). Start =
 * Sunday of the reference week + weekday offset (a Saturday reference
 * first jumps a week ahead); AM 08:00, PM 20:00; end = start +
 * 12h x (count - 1). Returns null for a bad code or a count <= 0.
 */
export function deriveStartEnd(autoCode: string, referenceDay: string): AutoSchedule | null {
  const m = /^([A-Ja-j])(\d+)/.exec(autoCode.trim());
  if (!m) return null;
  const times = parseInt(m[2], 10);
  if (!(times > 0)) return null;
  const info = autoLetterInfo(m[1]);
  if (!info) return null;
  const ref = parseISO(referenceDay);
  if (!ref) return null;
  let base = ref;
  if (base.getDay() === 6) base = addDays(base, 7);
  const sunday = addDays(base, -base.getDay());
  const startDate = addDays(sunday, info.weekdayOffset);
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), info.session === 'AM' ? 8 : 20);
  const end = new Date(start.getTime() + 12 * 3600 * 1000 * (times - 1));
  return {
    startDay: fmtISO(start),
    startSession: info.session,
    endDay: fmtISO(end),
    endSession: end.getHours() < 12 ? 'AM' : 'PM',
    times,
  };
}

/* ------------------------------------------------------------------ */
/* Session schedule — the original btnSave_Click stepping loop         */
/* ------------------------------------------------------------------ */

/**
 * The sessions a rule produces, following `AutoCode.btnSave_Click`
 * exactly: cursor starts 12h before the start, then advances 12h per
 * session; while the stepped-to date is a Close Day it advances another
 * 12h (and re-checks); if the stepped-to date is a Saturday the loop
 * breaks — that session and all later ones are lost.
 */
export function autoSessions(rule: AutoRule, closedDays: string[]): AutoSessionSlot[] {
  const closed = new Set(closedDays);
  const start = parseISO(rule.startDay);
  if (!start) return [];
  let cursor = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
    rule.startSession === 'AM' ? 8 : 20,
  );
  cursor = new Date(cursor.getTime() - 12 * 3600 * 1000);
  const out: AutoSessionSlot[] = [];
  for (let i = 0; i < rule.times; i++) {
    do {
      cursor = new Date(cursor.getTime() + 12 * 3600 * 1000);
    } while (closed.has(fmtISO(cursor)));
    if (cursor.getDay() === 6) break;
    out.push({ betDay: fmtISO(cursor), session: cursor.getHours() < 12 ? 'AM' : 'PM' });
  }
  return out;
}

export function isRuleDue(rule: AutoRule, betDay: string, session: Session, closedDays: string[]): boolean {
  return autoSessions(rule, closedDays).some((s) => s.betDay === betDay && s.session === session);
}

export function dueRules(rules: AutoRule[], betDay: string, session: Session, closedDays: string[]): AutoRule[] {
  return rules.filter((r) => isRuleDue(r, betDay, session, closedDays));
}

/**
 * Materialise every rule due in this day/session into concrete bet
 * rows, expanding each rule's code-language input with the shared
 * `expandCode` (same expansion as hand-typed entry). A rule whose code
 * no longer expands is skipped. Yields nothing on a Saturday or a
 * Close Day — the schedule can never land there (see `autoSessions`),
 * and this guard makes the rule explicit.
 */
export function materialiseRules(
  rules: AutoRule[],
  betDay: string,
  session: Session,
  closedDays: string[],
): Array<{ no: string; amount: number }> {
  if (isSaturdayISO(betDay) || closedDays.includes(betDay)) return [];
  const rows: Array<{ no: string; amount: number }> = [];
  for (const rule of dueRules(rules, betDay, session, closedDays)) {
    const expanded = expandCode(rule.code, rule.amountText);
    if (!expanded) continue;
    for (const n of expanded.numbers) rows.push({ no: n.no, amount: n.amount });
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Percent edit (AutoEdit.cmdEditGroupSave_Click)                      */
/* ------------------------------------------------------------------ */

/**
 * Scale one amount text by +/- pct (1–100), applying the percent to
 * each "/" part separately, as the original does per amount part before
 * re-expanding. Amounts are rounded to whole units.
 * NOTE (ANALYSIS §11.10): no SQL UPDATE was found in the original
 * handler, so whether its percent edit persisted is unverified. The
 * web version persists the scaled amounts in localStorage.
 */
export function scaleAmountText(amountText: string, pct: number, dir: '+' | '-'): string {
  const factor = dir === '+' ? 1 + pct / 100 : 1 - pct / 100;
  return amountText
    .split('/')
    .map((part) => {
      const v = Number(part.trim());
      if (!Number.isFinite(v)) return part;
      return String(Math.max(0, Math.round(v * factor)));
    })
    .join('/');
}

/* ------------------------------------------------------------------ */
/* PasteF — AutoCode.MessagePaste + ModTran.xInputReverse              */
/* ------------------------------------------------------------------ */

/**
 * Reverse of the display-code language back to typeable input
 * (`ModTran.xInputReverse`): PAR -> //, POW -> **, BRT -> star-slash,
 * PZ -> pz, P-N -> pn, S-B -> a, B-S -> z, 1-SKIP -> q, N-SKIP -> 0+N,
 * 2(+)6 -> 2+6, NAM -> n, 02468/N+ -> +/N, 13579/N+ -> -/N, plus the
 * default " R" / " @" / " B-" / " F-" / " BK" / " LP" / " (-)" rewrites.
 */
export function xInputReverse(nCopied: string): string {
  const named: Record<string, string> = {
    'S-B': 'a',
    'B-S': 'z',
    '1-SKIP': 'q',
    '2-SKIP': '0+2',
    '3-SKIP': '0+3',
    '4-SKIP': '0+4',
    '5-SKIP': '0+5',
    '6-SKIP': '0+6',
    '7-SKIP': '0+7',
    '8-SKIP': '0+8',
    '9-SKIP': '0+9',
    PAR: '//',
    POW: '**',
    BRT: '*/',
    ZOD: '/*',
    PZ: 'pz',
    'P-N': 'pn',
    '2(+)6': '2+6',
    NAM: 'n',
  };
  if (Object.prototype.hasOwnProperty.call(named, nCopied)) return named[nCopied];
  for (let n = 0; n <= 9; n++) {
    if (nCopied === `02468/${n}+`) return `+/${n}`;
    if (nCopied === `13579/${n}+`) return `-/${n}`;
  }
  let t = nCopied;
  if (t.includes(' (-) ')) {
    t = t.replace('PAR', '//').replace('POW', '**').replace('BRT', '*/').replace('ZOD', '/*').replace('PZ', 'pz');
    t = t.replace(' R', '+').replace(' B-', '/');
    if (t.includes(' F-')) t = `/${t.replace(' F-', '')}`;
    t = t.replace(' BK', '*').replace(' LP', '+');
    return t.replace(' (-) ', '-');
  }
  if (t.includes(' R')) return t.replace(' R', '+');
  if (t.includes(' @')) return t.replace(' @', '+');
  if (t.includes(' B-')) return `/${t.replace(' B-', '')}`;
  if (t.includes(' F-')) return t.replace(' F-', '/');
  if (t.includes(' BK')) return t.replace(' BK', '*');
  if (t.includes(' LP')) return t.replace(' LP', '+');
  if (t.includes('R')) return t.replace('R', '+');
  if (t.includes('@')) return t.replace('@', '+');
  return t;
}

const HAS_LETTER = /[A-Za-z]/;

/**
 * `AutoCode.MessagePaste`, called by `PasteF_Click` (after the Auto
 * code is re-derived with Enter). Clipboard text of `No=Amt` lines:
 *  - a comma anywhere means the text is `No,Amt` — commas become `=`
 *    and the lines are then transformed (in reverse order, tracking the
 *    last-seen amount): lines with letters or the word `Total` are
 *    skipped; `/` splits are re-paired (`a/b=c/d` -> `a/b=c` plus an
 *    extra `b/a=d` line); a 2-digit non-twin number gets ` R=` (reverse
 *    pair); a bare number or a `/` code gets `+=` (reverse) appended.
 *  - without a comma the lines are taken as-is.
 * Each surviving line is split on `=` into (code, amount), the code
 * going through `xInputReverse`. Lines without `=` (or with an empty
 * amount) are dropped, like the original's per-line error path.
 */
export function parsePaste(text: string): Array<{ no: string; amountText: string }> {
  const splitLines = (s: string) => s.split(/\r\n|\n|\r/).filter((l) => l.length > 0);
  let lines = splitLines(text);
  if (text.includes(',')) {
    lines = splitLines(text.replace(/,/g, '='));
    const extra: string[] = [];
    let lastAmt = '0';
    for (let idx = lines.length - 1; idx >= 0; idx--) {
      let line = lines[idx];
      if (line.includes('Total') || line.includes('`') || HAS_LETTER.test(line)) continue;
      if (line.includes('=') && line.endsWith('=')) line = line.slice(0, -1);
      if (line.includes('=')) {
        if (!line.endsWith('=')) {
          const eq = line.indexOf('=');
          lastAmt = line.slice(eq + 1);
          const left = line.slice(0, eq);
          const right = line.slice(eq + 1);
          if (left.includes('/') && right.includes('/')) {
            const [a, b] = left.split('/');
            const [c, d] = right.split('/');
            line = `${a}/${b}=${c}`;
            extra.push(`${b}/${a}=${d}`);
          } else if (left.includes('/') && !right.includes('/')) {
            line = line.replace('=', '+=');
          } else if (!left.includes('/') && right.includes('/')) {
            if (left.length === 1) {
              const [c, d] = right.split('/');
              if (c !== '0' && d !== '0') {
                line = `${left}/=${c}`;
                extra.push(`/${left}=${d}`);
              } else if (d === '0') {
                line = `${left}/=${c}`;
              } else {
                line = `/${left}=${d}`;
              }
            }
          } else if (left.length === 2 && left[0] !== left[1]) {
            line = line.replace('=', ' R=');
          }
        } else if (line.length === 2 && lastAmt.includes('/')) {
          const [c, d] = lastAmt.split('/');
          if (c === '0' && Number(d) > 0) line = `${line}/=${d}`;
          else if (Number(c) > 0 && d === '0') line = `/${line}=${c}`;
          else if (Number(c) > 0 && Number(d) > 0) {
            line = `${line}/=${c}`;
            extra.push(`/${line.slice(0, 1)}=${d}`);
          }
        } else {
          line = line + lastAmt;
        }
        if (line.length >= 2 && line[0] !== line[1] && !line.includes('R') && !line.includes('/')) {
          line = line.replace('=', '+=');
        }
      } else if (line.length === 1) {
        line = `${line}=${lastAmt}`;
        const parts = line.slice(2).split('/');
        if (parts.length === 2 && parts[0] !== '0' && parts[1] !== '0') {
          line = `${line[0]}/=${parts[0]}`;
          extra.push(`/${line[0]}=${parts[1]}`);
        } else if (parts.length === 2 && parts[1] === '0') {
          line = `${line[0]}/=${parts[0]}`;
        } else if (parts.length === 2) {
          line = `/${line[0]}=${parts[1]}`;
        }
      } else if (line.includes('/') && line[0] !== '/' && !line.endsWith('/')) {
        line = line.endsWith('=') ? line + '+' + lastAmt : line + '+=' + lastAmt;
        if (lastAmt.includes('/')) {
          const [l, r] = line.split('=');
          if (l.includes('/') && r.includes('/')) {
            const [a, b] = l.split('/');
            if (a !== '' && b !== '' && b.length === 2) {
              line = `${a}${b[0]}=${r}`;
              extra.push(`${a}${b[1]}=${r}`);
            }
          }
        }
      } else {
        const parts = line.split('=');
        if (parts[0].includes('/')) {
          const [a, b] = parts[0].split('/');
          if (a !== '' && b !== '' && b.length === 2) {
            line = `${a}${b[0]}=${lastAmt}`;
            extra.push(`${a}${b[1]}=${lastAmt}`);
          }
        } else if (line.length >= 2 && line[0] !== line[1]) {
          if (line.includes('R') || lastAmt.includes('/')) line = `${line}=${lastAmt}`;
          else line = `${line}+=${lastAmt}`;
        } else {
          line = `${line}=${lastAmt}`;
        }
      }
      lines[idx] = line;
    }
    lines = [...lines, ...extra];
  }
  const out: Array<{ no: string; amountText: string }> = [];
  for (const line of lines) {
    if (line.includes('Total') || line.includes('`')) continue;
    const parts = line.split('=');
    if (parts.length < 2) continue;
    const no = xInputReverse(parts[0].trim());
    const amountText = parts[1].trim();
    if (!no || !amountText) continue;
    out.push({ no, amountText });
  }
  return out;
}
