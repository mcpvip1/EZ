import { useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { useLang } from '../i18n';
import type { Person } from '../lib/db';
import type { EntryRow } from '../lib/types';
import { fmt } from '../lib/types';

interface Props {
  side: 'bet' | 'carry';
  people: Person[];
  personNo: string;
  onPersonChange: (no: string) => void;
  commission: number;
  rate: number;
  onCommissionChange: (v: number) => void;
  onRateChange: (v: number) => void;
  rows: EntryRow[];
  onAdd: (code: string, amount: string) => boolean;
  onDeleteRow: (id: string) => void;
  /** Inline row editor (original LoadGroupBox / txtNoEdit + txtAmtEdit). */
  onEditRow: (id: string, code: string, amount: string) => boolean;
  onClear: () => void;
  onSave: () => void;
  accent: 'indigo' | 'amber';
  /** Ref so F3 (Fighter) / F6 (Carry) can focus the code box. */
  codeInputRef?: MutableRefObject<HTMLInputElement | null>;
  /** Ref to the person dropdown — the original F3/F6 focus cboF/cboO (D16). */
  personSelectRef?: MutableRefObject<HTMLSelectElement | null>;
  /** Extra small fields shown above the Carry grid (Ft / No / Tk). */
  extraTop?: React.ReactNode;
  /** "Order" toggles grid sort; "..." browses this person's saved codes. */
  onOrder: () => void;
  onDots: () => void;
}

/**
 * Original grid display for exclusion codes (MDIMain.cs:6898-6907,
 * gF/gO Cells[1]): "-" is shown as " (-) " EXCEPT when it sits in the
 * first two characters, which the original returns verbatim — so "12-34"
 * shows as "12 (-) 34" but "1-2" stays "1-2", exactly as the original.
 * (A probe once flagged "1-2" as wrong; it is not — the decompiled
 * IIf branch preserves the prefix dash by design.)
 * The stored codeNo keeps the plain "-" form.
 */
export function formatDisplayCode(text: string): string {
  const dash = (s: string) => s.split('-').join(' (-) ');
  if (text.includes('F-') || text.includes('B-')) {
    return text.slice(0, 4) + dash(text.slice(4));
  }
  if (text.slice(0, 2).includes('-')) {
    return text.slice(0, 2) + dash(text.slice(2));
  }
  return dash(text);
}

/**
 * Entry panel in the original EASY main-screen style: person dropdown +
 * Order + "..." on top, grid (# / No / Amount), code + amount inputs,
 * commission/rate, total, Save / Clear.
 *
 * Keyboard loop — decompiled from MDIMain.cs (txtNoF/txtAmtF/gF and the
 * txtNoO/txtAmtO/gO mirrors, plus MDIMain_KeyDown):
 * - Enter in the code box: code present + amount empty -> focus the amount
 *   box; both present -> add the row and focus returns to the code box.
 * - Enter in the amount box: empty/zero code or amount -> focus the code
 *   box; otherwise add the row, clear both boxes, focus the code box.
 * - "." in the amount box -> back to the code box (suppress the key).
 * - Up in the code box (1-2 digit code, amount present) -> submit (add).
 * - Down in the code box (2-digit code, amount present) -> append "+" to
 *   the code and submit (add with reverse).
 * - F3 (Fighter) / F6 (Carry) or "." in the code box -> save (cmdSaveF/O).
 * - Del in the grid -> delete the selected row; F2 in the grid (or the
 *   code box) -> open the inline row editor for the selected/last row;
 *   double-click a row also opens it.
 * F3/F6 pressed anywhere else (e.g. in the amount box) are handled by the
 * form-level handler in App.tsx, which focuses the person dropdown.
 */
export default function EntryPanel(p: Props) {
  const { t } = useLang();
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [sortMode, setSortMode] = useState<'entry' | 'code'>('entry');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editAmt, setEditAmt] = useState('');
  const codeRef = useRef<HTMLInputElement | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);
  const comRef = useRef<HTMLInputElement | null>(null);
  const rateRef = useRef<HTMLInputElement | null>(null);
  const total = p.rows.reduce((s, r) => s + r.rowTotal, 0);

  const focusCode = () => {
    codeRef.current?.focus();
    codeRef.current?.select();
  };
  const focusAmount = () => {
    amountRef.current?.focus();
    amountRef.current?.select();
  };

  /** Add one code+amount (the txtAmtF/txtAmtO Enter path). */
  const submit = (codeVal: string, amountVal: string): boolean => {
    if (!codeVal.trim() || !amountVal.trim() || amountVal.trim() === '0') {
      // Original: empty/zero -> back to the code box, nothing added.
      focusCode();
      return false;
    }
    const ok = p.onAdd(codeVal, amountVal);
    if (!ok) {
      setInvalid(true);
      focusCode();
      return false;
    }
    setInvalid(false);
    setCode('');
    setAmount('');
    focusCode();
    return true;
  };

  const openEditor = (id: string | null) => {
    const row = p.rows.find((r) => r.id === id) ?? p.rows[p.rows.length - 1];
    if (!row) return;
    setSelectedId(row.id);
    setEditId(row.id);
    setEditCode(row.codeNo);
    setEditAmt(row.amountText);
  };

  const saveEditor = () => {
    if (!editId) return;
    const ok = p.onEditRow(editId, editCode, editAmt);
    if (!ok) return; // keep the editor open on an invalid code/amount
    setEditId(null);
    focusCode();
  };

  const saveKey = p.side === 'bet' ? 'F3' : 'F6';

  const onCodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!code.trim()) return; // original txtNoF: empty code -> nothing
      if (!amount.trim()) {
        focusAmount(); // never silently does nothing
        return;
      }
      submit(code, amount);
    } else if (e.key === 'ArrowUp') {
      // Original: 1- or 2-digit code + amount present -> submit.
      const len = code.trim().length;
      if ((len === 1 || len === 2) && amount.trim()) {
        e.preventDefault();
        submit(code, amount);
      }
    } else if (e.key === 'ArrowDown') {
      // Original: 2-digit code + amount present -> append "+" and submit.
      if (code.trim().length === 2 && amount.trim()) {
        e.preventDefault();
        const next = `${code.trim()}+`;
        setCode(next);
        submit(next, amount);
      }
    } else if (e.key === saveKey || e.key === '.') {
      // Original txtNoF/txtNoO: F3/F6 or "." saves (and clears the code box).
      e.preventDefault();
      e.stopPropagation();
      setCode('');
      p.onSave();
    } else if (e.key === 'F2') {
      e.preventDefault();
      e.stopPropagation();
      openEditor(selectedId);
    }
  };

  const onAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit(code, amount);
    } else if (e.key === '.') {
      // Original txtAmtF/txtAmtO: "." (main or numpad) -> back to code box.
      e.preventDefault();
      e.stopPropagation();
      focusCode();
    }
  };

  const onGridKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>, row: EntryRow) => {
    if (e.key === 'Delete') {
      e.preventDefault();
      p.onDeleteRow(row.id);
      setSelectedId(null);
    } else if (e.key === 'F2' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      openEditor(row.id);
    }
  };

  const shownRows = useMemo(
    () => (sortMode === 'code' ? [...p.rows].sort((a, b) => a.displayCode.localeCompare(b.displayCode)) : p.rows),
    [p.rows, sortMode],
  );

  const accentBtn = p.accent === 'indigo' ? 'btn-primary' : 'btn-amber';
  const accentText = p.accent === 'indigo' ? 'text-indigo-700' : 'text-amber-700';
  const yellowInput = 'input-yellow';

  // Hint split into two readable lines at "Enter:" (both locales use it).
  const hintFull = t('entry.hint', { saveKey });
  const hintAt = hintFull.indexOf('Enter:');
  const hintFirst = hintAt >= 0 ? hintFull.slice(0, hintAt).trim() : hintFull;
  const hintSecond = hintAt >= 0 ? hintFull.slice(hintAt).trim() : '';

  return (
    <section className="card">
      {/* Person row: dropdown + Order + Browse (original top row) */}
      <div className="flex items-center gap-1 border-b bg-slate-50 p-1">
        <select
          ref={(el) => {
            if (p.personSelectRef) p.personSelectRef.current = el;
          }}
          className="input-yellow min-w-0 flex-1"
          value={p.personNo}
          onChange={(e) => p.onPersonChange(e.target.value)}
          onKeyDown={(e) => {
            // Original cboF/cboO: Enter loads the person's com/rate (already
            // done by onChange) and moves focus to the code box.
            if (e.key === 'Enter') {
              e.preventDefault();
              focusCode();
            }
          }}
          aria-label={p.side === 'bet' ? t('entry.fighter') : t('entry.owner')}
        >
          {p.personNo === '' && <option value="">{t('entry.pickPerson')}</option>}
          {p.people.map((person) => (
            <option key={person.id} value={person.no}>
              {person.no}
              {person.name ? ` — ${person.name}` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setSortMode((m) => (m === 'entry' ? 'code' : 'entry'));
            p.onOrder();
          }}
          className={`btn btn-sm ${sortMode === 'code' ? 'btn-primary' : 'btn-outline'}`}
          aria-pressed={sortMode === 'code'}
          title={t('entry.orderTitle')}
        >
          {t('entry.order')}
        </button>
        <button
          type="button"
          onClick={p.onDots}
          className="btn btn-outline btn-sm"
          title={t('entry.browseTitle')}
        >
          {t('entry.browse')}
        </button>
      </div>

      {p.extraTop}

      {/* Commission / rate — Enter in Com moves to Rate, Enter in Rate moves to the code box (original txtCommissionF/txtRateF). */}
      <div className="flex gap-2 px-2 pt-2">
        <label className="flex flex-1 items-center gap-1 text-xs font-medium text-slate-600">
          {t('entry.com')}
          <input
            ref={comRef}
            type="number"
            className="input w-16"
            value={p.commission}
            onChange={(e) => p.onCommissionChange(Number(e.target.value) || 0)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                rateRef.current?.focus();
                rateRef.current?.select();
              }
            }}
          />
        </label>
        <label className="flex flex-1 items-center gap-1 text-xs font-medium text-slate-600">
          {t('entry.rate')}
          <input
            ref={rateRef}
            type="number"
            className="input w-16"
            value={p.rate}
            onChange={(e) => p.onRateChange(Number(e.target.value) || 0)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                focusCode();
              }
            }}
          />
        </label>
        <span className={`ml-auto text-sm font-bold ${accentText}`}>{p.side === 'bet' ? t('entry.bet') : t('entry.carry')}</span>
      </div>

      {/* Code + amount (the yellow boxes, as in the original) */}
      <div className="flex gap-2 px-2 pt-2">
        <input
          ref={(el) => {
            codeRef.current = el;
            if (p.codeInputRef) p.codeInputRef.current = el;
          }}
          className={`${yellowInput} min-w-0 flex-1 uppercase`}
          placeholder={t('entry.codePlaceholder')}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={onCodeKeyDown}
          aria-label={p.side === 'bet' ? t('entry.fighterCode') : t('entry.carryCode')}
        />
        <input
          ref={amountRef}
          className={`${yellowInput} w-24`}
          placeholder={t('entry.amountPlaceholder')}
          inputMode="numeric"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={onAmountKeyDown}
          aria-label={t('entry.amount')}
        />
        <button
          type="button"
          onClick={() => submit(code, amount)}
          className={`btn ${accentBtn}`}
        >
          {t('entry.add')}
        </button>
      </div>
      {invalid && <p className="px-2 pt-1 text-sm text-red-600">{t('entry.invalid')}</p>}
      <p className="px-2 pt-1 text-[11px] text-slate-500">
        <span className="block">{hintFirst}</span>
        {hintSecond && <span className="block">{hintSecond}</span>}
      </p>

      {/* Grid: # / No / Amount (original columns) */}
      <div className="mt-2 max-h-64 overflow-y-auto border-t">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-100">
            <tr className="text-left text-slate-500">
              <th className="w-8 px-2 py-1">{t('entry.colNum')}</th>
              <th className="px-2 py-1">{t('entry.colNo')}</th>
              <th className="px-2 py-1 text-right">{t('entry.colAmount')}</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {shownRows.map((r, i) => (
              <tr
                key={r.id}
                tabIndex={0}
                onClick={() => setSelectedId(r.id)}
                onDoubleClick={() => openEditor(r.id)}
                onKeyDown={(e) => onGridKeyDown(e, r)}
                className={`cursor-pointer border-t outline-none focus:bg-indigo-50 ${selectedId === r.id ? 'bg-indigo-100' : ''}`}
              >
                <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                {editId === r.id ? (
                  <>
                    <td className="px-1 py-1">
                      <input
                        className="input-yellow w-full uppercase"
                        value={editCode}
                        autoFocus
                        onChange={(e) => setEditCode(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            (e.target as HTMLInputElement).closest('tr')?.querySelector<HTMLInputElement>('input[data-edit-amt]')?.focus();
                          } else if (e.key === 'Escape') {
                            e.stopPropagation();
                            setEditId(null);
                            focusCode();
                          }
                        }}
                        aria-label={t('entry.editCode')}
                      />
                    </td>
                    <td className="px-1 py-1 text-right">
                      <input
                        data-edit-amt
                        className="input-yellow w-20 text-right"
                        value={editAmt}
                        inputMode="numeric"
                        onChange={(e) => setEditAmt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            saveEditor();
                          } else if (e.key === 'Escape') {
                            e.stopPropagation();
                            setEditId(null);
                            focusCode();
                          }
                        }}
                        aria-label={t('entry.editAmount')}
                      />
                    </td>
                    <td className="py-1 pr-1 text-right">
                      <button type="button" onClick={saveEditor} className={`btn btn-sm ${accentBtn}`} aria-label={t('entry.saveEdit')}>
                        ✓
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-2 py-1 font-bold">{formatDisplayCode(r.displayCode)}</td>
                    <td className="px-2 py-1 text-right font-medium">{fmt(r.rowTotal)}</td>
                    <td className="py-1 pr-1 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          p.onDeleteRow(r.id);
                        }}
                        className="btn btn-danger btn-sm"
                        aria-label={t('entry.deleteRow')}
                      >
                        ✕
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {shownRows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  {t('entry.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t px-2 py-2">
        <span className="text-sm text-slate-500">{t('entry.total')}</span>
        <span className="text-xl font-bold">{fmt(total)}</span>
      </div>
      <div className="flex gap-2 px-2 pb-2">
        <button type="button" onClick={p.onSave} className={`btn flex-1 text-base ${accentBtn}`}>
          {p.side === 'bet' ? t('entry.saveBet') : t('entry.saveCarry')}
        </button>
        <button type="button" onClick={p.onClear} className="btn btn-ghost">
          {t('entry.clear')}
        </button>
      </div>
    </section>
  );
}
