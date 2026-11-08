/**
 * Clipboard texts copied on Save (MDIMain.cmdSaveF_Click / cmdSaveO_Click).
 *
 * All lines end with \r\n exactly as the original Clipboard.SetText
 * calls do. The "`No.(n)-d.M AM/PM" line carries the group sequence
 * number n for that person/day/session — the original counts the distinct
 * saved groups for that person/day/session and adds 1
 * (MDIMain.cs:7009-7101: `select groupid ... group by groupid`, COUNT + 1);
 * see nextGroupNo() below. The day/month in that line come from TODAY
 * (DateAndTime.Now), NOT from the working BetDay.
 */

import type { ClipboardCode, Session } from './types.js';

/** One saved detail row, as far as the group count needs to see it. */
export interface GroupCountRow {
  personNo: string;
  betDay: string;
  session: Session;
  groupId: number;
}

/**
 * Group sequence number for the NEXT save (MDIMain.cmdSaveF_Click /
 * cmdSaveO_Click): distinct saved groupIds for this person/day/session,
 * + 1. 0 saved groups -> 1. Pass the result as `groupNo` to
 * clipboardBetText / clipboardCarryText. `details` is the saved detail
 * rows (web DetailRow[] / mobile detail rows — any array of rows with
 * personNo, betDay, session and groupId).
 */
export function nextGroupNo(
  details: readonly GroupCountRow[],
  personNo: string,
  betDay: string,
  session: Session,
): number {
  const groups = new Set<number>();
  for (const d of details) {
    if (d.personNo === personNo && d.betDay === betDay && d.session === session) {
      groups.add(d.groupId);
    }
  }
  return groups.size + 1;
}

/** Day/month of TODAY (the original stamps DateAndTime.Now, not BetDay). */
function todayDayMonth(): { d: number; m: number } {
  const now = new Date();
  return { d: now.getDate(), m: now.getMonth() + 1 };
}

function codeLines(codes: ClipboardCode[]): string {
  return codes.map((c) => `${c.displayCode}=${c.amountText}\r\n`).join('');
}

/**
 * Fighter save text (cmdSaveF_Click).
 * Fighter "1" gets just "T=<total>"; everyone else gets the
 * "2DCode=Amount" lines, then "`No.(n)-d.M AM/PM", then "T=<total>".
 * `groupNo` is the next group sequence for this person/day/session
 * (nextGroupNo); the d.M stamp is TODAY, not `betDay`.
 * `betDay` is kept in the signature for the call sites but no longer
 * feeds the stamp.
 */
export function clipboardBetText(
  codes: ClipboardCode[],
  total: number,
  personNo: string,
  betDay: string,
  session: Session,
  groupNo: number,
): string {
  void betDay;
  if (personNo === '1') return `T=${total}`;
  const { d, m } = todayDayMonth();
  const n = Number.isFinite(groupNo) ? Math.floor(groupNo) : 1;
  return `${codeLines(codes)}\`No.(${n})-${d}.${m} ${session}\r\nT=${total}`;
}

/**
 * Owner save text (cmdSaveO_Click) — the mirror image, with its own
 * quirks: "Total=" instead of "T=", and a trailing "`Q" line.
 * Owner "0" gets just the code lines + "Total=<total>\r\n"; everyone
 * else gets the "`No.(n)-d.M AM/PM" line and the "`Q" trailer.
 * `groupNo` is the next group sequence (nextGroupNo); the d.M stamp
 * is TODAY, not `betDay`.
 */
export function clipboardCarryText(
  codes: ClipboardCode[],
  total: number,
  personNo: string,
  betDay: string,
  session: Session,
  groupNo: number,
): string {
  void betDay;
  if (personNo === '0') return `${codeLines(codes)}Total=${total}\r\n`;
  const { d, m } = todayDayMonth();
  const n = Number.isFinite(groupNo) ? Math.floor(groupNo) : 1;
  return `${codeLines(codes)}\`No.(${n})-${d}.${m} ${session}\r\nTotal=${total}\r\n\`Q`;
}
