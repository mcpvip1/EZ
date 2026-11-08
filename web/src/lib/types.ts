import type { ExpandResult, ExpandedNumber } from '../shared-vendor/index.ts';

/** One unsaved row in the Fighter / Owner entry grid (MDIMain gF / gO). */
export interface EntryRow {
  id: string;
  displayCode: string;
  codeNo: string;
  amountText: string;
  rowTotal: number;
  numbers: ExpandedNumber[];
  /** True when the row came from the over-limit pass-up list (for Back). */
  fromLimit?: boolean;
}

let seq = 0;
export function makeEntryRow(r: ExpandResult, amountText: string, fromLimit = false): EntryRow {
  return {
    id: `e${Date.now().toString(36)}-${seq++}`,
    displayCode: r.displayCode,
    codeNo: r.codeNo,
    amountText,
    rowTotal: r.rowTotal,
    numbers: r.numbers,
    fromLimit,
  };
}

export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}
