import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from './shared';
import { CALC, FIGHTERS, OWNERS } from './shared';
import { clipboardBetText, clipboardCarryText, nextGroupNo } from './shared';
import { reverseNo } from './shared';
import type {
  CodeRow,
  Db,
  DetailRow,
  EntryRow,
  GroupPack,
  Person,
  ReplayRequest,
  TemplateItem,
} from './types';
import seedJson from './seed.json';

const STORAGE_KEY = 'easy2d.db.v1';

function localDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function clockSession(): Session {
  return new Date().getHours() < 12 ? 'AM' : 'PM';
}

function seedDb(): Db {
  const s = seedJson as unknown as {
    calc: { limit: number; commission: number; rate: number };
    fighters: { no: string; name: string; commission: number; rate: number }[];
    owners: { no: string; name: string; commission: number; rate: number }[];
    templates: { no: number; text: string }[];
    groups: GroupPack[];
  };
  const toPeople = (
    list: { no: string; name: string; commission: number; rate: number }[],
  ): Person[] =>
    list.map((p, i) => ({
      sno: i + 1,
      no: p.no,
      name: p.name ?? '',
      commission: p.commission,
      rate: p.rate,
    }));
  return {
    // Master data + Calc come from seed.json (= live simple.mdb values);
    // the shared FIGHTERS/OWNERS/CALC exports carry the same values and
    // are the cross-check (Fighter 3 rate is 80 here, NOT the 80250
    // anomaly in the MDB — see ANALYSIS §9.3).
    fighters: toPeople(s.fighters.length ? s.fighters : FIGHTERS),
    owners: toPeople(s.owners.length ? s.owners : OWNERS),
    settings: {
      limit: s.calc?.limit ?? CALC.limit,
      commission: s.calc?.commission ?? CALC.commission,
      rate: s.calc?.rate ?? CALC.rate,
    },
    betCodes: [],
    bets: [],
    carryCodes: [],
    carries: [],
    luckyNos: [],
    templates: (s.templates ?? []).map((t) => ({ no: t.no, text: t.text })),
    groups: s.groups ?? [],
    updatedAt: new Date().toISOString(),
  };
}

export interface SessionState {
  betDay: string;
  ampm: Session;
}

interface StoreValue {
  db: Db | null;
  loaded: boolean;
  session: SessionState;
  setSession: (s: SessionState) => void;
  saveDb: (next: Db) => Promise<void>;
  patchPeople: (
    side: 'fighters' | 'owners',
    people: Person[],
  ) => Promise<void>;
  setLimit: (limit: number) => Promise<void>;
  saveEntry: (
    side: 'bet' | 'carry',
    personNo: string,
    rows: EntryRow[],
  ) => Promise<string>;
  upsertLucky: (no: string) => Promise<void>;
  deleteLucky: (betDay: string, ampm: Session) => Promise<void>;
  replay: ReplayRequest | null;
  requestReplay: (r: ReplayRequest) => void;
  consumeReplay: () => ReplayRequest | null;
  loadFixture: () => Promise<void>;
  clearTransactions: () => Promise<void>;
  importDb: (json: string) => Promise<void>;
  exportJson: () => string;
}

const StoreCtx = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const v = useContext(StoreCtx);
  if (!v) throw new Error('useStore must be used inside <DataProvider>');
  return v;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null);
  const [session, setSessionState] = useState<SessionState>({
    betDay: localDate(),
    ampm: clockSession(),
  });
  const [replay, setReplay] = useState<ReplayRequest | null>(null);
  const replayRef = useRef<ReplayRequest | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Db;
          // Tolerate older/partial shapes: fill any missing array.
          const seeded = seedDb();
          setDb({
            ...seeded,
            ...parsed,
            fighters: parsed.fighters ?? seeded.fighters,
            owners: parsed.owners ?? seeded.owners,
            settings: parsed.settings ?? seeded.settings,
            betCodes: parsed.betCodes ?? [],
            bets: parsed.bets ?? [],
            carryCodes: parsed.carryCodes ?? [],
            carries: parsed.carries ?? [],
            luckyNos: parsed.luckyNos ?? [],
            templates: parsed.templates ?? seeded.templates,
            groups: parsed.groups ?? seeded.groups,
          });
        } else {
          const seeded = seedDb();
          setDb(seeded);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
        }
      } catch {
        setDb(seedDb());
      }
    })();
  }, []);

  const saveDb = useCallback(async (next: Db) => {
    const stamped: Db = { ...next, updatedAt: new Date().toISOString() };
    setDb(stamped);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stamped));
  }, []);

  const setSession = useCallback((s: SessionState) => setSessionState(s), []);

  const patchPeople = useCallback(
    async (side: 'fighters' | 'owners', people: Person[]) => {
      if (!db) return;
      await saveDb({ ...db, [side]: people });
    },
    [db, saveDb],
  );

  const setLimit = useCallback(
    async (limit: number) => {
      if (!db || !Number.isFinite(limit) || limit <= 0) return;
      await saveDb({ ...db, settings: { ...db.settings, limit } });
    },
    [db, saveDb],
  );

  /**
   * Save one entry grid (MDIMain cmdSaveF / cmdSaveO).
   * GroupID = MAX(GroupID)+1 globally per save; Sno = MAX(Sno)+1 per row
   * (per table, taken at insert time — same as the original, §7.3).
   * Returns the clipboard text for the save.
   */
  const saveEntry = useCallback(
    async (
      side: 'bet' | 'carry',
      personNo: string,
      rows: EntryRow[],
    ): Promise<string> => {
      if (!db) return '';
      const people = side === 'bet' ? db.fighters : db.owners;
      const person = people.find((p) => p.no === personNo);
      const commission = person?.commission ?? db.settings.commission;
      const rate = person?.rate ?? db.settings.rate;
      const codeTable = side === 'bet' ? db.betCodes : db.carryCodes;
      const detailTable = side === 'bet' ? db.bets : db.carries;
      const allCodes = [...db.betCodes, ...db.carryCodes];
      const groupId =
        allCodes.reduce((m, c) => Math.max(m, c.groupId), 0) + 1;
      let sno = [...codeTable, ...detailTable].reduce(
        (m, r) => Math.max(m, r.sno),
        0,
      );
      const now = new Date().toISOString();
      const newCodes: CodeRow[] = [];
      const newDetails: DetailRow[] = [];
      for (const r of rows) {
        sno += 1;
        const codeSno = sno;
        newCodes.push({
          sno: codeSno,
          groupId,
          betDay: session.betDay,
          ampm: session.ampm,
          personNo,
          displayCode: r.displayCode,
          codeNo: r.codeNo,
          amountText: r.amountText,
          rowTotal: r.rowTotal,
          commission,
          rate,
          edited: 0,
          createdAt: now,
        });
        for (const n of r.numbers) {
          sno += 1;
          newDetails.push({
            sno,
            groupId,
            betDay: session.betDay,
            ampm: session.ampm,
            personNo,
            no: n.no,
            amount: n.amount,
            commission,
            rate,
            displayCode: r.displayCode,
            codeNo: r.codeNo,
          });
        }
      }
      const next: Db =
        side === 'bet'
          ? {
              ...db,
              betCodes: [...db.betCodes, ...newCodes],
              bets: [...db.bets, ...newDetails],
            }
          : {
              ...db,
              carryCodes: [...db.carryCodes, ...newCodes],
              carries: [...db.carries, ...newDetails],
            };
      await saveDb(next);
      const codes = rows.map((r) => ({
        displayCode: r.displayCode,
        amountText: r.amountText,
      }));
      const total = rows.reduce((s, r) => s + r.rowTotal, 0);
      // Group number counts distinct saved groups for this person/day/session + 1,
      // computed from the pre-save tables (the new group is not in there yet).
      const groupNo = nextGroupNo(
        (side === 'bet' ? db.bets : db.carries).map((d) => ({
          personNo: d.personNo,
          betDay: d.betDay,
          session: d.ampm,
          groupId: d.groupId,
        })),
        personNo,
        session.betDay,
        session.ampm,
      );
      return side === 'bet'
        ? clipboardBetText(codes, total, personNo, session.betDay, session.ampm, groupNo)
        : clipboardCarryText(codes, total, personNo, session.betDay, session.ampm, groupNo);
    },
    [db, saveDb, session],
  );

  const upsertLucky = useCallback(
    async (no: string) => {
      if (!db) return;
      const rev = reverseNo(no);
      const rest = db.luckyNos.filter(
        (l) => !(l.betDay === session.betDay && l.ampm === session.ampm),
      );
      await saveDb({
        ...db,
        luckyNos: [...rest, { betDay: session.betDay, ampm: session.ampm, no, rev }],
      });
    },
    [db, saveDb, session],
  );

  const deleteLucky = useCallback(
    async (betDay: string, ampm: Session) => {
      if (!db) return;
      await saveDb({
        ...db,
        luckyNos: db.luckyNos.filter(
          (l) => !(l.betDay === betDay && l.ampm === ampm),
        ),
      });
    },
    [db, saveDb],
  );

  const requestReplay = useCallback((r: ReplayRequest) => {
    replayRef.current = r;
    setReplay(r);
  }, []);

  const consumeReplay = useCallback((): ReplayRequest | null => {
    const r = replayRef.current;
    replayRef.current = null;
    setReplay(null);
    return r;
  }, []);

  /**
   * §9.3 fixture — the worked example only, not the full 1,975-row day
   * (the per-number rows for 2024-04-11 are not in ANALYSIS.md).
   * Fighter 12, 2024-04-11: AM 55,000 with no win (draw 62), PM 51,950
   * with WinAmt 250 on 82 (draw 82). Replays the §7.1 check exactly:
   * AM net 46,750; PM net 24,157.5.
   */
  const loadFixture = useCallback(async () => {
    if (!db) return;
    const day = '2024-04-11';
    const keepBets = db.bets.filter((b) => b.betDay !== day);
    const keepCodes = db.betCodes.filter((c) => c.betDay !== day);
    const keepLucky = db.luckyNos.filter((l) => l.betDay !== day);
    let sno = [...db.bets, ...db.betCodes].reduce((m, r) => Math.max(m, r.sno), 0);
    const codes: CodeRow[] = [];
    const details: DetailRow[] = [];
    const add = (
      ampm: Session,
      groupId: number,
      displayCode: string,
      codeNo: string,
      amountText: string,
      rowTotal: number,
      numbers: { no: string; amount: number }[],
    ) => {
      sno += 1;
      codes.push({
        sno,
        groupId,
        betDay: day,
        ampm,
        personNo: '12',
        displayCode,
        codeNo,
        amountText,
        rowTotal,
        commission: 15,
        rate: 80,
        edited: 0,
        createdAt: new Date().toISOString(),
      });
      for (const n of numbers) {
        sno += 1;
        details.push({
          sno,
          groupId,
          betDay: day,
          ampm,
          personNo: '12',
          no: n.no,
          amount: n.amount,
          commission: 15,
          rate: 80,
          displayCode,
          codeNo,
        });
      }
    };
    const gid = [...db.betCodes, ...db.carryCodes].reduce(
      (m, c) => Math.max(m, c.groupId),
      0,
    );
    // AM: 55,000 on "12" — nothing on the winning 62, so no win.
    add('AM', gid + 1, '12', '12', '55000', 55000, [{ no: '12', amount: 55000 }]);
    // PM: 250 on the winning 82 + 51,700 on "12" = 51,950, WinAmt 250.
    add('PM', gid + 2, '82', '82', '250', 250, [{ no: '82', amount: 250 }]);
    add('PM', gid + 2, '12', '12', '51700', 51700, [{ no: '12', amount: 51700 }]);
    await saveDb({
      ...db,
      bets: [...keepBets, ...details],
      betCodes: [...keepCodes, ...codes],
      luckyNos: [
        ...keepLucky,
        { betDay: day, ampm: 'AM', no: '62', rev: '26' },
        { betDay: day, ampm: 'PM', no: '82', rev: '28' },
      ],
    });
  }, [db, saveDb]);

  const clearTransactions = useCallback(async () => {
    if (!db) return;
    await saveDb({
      ...db,
      betCodes: [],
      bets: [],
      carryCodes: [],
      carries: [],
      luckyNos: [],
    });
  }, [db, saveDb]);

  const importDb = useCallback(
    async (json: string) => {
      const parsed = JSON.parse(json) as Db;
      if (!parsed || !Array.isArray(parsed.fighters) || !Array.isArray(parsed.bets)) {
        throw new Error('Not an EASY 2D backup file');
      }
      const seeded = seedDb();
      await saveDb({
        ...seeded,
        ...parsed,
        updatedAt: new Date().toISOString(),
      });
    },
    [saveDb],
  );

  const exportJson = useCallback(() => {
    return db ? JSON.stringify(db, null, 2) : '';
  }, [db]);

  const value = useMemo<StoreValue>(
    () => ({
      db,
      loaded: db !== null,
      session,
      setSession,
      saveDb,
      patchPeople,
      setLimit,
      saveEntry,
      upsertLucky,
      deleteLucky,
      replay,
      requestReplay,
      consumeReplay,
      loadFixture,
      clearTransactions,
      importDb,
      exportJson,
    }),
    [
      db,
      session,
      setSession,
      saveDb,
      patchPeople,
      setLimit,
      saveEntry,
      upsertLucky,
      deleteLucky,
      replay,
      requestReplay,
      consumeReplay,
      loadFixture,
      clearTransactions,
      importDb,
      exportJson,
    ],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export type { TemplateItem };
