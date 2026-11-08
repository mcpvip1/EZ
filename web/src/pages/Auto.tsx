/**
 * EASY 2D web — Auto bets popup content (audit item #7).
 *
 * Content only: no page chrome, no overlay, no "Back to Board" — the
 * parent mounts this inside a popup dialog and wires `onMaterialise`
 * into the Fighter entry grid.
 *
 * Mirrors the original `AutoCode` (create) + `AutoEdit` (manage) forms:
 *  - Create: pick a Fighter, type an Auto code (`A3` = letter A–J +
 *    session count; the letter picks the weekday + session, the number
 *    is how many sessions the bet repeats), then add code/amount rows.
 *    Enter moves Code -> No -> Amt -> add row, like the original
 *    KeyDown chain. `Paste` is the original `PasteF` (clipboard
 *    `No=Amt` / `No,Amt` lines — see `parsePaste` in ../lib/auto.ts).
 *  - Save Auto asks "Are You Sure to Save Auto?" and stores one rule
 *    group in localStorage (`easy2d.auto.v1`).
 *  - Materialise: the rules due in the current day/session expand into
 *    concrete `{ no, amount }` rows via `onMaterialise`. Nothing
 *    materialises on a Saturday or a Close Day.
 *  - Manage: groups with the original's pink subtotals, Hide Previous
 *    Days (AM: EndBetDay >= today; PM: EndBetDay > today or today-PM),
 *    Edit Group by +/- percent (1–100), Delete Group (future-only:
 *    the rule stops materialising; bets already saved are untouched).
 */
import { useMemo, useRef, useState } from 'react';
import type { AllData, Session } from '../lib/db';
import { expandCode } from '../shared-vendor/index.ts';
import {
  AUTO_STORAGE_KEY,
  autoSessions,
  deriveStartEnd,
  dueRules,
  isSaturdayISO,
  loadAutoRules,
  loadClosedDays,
  materialiseRules,
  newAutoId,
  nextGroupId,
  parsePaste,
  saveAutoRules,
  scaleAmountText,
} from '../lib/auto';
import type { AutoRule, AutoSchedule } from '../lib/auto';
import { ConfirmDialog } from '../components/Dialogs';
import { fmt } from '../lib/types';
import { useLang } from '../i18n';

export interface AutoProps {
  data: AllData;
  betDay: string;
  session: Session;
  onMaterialise: (rows: Array<{ no: string; amount: number }>, fighterNo: string) => void;
  onClose: () => void;
}

interface PendingRow {
  id: string;
  autoCode: string;
  code: string;
  amountText: string;
  displayCode: string;
  codeNo: string;
  rowTotal: number;
  startDay: string;
  startSession: Session;
  endDay: string;
  endSession: Session;
  times: number;
}

export default function Auto(p: AutoProps) {
  const { t } = useLang();
  const fighters = useMemo(() => p.data.people.filter((x) => x.side === 'fighter'), [p.data]);
  const [rules, setRules] = useState<AutoRule[]>(() => loadAutoRules());
  const [fighterNo, setFighterNo] = useState(() => fighters[0]?.no ?? '');
  const [autoCode, setAutoCode] = useState('');
  const [noInput, setNoInput] = useState('');
  const [amtInput, setAmtInput] = useState('');
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [msg, setMsg] = useState('');
  const [hidePrev, setHidePrev] = useState(false);
  const [matFighter, setMatFighter] = useState('__all__');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [editPct, setEditPct] = useState('');
  const [editDir, setEditDir] = useState<'+' | '-'>('-');
  const [editGroup, setEditGroup] = useState<number | null>(null);
  // In-app confirm (window.confirm is suppressed in the Space frame — see item 3).
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const noRef = useRef<HTMLInputElement>(null);
  const amtRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const closedDays = useMemo(() => loadClosedDays(), []);
  const derived: AutoSchedule | null = useMemo(
    () => deriveStartEnd(autoCode, p.betDay),
    [autoCode, p.betDay],
  );
  const isSaturday = isSaturdayISO(p.betDay);
  const isClosed = closedDays.includes(p.betDay);

  const persist = (next: AutoRule[]) => {
    setRules(next);
    saveAutoRules(next);
  };

  const due = useMemo(
    () => dueRules(rules, p.betDay, p.session, closedDays),
    [rules, p.betDay, p.session, closedDays],
  );
  const dueForMat = useMemo(
    () => (matFighter === '__all__' ? due : due.filter((r) => r.fighterNo === matFighter)),
    [due, matFighter],
  );
  const duePreview = useMemo(
    () => materialiseRules(dueForMat, p.betDay, p.session, closedDays),
    [dueForMat, p.betDay, p.session, closedDays],
  );

  const groups = useMemo(() => {
    const map = new Map<number, AutoRule[]>();
    for (const r of rules) {
      const list = map.get(r.groupId) ?? [];
      list.push(r);
      map.set(r.groupId, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [rules]);

  const visibleGroups = useMemo(() => {
    if (!hidePrev) return groups;
    return groups.filter(([, rs]) => {
      const endDay = rs[0].endDay;
      const endSession = rs[0].endSession;
      if (p.session === 'AM') return endDay >= p.betDay;
      return endDay > p.betDay || (endDay === p.betDay && endSession === 'PM');
    });
  }, [groups, hidePrev, p.betDay, p.session]);

  const fighter = fighters.find((x) => x.no === fighterNo);

  const addPending = (): boolean => {
    if (!fighter) {
      setMsg(t('auto.msg.pickFighter'));
      return false;
    }
    if (!derived) {
      setMsg(t('auto.msg.badAutoCode'));
      codeRef.current?.focus();
      return false;
    }
    const expanded = expandCode(noInput, amtInput);
    if (!expanded) {
      setMsg(t('auto.msg.badNoAmt'));
      noRef.current?.focus();
      return false;
    }
    const row: PendingRow = {
      id: newAutoId(),
      autoCode: autoCode.trim().toUpperCase(),
      code: noInput.trim().toLowerCase(),
      amountText: amtInput.trim(),
      displayCode: expanded.displayCode,
      codeNo: expanded.codeNo,
      rowTotal: expanded.rowTotal,
      startDay: derived.startDay,
      startSession: derived.startSession,
      endDay: derived.endDay,
      endSession: derived.endSession,
      times: derived.times,
    };
    setPending((prev) => [...prev, row]);
    setNoInput('');
    setAmtInput('');
    setMsg('');
    noRef.current?.focus();
    return true;
  };

  const applyPaste = (text: string) => {
    if (!derived) {
      setMsg(t('auto.msg.pasteNeedsCode'));
      return;
    }
    if (!fighter) {
      setMsg(t('auto.msg.pickFighter'));
      return;
    }
    const pairs = parsePaste(text);
    let added = 0;
    let skipped = 0;
    const rows: PendingRow[] = [];
    for (const pair of pairs) {
      const expanded = expandCode(pair.no, pair.amountText);
      if (!expanded) {
        skipped++;
        continue;
      }
      rows.push({
        id: newAutoId(),
        autoCode: autoCode.trim().toUpperCase(),
        code: pair.no.trim().toLowerCase(),
        amountText: pair.amountText,
        displayCode: expanded.displayCode,
        codeNo: expanded.codeNo,
        rowTotal: expanded.rowTotal,
        startDay: derived.startDay,
        startSession: derived.startSession,
        endDay: derived.endDay,
        endSession: derived.endSession,
        times: derived.times,
      });
      added++;
    }
    if (rows.length > 0) setPending((prev) => [...prev, ...rows]);
    setPasteText('');
    setPasteOpen(false);
    setMsg(
      added > 0
        ? added === 1
          ? skipped > 0
            ? t('auto.msg.pastedOne', { a: added, s: skipped })
            : t('auto.msg.pastedOneNoSkip', { a: added })
          : skipped > 0
            ? t('auto.msg.pasted', { a: added, s: skipped })
            : t('auto.msg.pastedNoSkip', { a: added })
        : t('auto.msg.nothingToPaste'),
    );
  };

  const pasteFromClipboard = async () => {
    if (!derived) {
      setMsg(t('auto.msg.pasteNeedsCode'));
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) applyPaste(text);
      else setPasteOpen(true);
    } catch {
      setPasteOpen(true);
    }
  };

  const saveAuto = () => {
    if (pending.length === 0) {
      setMsg(t('auto.msg.addRowFirst'));
      return;
    }
    if (!fighter) {
      setMsg(t('auto.msg.pickFighter'));
      return;
    }
    setConfirm({
      title: t('auto.confirm.saveTitle'),
      message:
        pending.length === 1
          ? t('auto.confirm.saveMsgOne', { n: pending.length, no: fighter.no })
          : t('auto.confirm.saveMsg', { n: pending.length, no: fighter.no }),
      onConfirm: () => {
        const groupId = nextGroupId(rules);
        const now = Date.now();
        const added: AutoRule[] = pending.map((row) => ({
          id: newAutoId(),
          groupId,
          fighterNo: fighter.no,
          autoCode: row.autoCode,
          code: row.code,
          amountText: row.amountText,
          displayCode: row.displayCode,
          codeNo: row.codeNo,
          rowTotal: row.rowTotal,
          startDay: row.startDay,
          startSession: row.startSession,
          endDay: row.endDay,
          endSession: row.endSession,
          times: row.times,
          groupTotal: row.rowTotal * row.times,
          createdAt: now,
        }));
        persist([...rules, ...added]);
        setPending([]);
        setAutoCode('');
        setMsg(
          added.length === 1
            ? t('auto.msg.groupSavedOne', { id: groupId, n: added.length, no: fighter.no })
            : t('auto.msg.groupSaved', { id: groupId, n: added.length, no: fighter.no }),
        );
      },
    });
  };

  const deleteGroup = (groupId: number) => {
    setConfirm({
      title: t('auto.confirm.deleteTitle', { id: groupId }),
      message: t('auto.confirm.deleteMsg'),
      onConfirm: () => {
        persist(rules.filter((r) => r.groupId !== groupId));
        if (editGroup === groupId) setEditGroup(null);
        setMsg(t('auto.msg.groupDeleted', { id: groupId }));
      },
    });
  };

  const applyEditGroup = (groupId: number) => {
    const pct = Number(editPct);
    if (!(pct > 0 && pct <= 100)) {
      setMsg(t('auto.msg.percentRange'));
      return;
    }
    setConfirm({
      title: t('auto.confirm.editTitle', { id: groupId }),
      message:
        editDir === '+'
          ? t('auto.confirm.editMsgInc', { pct })
          : t('auto.confirm.editMsgDec', { pct }),
      onConfirm: () => {
        const next = rules.map((r) => {
          if (r.groupId !== groupId) return r;
          const amountText = scaleAmountText(r.amountText, pct, editDir);
          const expanded = expandCode(r.code, amountText);
          const rowTotal = expanded ? expanded.rowTotal : r.rowTotal;
          return { ...r, amountText, rowTotal, groupTotal: rowTotal * r.times };
        });
        persist(next);
        setEditGroup(null);
        setEditPct('');
        setMsg(t('auto.msg.groupEdited', { id: groupId, pct, dir: t(editDir === '+' ? 'auto.dirInc' : 'auto.dirDec') }));
      },
    });
  };

  const materialise = () => {
    if (isSaturday) {
      setMsg(t('auto.msg.saturday'));
      return;
    }
    if (isClosed) {
      setMsg(t('auto.msg.closedDay'));
      return;
    }
    if (duePreview.length === 0) {
      setMsg(t('auto.msg.noneDueToast'));
      return;
    }
    p.onMaterialise(duePreview, matFighter);
    const total = duePreview.reduce((s, r) => s + r.amount, 0);
    setMsg(
      duePreview.length === 1
        ? t('auto.msg.materialisedOne', { n: duePreview.length, total: fmt(total) })
        : t('auto.msg.materialised', { n: duePreview.length, total: fmt(total) }),
    );
  };

  return (
    <div className="space-y-4 text-sm text-slate-800">
      <h2 className="text-lg font-bold">{t('auto.title')}</h2>
      <p className="text-slate-500">{t('auto.intro', { hint: t('auto.letterHint') })}</p>

      {/* Create */}
      <section className="card-pad">
        <h3 className="font-bold text-slate-700">{t('auto.newTitle')}</h3>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="font-medium text-slate-600">
            {t('auto.fighter')}
            <select
              className="input ml-2"
              value={fighterNo}
              onChange={(e) => setFighterNo(e.target.value)}
              aria-label={t('auto.fighter')}
            >
              {fighters.map((f) => (
                <option key={f.id} value={f.no}>
                  {f.no}
                  {f.name ? ` — ${f.name}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="font-medium text-slate-600">
            {t('auto.code')}
            <input
              ref={codeRef}
              className="input ml-2 w-20 uppercase"
              value={autoCode}
              placeholder="A3"
              onChange={(e) => setAutoCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (deriveStartEnd(autoCode, p.betDay)) noRef.current?.focus();
                  else setMsg(t('auto.msg.badAutoCode'));
                }
              }}
              aria-label={t('auto.code')}
            />
          </label>
          <label className="font-medium text-slate-600">
            {t('auto.no')}
            <input
              ref={noRef}
              className="input ml-2 w-28"
              value={noInput}
              placeholder="12, //, **"
              onChange={(e) => setNoInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  amtRef.current?.focus();
                }
              }}
              aria-label={t('auto.no')}
            />
          </label>
          <label className="font-medium text-slate-600">
            {t('auto.amt')}
            <input
              ref={amtRef}
              className="input ml-2 w-24"
              value={amtInput}
              placeholder="1000"
              inputMode="numeric"
              onChange={(e) => setAmtInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addPending();
                }
              }}
              aria-label={t('auto.amt')}
            />
          </label>
          <button type="button" onClick={addPending} className="btn btn-primary">
            {t('auto.addRow')}
          </button>
          <button type="button" onClick={() => void pasteFromClipboard()} className="btn btn-ghost">
            {t('auto.paste')}
          </button>
        </div>
        {derived ? (
          <p className="mt-2 text-slate-600">
            {fighter
              ? t('auto.derivedWithFighter', {
                  start: `${derived.startDay} ${derived.startSession}`,
                  end: `${derived.endDay} ${derived.endSession}`,
                  n: derived.times,
                  no: fighter.no,
                  com: fighter.commission,
                  rate: fighter.rate,
                })
              : t('auto.derived', {
                  start: `${derived.startDay} ${derived.startSession}`,
                  end: `${derived.endDay} ${derived.endSession}`,
                  n: derived.times,
                })}
          </p>
        ) : (
          <p className="mt-2 text-slate-400">{t('auto.typeCodeFirst')}</p>
        )}
        {pasteOpen && (
          <div className="mt-2">
            <p className="text-slate-500">{t('auto.pasteBlocked')}</p>
            <textarea
              className="input mt-1 w-full"
              rows={4}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={t('auto.pastePlaceholder')}
              aria-label={t('auto.pasteLinesLabel')}
            />
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => applyPaste(pasteText)} className="btn btn-primary btn-sm">
                {t('auto.applyPasted')}
              </button>
              <button type="button" onClick={() => setPasteOpen(false)} className="btn btn-ghost btn-sm">
                {t('auto.pasteCancel')}
              </button>
            </div>
          </div>
        )}
        {pending.length > 0 && (
          <>
            <table className="mt-3 w-full border-collapse text-left">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-1 pr-2">{t('auto.colCode')}</th>
                  <th className="py-1 pr-2">{t('auto.colNo')}</th>
                  <th className="py-1 pr-2">{t('auto.colAmt')}</th>
                  <th className="py-1 pr-2">{t('auto.colStart')}</th>
                  <th className="py-1 pr-2">{t('auto.colTime')}</th>
                  <th className="py-1 pr-2">{t('auto.colTimes')}</th>
                  <th className="py-1 pr-2">{t('auto.colEnd')}</th>
                  <th className="py-1 pr-2">{t('auto.colEndTime')}</th>
                  <th className="py-1 pr-2 text-right">{t('auto.colTotal')}</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="py-1 pr-2 font-bold">{row.autoCode}</td>
                    <td className="py-1 pr-2">{row.displayCode}</td>
                    <td className="py-1 pr-2">{fmt(Number(row.amountText.split('/')[0]) || 0)}{row.amountText.includes('/') ? `/${row.amountText.split('/')[1]}` : ''}</td>
                    <td className="py-1 pr-2">{row.startDay}</td>
                    <td className="py-1 pr-2">{row.startSession}</td>
                    <td className="py-1 pr-2">{row.times}</td>
                    <td className="py-1 pr-2">{row.endDay}</td>
                    <td className="py-1 pr-2">{row.endSession}</td>
                    <td className="py-1 pr-2 text-right">{fmt(row.rowTotal)}</td>
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={() => setPending((prev) => prev.filter((x) => x.id !== row.id))}
                        className="btn btn-danger btn-sm"
                        aria-label={t('auto.deletePendingRow', { code: row.displayCode })}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={saveAuto} className="btn btn-primary mt-3">
              {t('auto.saveAuto')}
            </button>
          </>
        )}
      </section>

      {/* Materialise */}
      <section className="card-pad">
        <h3 className="font-bold text-slate-700">{t('auto.materialiseTitle', { day: p.betDay, session: p.session })}</h3>
        {isSaturday && <p className="mt-1 font-medium text-red-700">{t('auto.saturdayNote')}</p>}
        {!isSaturday && isClosed && <p className="mt-1 font-medium text-red-700">{t('auto.closedNote')}</p>}
        {!isSaturday && !isClosed && due.length === 0 && <p className="mt-1 text-slate-500">{t('auto.noneDue')}</p>}
        {!isSaturday && !isClosed && due.length > 0 && (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="font-medium text-slate-600">
                {t('auto.matFighter')}
                <select
                  className="input ml-2"
                  value={matFighter}
                  onChange={(e) => setMatFighter(e.target.value)}
                  aria-label={t('auto.matFighter')}
                >
                  <option value="__all__">{t('auto.matAll', { n: due.length })}</option>
                  {[...new Set(due.map((r) => r.fighterNo))].map((no) => (
                    <option key={no} value={no}>
                      {t('auto.matFighterNo', { no })}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={materialise}
                disabled={duePreview.length === 0}
                className="btn btn-teal"
              >
                {t('auto.materialiseBtn', { n: duePreview.length })}
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {dueForMat.map((r) => {
                const amtStr = `${fmt(Number(r.amountText.split('/')[0]) || 0)}${r.amountText.includes('/') ? `/${r.amountText.split('/')[1]}` : ''}`;
                return (
                  <li key={r.id} className="text-slate-600">
                    {t('auto.dueLine', {
                      no: r.fighterNo,
                      code: r.autoCode,
                      display: r.displayCode,
                      amt: amtStr,
                      sessions: autoSessions(r, closedDays).map((s) => `${s.betDay} ${s.session}`).join(', '),
                    })}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* Manage */}
      <section className="card-pad">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-slate-700">{t('auto.savedTitle')}</h3>
          <label className="flex items-center gap-1 text-slate-600">
            <input type="checkbox" checked={hidePrev} onChange={(e) => setHidePrev(e.target.checked)} />
            {t('auto.hidePrev')}
          </label>
        </div>
        {visibleGroups.length === 0 && (
          <p className="mt-2 text-slate-400">{hidePrev ? t('auto.noSavedHidden') : t('auto.noSaved')}</p>
        )}
        {visibleGroups.map(([groupId, rs]) => {
          const subtotal = rs.reduce((s, r) => s + r.groupTotal, 0);
          return (
            <div key={groupId} className="mt-3">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-1 pr-2">{t('auto.colGroup')}</th>
                    <th className="py-1 pr-2">{t('auto.colFighter')}</th>
                    <th className="py-1 pr-2">{t('auto.colCode')}</th>
                    <th className="py-1 pr-2">{t('auto.colNo')}</th>
                    <th className="py-1 pr-2">{t('auto.colAmt')}</th>
                    <th className="py-1 pr-2">{t('auto.colStart')}</th>
                    <th className="py-1 pr-2">{t('auto.colTime')}</th>
                    <th className="py-1 pr-2">{t('auto.colEnd')}</th>
                    <th className="py-1 pr-2">{t('auto.colEndTime')}</th>
                    <th className="py-1 pr-2 text-right">{t('auto.colGroupTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rs.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="py-1 pr-2">{groupId}</td>
                      <td className="py-1 pr-2">{r.fighterNo}</td>
                      <td className="py-1 pr-2 font-bold">{r.autoCode}</td>
                      <td className="py-1 pr-2">{r.displayCode}</td>
                      <td className="py-1 pr-2">{r.amountText}</td>
                      <td className="py-1 pr-2">{r.startDay}</td>
                      <td className="py-1 pr-2">{r.startSession}</td>
                      <td className="py-1 pr-2">{r.endDay}</td>
                      <td className="py-1 pr-2">{r.endSession}</td>
                      <td className="py-1 pr-2 text-right">{fmt(r.groupTotal)}</td>
                    </tr>
                  ))}
                  <tr className="bg-pink-100 font-bold">
                    <td className="py-1 pr-2" colSpan={9}>{t('auto.groupTotalRow', { id: groupId })}</td>
                    <td className="py-1 pr-2 text-right">{fmt(subtotal)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => deleteGroup(groupId)} className="btn btn-danger btn-sm">
                  {t('auto.deleteGroup')}
                </button>
                {editGroup === groupId ? (
                  <>
                    <input
                      className="input w-16"
                      value={editPct}
                      placeholder="%"
                      inputMode="numeric"
                      onChange={(e) => setEditPct(e.target.value)}
                      aria-label={t('auto.percentLabel')}
                    />
                    <span className="text-slate-500">%</span>
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={editDir === '+'} onChange={() => setEditDir('+')} /> +
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={editDir === '-'} onChange={() => setEditDir('-')} /> −
                    </label>
                    <button type="button" onClick={() => applyEditGroup(groupId)} className="btn btn-primary btn-sm">
                      {t('auto.editGroupSave')}
                    </button>
                    <button type="button" onClick={() => setEditGroup(null)} className="btn btn-ghost btn-sm">
                      {t('auto.editCancel')}
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => { setEditGroup(groupId); setEditPct(''); }} className="btn btn-ghost btn-sm">
                    {t('auto.editGroup')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {msg && <p className="font-medium text-slate-700" role="status">{msg}</p>}
      <p className="text-xs text-slate-400">{t('auto.footer', { key: AUTO_STORAGE_KEY })}</p>
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={t('auto.confirm.yes')}
          onConfirm={() => {
            const f = confirm.onConfirm;
            setConfirm(null);
            f();
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
