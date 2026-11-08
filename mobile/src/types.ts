import type { Session } from './shared';

/** Master-data person (Fighter or Owner). Mirrors the Access tables. */
export interface Person {
  sno: number;
  no: string;
  name: string;
  commission: number;
  rate: number;
}

/** One typed code as saved (BetCode / CarryCode). Amount is text here,
 *  like the original (BetCode.Amount is Text in the MDB). */
export interface CodeRow {
  sno: number;
  groupId: number;
  betDay: string; // YYYY-MM-DD
  ampm: Session;
  personNo: string;
  displayCode: string;
  codeNo: string;
  amountText: string;
  rowTotal: number;
  commission: number;
  rate: number;
  edited: number;
  createdAt: string;
}

/** One expanded 2D number as saved (Bet / Carry). */
export interface DetailRow {
  sno: number;
  groupId: number;
  betDay: string; // YYYY-MM-DD
  ampm: Session;
  personNo: string;
  no: string; // "00".."99"
  amount: number;
  commission: number;
  rate: number;
  displayCode: string;
  codeNo: string;
}

/** A draw result (LuckyNo). */
export interface Lucky {
  betDay: string;
  ampm: Session;
  no: string; // exactly 2 digits
  rev: string;
}

/** A named pattern pack (Group / GroupCode). Rows are typed codes. */
export interface GroupPack {
  name: string;
  rows: { code: string; amount: string }[];
}

export interface TemplateItem {
  no: number;
  text: string;
}

export interface Settings {
  limit: number;
  commission: number;
  rate: number;
}

export interface Db {
  fighters: Person[];
  owners: Person[];
  settings: Settings;
  betCodes: CodeRow[];
  bets: DetailRow[];
  carryCodes: CodeRow[];
  carries: DetailRow[];
  luckyNos: Lucky[];
  templates: TemplateItem[];
  groups: GroupPack[];
  updatedAt: string;
}

/** One unsaved entry-grid row (the MDIMain gF / gO grids). */
export interface EntryRow {
  displayCode: string;
  codeNo: string;
  amountText: string;
  rowTotal: number;
  numbers: { no: string; amount: number }[];
}

export interface ReplayRequest {
  side: 'bet' | 'carry';
  rows: { code: string; amount: string }[];
  amountOverride: string; // "" = use each row's stored amount
}
