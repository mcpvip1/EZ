/**
 * Settlement and status dashboard.
 *
 * Formulas from ANALYSIS §7.1 (bResult/cResult queries) and §7.4
 * (MDIMain.xProfit / grid gS), decompiled in
 * ~/workspace/2d-rebuild/decompiled/_Simple/ModTran.cs and MDIMain.cs.
 *
 * Per BetDay + AMPM + person:
 *   Amount           = SUM(Amount)
 *   WinAmt           = SUM(Amount) on rows whose 2DNo EXACTLY equals the
 *                      LuckyNo (the reverse never wins)
 *   CommissionAmount = Amount / 100 * Commission
 *   GrossAmount      = WinAmt * Rate
 *   NetAmount        = Amount - CommissionAmount - GrossAmount
 *                      (GrossAmount is 0 when there is no win)
 */

import type { BetRow, CalcSettings, DashboardResult, SettleResult, Side } from './types.js';

/**
 * VB/C# Math.Round / FormatNumber rounding: halves go to the even
 * neighbour (banker's rounding). JS Math.round is half-up, so we do it
 * explicitly. Used for row totals, dashboard 0-decimal figures, and the
 * per-person clipboard "You=" value.
 */
export function roundHalfEven(n: number): number {
  const f = Math.floor(n);
  const diff = n - f;
  if (diff < 0.5 - 1e-9) return f;
  if (diff > 0.5 + 1e-9) return f + 1;
  // Exactly .5 (within epsilon): pick the even neighbour.
  return f % 2 === 0 ? f : f + 1;
}

/**
 * Settle one person for one session. `luckyNo` is null when no draw has
 * been entered yet (then WinAmt is 0). Commission is a percent, rate is
 * the payout multiplier (e.g. 80).
 */
export function settlePerson(
  rows: BetRow[],
  luckyNo: string | null,
  commission: number,
  rate: number,
): SettleResult {
  const amount = rows.reduce((sum, r) => sum + r.amount, 0);
  const winAmt =
    luckyNo === null
      ? 0
      : rows.reduce((sum, r) => sum + (r.no === luckyNo ? r.amount : 0), 0);
  const commissionAmount = (amount / 100) * commission;
  const grossAmount = winAmt * rate;
  const netAmount = amount - commissionAmount - grossAmount;
  return { amount, winAmt, commissionAmount, grossAmount, netAmount };
}

/**
 * Per-person clipboard settlement (Bet.cs / Carry.cs btnCurrentTotal).
 *   Bet:   You = -(Total - WinAmt*Rate - Total/100*Commission), rounded
 *   Carry: same arithmetic WITHOUT the sign flip
 * Rendered "You=(+)…" when the result is >= 0, "You=(−)…" otherwise
 * (U+2212 minus — the task contract; the original VB code uses ASCII "-").
 */
export function settlePersonClipboard(
  rows: BetRow[],
  luckyNo: string | null,
  commission: number,
  rate: number,
  side: Side,
): string {
  const { amount, winAmt } = settlePerson(rows, luckyNo, commission, rate);
  let you = amount - winAmt * rate - (amount / 100) * commission;
  if (side === 'bet') you = -you;
  const rounded = roundHalfEven(you);
  return rounded < 0 ? `You=(\u2212)${Math.abs(rounded)}` : `You=(+)${rounded}`;
}

/**
 * Status dashboard (§7.4). `luckyBetWin` / `luckyCarryWin` are the sums
 * bet/carried on the LuckyNo for the session (0 when no draw yet).
 * Payout and netPL are shown as 0 when sales == carry; netPLRed is the
 * "red Net P/L" flag (grossProfit < payout, compared on the un-zeroed
 * payout, as in xProfit).
 */
export function dashboard(
  betTotal: number,
  carryTotal: number,
  luckyBetWin: number,
  luckyCarryWin: number,
  calc: CalcSettings,
): DashboardResult {
  const sales = betTotal;
  const carry = carryTotal;
  const netSales = sales - carry;
  const times = calc.limit === 0 ? 0 : roundHalfEven(netSales / calc.limit);
  const commissionAmt = roundHalfEven((netSales / 100) * calc.commission);
  const grossProfit = netSales - commissionAmt;
  const rawPayout = (luckyBetWin - luckyCarryWin) * calc.rate;
  const payout = sales === carry ? 0 : rawPayout;
  const netPL = sales === carry ? 0 : grossProfit - rawPayout;
  const netPLRed = grossProfit < rawPayout;
  return {
    limit: calc.limit,
    times,
    sales,
    carry,
    netSales,
    commissionAmt,
    grossProfit,
    payout,
    netPL,
    netPLRed,
  };
}
