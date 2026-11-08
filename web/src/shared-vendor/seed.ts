/**
 * Seed data from the live simple.mdb (2024-04-11), read with mdb-export.
 * - Calc: single row, Limit 40000, Commission 16, Rate 80.
 * - Fighter: 12 rows, all Commission 15, Rate 80 — EXCEPT the live DB has
 *   Fighter "3" with Rate 80250 (almost certainly a typo for 80; see
 *   ANALYSIS §9.3). We seed 80 here and flag the anomaly; do not migrate
 *   80250 blindly.
 * - Owner: 6 rows, all Commission 14, Rate 80.
 * - FighterName / OwnerName are all empty in the live DB, so name is "".
 * - Template snippets: the documented examples from ANALYSIS §9.3 only
 *   (TemplateNo 5-9, 11, 21, 24, 55), copied byte-for-byte from the MDB.
 *   Note TemplateNo 9 ("နကၡတ္(10)ကြက္") contains a U+200B ZERO WIDTH
 *   SPACE after နကၡတ္ in the live data — preserved here via \u200b.
 *   No new snippets were invented.
 */

import type { CalcSettings } from './types.js';

export interface PersonSeed {
  no: string;
  name: string;
  commission: number;
  rate: number;
}

export const CALC: CalcSettings = { limit: 40000, commission: 16, rate: 80 };

export const FIGHTERS: PersonSeed[] = [
  { no: '1', name: '', commission: 15, rate: 80 },
  { no: '8', name: '', commission: 15, rate: 80 },
  { no: '9', name: '', commission: 15, rate: 80 },
  { no: '10', name: '', commission: 15, rate: 80 },
  { no: '11', name: '', commission: 15, rate: 80 },
  { no: '12', name: '', commission: 15, rate: 80 },
  { no: '00', name: '', commission: 15, rate: 80 },
  { no: '000', name: '', commission: 15, rate: 80 },
  { no: '111', name: '', commission: 15, rate: 80 },
  { no: '222', name: '', commission: 15, rate: 80 },
  { no: '41+', name: '', commission: 15, rate: 80 },
  // Live DB has rate 80250 for Fighter "3" (data anomaly, ANALYSIS §9.3).
  // Seeded as 80; confirm with the operator before migrating 80250.
  { no: '3', name: '', commission: 15, rate: 80 },
];

export const OWNERS: PersonSeed[] = [
  { no: '1', name: '', commission: 14, rate: 80 },
  { no: '2', name: '', commission: 14, rate: 80 },
  { no: '3', name: '', commission: 14, rate: 80 },
  { no: '4', name: '', commission: 14, rate: 80 },
  { no: '5', name: '', commission: 14, rate: 80 },
  { no: '111', name: '', commission: 14, rate: 80 },
];

/** The 100 board numbers, "00".."99". */
export const DIGITS: string[] = Array.from({ length: 100 }, (_, i) =>
  String(i).padStart(2, '0'),
);

/**
 * Template message snippets (Template table, TemplateNo in comments).
 * Myanmar strings are literal UTF-8, byte-verified against the MDB;
 * the U+200B in TemplateNo 9 is written as \u200b so it survives.
 */
export const TEMPLATE_SNIPPETS: string[] = [
  'ထိပ္(10)ကြက္', // TemplateNo 5 — "thit (10) kwet" (first/top 10)
  'ေနာက္(10)ကြက္', // TemplateNo 6 — "neik (10) kwet" (back 10)
  'ပါဝါ(10)ကြက္', // TemplateNo 7 — "power (10) kwet"
  'ဘရိတ္(10)ကြက္', // TemplateNo 8 — "break (10) kwet"
  'နကၡတ္\u200b(10)ကြက္', // TemplateNo 9 — "nakhat (10) kwet"; live data has U+200B here
  '*Final*', // TemplateNo 11
  'Total = ', // TemplateNo 21
  'KQ BUY', // TemplateNo 24
  'Please Copy', // TemplateNo 55
];
