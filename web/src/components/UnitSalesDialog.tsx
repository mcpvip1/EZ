/**
 * EASY 2D web — Unit Sales dialog (audit item #10).
 *
 * Replaces the view-only `UnitSalesDialog` that lived in Dialogs.tsx.
 * Same props interface as the old call site, plus `onSaved` (called
 * after a successful Save so the parent reloads).
 *
 * Mirrors the original `UnitSales` form:
 *  - Load: per-number sales for the current day/session (`gT`, hidden
 *    in the original) from `bet` rows, and the distribution grid (`g`,
 *    visible): one row per distinct amount — count of numbers sitting
 *    at that amount — plus the zero row first (count of numbers with no
 *    bets, amount 0). The third column is an editable amount to add.
 *  - Save (`btnSave_Click`): for every number whose current amount
 *    matches a distribution row with a non-zero top-up, insert a Bet
 *    row + a BetCode row for customer `'X'` (commission/rate from
 *    Calc), all under one new GroupID (MAX(GroupID) from betcode + 1).
 *    No confirm in the original, none here. After saving the original
 *    closes with DialogResult OK — so this calls `onSaved()` and then
 *    `onClose()`.
 *  - Copy (`btnCopy_Click`): copies one `Amt->No` line per distribution
 *    row — the unit amount, `->`, the count of numbers at that amount —
 *    in grid order (zero row first), CRLF-separated. The dialog stays
 *    open. Cancel / ✕ / backdrop closes without saving.
 *
 * The write path reuses exactly the Bet-row shapes `App.tsx`'s
 * `saveSide('bet')` writes (`SavedCode` + `DetailRow` via
 * `dbPutMany('codes' | 'details')`), with personNo `'X'` and no
 * `people` row — the original inserts customer 'X' with no Fighter
 * master row either.
 */
import { useMemo, useState } from 'react';
import type { AllData, DetailRow, SavedCode, Session } from '../lib/db';
import { dbPutMany, nowStamp, uid } from '../lib/db';
import { fmt } from '../lib/types';
import { Modal } from './Dialogs';
import { useLang } from '../i18n';

export interface UnitSalesDialogProps {
  data: AllData;
  betDay: string;
  session: Session;
  onClose: () => void;
  onSaved: () => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

export function UnitSalesDialog(p: UnitSalesDialogProps) {
  const { t } = useLang();
  // Per-number sales this session (original gT, from `bet` rows).
  const perNo = useMemo(() => {
    const m = new Map<string, number>();
    p.data.details
      .filter((d) => d.side === 'bet' && d.betDay === p.betDay && d.session === p.session)
      .forEach((d) => m.set(d.no, (m.get(d.no) ?? 0) + d.amount));
    return m;
  }, [p.data, p.betDay, p.session]);

  // Distribution rows (original g): { amt, count }, amount ascending,
  // zero row first — exactly the original's `order by a.amt` with the
  // 0-amount row (100 - numbers with bets) prepended.
  const dist = useMemo(() => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 100; i++) {
      const n = String(i).padStart(2, '0');
      const amt = perNo.get(n) ?? 0;
      counts.set(amt, (counts.get(amt) ?? 0) + 1);
    }
    return [...counts.entries()].map(([amt, count]) => ({ amt, count })).sort((a, b) => a.amt - b.amt);
  }, [perNo]);

  const total = [...perNo.values()].reduce((a, b) => a + b, 0);

  // Editable top-up per distribution row (original g column 3, "Amount").
  const [topUps, setTopUps] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const topUpFor = (amt: number): number => {
    const v = Number(topUps[amt] ?? '');
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  };

  const save = async () => {
    if (busy) return;
    // Original: one BetCode + Bet row per number whose amount matches a
    // distribution row with a non-zero top-up; one shared GroupID.
    const commission = p.data.settings?.commission ?? 16;
    const rate = p.data.settings?.rate ?? 80;
    const betCodes = p.data.codes.filter((c) => c.side === 'bet');
    const groupId = betCodes.reduce((m, c) => Math.max(m, c.groupId), 0) + 1;
    let sno = betCodes.reduce((m, c) => Math.max(m, c.sno), 0);
    const now = Date.now();
    const stamp = nowStamp();
    const codes: SavedCode[] = [];
    const details: DetailRow[] = [];
    for (let i = 0; i < 100; i++) {
      const no = String(i).padStart(2, '0');
      const amt = perNo.get(no) ?? 0;
      const topUp = topUpFor(amt);
      if (topUp <= 0) continue;
      sno += 1;
      codes.push({
        id: uid(),
        side: 'bet',
        betDay: p.betDay,
        session: p.session,
        personNo: 'X',
        displayCode: no,
        codeNo: no,
        amountText: String(topUp),
        rowTotal: topUp,
        commission,
        rate,
        groupId,
        sno,
        betDateTime: stamp,
        updatedAt: now,
      });
      details.push({
        id: uid(),
        side: 'bet',
        betDay: p.betDay,
        session: p.session,
        personNo: 'X',
        no,
        amount: topUp,
        commission,
        rate,
        sno,
        groupId,
        updatedAt: now,
      });
    }
    if (codes.length === 0) {
      setMsg(t('unitsales.msgEnterFirst'));
      return;
    }
    setBusy(true);
    try {
      await dbPutMany('codes', codes);
      await dbPutMany('details', details);
    } catch {
      setBusy(false);
      setMsg(t('unitsales.msgSaveFailed'));
      return;
    }
    // Original closes with DialogResult OK after saving.
    p.onSaved();
    p.onClose();
  };

  const copy = async () => {
    // Original btnCopy_Click: `Unit -> Count` per grid row, CRLF lines.
    const text = dist.map((r) => `${r.amt}->${r.count}`).join('\r\n');
    const ok = await copyText(text);
    setMsg(ok ? t('unitsales.msgCopied', { n: dist.length }) : t('unitsales.msgCopyFailed'));
  };

  return (
    <Modal title={t('unitsales.title', { day: p.betDay, session: p.session })} onClose={p.onClose} wide>
      <p className="mt-1 text-sm text-slate-500">{t('unitsales.note', { total: fmt(total) })}</p>
      <div className="mt-3 grid max-h-72 grid-cols-5 gap-1 overflow-y-auto text-sm">
        {Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0')).map((n) => (
          <div
            key={n}
            className={`flex justify-between rounded border px-2 py-1 ${perNo.get(n) ? 'bg-yellow-50 font-bold' : 'text-slate-400'}`}
          >
            <span>{n}</span>
            <span>{fmt(perNo.get(n) ?? 0)}</span>
          </div>
        ))}
      </div>
      <h3 className="mt-3 text-sm font-bold text-slate-700">{t('unitsales.distTitle')}</h3>
      <table className="mt-1 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b text-slate-500">
            <th className="py-1 pr-2">{t('unitsales.colCount')}</th>
            <th className="py-1 pr-2">{t('unitsales.colUnit')}</th>
            <th className="py-1 pr-2">{t('unitsales.colAdd')}</th>
          </tr>
        </thead>
        <tbody>
          {dist.map((r) => (
            <tr key={r.amt} className="border-b">
              <td className="py-1 pr-2">{r.count}</td>
              <td className="py-1 pr-2 font-bold">{fmt(r.amt)}</td>
              <td className="py-1 pr-2">
                <input
                  type="number"
                  min={0}
                  className="input w-28 py-1"
                  value={topUps[r.amt] ?? ''}
                  placeholder="0"
                  onChange={(e) => setTopUps((prev) => ({ ...prev, [r.amt]: e.target.value }))}
                  aria-label={t('unitsales.addAmountLabel', { amt: r.amt })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && (
        <p className="mt-2 text-sm font-medium text-slate-700" role="status">
          {msg}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={() => void save()} className="btn btn-teal">
          {t('unitsales.save')}
        </button>
        <button type="button" onClick={() => void copy()} className="btn btn-teal">
          {t('unitsales.copy')}
        </button>
        <button type="button" onClick={p.onClose} className="btn btn-ghost">
          {t('unitsales.cancel')}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">{t('unitsales.foot')}</p>
    </Modal>
  );
}
