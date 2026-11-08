import { useEffect, useMemo, useState } from 'react';
import { expandCode, settlePersonClipboard } from '../shared-vendor/index.ts';
import type { AllData, DetailRow, SavedCode, Session } from '../lib/db';
import { deleteSavedCode, nowStamp, uid, updateSavedCode } from '../lib/db';
import { ConfirmDialog, PopupDialog } from '../components/Dialogs';
import { fmt } from '../lib/types';
import { useLang } from '../i18n';

export interface BrowseProps {
  data: AllData;
  betDay: string;
  session: Session;
  onChanged: () => void;
  onClose: () => void;
}

/**
 * Browse / edit / delete of saved bets — the web equivalent of the
 * original Bet.cs / Carry.cs forms (opened from MDIMain cmdOpenF /
 * cmdOpenO). Content only: it is mounted inside a popup dialog, so it
 * renders no page chrome and no "Back to Board" button (Esc closes it
 * via onClose). The Bet/Carry side is an internal toggle (the props
 * carry no side) defaulting to Bet.
 *
 * Original behaviour reproduced:
 * - gT: per-person totals for the working BetDay + session; click a
 *   person to load their codes (LoadData / LoadDetail).
 * - g: codes grouped by groupId, in save order, each group followed by
 *   a pink subtotal row; rows edited in Browse are painted red
 *   (betcode.edited = 1).
 * - Double-click / Edit opens the edit popup (GroupBox1: txtNoEdit =
 *   codeNo, txtAmtEdit = amount); saving re-expands the code with
 *   expandCode, updates the code row (betDateTime = now, edited = 1)
 *   and replaces that sno's detail rows (cmdEditSave_Click).
 * - Del deletes the selected code row (+ its detail rows, by sno);
 *   Del on a person deletes ALL of that person's numbers for the day
 *   (g_KeyDown / gT_KeyDown, both with a confirm).
 * - Click a code row copies that group's clipboard text (g_Click ->
 *   cmdGroupCopy: "`No.(n)-d.M AM/PM" + code=amount lines + T=group
 *   total, plus "All T=" + person total when it is not the first
 *   group); the d.M stamp is TODAY, as in the original.
 * - Re-price: one amount applied to every code in a group
 *   (cmdEditGroupSave_Click — Ctrl+click in the original).
 * - Copy settlement: per-person "(n) / T= / (WinNo) P= / You=…" text
 *   (Bet.cs btnCurrentTotal + settlePersonClipboard; Bet flips the
 *   sign, Carry does not).
 */

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
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export default function Browse(p: BrowseProps) {
  const { t } = useLang();
  const [side, setSide] = useState<'bet' | 'carry'>('bet');
  const [personNo, setPersonNo] = useState('');
  const [selectedCodeId, setSelectedCodeId] = useState('');
  const [editing, setEditing] = useState<SavedCode | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editAmt, setEditAmt] = useState('');
  const [editError, setEditError] = useState('');
  const [repriceGroup, setRepriceGroup] = useState<number | null>(null);
  const [repriceAmt, setRepriceAmt] = useState('');
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  // In-app confirm (window.confirm is suppressed in the Space frame — see item 3).
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  // Esc closes the popup (the dialog wrapper owns onClose) — but not while a confirm is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing && repriceGroup === null && !confirm) p.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, repriceGroup, confirm, p]);

  const sideLabel = side === 'bet' ? t('reports.fighterLabel') : t('reports.selOwner');

  // People with saved rows this day/session, in master-table order.
  const persons = useMemo(() => {
    const nos = new Set<string>();
    p.data.codes.forEach((c) => {
      if (c.side === side && c.betDay === p.betDay && c.session === p.session) nos.add(c.personNo);
    });
    p.data.details.forEach((d) => {
      if (d.side === side && d.betDay === p.betDay && d.session === p.session) nos.add(d.personNo);
    });
    const order = new Map(
      p.data.people
        .filter((x) => (side === 'bet' ? x.side === 'fighter' : x.side === 'owner'))
        .map((x, i) => [x.no, i]),
    );
    return [...nos].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b));
  }, [p.data, p.betDay, p.session, side]);

  const person = personNo && persons.includes(personNo) ? personNo : persons[0] ?? '';
  const personName = p.data.people.find(
    (x) => x.no === person && (side === 'bet' ? x.side === 'fighter' : x.side === 'owner'),
  )?.name;

  const personDetails = useMemo(
    () =>
      p.data.details.filter(
        (d) => d.side === side && d.betDay === p.betDay && d.session === p.session && d.personNo === person,
      ),
    [p.data, p.betDay, p.session, side, person],
  );
  const personCodes = useMemo(
    () =>
      p.data.codes
        .filter(
          (c) => c.side === side && c.betDay === p.betDay && c.session === p.session && c.personNo === person,
        )
        .sort((a, b) => a.groupId - b.groupId || a.sno - b.sno),
    [p.data, p.betDay, p.session, side, person],
  );

  // Groups in save order; group sequence = position + 1 (Bet.cs funcRowNo).
  const groups = useMemo(() => {
    const out: { groupId: number; seq: number; codes: SavedCode[]; subtotal: number }[] = [];
    const byId = new Map<number, SavedCode[]>();
    personCodes.forEach((c) => {
      if (!byId.has(c.groupId)) byId.set(c.groupId, []);
      byId.get(c.groupId)!.push(c);
    });
    [...byId.keys()]
      .sort((a, b) => a - b)
      .forEach((gid, i) => {
        const codes = byId.get(gid)!;
        out.push({ groupId: gid, seq: i + 1, codes, subtotal: codes.reduce((s, c) => s + c.rowTotal, 0) });
      });
    return out;
  }, [personCodes]);

  const personTotal = personDetails.reduce((s, d) => s + d.amount, 0);
  const lucky = p.data.lucky.find((l) => l.betDay === p.betDay && l.session === p.session) ?? null;
  const winAmt = lucky ? personDetails.filter((d) => d.no === lucky.no).reduce((s, d) => s + d.amount, 0) : 0;
  const com = personDetails.reduce((m, d) => Math.max(m, d.commission), 0);
  const rate = personDetails.reduce((m, d) => Math.max(m, d.rate), 0);
  const youText =
    personDetails.length > 0
      ? settlePersonClipboard(
          personDetails.map((d) => ({ no: d.no, amount: d.amount })),
          lucky?.no ?? null,
          com,
          rate,
          side,
        )
      : '';

  const flash = (msg: string) => {
    setCopied(msg);
    setTimeout(() => setCopied(''), 2500);
  };

  const todayStamp = () => {
    const now = new Date();
    return `${now.getDate()}.${now.getMonth() + 1}`;
  };

  // cmdGroupCopy_Click: "`No.(seq)-d.M AM/PM" + code lines + T=group
  // total; "All T=" + person total when it is not the first group.
  const copyGroup = async (seq: number, codes: SavedCode[], subtotal: number) => {
    const lines = codes.map((c) => `${c.displayCode}=${c.amountText}`).join('\r\n');
    let text = `\`No.(${seq})-${todayStamp()} ${p.session}\r\n${lines}\r\nT=${subtotal}`;
    if (seq > 1) text += `\r\n\r\nAll T=${personTotal}`;
    flash((await copyText(text)) ? t('browse.groupCopied', { seq }) : t('browse.copyFailed'));
  };

  const copySettlement = async () => {
    if (!person) return;
    const winPart = lucky ? `(${lucky.no}) P=${winAmt}` : `P=${winAmt}`;
    const text = `(${person})\r\n\r\nT=${personTotal}\r\n${winPart}\r\n${youText}`;
    flash((await copyText(text)) ? t('browse.settlementCopied') : t('browse.copyFailed'));
  };

  const openEdit = (code: SavedCode) => {
    setEditing(code);
    setEditCode(code.codeNo);
    setEditAmt(code.amountText);
    setEditError('');
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (editCode.trim() === '' || editAmt.trim() === '') {
      setEditError(t('browse.errEnterCodeAmt'));
      return;
    }
    const expanded = expandCode(editCode, editAmt);
    if (!expanded) {
      setEditError(t('browse.errCantSave'));
      return;
    }
    setBusy(true);
    try {
      const now = Date.now();
      const updated: SavedCode = {
        ...editing,
        displayCode: expanded.displayCode,
        codeNo: expanded.codeNo,
        amountText: editAmt.trim(),
        rowTotal: expanded.rowTotal,
        betDateTime: nowStamp(),
      };
      const newDetails: DetailRow[] = expanded.numbers.map((n) => ({
        id: uid(),
        side: editing.side,
        betDay: editing.betDay,
        session: editing.session,
        personNo: editing.personNo,
        no: n.no,
        amount: n.amount,
        commission: editing.commission,
        rate: editing.rate,
        sno: editing.sno,
        groupId: editing.groupId,
        updatedAt: now,
      }));
      await updateSavedCode(updated, newDetails);
      setEditing(null);
      p.onChanged();
    } finally {
      setBusy(false);
    }
  };

  const saveReprice = async () => {
    if (repriceGroup === null) return;
    const group = groups.find((g) => g.groupId === repriceGroup);
    if (!group) return;
    if (repriceAmt.trim() === '' || Number(repriceAmt) === 0) {
      setEditError(t('browse.errEnterRepriceAmt'));
      return;
    }
    // Validate every code in the group first (cmdEditGroupSave replays
    // cmdEditSave per row); abort without saving anything on a bad code.
    const expanded = group.codes.map((c) => ({ code: c, r: expandCode(c.codeNo, repriceAmt) }));
    const bad = expanded.find((e) => !e.r);
    if (bad) {
      setEditError(t('browse.errCantSaveCode', { code: bad.code.displayCode }));
      return;
    }
    setBusy(true);
    try {
      const now = Date.now();
      for (const { code, r } of expanded) {
        const updated: SavedCode = {
          ...code,
          displayCode: r!.displayCode,
          codeNo: r!.codeNo,
          amountText: repriceAmt.trim(),
          rowTotal: r!.rowTotal,
          betDateTime: nowStamp(),
        };
        const newDetails: DetailRow[] = r!.numbers.map((n) => ({
          id: uid(),
          side: code.side,
          betDay: code.betDay,
          session: code.session,
          personNo: code.personNo,
          no: n.no,
          amount: n.amount,
          commission: code.commission,
          rate: code.rate,
          sno: code.sno,
          groupId: code.groupId,
          updatedAt: now,
        }));
        await updateSavedCode(updated, newDetails);
      }
      setRepriceGroup(null);
      p.onChanged();
    } finally {
      setBusy(false);
    }
  };

  const deleteCode = async (code: SavedCode) => {
    setConfirm({
      title: t('browse.delRowTitle', { sno: code.sno }),
      message: t('browse.delRowMsg', { code: code.displayCode }),
      onConfirm: () => {
        void (async () => {
          await deleteSavedCode(code);
          setSelectedCodeId('');
          p.onChanged();
        })();
      },
    });
  };

  const deletePersonAll = async (no: string) => {
    setConfirm({
      title: t('browse.delAllConfirmTitle'),
      message: t('browse.delAllMsg', { side: sideLabel, no, day: p.betDay, session: p.session }),
      onConfirm: () => {
        void (async () => {
          const codes = p.data.codes.filter(
            (c) => c.side === side && c.betDay === p.betDay && c.session === p.session && c.personNo === no,
          );
          for (const c of codes) await deleteSavedCode(c);
          p.onChanged();
        })();
      },
    });
  };

  // Del key on a selected code row (g_KeyDown).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'Delete' && selectedCodeId) {
        const code = personCodes.find((c) => c.id === selectedCodeId);
        if (code) void deleteCode(code);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCodeId, personCodes]);

  const personTotals = useMemo(() => {
    const m = new Map<string, number>();
    p.data.details.forEach((d) => {
      if (d.side === side && d.betDay === p.betDay && d.session === p.session) {
        m.set(d.personNo, (m.get(d.personNo) ?? 0) + d.amount);
      }
    });
    return m;
  }, [p.data, p.betDay, p.session, side]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border bg-white p-0.5">
          {(['bet', 'carry'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSide(s);
                setPersonNo('');
                setSelectedCodeId('');
              }}
              className={`btn btn-sm ${side === s ? 'btn-primary' : 'btn-ghost'}`}
            >
              {s === 'bet' ? t('browse.betTab') : t('browse.carryTab')}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-500">
          {t('browse.hint', { day: p.betDay, session: p.session })}
        </span>
        {copied && <span className="rounded bg-emerald-100 px-2 py-1 text-sm font-bold text-emerald-800">{copied}</span>}
      </div>

      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Per-person totals (Bet.cs gT) */}
        <section className="card-pad">
          <h3 className="px-1 py-1 text-sm font-bold text-slate-700">
            {side === 'bet' ? t('browse.totalsFighter') : t('browse.totalsOwner')}
          </h3>
          {persons.length === 0 ? (
            <p className="px-1 py-2 text-sm text-slate-400">
              {side === 'bet'
                ? t('browse.noSavedBet', { day: p.betDay, session: p.session })
                : t('browse.noSavedCarry', { day: p.betDay, session: p.session })}
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {persons.map((no) => (
                  <tr
                    key={no}
                    onClick={() => {
                      setPersonNo(no);
                      setSelectedCodeId('');
                    }}
                    className={`cursor-pointer border-t ${no === person ? 'bg-indigo-100 font-bold' : ''}`}
                  >
                    <td className="px-2 py-1.5">{no}</td>
                    <td className="px-2 py-1.5 text-right">{fmt(personTotals.get(no) ?? 0)}</td>
                    <td className="px-1 py-1.5 text-right">
                      <button
                        type="button"
                        title={t('browse.delAllTitle', { no })}
                        onClick={(e) => {
                          e.stopPropagation();
                          void deletePersonAll(no);
                        }}
                        className="btn btn-danger btn-sm"
                      >
                        {t('browse.delAll')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Grouped codes with pink subtotals (Bet.cs g) */}
        <section className="card-pad">
          {person ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-slate-800">
                  {sideLabel} {person}
                  {personName ? ` — ${personName}` : ''}
                </h3>
                <span className="text-sm text-slate-500">
                  T={fmt(personTotal)}
                  {lucky ? ` · (${lucky.no}) P=${fmt(winAmt)}` : ''}
                  {youText ? (
                    <>
                      {' · '}
                      <span className="font-bold text-slate-700">{youText}</span>
                    </>
                  ) : (
                    ''
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => void copySettlement()}
                  className="btn btn-outline btn-sm ml-auto"
                  title={t('browse.copySettlementTitle')}
                >
                  {t('browse.copySettlement')}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">{t('browse.help')}</p>
              {groups.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">{t('browse.noRows')}</p>
              ) : (
                groups.map((g) => (
                  <div key={g.groupId} className="mt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-600">{t('browse.group', { seq: g.seq })}</span>
                      <button
                        type="button"
                        onClick={() => void copyGroup(g.seq, g.codes, g.subtotal)}
                        className="btn btn-outline btn-sm"
                      >
                        {t('browse.copyGroup')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRepriceGroup(g.groupId);
                          setRepriceAmt('');
                          setEditError('');
                        }}
                        className="btn btn-outline btn-sm"
                      >
                        {t('browse.repriceGroup')}
                      </button>
                    </div>
                    <table className="mt-1 w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-slate-500">
                          <th className="py-1">{t('browse.colNum')}</th>
                          <th>{t('browse.colCode')}</th>
                          <th className="text-right">{t('browse.colAmount')}</th>
                          <th>{t('browse.colCodeNo')}</th>
                          <th>{t('browse.colBetDateTime')}</th>
                          <th className="text-right">{t('browse.colRowTotal')}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {g.codes.map((c) => (
                          <tr
                            key={c.id}
                            onClick={() => {
                              setSelectedCodeId(c.id);
                              void copyGroup(g.seq, g.codes, g.subtotal);
                            }}
                            onDoubleClick={() => openEdit(c)}
                            className={`cursor-pointer border-b ${selectedCodeId === c.id ? 'bg-indigo-100' : ''} ${c.edited ? 'text-red-600' : ''}`}
                            title={t('browse.rowTitle')}
                          >
                            <td className="py-1 font-bold">{c.sno}</td>
                            <td className="font-bold">{c.displayCode}</td>
                            <td className="text-right">{Number(c.amountText) ? fmt(Number(c.amountText)) : c.amountText}</td>
                            <td>{c.codeNo}</td>
                            <td className="text-xs">{c.betDateTime}</td>
                            <td className="text-right">{fmt(c.rowTotal)}</td>
                            <td className="text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEdit(c);
                                }}
                                className="btn btn-outline btn-sm"
                              >
                                {t('browse.editRow')}
                              </button>{' '}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void deleteCode(c);
                                }}
                                className="btn btn-danger btn-sm"
                              >
                                {t('browse.delRow')}
                              </button>
                            </td>
                          </tr>
                        ))}
                        <tr className="font-bold">
                          <td />
                          <td />
                          <td className="py-1 text-right" style={{ backgroundColor: '#fbcfe8' }}>
                            {fmt(g.subtotal)}
                          </td>
                          <td colSpan={4} className="text-xs font-normal text-slate-500">
                            {t('browse.groupSubtotal', { seq: g.seq })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400">{t('browse.pickPerson')}</p>
          )}
        </section>
      </div>

      {/* Edit popup (Bet.cs GroupBox1) — shared PopupDialog (narrow), same Esc-stack + backdrop-close as the other dialogs. */}
      {editing && (
        <PopupDialog
          title={t('browse.editTitle', { side: sideLabel, person: editing.personNo })}
          onClose={() => setEditing(null)}
          wide={false}
        >
          <p className="text-sm text-slate-500">
            {t('browse.editSub', { code: editing.displayCode, sno: editing.sno, gid: editing.groupId })}
          </p>
          <label className="mt-3 block text-sm font-medium text-slate-600">
            {t('browse.editCode')}
            <input
              className="input mt-1 w-full font-bold"
              value={editCode}
              onChange={(e) => setEditCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (document.getElementById('browse-edit-amt') as HTMLInputElement | null)?.focus();
                if (e.key === 'Escape') setEditing(null);
              }}
              autoFocus
            />
          </label>
          <label className="mt-2 block text-sm font-medium text-slate-600">
            {t('browse.editAmount')}
            <input
              id="browse-edit-amt"
              className="input mt-1 w-full font-bold"
              value={editAmt}
              inputMode="decimal"
              onChange={(e) => setEditAmt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveEdit();
                if (e.key === 'Escape') setEditing(null);
              }}
            />
          </label>
          {editError && <p className="mt-2 text-sm font-bold text-red-600">{editError}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void saveEdit()} className="btn btn-primary">
              {t('browse.editSave')}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="btn btn-outline">
              {t('browse.editCancel')}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">{t('browse.editNote')}</p>
        </PopupDialog>
      )}

      {/* Re-price popup (Bet.cs GroupBox2) — shared PopupDialog (narrow). */}
      {repriceGroup !== null && (
        <PopupDialog
          title={t('browse.repriceTitle', {
            seq: groups.find((g) => g.groupId === repriceGroup)?.seq ?? '',
            side: sideLabel,
            person,
          })}
          onClose={() => setRepriceGroup(null)}
          wide={false}
        >
          <p className="text-sm text-slate-500">{t('browse.repriceNote')}</p>
          <label className="mt-3 block text-sm font-medium text-slate-600">
            {t('browse.repriceAmount')}
            <input
              className="input mt-1 w-full font-bold"
              value={repriceAmt}
              inputMode="decimal"
              onChange={(e) => setRepriceAmt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveReprice();
                if (e.key === 'Escape') setRepriceGroup(null);
              }}
              autoFocus
            />
          </label>
          {editError && <p className="mt-2 text-sm font-bold text-red-600">{editError}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void saveReprice()} className="btn btn-primary">
              {t('browse.repriceApply')}
            </button>
            <button type="button" onClick={() => setRepriceGroup(null)} className="btn btn-outline">
              {t('browse.repriceCancel')}
            </button>
          </div>
        </PopupDialog>
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={t('browse.yesDelete')}
          danger
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
