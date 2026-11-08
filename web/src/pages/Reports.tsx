import { useMemo, useState } from 'react';
import { settlePerson } from '../shared-vendor/index.ts';
import type { DetailRow, Lucky, Person, SavedCode } from '../lib/db';
import { todayISO } from '../lib/db';
import { fmt } from '../lib/types';
import { useLang } from '../i18n';

type Tab = 'current' | 'daily' | 'weekly' | 'range' | 'selected' | 'uptodate';

interface Props {
  betDay: string;
  session: 'AM' | 'PM';
  details: DetailRow[];
  lucky: Lucky[];
  people: Person[];
  /**
   * Saved code rows, for the BetDateTime column: DetailRow carries no
   * timestamp (D7) — the session's timestamp comes from its code row
   * (SavedCode.betDateTime, earliest sno wins). Omit it and the column
   * falls back to "betDay session".
   */
  codes?: SavedCode[];
  /** Menu shortcuts (F9/F10/F11/F12/F4/Ctrl+F4) open the report on a tab. */
  initialTab?: Tab;
  initialPerson?: { side: 'bet' | 'carry'; no: string };
  initialRange?: { from: string; to: string; fromSess: 'AM' | 'PM'; toSess: 'AM' | 'PM' };
  /** "Selected (View Only)" — read-only view of one person's totals. */
  viewOnly?: boolean;
}

interface Row {
  personNo: string;
  betDay: string;
  session: 'AM' | 'PM';
  betDateTime: string;
  amount: number;
  winNo: string;
  winAmt: number;
  com: number;
  rate: number;
  netAmount: number;
}

function weekBounds(dateISO: string): { from: string; to: string } {
  const d = new Date(`${dateISO}T12:00:00`);
  const from = new Date(d);
  from.setDate(d.getDate() - d.getDay()); // Sunday
  const to = new Date(from);
  to.setDate(from.getDate() + 6); // Saturday
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

/**
 * Monday of the week containing dateISO (Mon–Sun week). The original
 * RangeUpToDate / RangeAMPM forms compute From as today − DayOfWeek + 1
 * (RangeUpToDate.cs RangeAMPM_Load, RangeAMPM.cs RangeAMPM_Load) — the
 * same Monday for Mon–Sat; on a Sunday the literal formula lands on
 * tomorrow (an empty range), so the Monday of the week just ended is
 * used instead.
 */
function mondayStart(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00`);
  const dow = d.getDay(); // 0 = Sunday
  const back = (dow + 6) % 7; // days since Monday
  d.setDate(d.getDate() - back);
  return d.toISOString().slice(0, 10);
}

/** "To" session of the original forms: AM while the hour is 0–11, else PM. */
function clockSession(): 'AM' | 'PM' {
  return new Date().getHours() <= 11 ? 'AM' : 'PM';
}

const sessRank = (s: 'AM' | 'PM') => (s === 'AM' ? 0 : 1);

export default function Reports(p: Props) {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>(p.initialTab ?? 'current');
  // Range / Range AMPM / Up to Date default to week-to-date (Mon → today,
  // D6) when the menu passes no explicit range; an explicit initialRange
  // (e.g. Report → Range, one day) is kept as-is.
  const [from, setFrom] = useState(p.initialRange?.from ?? mondayStart(todayISO()));
  const [to, setTo] = useState(p.initialRange?.to ?? todayISO());
  const [fromSess, setFromSess] = useState<'AM' | 'PM'>(p.initialRange?.fromSess ?? 'AM');
  const [toSess, setToSess] = useState<'AM' | 'PM'>(p.initialRange?.toSess ?? clockSession());
  const [selSide, setSelSide] = useState<'bet' | 'carry'>(p.initialPerson?.side ?? 'bet');
  const [selPerson, setSelPerson] = useState(p.initialPerson?.no ?? '');
  // Up to Date is one fighter only, default fighter "1"
  // (RangeUpToDate.cs RangeAMPM_Load: cboF.Text = "1").
  const [utdPerson, setUtdPerson] = useState('1');

  const luckyMap = useMemo(() => {
    const m = new Map<string, string>();
    p.lucky.forEach((l) => m.set(`${l.betDay}|${l.session}`, l.no));
    return m;
  }, [p.lucky]);

  // BetDateTime per (side, person, day, session): the earliest-sno code
  // row for that session (D7). DetailRow has no timestamp of its own.
  const betDateTimeMap = useMemo(() => {
    const m = new Map<string, { sno: number; stamp: string }>();
    (p.codes ?? []).forEach((c) => {
      const key = `${c.side}|${c.personNo}|${c.betDay}|${c.session}`;
      const cur = m.get(key);
      if (!cur || c.sno < cur.sno) m.set(key, { sno: c.sno, stamp: c.betDateTime });
    });
    return m;
  }, [p.codes]);

  const filtered = useMemo(() => {
    const inRange = (d: DetailRow): boolean => {
      if (tab === 'current') return d.betDay === p.betDay && d.session === p.session;
      if (tab === 'daily') return d.betDay === p.betDay;
      if (tab === 'weekly') {
        const w = weekBounds(p.betDay);
        return d.betDay >= w.from && d.betDay <= w.to;
      }
      if (tab === 'range' || tab === 'uptodate') {
        if (d.betDay < from || d.betDay > to) return false;
        if (d.betDay === from && sessRank(d.session) < sessRank(fromSess)) return false;
        if (d.betDay === to && sessRank(d.session) > sessRank(toSess)) return false;
        return true;
      }
      // selected: all dates, one person
      if (!selPerson) return false;
      return d.personNo === selPerson;
    };
    return p.details.filter(inRange);
  }, [p, tab, from, to, fromSess, toSess, selPerson]);

  // Per-session settlement (D7): one row per (person, BetDay, session),
  // not one collapsed row per person — settlePerson per session via the
  // shared §7.1 formula; commission/rate are MAX per session.
  const settle = (side: 'bet' | 'carry'): Row[] => {
    const byPerson = new Map<string, Map<string, DetailRow[]>>();
    filtered
      .filter((d) => d.side === side)
      .forEach((d) => {
        const key = `${d.betDay}|${d.session}`;
        if (!byPerson.has(d.personNo)) byPerson.set(d.personNo, new Map());
        const m = byPerson.get(d.personNo)!;
        if (!m.has(key)) m.set(key, []);
        m.get(key)!.push(d);
      });
    const out: Row[] = [];
    byPerson.forEach((sessions, personNo) => {
      sessions.forEach((rows, key) => {
        const [betDay, session] = key.split('|') as [string, 'AM' | 'PM'];
        const luckyNo = luckyMap.get(key) ?? null;
        const s = settlePerson(
          rows.map((r) => ({ no: r.no, amount: r.amount })),
          luckyNo,
          Math.max(...rows.map((r) => r.commission)),
          Math.max(...rows.map((r) => r.rate)),
        );
        out.push({
          personNo,
          betDay,
          session,
          betDateTime:
            betDateTimeMap.get(`${side}|${personNo}|${betDay}|${session}`)?.stamp ?? `${betDay} ${session}`,
          amount: s.amount,
          winNo: s.winAmt > 0 && luckyNo ? luckyNo : '—',
          winAmt: s.winAmt,
          com: Math.max(...rows.map((r) => r.commission)),
          rate: Math.max(...rows.map((r) => r.rate)),
          netAmount: s.netAmount,
        });
      });
    });
    return out.sort(
      (a, b) =>
        a.personNo.localeCompare(b.personNo) ||
        a.betDay.localeCompare(b.betDay) ||
        sessRank(a.session) - sessRank(b.session),
    );
  };

  const fighterRows = settle('bet');
  const ownerRows = settle('carry');
  // Up to Date: one fighter only (RangeUpToDate fills bRange for cboF
  // only; the original's cRange is never filled, so no Owner half).
  const upToDateRows = fighterRows.filter((r) => r.personNo === utdPerson);
  const selPeople = p.people.filter((x) => (selSide === 'bet' ? x.side === 'fighter' : x.side === 'owner'));
  const fighters = p.people.filter((x) => x.side === 'fighter');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'current', label: t('reports.tab.current') },
    { id: 'daily', label: t('reports.tab.daily') },
    { id: 'weekly', label: t('reports.tab.weekly') },
    { id: 'range', label: t('reports.tab.range') },
    { id: 'uptodate', label: t('reports.tab.uptodate') },
    { id: 'selected', label: t('reports.tab.selected') },
  ];

  const renderTable = (title: string, rows: Row[]) => {
    const tot = rows.reduce(
      (a, r) => ({ amount: a.amount + r.amount, winAmt: a.winAmt + r.winAmt, net: a.net + r.netAmount }),
      { amount: 0, winAmt: 0, net: 0 },
    );
    return (
      <section className="card-pad print-area">
        <h3 className="text-base font-bold text-slate-800">{title}</h3>
        {rows.length === 0 ? (
          <p className="mt-1 text-sm text-slate-400">{t('reports.table.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-1 w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-1">{t('reports.col.person')}</th>
                  <th>{t('reports.col.betDateTime')}</th>
                  <th className="text-right">{t('reports.col.amount')}</th>
                  <th>{t('reports.col.winNo')}</th>
                  <th className="text-right">{t('reports.col.winAmt')}</th>
                  <th className="text-right">{t('reports.col.com')}</th>
                  <th className="text-right">{t('reports.col.rate')}</th>
                  <th className="text-right">{t('reports.col.netAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.personNo}|${r.betDay}|${r.session}`} className="border-b">
                    <td className="py-1 font-bold">{r.personNo}</td>
                    <td className="text-xs">{r.betDateTime}</td>
                    <td className="text-right">{fmt(r.amount)}</td>
                    <td>{r.winNo}</td>
                    <td className="text-right">{fmt(r.winAmt)}</td>
                    <td className="text-right">{r.com}</td>
                    <td className="text-right">{r.rate}</td>
                    <td className={`text-right font-bold ${r.netAmount < 0 ? 'text-red-600' : ''}`}>{fmt(r.netAmount)}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="py-1">{t('reports.col.total')}</td>
                  <td />
                  <td className="text-right">{fmt(tot.amount)}</td>
                  <td />
                  <td className="text-right">{fmt(tot.winAmt)}</td>
                  <td />
                  <td />
                  <td className={`text-right ${tot.net < 0 ? 'text-red-600' : ''}`}>{fmt(tot.net)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-3">
      {p.viewOnly && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
          {t('reports.viewOnly')}
        </p>
      )}
      <div className="no-print flex flex-wrap items-center gap-2">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={`btn ${tab === tb.id ? 'btn-primary' : 'btn-outline'}`}
          >
            {tb.label}
          </button>
        ))}
        <button type="button" onClick={() => window.print()} className="btn btn-dark ml-auto">
          {t('reports.print')}
        </button>
      </div>

      {(tab === 'range' || tab === 'uptodate') && (
        <div className="card-pad no-print flex flex-wrap items-end gap-3">
          {tab === 'uptodate' && (
            <label className="text-sm font-medium text-slate-600">
              {t('reports.fighterLabel')}
              <select
                className="input ml-2"
                value={utdPerson}
                onChange={(e) => setUtdPerson(e.target.value)}
              >
                {fighters.map((x) => (
                  <option key={x.id} value={x.no}>{x.no}</option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm font-medium text-slate-600">
            {t('reports.from')}
            <input type="date" className="input ml-2" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <select className="input" value={fromSess} onChange={(e) => setFromSess(e.target.value as 'AM' | 'PM')}>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
          <label className="text-sm font-medium text-slate-600">
            {t('reports.to')}
            <input type="date" className="input ml-2" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <select className="input" value={toSess} onChange={(e) => setToSess(e.target.value as 'AM' | 'PM')}>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        </div>
      )}

      {tab === 'selected' && (
        <div className="card-pad no-print flex flex-wrap items-end gap-3">
          <select className="input" value={selSide} onChange={(e) => { setSelSide(e.target.value as 'bet' | 'carry'); setSelPerson(''); }}>
            <option value="bet">{t('reports.selFighter')}</option>
            <option value="carry">{t('reports.selOwner')}</option>
          </select>
          <select className="input" value={selPerson} onChange={(e) => setSelPerson(e.target.value)}>
            <option value="">{t('reports.pickPerson')}</option>
            {selPeople.map((x) => (
              <option key={x.id} value={x.no}>{x.no}</option>
            ))}
          </select>
          <span className="text-sm text-slate-500">{t('reports.allDates')}</span>
        </div>
      )}

      <p className="text-sm text-slate-500">
        {tab === 'current' && t('reports.desc.current', { day: p.betDay, session: p.session })}
        {tab === 'daily' && t('reports.desc.daily', { day: p.betDay })}
        {tab === 'weekly' &&
          t('reports.desc.weekly', { day: p.betDay, from: weekBounds(p.betDay).from, to: weekBounds(p.betDay).to })}
        {tab === 'range' && t('reports.desc.range', { from, fromSess, to, toSess })}
        {tab === 'uptodate' && t('reports.desc.uptodate', { no: utdPerson, from, fromSess, to, toSess })}
        {tab === 'selected' &&
          (selPerson
            ? t('reports.desc.selected', { side: selSide === 'bet' ? t('reports.selFighter') : t('reports.selOwner'), no: selPerson })
            : t('reports.desc.selectedPick'))}
      </p>

      {tab === 'uptodate' ? (
        <div className="grid gap-3 lg:grid-cols-2">{renderTable(t('reports.table.uptodate', { no: utdPerson }), upToDateRows)}</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {renderTable(t('reports.table.fighterBet'), fighterRows)}
          {renderTable(t('reports.table.ownerCarry'), ownerRows)}
        </div>
      )}
    </div>
  );
}
