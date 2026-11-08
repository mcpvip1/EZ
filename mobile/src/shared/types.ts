/**
 * Shared types for the EASY 2D rebuild core.
 *
 * Source: ~/workspace/2d-rebuild/ANALYSIS.md §5-§7 and
 * ~/workspace/2d-rebuild/decompiled/_Simple/ModTran.cs (xInput / xCalc).
 */

/** One draw session in a day. */
export type Session = 'AM' | 'PM';

/** Which side of the book a row belongs to. */
export type Side = 'bet' | 'carry';

/** One expanded 2D number with the amount bet on it. */
export interface ExpandedNumber {
  no: string;
  amount: number;
}

/** Result of expanding one typed code + amount. */
export interface ExpandResult {
  /** Display code as shown in the entry grid (2DCode), e.g. "PAR", "12 R", "1-2". */
  displayCode: string;
  /**
   * Stored code (BetCode.CodeNo), e.g. "12+" for a reverse, "168/2749" for "1-2".
   * For most codes this is the typed code itself.
   */
  codeNo: string;
  /** The expanded numbers, in original order (duplicates kept, e.g. 0+5). */
  numbers: ExpandedNumber[];
  /**
   * Row total for the entry grid.
   * Plain amount: amount x number-of-numbers. Split amount "a/b": a+b.
   * NOTE: in space-separated list mode (expandEntryList) the row total is the
   * typed amount (x2 in the trailing-"+" case), NOT amount x count — see README.
   */
  rowTotal: number;
  /** True when the code is a reverse pair (number + its digit-swap). */
  isReverse: boolean;
}

/** One bet/carry detail row: a 2D number and the amount on it. */
export interface BetRow {
  no: string;
  amount: number;
}

/** Per-person settlement for one BetDay + session (§7.1). */
export interface SettleResult {
  /** SUM(Amount) for the person/session. */
  amount: number;
  /** SUM(Amount) on rows whose number exactly equals the LuckyNo. */
  winAmt: number;
  /** Amount / 100 * Commission. */
  commissionAmount: number;
  /** WinAmt * Rate (payout). */
  grossAmount: number;
  /** Amount - CommissionAmount - GrossAmount (house net for the person). */
  netAmount: number;
}

/** Global defaults from the Calc table (also the dashboard inputs). */
export interface CalcSettings {
  limit: number;
  commission: number;
  rate: number;
}

/** Status dashboard (§7.4, MDIMain.xProfit / grid gS). */
export interface DashboardResult {
  limit: number;
  /** NetSales / Limit, 0 decimals. */
  times: number;
  /** SUM(Bet.Amount) for the session. */
  sales: number;
  /** SUM(Carry.Amount) for the session. */
  carry: number;
  /** Sales - Carry. */
  netSales: number;
  /** NetSales / 100 * Commission%, 0 decimals. */
  commissionAmt: number;
  /** NetSales - CommissionAmt. */
  grossProfit: number;
  /** (Bets on LuckyNo - Carry on LuckyNo) * Rate; 0 when Sales == Carry. */
  payout: number;
  /** GrossProfit - Payout; 0 when Sales == Carry. */
  netPL: number;
  /** True when GrossProfit < Payout — the original paints Net P/L red. */
  netPLRed: boolean;
}

/** One over-limit row (MDIMain gL / Limit table). */
export interface OverLimitRow {
  /** Number, e.g. "72"; "12 R" after an equal-excess reverse merge. */
  no: string;
  /**
   * Excess over the limit. A number for plain rows; the string "a/b"
   * (excess on the number / excess on its reverse) after a different-excess
   * merge — exactly as the original stores it in gL.Cells[2] / Limit.Over.
   */
  over: number | string;
  /** Mirrors `over` as text (Limit.OverHidden); "a/b" after a merge. */
  overHidden: string;
  /** Row total: excess, or a+b after a merge, or 2*excess for an "R" merge. */
  rowTotal: number;
  /** Code for the row: the number, or "NN+" after an equal-excess merge. */
  codeNo: string;
}

/** One line of a save-clipboard text: display code + typed amount text. */
export interface ClipboardCode {
  displayCode: string;
  amountText: string;
}
