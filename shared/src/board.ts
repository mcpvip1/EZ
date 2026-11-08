/**
 * The 00-99 board and the over-limit / pass-up list.
 *
 * Source: MDIMain.LoadData / gValuePlus (board cell = SUM(Bet) - SUM(Carry)
 * per number), MDIMain.xLimit (rows where the net exceeds the limit,
 * sorted by excess descending) and MDIMain.xLimitNo2Code (reverse-pair
 * merging), ANALYSIS §6.
 */

import type { BetRow, OverLimitRow } from './types.js';
import { pad2, reverseNo } from './expand.js';

/** Length-100 array, cell i = net amount on number pad2(i). */
export function computeBoard(betRows: BetRow[], carryRows: BetRow[]): number[] {
  const board = new Array<number>(100).fill(0);
  const add = (rows: BetRow[], sign: 1 | -1): void => {
    for (const r of rows) {
      if (!/^\d{1,2}$/.test(r.no)) continue;
      const i = Number(r.no);
      if (i < 0 || i > 99) continue;
      board[i] += sign * r.amount;
    }
  };
  add(betRows, 1);
  add(carryRows, -1);
  return board;
}

/**
 * Merge reverse pairs in an over-limit list (xLimitNo2Code).
 * Rows are first sorted by excess descending (ties: number ascending,
 * for determinism — the original's DataGridView sort leaves ties
 * unspecified). For each non-twin row whose reverse is also over:
 * - different excesses: one row, over/overHidden = "a/b", rowTotal = a+b;
 * - equal excesses: one row "NN R", codeNo gets "+", rowTotal = 2*excess.
 * The reverse row is removed in both cases.
 */
export function mergeOverLimit(rows: OverLimitRow[]): OverLimitRow[] {
  const out: OverLimitRow[] = rows.map((r) => ({ ...r }));
  out.sort((a, b) => {
    const diff = Number(b.over) - Number(a.over);
    return diff !== 0 ? diff : a.no.localeCompare(b.no);
  });
  let i = 0;
  while (i < out.length) {
    const row = out[i];
    const overNum = Number(row.over);
    if (/^\d\d$/.test(row.no) && row.no[0] !== row.no[1] && Number.isFinite(overNum)) {
      const rev = reverseNo(row.no);
      const j = out.findIndex((r, k) => k !== i && r.no === rev);
      if (j !== -1) {
        const other = out[j];
        const otherNum = Number(other.over);
        if (Number.isFinite(otherNum)) {
          if (overNum !== otherNum) {
            row.over = `${overNum}/${otherNum}`;
            row.overHidden = row.over;
            row.rowTotal = overNum + otherNum;
          } else {
            row.no = `${row.no} R`;
            row.codeNo = `${row.codeNo}+`;
            row.rowTotal = 2 * overNum;
            row.overHidden = String(overNum);
          }
          out.splice(j, 1);
          if (j < i) i--;
        }
      }
    }
    i++;
  }
  return out;
}

/**
 * Over-limit rows for a board: every number whose net exceeds `limit`.
 * over = net - limit, sorted by excess descending, then merged via
 * mergeOverLimit. Unmerged rows carry overHidden = String(over) and
 * codeNo = the number itself (xLimit sets both from the board cell).
 */
export function computeOverLimit(board: number[], limit: number): OverLimitRow[] {
  const rows: OverLimitRow[] = [];
  for (let i = 0; i < 100; i++) {
    const net = board[i] ?? 0;
    if (net > limit) {
      const over = net - limit;
      rows.push({
        no: pad2(i),
        over,
        overHidden: String(over),
        rowTotal: over,
        codeNo: pad2(i),
      });
    }
  }
  return mergeOverLimit(rows);
}

/**
 * Round up to the next ten (cmdGoTens): 2801 -> 2810, 2800 -> 2800,
 * 5 -> 10, 0 -> 0. Exact multiples of ten are unchanged.
 */
export function roundUpToTen(n: number): number {
  if (n <= 0) return 0;
  if (n % 10 === 0) return n;
  return (Math.floor(n / 10) + 1) * 10;
}

/** One row of a bulk limit operation: add `amount` on number `no`. */
export interface LimitBulkRow {
  /** 2-digit number, e.g. "05". */
  no: string;
  /** Amount to ADD as a Bet (BTbuy) or Carry (OverTopCrop) entry. */
  amount: number;
}

/**
 * BTbuy top-up (MDIMain.txtBTbuy_KeyDown): for every board number whose
 * net is below `limit`, buy it up to `limit` — the row amount is
 * `limit - board[i]`. The original compares the board cell against the
 * Calc Limit (gS.Rows[0].Cells[1], xProfit) and takes the top-up target
 * from a separate txtBTbuy box; this pure function takes a single
 * target/threshold, and the app passes the Calc limit as the target.
 * Numbers already at/above the limit get no row; untouched numbers
 * (net 0) get a full `limit` row, exactly as the original fills the
 * whole grid. Feed the rows into the Bet entry flow (expandCode(no,
 * String(amount)) per row) and save as usual.
 */
export function btbuyTopUp(board: number[], limit: number): LimitBulkRow[] {
  const out: LimitBulkRow[] = [];
  for (let i = 0; i < 100; i++) {
    const net = board[i] ?? 0;
    if (net < limit) out.push({ no: pad2(i), amount: limit - net });
  }
  return out;
}

/**
 * OverTopCrop (MDIMain.txtOverTopCropQty_KeyDown): crop the over-limit
 * part of every board number — the row amount is `board[i] - limit`,
 * the excess that would otherwise be passed up. The original works
 * down the merged over-limit list (gL) taking at most Qty numbers and
 * at most Amt per number, skipping Luck/Old numbers when those boxes
 * are checked, and feeds each cropped row into the Carry entry; with
 * no Qty/Amt cap given here the full excess of every over-limit
 * number is returned, unmerged (a merged "a/b" or "NN R" gL row is
 * equivalent to one row per number with its own excess — the Carry
 * detail rows it produces are the same). Feed the rows into the Carry
 * entry flow (expandCode(no, String(amount)) per row) and save as usual.
 */
export function overTopCrop(board: number[], limit: number): LimitBulkRow[] {
  const out: LimitBulkRow[] = [];
  for (let i = 0; i < 100; i++) {
    const net = board[i] ?? 0;
    if (net > limit) out.push({ no: pad2(i), amount: net - limit });
  }
  return out;
}
