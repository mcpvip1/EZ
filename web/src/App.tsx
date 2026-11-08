import { useEffect, useMemo, useRef, useState } from 'react';
import {
  btbuyTopUp,
  clipboardBetText,
  clipboardCarryText,
  computeBoard,
  computeOverLimit,
  dashboard,
  expandCode,
  expandEntryList,
  nextGroupNo,
  overTopCrop,
  reverseNo,
  roundUpToTen,
} from './shared-vendor/index.ts';
import type { OverLimitRow } from './shared-vendor/index.ts';
import {
  dbDelete,
  dbPut,
  dbPutMany,
  importData,
  loadAll,
  loadFixture,
  nowStamp,
  seedIfEmpty,
  sessionFromClock,
  usingMemoryStorage,
  todayISO,
  uid,
} from './lib/db';
import type { AllData, CalcSettings, DetailRow, GroupPack, Lucky, Person, SavedCode, Session } from './lib/db';
import { makeEntryRow } from './lib/types';
import type { EntryRow } from './lib/types';
import seedJson from './seed.json';
import Board from './pages/Board';
import LuckyPage from './pages/Lucky';
import Reports from './pages/Reports';
import PeoplePage from './pages/People';
import GroupsPage from './pages/Groups';
import BackupPage from './pages/Backup';
import Browse from './pages/Browse';
import Auto from './pages/Auto';
import MenuBar from './components/MenuBar';
import { useLang } from './i18n';
import type { MenuAction } from './components/MenuBar';
import {
  AboutDialog,
  CalcDialog,
  ChangeDateDialog,
  CloseDaysDialog,
  ConfirmDialog,
  DeleteDialog,
  HighlightDialog,
  PopupDialog,
} from './components/Dialogs';
import { UnitSalesDialog } from './components/UnitSalesDialog';

type Dialog = 'changeDate' | 'delete' | 'unitSales' | 'closeDays' | 'about' | 'highlight' | 'calc' | null;
type ReportTab = 'current' | 'daily' | 'weekly' | 'range' | 'selected' | 'uptodate';
/** Popups open OVER the main screen — the board stays mounted behind them. */
type PopupKind = 'lucky' | 'people' | 'reports' | 'groups' | 'backup' | 'browse' | 'auto';
type Popup = { kind: PopupKind; focus?: 'fighter' | 'owner' } | null;

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

/** People order = the original MDB table order (seed.json order), not
 * IndexedDB key order — so the dropdowns list fighters/owners as the
 * original did and default to Fighter 1 / Owner 1. People added later
 * (not in the seed) sort after, by number. */
function sortPeople(list: Person[]): Person[] {
  const rank = (x: Person) => {
    const seed = (x.side === 'fighter' ? seedJson.fighters : seedJson.owners) as { no: string }[];
    const i = seed.findIndex((s) => s.no === x.no);
    return i === -1 ? 1000 : i;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || a.no.localeCompare(b.no));
}

/** AUTO letter for a date+session (ANALYSIS §4.8): A/B = day 1 (Sunday),
 * C/D = day 2, E/F = day 3, G/H = day 4, I/J = day 5; odd letter = AM. */
function autoLetterFor(betDay: string, session: Session): string | null {
  const dow = new Date(`${betDay}T12:00:00`).getDay(); // 0 = Sunday
  const pairs = ['AB', 'CD', 'EF', 'GH', 'IJ'];
  if (dow < 0 || dow > 4) return null;
  return pairs[dow][session === 'AM' ? 0 : 1];
}

export default function App() {
  const [data, setData] = useState<AllData | null>(null);
  const [memMode, setMemMode] = useState(false);
  const [popup, setPopup] = useState<Popup>(null);
  const [betDay, setBetDay] = useState(todayISO());
  const [session, setSession] = useState<Session>(sessionFromClock());
  const [limit, setLimit] = useState(40000);
  const [fighterNo, setFighterNo] = useState('');
  const [ownerNo, setOwnerNo] = useState('');
  const [fighterCom, setFighterCom] = useState(15);
  const [fighterRate, setFighterRate] = useState(80);
  const [ownerCom, setOwnerCom] = useState(14);
  const [ownerRate, setOwnerRate] = useState(80);
  const [fighterRows, setFighterRows] = useState<EntryRow[]>([]);
  const [carryRows, setCarryRows] = useState<EntryRow[]>([]);
  const [lastClipboard, setLastClipboard] = useState('');
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' | 'info' } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pendingSave, setPendingSave] = useState<'bet' | 'carry' | null>(null);
  const [reportNav, setReportNav] = useState<{
    tab: ReportTab;
    person?: { side: 'bet' | 'carry'; no: string };
    range?: { from: string; to: string; fromSess: Session; toSess: Session };
    viewOnly?: boolean;
  }>({ tab: 'current' });
  const [reportKey, setReportKey] = useState(0);
  const [carryEnabled, setCarryEnabled] = useState(true);
  // D17: highlight default is cyan, like the live table's totals row.
  const [highlight, setHighlight] = useState('#67e8f9');
  const fighterCodeRef = useRef<HTMLInputElement>(null);
  const carryCodeRef = useRef<HTMLInputElement>(null);
  const fighterPersonRef = useRef<HTMLSelectElement>(null);
  const carryPersonRef = useRef<HTMLSelectElement>(null);

  const { t, setLang } = useLang();
  const showToast = (msg: string, kind: 'ok' | 'err' | 'info' = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), kind === 'err' ? 5000 : 3500);
  };

  useEffect(() => {
    (async () => {
      // The app must never sit on the loading screen: the db layer already
      // falls back to in-memory storage when IndexedDB is unavailable, and
      // as a last resort we render with an empty book so the operator can
      // still work and use Backup/Restore.
      let d: AllData;
      try {
        await seedIfEmpty();
        d = await loadAll();
      } catch {
        d = { people: [], codes: [], details: [], lucky: [], templates: [], groups: [], settings: null };
      }
      setMemMode(usingMemoryStorage());
      setData(d);
      setLimit(d.settings?.limit ?? 40000);
      const f = sortPeople(d.people.filter((x) => x.side === 'fighter'))[0];
      const o = sortPeople(d.people.filter((x) => x.side === 'owner'))[0];
      if (f) {
        setFighterNo(f.no);
        setFighterCom(f.commission);
        setFighterRate(f.rate);
      }
      if (o) {
        setOwnerNo(o.no);
        setOwnerCom(o.commission);
        setOwnerRate(o.rate);
      }
    })();
  }, []);

  const fighters = useMemo(() => sortPeople((data?.people ?? []).filter((x) => x.side === 'fighter')), [data]);
  const owners = useMemo(() => sortPeople((data?.people ?? []).filter((x) => x.side === 'owner')), [data]);

  const sessionDetails = useMemo(
    () => (data?.details ?? []).filter((d) => d.betDay === betDay && d.session === session),
    [data, betDay, session],
  );
  const savedBet = sessionDetails.filter((d) => d.side === 'bet');
  const savedCarry = sessionDetails.filter((d) => d.side === 'carry');
  const luckyNow = useMemo(
    () => (data?.lucky ?? []).find((l) => l.betDay === betDay && l.session === session) ?? null,
    [data, betDay, session],
  );

  // Dashboard + board are SAVED-ONLY (item 5): unsaved entry rows live in
  // the entry grids and never join the board or the totals. Refr is a
  // manual reload (re-reads saved data), not a visibility toggle.
  const board = useMemo(() => {
    const betRows = savedBet.map((d) => ({ no: d.no, amount: d.amount }));
    const carryRowsFlat = savedCarry.map((d) => ({ no: d.no, amount: d.amount }));
    return computeBoard(betRows, carryRowsFlat);
  }, [savedBet, savedCarry]);

  const overLimit = useMemo(() => computeOverLimit(board, limit), [board, limit]);

  const dash = useMemo(() => {
    const betTotal = savedBet.reduce((s, d) => s + d.amount, 0);
    const carryTotal = savedCarry.reduce((s, d) => s + d.amount, 0);
    const luckyNo = luckyNow?.no ?? null;
    const winSum = (rows: DetailRow[]) => {
      if (!luckyNo) return 0;
      return rows.filter((d) => d.no === luckyNo).reduce((s, d) => s + d.amount, 0);
    };
    return dashboard(betTotal, carryTotal, winSum(savedBet), winSum(savedCarry), {
      limit,
      commission: data?.settings?.commission ?? 16,
      rate: data?.settings?.rate ?? 80,
    });
  }, [savedBet, savedCarry, luckyNow, limit, data]);

  const changeFighter = (no: string) => {
    setFighterNo(no);
    const p = fighters.find((x) => x.no === no);
    if (p) {
      setFighterCom(p.commission);
      setFighterRate(p.rate);
    }
  };
  const changeOwner = (no: string) => {
    setOwnerNo(no);
    const p = owners.find((x) => x.no === no);
    if (p) {
      setOwnerCom(p.commission);
      setOwnerRate(p.rate);
    }
  };

  const addEntry = (side: 'bet' | 'carry', code: string, amount: string): boolean => {
    const expanded = expandEntryList(code, amount);
    if (expanded.length === 0) return false;
    const rows = expanded.map((r) => makeEntryRow(r, amount));
    if (side === 'bet') setFighterRows((prev) => [...prev, ...rows]);
    else setCarryRows((prev) => [...prev, ...rows]);
    return true;
  };

  /** Inline row editor (original LoadGroupBox): re-expand the edited code/amount in place. */
  const editEntryRow = (side: 'bet' | 'carry', id: string, code: string, amount: string): boolean => {
    const expanded = expandEntryList(code, amount);
    if (expanded.length === 0) return false;
    const rows = expanded.map((r) => makeEntryRow(r, amount));
    const apply = (prev: EntryRow[]) => {
      const i = prev.findIndex((r) => r.id === id);
      if (i === -1) return prev;
      return [...prev.slice(0, i), ...rows, ...prev.slice(i + 1)];
    };
    if (side === 'bet') setFighterRows(apply);
    else setCarryRows(apply);
    return true;
  };

  /**
   * Save, split in two so the master rates are updated BEFORE the confirm,
   * as in the original (cmdSaveF_Click / cmdSaveO_Click write the fighter /
   * owner master first, then ask "Are You Sure to Save Bet/Carry?").
   * A cancelled save therefore still keeps the updated master rates.
   */
  const requestSave = (side: 'bet' | 'carry') => {
    if (!data) return;
    const rows = side === 'bet' ? fighterRows : carryRows;
    const personNo = side === 'bet' ? fighterNo : ownerNo;
    const commission = side === 'bet' ? fighterCom : ownerCom;
    const rate = side === 'bet' ? fighterRate : ownerRate;
    if (rows.length === 0) {
      showToast(t('toast.nothingToSave'), 'err');
      return;
    }
    if (!personNo) {
      showToast(t('toast.pickPerson'), 'err');
      return;
    }
    const person = (side === 'bet' ? fighters : owners).find((x) => x.no === personNo);
    if (person) {
      const now = Date.now();
      const updated = { ...person, commission, rate, updatedAt: now };
      void dbPut('people', updated);
      setData((d) => (d ? { ...d, people: d.people.map((x) => (x.id === person.id ? updated : x)) } : d));
    }
    setPendingSave(side);
  };

  const confirmSave = async (side: 'bet' | 'carry') => {
    if (!data) return;
    const rows = side === 'bet' ? fighterRows : carryRows;
    const personNo = side === 'bet' ? fighterNo : ownerNo;
    const commission = side === 'bet' ? fighterCom : ownerCom;
    const rate = side === 'bet' ? fighterRate : ownerRate;
    if (rows.length === 0 || !personNo) return;
    const sideCodes = data.codes.filter((c) => c.side === side);
    const groupId = sideCodes.reduce((m, c) => Math.max(m, c.groupId), 0) + 1;
    let sno = sideCodes.reduce((m, c) => Math.max(m, c.sno), 0);
    const now = Date.now();
    const stamp = nowStamp();
    const codes: SavedCode[] = [];
    const details: DetailRow[] = [];
    rows.forEach((r) => {
      sno += 1;
      codes.push({
        id: uid(),
        side,
        betDay,
        session,
        personNo,
        displayCode: r.displayCode,
        codeNo: r.codeNo,
        amountText: r.amountText,
        rowTotal: r.rowTotal,
        commission,
        rate,
        groupId,
        sno,
        betDateTime: stamp,
        updatedAt: now,
      });
      r.numbers.forEach((n) => {
        details.push({
          id: uid(),
          side,
          betDay,
          session,
          personNo,
          no: n.no,
          amount: n.amount,
          commission,
          rate,
          sno,
          groupId,
          updatedAt: now,
        });
      });
    });
    await dbPutMany('codes', codes);
    await dbPutMany('details', details);
    const total = rows.reduce((s, r) => s + r.rowTotal, 0);
    const clipCodes = rows.map((r) => ({ displayCode: r.displayCode, amountText: r.amountText }));
    const text =
      side === 'bet'
        ? clipboardBetText(clipCodes, total, personNo, betDay, session, nextGroupNo(data.details, personNo, betDay, session))
        : clipboardCarryText(clipCodes, total, personNo, betDay, session, nextGroupNo(data.details, personNo, betDay, session));
    const ok = await copyText(text);
    setLastClipboard(text);
    setData((d) => (d ? { ...d, codes: [...d.codes, ...codes], details: [...d.details, ...details] } : d));
    if (side === 'bet') setFighterRows([]);
    else setCarryRows([]);
    // D3: after a successful save the original resets person / commission /
    // rate to 0 and refocuses the Fighter/Owner dropdown (cboF/cboO).
    if (side === 'bet') {
      setFighterNo('');
      setFighterCom(0);
      setFighterRate(0);
      setTimeout(() => fighterPersonRef.current?.focus(), 0);
    } else {
      setOwnerNo('');
      setOwnerCom(0);
      setOwnerRate(0);
      setTimeout(() => carryPersonRef.current?.focus(), 0);
    }
    showToast(
      ok
        ? t(side === 'bet' ? 'toast.betSaved' : 'toast.carrySaved')
        : t(side === 'bet' ? 'toast.betSavedNoClip' : 'toast.carrySavedNoClip'),
      ok ? 'ok' : 'err',
    );
  };

  // --- Over-limit pass-up (§6) ---
  const overRowToEntryRows = (row: OverLimitRow, round: boolean): EntryRow[] => {
    const amt = (n: number) => (round ? roundUpToTen(n) : n);
    if (row.no.endsWith(' R')) {
      const nn = row.no.slice(0, 2);
      const per = amt(row.rowTotal / 2);
      const e = expandCode(`${nn}+`, String(per));
      return e ? [makeEntryRow(e, String(per), true)] : [];
    }
    if (typeof row.over === 'string' && row.over.includes('/')) {
      const [a, b] = row.over.split('/').map(Number);
      const nn = row.no;
      const rev = reverseNo(nn);
      const ea = expandCode(nn, String(amt(a)));
      const eb = expandCode(rev, String(amt(b)));
      const out: EntryRow[] = [];
      if (ea) out.push(makeEntryRow(ea, String(amt(a)), true));
      if (eb) out.push(makeEntryRow(eb, String(amt(b)), true));
      return out;
    }
    const e = expandCode(row.no, String(amt(Number(row.over))));
    return e ? [makeEntryRow(e, String(amt(Number(row.over))), true)] : [];
  };

  const passRows = (rows: OverLimitRow[], round: boolean) => {
    // Rounded-to-tens: equal parts collapse to a single reverse row.
    if (round) {
      const out: EntryRow[] = [];
      rows.forEach((r) => {
        if (typeof r.over === 'string' && r.over.includes('/')) {
          const [a, b] = r.over.split('/').map(Number);
          const ra = roundUpToTen(a);
          const rb = roundUpToTen(b);
          if (ra === rb) {
            const e = expandCode(`${r.no}+`, String(ra));
            if (e) out.push(makeEntryRow(e, String(ra), true));
            return;
          }
        }
        out.push(...overRowToEntryRows(r, true));
      });
      setCarryRows((prev) => [...prev, ...out]);
    } else {
      setCarryRows((prev) => [...prev, ...rows.flatMap((r) => overRowToEntryRows(r, false))]);
    }
    showToast(t('toast.movedToCarry'));
  };

  /** BTbuy: top every below-limit number up to the limit, into the Fighter entry. */
  const handleBTbuy = () => {
    const rows = btbuyTopUp(board, limit);
    if (rows.length === 0) {
      showToast(t('toast.nothingToTopUp'), 'info');
      return;
    }
    const entryRows: EntryRow[] = [];
    rows.forEach((r) => {
      const e = expandCode(r.no, String(r.amount));
      if (e) entryRows.push(makeEntryRow(e, String(r.amount)));
    });
    setFighterRows((prev) => [...prev, ...entryRows]);
    showToast(t('toast.btbuyAdded', { n: entryRows.length }));
  };

  /** OverTopCrop: move the over-limit excess of every number into the Carry entry. */
  const handleCrop = () => {
    const rows = overTopCrop(board, limit);
    if (rows.length === 0) {
      showToast(t('toast.nothingToCrop'), 'info');
      return;
    }
    const entryRows: EntryRow[] = [];
    rows.forEach((r) => {
      const e = expandCode(r.no, String(r.amount));
      if (e) entryRows.push(makeEntryRow(e, String(r.amount), true));
    });
    setCarryRows((prev) => [...prev, ...entryRows]);
    showToast(t('toast.cropAdded', { n: entryRows.length }));
  };

  const reload = async () => setData(await loadAll());

  const saveLucky = async (no: string) => {
    if (!data) return;
    const rec: Lucky = { key: `${betDay}|${session}`, betDay, session, no, noR: reverseNo(no), updatedAt: Date.now() };
    await dbPut('lucky', rec);
    setData({ ...data, lucky: [...data.lucky.filter((l) => l.key !== rec.key), rec] });
  };

  const oldNumbers = (amount: string) => {
    if (!data) return;
    const nums = [...new Set(data.lucky.map((l) => l.no))].sort();
    if (nums.length === 0) {
      showToast(t('toast.noPastDraws'), 'info');
      return;
    }
    const rows: EntryRow[] = [];
    nums.forEach((nn) => {
      const twin = nn[0] === nn[1];
      const e = expandCode(twin ? nn : `${nn}+`, amount);
      if (e) rows.push(makeEntryRow(e, amount));
    });
    setFighterRows((prev) => [...prev, ...rows]);
    showToast(t('toast.oldNumbersCopied', { n: nums.length }));
  };

  /** D9: group replay uses each row's STORED amount and clears the grid first. */
  const replayGroup = (g: GroupPack) => {
    const rows: EntryRow[] = [];
    g.rows.forEach((r) => {
      const e = expandCode(r.code, r.amount);
      if (e) rows.push(makeEntryRow(e, r.amount));
    });
    setFighterRows(rows);
    setPopup(null);
    showToast(t('toast.groupReplayed', { name: g.name, n: rows.length }));
    setTimeout(() => fighterCodeRef.current?.focus(), 0);
  };

  /** AUTO materialise: expand each {no, amount} into entry rows via the expansion helpers.
   * When Auto materialised a specific fighter's rules, switch the Fighter entry to that fighter first. */
  const materialiseAuto = (items: Array<{ no: string; amount: number }>, fighter: string) => {
    if (fighter && fighter !== '__all__') changeFighter(fighter);
    const rows: EntryRow[] = [];
    items.forEach((it) => {
      const e = expandCode(it.no, String(it.amount));
      if (e) rows.push(makeEntryRow(e, String(it.amount)));
    });
    if (rows.length > 0) setFighterRows((prev) => [...prev, ...rows]);
    setPopup(null);
    showToast(rows.length > 0 ? t('toast.autoMaterialised', { n: rows.length }) : t('toast.nothingToMaterialise'), rows.length > 0 ? 'ok' : 'info');
    setTimeout(() => fighterCodeRef.current?.focus(), 0);
  };

  const savePerson = async (p: Person) => {
    if (!data) return;
    const rec = { ...p, updatedAt: Date.now() };
    await dbPut('people', rec);
    setData({ ...data, people: data.people.map((x) => (x.id === rec.id ? rec : x)) });
  };

  const addPerson = (side: 'fighter' | 'owner', no: string, commission: number, rate: number): string | null => {
    if (!data) return t('toast.stillLoading');
    if (!no) return t('toast.enterNumber');
    if (data.people.some((x) => x.side === side && x.no === no)) return t('toast.personExists', { side: side === 'fighter' ? t('entry.fighter') : t('entry.owner') });
    const rec: Person = { id: `${side === 'fighter' ? 'F' : 'O'}:${no}`, side, no, name: '', commission, rate, updatedAt: Date.now() };
    void dbPut('people', rec).then(() => setData((d) => (d ? { ...d, people: [...d.people, rec] } : d)));
    return null;
  };

  const deletePerson = async (id: string) => {
    if (!data) return;
    await dbDelete('people', id);
    setData({ ...data, people: data.people.filter((x) => x.id !== id) });
  };

  const exportJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `easy2d-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('toast.backupDownloaded'));
  };

  const importFile = async (f: File) => {
    const parsed = JSON.parse(await f.text()) as AllData;
    const r = await importData(parsed);
    await reload();
    return r;
  };

  const loadFixtureClick = async () => {
    await loadFixture();
    await reload();
    setBetDay('2024-04-11');
    showToast(t('toast.fixtureLoaded'));
  };

  /** D12/D13: persist the Calc row (limit / commission / rate) from the popup. */
  const saveCalc = async (limitV: number, commissionV: number, rateV: number) => {
    setLimit(limitV);
    const s: CalcSettings = { key: 'calc', limit: limitV, commission: commissionV, rate: rateV, updatedAt: Date.now() };
    await dbPut('settings', s);
    setData((d) => (d ? { ...d, settings: s } : d));
    showToast(t('toast.calcSaved'));
  };

  // --- Navigation helpers (menu bar + shortcuts) ---
  const openReports = (tab: ReportTab, extra?: Partial<typeof reportNav>) => {
    setReportNav({ tab, ...extra });
    setReportKey((k) => k + 1);
    setPopup({ kind: 'reports' });
    setDialog(null);
  };

  const openSelectedFor = (side: 'bet' | 'carry', no: string) => {
    openReports('selected', { person: { side, no } });
  };

  const onMenuAction = async (action: MenuAction['kind']) => {
    switch (action) {
      case 'lucky':
        setPopup({ kind: 'lucky' });
        break;
      case 'fighter':
        setPopup({ kind: 'people', focus: 'fighter' });
        break;
      case 'owner':
        setPopup({ kind: 'people', focus: 'owner' });
        break;
      case 'delete':
        setDialog('delete');
        break;
      case 'changeDate':
        setDialog('changeDate');
        break;
      case 'unitSales':
        setDialog('unitSales');
        break;
      case 'closeDays':
        setDialog('closeDays');
        break;
      case 'about':
        setDialog('about');
        break;
      case 'highlight':
        setDialog('highlight');
        break;
      case 'backup':
        setPopup({ kind: 'backup' });
        break;
      case 'browseBets':
        setPopup({ kind: 'browse' });
        break;
      case 'reportCurrent':
        openReports('current');
        break;
      case 'reportDaily':
        openReports('daily');
        break;
      case 'reportWeekly':
        openReports('weekly');
        break;
      case 'reportRange':
        openReports('range', { range: { from: betDay, to: betDay, fromSess: 'AM', toSess: 'PM' } });
        break;
      case 'reportRangeAMPM':
        openReports('range');
        break;
      case 'reportSelected':
        openReports('selected');
        break;
      case 'reportSelectedViewOnly':
        openReports('selected', { viewOnly: true });
        break;
      case 'reportUpToDate':
        openReports('uptodate');
        break;
      case 'auto':
        setPopup({ kind: 'auto' });
        break;
      case 'template':
        setPopup({ kind: 'groups' });
        break;
      case 'okThanks':
        await copyText('OK Thanks');
        showToast(t('toast.okThanksCopied'));
        break;
      case 'tEquals':
        await copyText('T=');
        showToast(t('toast.tEqualsCopied'));
        break;
      case 'close':
        if (popup) setPopup(null);
        else if (dialog) setDialog(null);
        break;
      case 'langMy':
        setLang('my');
        break;
      case 'langEn':
        setLang('en');
        break;
    }
  };

  // --- Keyboard shortcuts (original function keys) ---
  // MDIMain_KeyDown: F3 (114) -> cboF focus, F6 (117) -> cboO focus.
  // Function keys and Ctrl combos work WHILE focus is in any input — the
  // old early return for INPUT/TEXTAREA/SELECT is gone for them. Ordinary
  // typing keys are untouched. Esc is handled by the topmost dialog/popup
  // (Dialogs.tsx stack), so it closes a popup before anything behind it.
  // Note: F3/F6 (and ".") pressed in a code box are intercepted by the
  // EntryPanel, which saves instead (txtNoF/txtNoO KeyDown) and stops the
  // event reaching this handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'l') {
          e.preventDefault();
          setPopup({ kind: 'lucky' });
        } else if (k === 'f') {
          e.preventDefault();
          setPopup({ kind: 'people', focus: 'fighter' });
        } else if (k === 'o') {
          e.preventDefault();
          setPopup({ kind: 'people', focus: 'owner' });
        } else if (k === 'd') {
          e.preventDefault();
          setDialog('delete');
        } else if (k === 't') {
          e.preventDefault();
          setDialog('changeDate');
        } else if (e.key === 'F4') {
          e.preventDefault();
          openReports('selected', { viewOnly: true });
        }
        return;
      }
      switch (e.key) {
        case 'F3':
          e.preventDefault();
          fighterPersonRef.current?.focus();
          break;
        case 'F6':
          e.preventDefault();
          carryPersonRef.current?.focus();
          break;
        case 'F9':
          e.preventDefault();
          openReports('current');
          break;
        case 'F10':
          e.preventDefault();
          openReports('daily');
          break;
        case 'F11':
          e.preventDefault();
          openReports('weekly');
          break;
        case 'F12':
          e.preventDefault();
          openReports('range', { range: { from: betDay, to: betDay, fromSess: 'AM', toSess: 'PM' } });
          break;
        case 'F4':
          e.preventDefault();
          openReports('selected');
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betDay, session]);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
        {t('app.loading')}
      </div>
    );
  }

  const dayNum = Number(betDay.slice(8, 10));
  const monthNum = Number(betDay.slice(5, 7));
  const copyFighterToCarry = () => {
    if (fighterRows.length === 0) {
      showToast(t('toast.nothingToCopy'), 'err');
      return;
    }
    setCarryRows((prev) => [...prev, ...fighterRows.map((r) => ({ ...r, id: uid() }))]);
    showToast(t('toast.fighterRowsCopied', { n: fighterRows.length }));
  };

  const popupTitle =
    popup?.kind === 'lucky'
      ? t('app.popup.lucky')
      : popup?.kind === 'people'
        ? popup.focus === 'owner'
          ? t('app.popup.owner')
          : t('app.popup.fighter')
        : popup?.kind === 'reports'
          ? t('app.popup.reports')
          : popup?.kind === 'groups'
            ? t('app.popup.groups')
            : popup?.kind === 'backup'
              ? t('app.popup.backup')
              : popup?.kind === 'browse'
                ? t('app.popup.browse')
                : popup?.kind === 'auto'
                  ? t('app.popup.auto')
                  : '';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Classic title bar (original: "EASY v.5.5.1 - 8-11 PM") */}
      <header className="no-print border-b border-slate-400 bg-gradient-to-b from-slate-100 to-slate-200 px-3 py-1">
        <h1 className="text-base font-bold text-slate-900 sm:text-lg">
          EASY v.5.5.1 - {dayNum}-{monthNum} {session}
        </h1>
      </header>
      {memMode && (
        <p className="no-print bg-amber-100 px-3 py-1.5 text-center text-sm font-medium text-amber-900">
          {t('app.memNotice')}
        </p>
      )}
      <MenuBar
        onAction={(a) => void onMenuAction(a)}
        dateLabel={`${betDay} ${session}`}
        right={
          <>
            <input
              type="date"
              className="rounded border border-slate-300 bg-white px-1 py-0.5 text-sm"
              value={betDay}
              onChange={(e) => e.target.value && setBetDay(e.target.value)}
              aria-label={t('menu.changeDateLabel')}
              title={t('menu.changeDateTitle')}
            />
            <div className="flex overflow-hidden rounded border border-slate-300">
              {(['AM', 'PM'] as Session[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSession(s)}
                  className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-3 text-sm font-bold ${session === s ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        }
      />

      <main className="mx-auto max-w-[1400px] px-2 py-2">
        {/* The board is always mounted; popups render over it. */}
        <Board
          betDay={betDay}
          session={session}
          limit={limit}
          onOpenCalc={() => setDialog('calc')}
          dash={dash}
          board={board}
          overLimit={overLimit}
          savedBetCount={savedBet.length}
          savedCarryCount={savedCarry.length}
          fighters={fighters}
          owners={owners}
          fighterNo={fighterNo}
          ownerNo={ownerNo}
          onFighterChange={changeFighter}
          onOwnerChange={changeOwner}
          fighterCom={fighterCom}
          fighterRate={fighterRate}
          ownerCom={ownerCom}
          ownerRate={ownerRate}
          onFighterCom={setFighterCom}
          onFighterRate={setFighterRate}
          onOwnerCom={setOwnerCom}
          onOwnerRate={setOwnerRate}
          fighterRows={fighterRows}
          carryRows={carryRows}
          onAddFighter={(c, a) => addEntry('bet', c, a)}
          onAddCarry={(c, a) => addEntry('carry', c, a)}
          onDeleteFighterRow={(id) => setFighterRows((prev) => prev.filter((r) => r.id !== id))}
          onDeleteCarryRow={(id) => setCarryRows((prev) => prev.filter((r) => r.id !== id))}
          onEditFighterRow={(id, c, a) => editEntryRow('bet', id, c, a)}
          onEditCarryRow={(id, c, a) => editEntryRow('carry', id, c, a)}
          onClearFighter={() => setFighterRows([])}
          onClearCarry={() => setCarryRows([])}
          onSaveBet={() => requestSave('bet')}
          onSaveCarry={() => requestSave('carry')}
          onPassAll={() => passRows(overLimit, false)}
          onPassOne={(r) => passRows([r], false)}
          onPassTens={() => passRows(overLimit, true)}
          onBTbuy={handleBTbuy}
          onCrop={handleCrop}
          onBack={() => setCarryRows((prev) => prev.filter((r) => !r.fromLimit))}
          onBackOne={() => setCarryRows((prev) => {
            const idx = prev.map((r) => r.fromLimit).lastIndexOf(true);
            return idx === -1 ? prev : prev.filter((_, i) => i !== idx);
          })}
          lastClipboard={lastClipboard}
          onCopyLastClipboard={async () => {
            if (lastClipboard && (await copyText(lastClipboard))) showToast(t('board.lastSaveCopied'));
          }}
          savedDetails={sessionDetails}
          onRefr={() => void reload().then(() => showToast(t('toast.reloaded')))}
          highlight={highlight}
          autoLetter={autoLetterFor(betDay, session)}
          commissionPct={data.settings?.commission ?? 16}
          rate={data.settings?.rate ?? 80}
          carryEnabled={carryEnabled}
          onCarryEnabledChange={setCarryEnabled}
          onOldNumbers={oldNumbers}
          onUnitSales={() => setDialog('unitSales')}
          onBrowseFighter={() => openSelectedFor('bet', fighterNo)}
          onBrowseCarry={() => openSelectedFor('carry', ownerNo)}
          onCopyFighterToCarry={copyFighterToCarry}
          fighterCodeRef={fighterCodeRef}
          carryCodeRef={carryCodeRef}
          fighterPersonRef={fighterPersonRef}
          carryPersonRef={carryPersonRef}
        />
      </main>

      {/* ---- Popups over the board ---- */}
      {popup && (
        <PopupDialog title={popupTitle} onClose={() => setPopup(null)} wide={popup.kind !== 'lucky'}>
          {popup.kind === 'lucky' && (
            <LuckyPage betDay={betDay} session={session} current={luckyNow} all={data.lucky} onSave={(no) => void saveLucky(no)} onOldNumbers={oldNumbers} />
          )}
          {popup.kind === 'people' && (
            <>
              <p className="mb-2 text-sm text-slate-500">
                {popup.focus === 'owner' ? t('app.popup.ownerHint') : t('app.popup.fighterHint')}
              </p>
              <PeoplePage people={data.people} focus={popup.focus} onSave={(p) => void savePerson(p)} onAdd={addPerson} onDelete={(id) => void deletePerson(id)} />
            </>
          )}
          {popup.kind === 'reports' && (
            <Reports
              key={reportKey}
              betDay={betDay}
              session={session}
              details={data.details}
              codes={data.codes}
              lucky={data.lucky}
              people={data.people}
              initialTab={reportNav.tab}
              initialPerson={reportNav.person}
              initialRange={reportNav.range}
              viewOnly={reportNav.viewOnly}
            />
          )}
          {popup.kind === 'groups' && (
            <GroupsPage
              templates={data.templates}
              groups={data.groups}
              onCopyTemplate={async (text) => {
                await copyText(text);
                showToast(t('toast.templateCopied'));
              }}
              onReplayGroup={replayGroup}
            />
          )}
          {popup.kind === 'backup' && (
            <BackupPage
              data={data}
              onExport={exportJson}
              onImportFile={importFile}
              onLoadFixture={() => void loadFixtureClick()}
            />
          )}
          {popup.kind === 'browse' && (
            <Browse data={data} betDay={betDay} session={session} onChanged={() => void reload()} onClose={() => setPopup(null)} />
          )}
          {popup.kind === 'auto' && (
            <Auto data={data} betDay={betDay} session={session} onMaterialise={materialiseAuto} onClose={() => setPopup(null)} />
          )}
        </PopupDialog>
      )}

      {dialog === 'changeDate' && (
        <ChangeDateDialog
          betDay={betDay}
          session={session}
          onApply={(d, s) => {
            setBetDay(d);
            setSession(s);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'delete' && (
        <DeleteDialog
          betDay={betDay}
          onDone={(msg) => {
            void reload();
            showToast(msg);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'unitSales' && (
        <UnitSalesDialog data={data} betDay={betDay} session={session} onClose={() => setDialog(null)} onSaved={() => void reload()} />
      )}
      {dialog === 'calc' && (
        <CalcDialog
          limit={limit}
          commission={data.settings?.commission ?? 16}
          rate={data.settings?.rate ?? 80}
          onApply={(l, c, r) => void saveCalc(l, c, r)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'closeDays' && <CloseDaysDialog onClose={() => setDialog(null)} />}
      {dialog === 'about' && <AboutDialog onClose={() => setDialog(null)} />}
      {dialog === 'highlight' && <HighlightDialog color={highlight} onApply={setHighlight} onClose={() => setDialog(null)} />}

      {pendingSave && (
        <ConfirmDialog
          title={t('dialog.saveConfirmTitle')}
          message={pendingSave === 'bet' ? t('dialog.saveBetMsg') : t('dialog.saveCarryMsg')}
          confirmLabel={t('dialog.yesSave')}
          onCancel={() => setPendingSave(null)}
          onConfirm={() => {
            const s = pendingSave;
            setPendingSave(null);
            void confirmSave(s);
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`no-print fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full px-5 py-3 text-sm font-bold text-white shadow-lg ${
            toast.kind === 'err' ? 'bg-red-600' : toast.kind === 'info' ? 'bg-slate-900' : 'bg-emerald-700'
          }`}
        >
          {toast.msg}
        </div>
      )}
      <footer className="no-print mx-auto max-w-[1400px] px-3 pb-4 text-center text-xs text-slate-400">
        {memMode
          ? t('app.footer.mem')
          : t('app.footer.ok')}
      </footer>
    </div>
  );
}
