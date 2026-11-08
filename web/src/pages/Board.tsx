import { useEffect, useMemo, useState } from 'react';
import type { OverLimitRow } from '../shared-vendor/index.ts';
import type { DashboardResult } from '../shared-vendor/index.ts';
import type { DetailRow, Person } from '../lib/db';
import type { EntryRow } from '../lib/types';
import { fmt } from '../lib/types';
import { pad2str } from '../lib/format';
import { useLang } from '../i18n';
import EntryPanel from '../components/EntryPanel';
import StatusPanel from '../components/StatusPanel';

export interface BoardProps {
  betDay: string;
  session: 'AM' | 'PM';
  limit: number;
  /** Opens the Limit / Calc popup (D12/D13) — the limit is not edited inline. */
  onOpenCalc: () => void;
  dash: DashboardResult;
  board: number[];
  overLimit: OverLimitRow[];
  savedBetCount: number;
  savedCarryCount: number;
  fighters: Person[];
  owners: Person[];
  fighterNo: string;
  ownerNo: string;
  onFighterChange: (no: string) => void;
  onOwnerChange: (no: string) => void;
  fighterCom: number;
  fighterRate: number;
  ownerCom: number;
  ownerRate: number;
  onFighterCom: (v: number) => void;
  onFighterRate: (v: number) => void;
  onOwnerCom: (v: number) => void;
  onOwnerRate: (v: number) => void;
  fighterRows: EntryRow[];
  carryRows: EntryRow[];
  onAddFighter: (code: string, amount: string) => boolean;
  onAddCarry: (code: string, amount: string) => boolean;
  onDeleteFighterRow: (id: string) => void;
  onDeleteCarryRow: (id: string) => void;
  onEditFighterRow: (id: string, code: string, amount: string) => boolean;
  onEditCarryRow: (id: string, code: string, amount: string) => boolean;
  onClearFighter: () => void;
  onClearCarry: () => void;
  onSaveBet: () => void;
  onSaveCarry: () => void;
  onPassAll: () => void;
  onPassOne: (row: OverLimitRow) => void;
  onPassTens: () => void;
  /** BTbuy top-up / OverTopCrop bulk limit ops (item 8): wired by App from
   * shared btbuyTopUp / overTopCrop; optional until then (buttons stay
   * disabled while unwired). */
  onBTbuy?: () => void;
  onCrop?: () => void;
  onBack: () => void;
  onBackOne: () => void;
  lastClipboard: string;
  /** Re-copy the last save summary to the clipboard (App wires this). */
  onCopyLastClipboard?: () => void;
  savedDetails: DetailRow[];
  /** Manual reload (Refr): re-reads saved data. It is a button, not a visibility toggle — the board always shows saved data. */
  onRefr: () => void;
  /** Over-limit highlight colour (System → Highlight Color). */
  highlight: string;
  autoLetter: string | null;
  commissionPct: number;
  rate: number;
  /** Carry checkbox (D10): flips the Ft/Cr label only — it never disables the Carry panel. */
  carryEnabled: boolean;
  onCarryEnabledChange: (v: boolean) => void;
  onOldNumbers: (amount: string) => void;
  onUnitSales: () => void;
  onBrowseFighter: () => void;
  onBrowseCarry: () => void;
  onCopyFighterToCarry: () => void;
  fighterCodeRef: React.RefObject<HTMLInputElement | null>;
  carryCodeRef: React.RefObject<HTMLInputElement | null>;
  /** Person dropdowns — F3/F6 focus these (D16, original cboF/cboO). */
  fighterPersonRef: React.RefObject<HTMLSelectElement | null>;
  carryPersonRef: React.RefObject<HTMLSelectElement | null>;
}

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
}

/**
 * Main screen in the original EASY layout: the 00–99 board on top, full
 * width (columns 00, 10, …, 90; rows 01, 11, …; cyan totals row), then
 * Fighter entry (left), over-limit + clock + pass-up buttons (middle),
 * Carry entry (right) and the status panel beside it. On narrow screens
 * the panels stack below the board.
 *
 * The board and the status dashboard show SAVED data only — unsaved entry
 * rows live in the entry grids and never join the board or the totals.
 */
export default function Board(p: BoardProps) {
  const { t } = useLang();
  const clock = useClock();
  const [selectedOver, setSelectedOver] = useState<Set<string>>(new Set());
  const [overAsc, setOverAsc] = useState(false);
  const [oldAmt, setOldAmt] = useState('1000');
  // D11: the original Luck checkbox has no handler — it is a plain toggle
  // and must not navigate anywhere.
  const [luckChecked, setLuckChecked] = useState(false);

  const fighterTotal = p.fighterRows.reduce((s, r) => s + r.rowTotal, 0);
  const carryTotal = p.carryRows.reduce((s, r) => s + r.rowTotal, 0);

  const overShown = useMemo(
    () => (overAsc ? [...p.overLimit].reverse() : p.overLimit),
    [p.overLimit, overAsc],
  );

  // Column totals for the cyan row: column j holds numbers j*10 + r.
  const colTotals = useMemo(() => {
    const out: number[] = [];
    for (let j = 0; j < 10; j++) {
      let s = 0;
      for (let r = 0; r < 10; r++) s += p.board[r + j * 10];
      out.push(s);
    }
    return out;
  }, [p.board]);

  const toggleOver = (no: string) => {
    setSelectedOver((prev) => {
      const next = new Set(prev);
      if (next.has(no)) next.delete(no);
      else next.add(no);
      return next;
    });
  };

  const passSelected = () => {
    const rows = p.overLimit.filter((r) => selectedOver.has(r.no));
    if (rows.length === 0 && p.overLimit.length > 0) p.onPassOne(p.overLimit[0]);
    else rows.forEach((r) => p.onPassOne(r));
    setSelectedOver(new Set());
  };

  // Middle-column buttons: original glyph on top, short label under it
  // so the pass-up actions are understandable on touch as well.
  const midBtn = 'btn btn-outline btn-sm w-full flex-col leading-tight';
  const passLabel = 'text-[11px] font-bold leading-none';

  return (
    <div className="space-y-2">
      {/* ---- 00–99 board, full width, on top (original layout) ---- */}
      <section className="card overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <tbody>
            {Array.from({ length: 10 }, (_, r) => (
              <tr key={r}>
                {Array.from({ length: 10 }, (_, j) => {
                  const n = r + j * 10;
                  const v = p.board[n];
                  const over = v > p.limit;
                  return (
                    <td
                      key={j}
                      className="border border-slate-300 px-1 py-0.5"
                      style={over ? { backgroundColor: p.highlight } : undefined}
                    >
                      <span className="flex items-baseline justify-between gap-1">
                        <span className="font-bold text-slate-800">{pad2str(n)}</span>
                        <span className={v === 0 ? 'text-slate-400' : 'text-slate-700'}>{v === 0 ? '0' : fmt(v)}</span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* Cyan totals row: one total per column */}
            <tr>
              {colTotals.map((t, j) => (
                <td key={j} className="border border-cyan-600 bg-cyan-300 px-1 py-0.5 text-right font-bold text-slate-900">
                  {fmt(t)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>
      <p className="text-xs text-slate-500">
        {t('board.note', {
          limit: fmt(p.limit),
          bet: p.savedBetCount,
          carry: p.savedCarryCount,
          day: p.betDay,
          session: p.session,
        })}
      </p>

      {p.lastClipboard && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-2 py-1.5">
          <span className="shrink-0 text-xs font-bold uppercase text-slate-500">{t('board.lastSave')}</span>
          <span className="min-w-0 flex-1 truncate text-sm">{p.lastClipboard}</span>
          <button type="button" onClick={() => p.onCopyLastClipboard?.()} className="btn btn-outline btn-sm shrink-0">
            {t('board.lastSaveCopyAgain')}
          </button>
        </div>
      )}

      {/* ---- Below the board: Fighter | middle | Carry | status ---- */}
      {/* Tablet (md, 2 cols): the two entry panels pair up first (Bet,
       * Carry) so Save Carry sits within the first viewport, with the
       * over-limit/clock panel and the status panel below them. Desktop
       * (lg, 4 cols) keeps the original's left-to-right order
       * (Fighter | over-limit | Carry | status). DOM/tab order is
       * unchanged — only the visual order at md changes. */}
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_200px_minmax(0,1fr)_250px]">
        <div className="md:order-1 lg:order-none">
        <EntryPanel
          side="bet"
          people={p.fighters}
          personNo={p.fighterNo}
          onPersonChange={p.onFighterChange}
          commission={p.fighterCom}
          rate={p.fighterRate}
          onCommissionChange={p.onFighterCom}
          onRateChange={p.onFighterRate}
          rows={p.fighterRows}
          onAdd={p.onAddFighter}
          onDeleteRow={p.onDeleteFighterRow}
          onEditRow={p.onEditFighterRow}
          onClear={p.onClearFighter}
          onSave={p.onSaveBet}
          accent="indigo"
          codeInputRef={p.fighterCodeRef}
          personSelectRef={p.fighterPersonRef}
          onOrder={() => undefined}
          onDots={p.onBrowseFighter}
        />
        </div>

        {/* Middle: over-limit list + clock + pass-up buttons */}
        <section className="card md:order-3 lg:order-none">
          <div className="flex items-center gap-1 border-b bg-slate-50 p-1">
            <span className="px-1 text-sm font-bold text-slate-700">{t('board.overTitle')}</span>
            <button type="button" onClick={() => setSelectedOver(new Set(p.overLimit.map((r) => r.no)))} className="btn btn-outline btn-sm ml-auto">
              {t('board.overAll')}
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {overShown.map((r) => (
                  <tr
                    key={r.no}
                    onClick={() => toggleOver(r.no)}
                    className={`cursor-pointer border-t ${selectedOver.has(r.no) ? 'bg-indigo-100' : ''}`}
                  >
                    <td className="px-2 py-1 font-bold">{r.no}</td>
                    <td className="px-2 py-1 text-right">{r.overHidden}</td>
                  </tr>
                ))}
                {overShown.length === 0 && (
                  <tr>
                    <td className="px-2 py-3 text-center text-slate-400">{t('board.overEmpty')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t p-2 text-center">
            <div className="text-2xl font-extrabold tabular-nums text-red-600">{clock}</div>
            <label className="mt-1 flex items-center justify-center gap-1 text-sm">
              <input type="checkbox" checked={luckChecked} onChange={(e) => setLuckChecked(e.target.checked)} />
              {t('board.luck')}
            </label>
          </div>
          <div className="flex flex-col gap-1 border-t p-2">
            <div className="grid grid-cols-2 gap-1">
              <button type="button" onClick={passSelected} className={midBtn} title={t('board.passSelectedTitle')}>
                <span aria-hidden="true">&gt;</span>
                <span className={passLabel}>{t('board.passSelected')}</span>
              </button>
              <button type="button" onClick={p.onBackOne} className={midBtn} title={t('board.backOneTitle')}>
                <span aria-hidden="true">&lt;</span>
                <span className={passLabel}>{t('board.backOne')}</span>
              </button>
              <button type="button" onClick={p.onPassAll} className={midBtn} title={t('board.passAllTitle')}>
                <span aria-hidden="true">&gt;&gt;</span>
                <span className={passLabel}>{t('board.passAll')}</span>
              </button>
              <button type="button" onClick={p.onBack} className={midBtn} title={t('board.backAllTitle')}>
                <span aria-hidden="true">&lt;&lt;</span>
                <span className={passLabel}>{t('board.backAll')}</span>
              </button>
            </div>
            <button type="button" onClick={p.onPassTens} className={midBtn} title={t('board.passTensTitle')}>
              <span aria-hidden="true">&gt;&gt;&gt;</span>
              <span className={passLabel}>{t('board.passTens')}</span>
            </button>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => p.onBTbuy?.()}
                disabled={!p.onBTbuy}
                className="btn btn-outline btn-sm w-full"
                title={t('board.btbuyTitle')}
              >
                {t('board.btbuy')}
              </button>
              <button
                type="button"
                onClick={() => p.onCrop?.()}
                disabled={!p.onCrop}
                className="btn btn-outline btn-sm w-full"
                title={t('board.cropTitle')}
              >
                {t('board.crop')}
              </button>
            </div>
            <p className="text-[11px] leading-snug text-slate-500">{t('board.limitOpsNote')}</p>
            <div className="flex gap-1">
              <button type="button" onClick={() => p.onOldNumbers(oldAmt)} className="btn btn-outline btn-sm flex-1" title={t('board.oldNoTitle')}>
                {t('board.oldNo')}
              </button>
              <input
                className="input w-16"
                value={oldAmt}
                inputMode="numeric"
                onChange={(e) => setOldAmt(e.target.value)}
                aria-label={t('board.oldNoAmountLabel')}
              />
            </div>
            <button type="button" onClick={p.onUnitSales} className="btn btn-outline btn-sm w-full">
              {t('board.unitSales')}
            </button>
          </div>
        </section>

        {/* Right: Carry entry */}
        <div className="space-y-2 md:order-2 lg:order-none">
          <div className="card flex items-center gap-2 px-2 py-1.5">
            <label className="flex items-center gap-1 text-sm font-bold">
              <input type="checkbox" checked={p.carryEnabled} onChange={(e) => p.onCarryEnabledChange(e.target.checked)} />
              {t('board.carryLabel')}
            </label>
            <span className="rounded bg-yellow-300 px-3 py-1 text-base font-extrabold">{fmt(carryTotal)}</span>
            <button type="button" onClick={p.onClearCarry} className="btn btn-outline btn-sm ml-auto">
              {t('board.clear')}
            </button>
          </div>
          <EntryPanel
            side="carry"
            people={p.owners}
            personNo={p.ownerNo}
            onPersonChange={p.onOwnerChange}
            commission={p.ownerCom}
            rate={p.ownerRate}
            onCommissionChange={p.onOwnerCom}
            onRateChange={p.onOwnerRate}
            rows={p.carryRows}
            onAdd={p.onAddCarry}
            onDeleteRow={p.onDeleteCarryRow}
            onEditRow={p.onEditCarryRow}
            onClear={p.onClearCarry}
            onSave={p.onSaveCarry}
            accent="amber"
            codeInputRef={p.carryCodeRef}
            personSelectRef={p.carryPersonRef}
            onOrder={() => undefined}
            onDots={p.onBrowseCarry}
            extraTop={
              <div className="flex items-center gap-1 px-2 pt-2 text-sm">
                <label className="flex items-center gap-1 font-bold text-red-600">
                  {/* Original chkCarry_CheckedChanged: lblFC = "Cr" when checked, "Ft" when not. */}
                  {p.carryEnabled ? t('board.labelCr') : t('board.labelFt')}
                  <input className="input-yellow w-14 text-center" value={p.fighterNo} readOnly aria-label={t('board.carryFighterNo')} />
                </label>
                <span className="font-bold text-red-600">
                  {t('board.labelNo')} <span className="rounded border border-yellow-500 bg-yellow-100 px-2 py-1 font-bold text-slate-800">{p.fighterRows.length}</span>
                </span>
                <span className="font-bold text-red-600">
                  {t('board.labelTk')} <span className="rounded border border-yellow-500 bg-yellow-100 px-2 py-1 font-bold text-slate-800">{fmt(fighterTotal)}</span>
                </span>
                <button
                  type="button"
                  onClick={p.onCopyFighterToCarry}
                  className="btn btn-outline btn-sm ml-auto"
                  title={t('board.copyFighterToCarryTitle')}
                >
                  {t('board.copyFighterToCarry')}
                </button>
              </div>
            }
          />
        </div>

        {/* Status panel + AUTO map */}
        <div className="md:order-4 lg:order-none">
        <StatusPanel
          dash={p.dash}
          limit={p.limit}
          onOpenCalc={p.onOpenCalc}
          commissionPct={p.commissionPct}
          rate={p.rate}
          autoLetter={p.autoLetter}
        />
        </div>
      </div>

      {/* ---- Bottom bar: Sales (F3) / Refr / All / Sort / Carry (F6) ---- */}
      <div className="card flex flex-wrap items-center gap-2 px-2 py-1.5">
        <button type="button" onClick={() => p.fighterPersonRef.current?.focus()} className="btn btn-outline">
          {t('board.salesF3')}
        </button>
        <span className="rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-bold">{fmt(fighterTotal)}</span>
        <button type="button" onClick={p.onClearFighter} className="btn btn-outline">
          {t('board.cl')}
        </button>
        <button
          type="button"
          onClick={p.onRefr}
          className="btn btn-outline"
          title={t('board.refrTitle')}
        >
          {t('board.refr')}
        </button>
        <span className="rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-bold" title={t('board.savedRowsTitle')}>
          {p.savedBetCount + p.savedCarryCount}
        </span>
        <button
          type="button"
          onClick={() => setSelectedOver(new Set(p.overLimit.map((r) => r.no)))}
          className="btn btn-outline"
        >
          {t('board.all')}
        </button>
        <button type="button" onClick={() => setOverAsc((v) => !v)} className="btn btn-outline" title={t('board.sortTitle')}>
          {t('board.sort')}
        </button>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => p.carryPersonRef.current?.focus()} className="btn btn-outline">
            {t('board.carryF6')}
          </button>
          <span className="rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-bold">{fmt(carryTotal)}</span>
          <button type="button" onClick={p.onClearCarry} className="btn btn-outline">
            {t('board.cl')}
          </button>
        </span>
      </div>
    </div>
  );
}
