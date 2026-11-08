import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useStore } from '../src/store';
import type { DetailRow, Person } from '../src/types';
import { Btn, Card, Chip, Row, Screen, Sub, Title, money } from '../src/ui';
import { settlePerson } from '../src/shared';
import type { Session } from '../src/shared';

type Tab = 'Current' | 'Daily' | 'Weekly' | 'Selected';

interface ScopeSession {
  betDay: string;
  ampm: Session;
}

function weekRange(betDay: string): { from: string; to: string } {
  const d = new Date(`${betDay}T12:00:00`);
  const from = new Date(d);
  from.setDate(d.getDate() - d.getDay()); // Sunday
  const to = new Date(from);
  to.setDate(from.getDate() + 6); // Saturday
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(
      x.getDate(),
    ).padStart(2, '0')}`;
  return { from: iso(from), to: iso(to) };
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export default function ReportsScreen() {
  const { db, session } = useStore();
  const [tab, setTab] = useState<Tab>('Current');
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [selectedSide, setSelectedSide] = useState<'bet' | 'carry'>('bet');

  const sessions: ScopeSession[] = useMemo(() => {
    if (tab === 'Current') return [{ betDay: session.betDay, ampm: session.ampm }];
    if (tab === 'Daily')
      return [
        { betDay: session.betDay, ampm: 'AM' },
        { betDay: session.betDay, ampm: 'PM' },
      ];
    if (tab === 'Weekly') {
      const { from, to } = weekRange(session.betDay);
      const out: ScopeSession[] = [];
      let d = from;
      while (d <= to) {
        out.push({ betDay: d, ampm: 'AM' }, { betDay: d, ampm: 'PM' });
        d = addDays(d, 1);
      }
      return out;
    }
    // Selected: every session that has any data, plus the current one.
    const keys = new Set<string>();
    for (const r of [...(db?.bets ?? []), ...(db?.carries ?? [])]) {
      keys.add(`${r.betDay}|${r.ampm}`);
    }
    keys.add(`${session.betDay}|${session.ampm}`);
    return [...keys].map((k) => {
      const [betDay, ampm] = k.split('|');
      return { betDay, ampm: ampm as Session };
    });
  }, [tab, session, db]);

  const luckyFor = (betDay: string, ampm: Session): string | null =>
    db?.luckyNos.find((l) => l.betDay === betDay && l.ampm === ampm)?.no ?? null;

  /** Settle one side for the current scope, per person (§7.1). */
  const settleSide = (side: 'bet' | 'carry') => {
    const rows: DetailRow[] = side === 'bet' ? (db?.bets ?? []) : (db?.carries ?? []);
    const people: Person[] = side === 'bet' ? (db?.fighters ?? []) : (db?.owners ?? []);
    const byPerson = new Map<string, DetailRow[]>();
    for (const s of sessions) {
      for (const r of rows) {
        if (r.betDay === s.betDay && r.ampm === s.ampm) {
          if (selectedPerson && r.personNo !== selectedPerson) continue;
          const list = byPerson.get(r.personNo) ?? [];
          list.push(r);
          byPerson.set(r.personNo, list);
        }
      }
    }
    return [...byPerson.entries()]
      .map(([no, list]) => {
        // Win is per session (each session has its own LuckyNo), so
        // settle session by session and sum — the Daily/Weekly reports
        // in the original group the same way (FillBy / FillBy1).
        let amount = 0;
        let winAmt = 0;
        let commissionAmount = 0;
        let grossAmount = 0;
        let netAmount = 0;
        let commission = 0;
        let rate = 0;
        for (const s of sessions) {
          const part = list.filter((r) => r.betDay === s.betDay && r.ampm === s.ampm);
          if (part.length === 0) continue;
          const c = Math.max(...part.map((r) => r.commission));
          const rt = Math.max(...part.map((r) => r.rate));
          commission = Math.max(commission, c);
          rate = Math.max(rate, rt);
          const settled = settlePerson(
            part.map((r) => ({ no: r.no, amount: r.amount })),
            luckyFor(s.betDay, s.ampm),
            c,
            rt,
          );
          amount += settled.amount;
          winAmt += settled.winAmt;
          commissionAmount += settled.commissionAmount;
          grossAmount += settled.grossAmount;
          netAmount += settled.netAmount;
        }
        const person = people.find((p) => p.no === no);
        return {
          no,
          name: person?.name ?? '',
          amount,
          winAmt,
          commissionAmount,
          grossAmount,
          netAmount,
          commission,
          rate,
        };
      })
      .sort((a, b) => a.no.localeCompare(b.no));
  };

  const fighterRows = tab === 'Selected' && selectedSide === 'carry' ? [] : settleSide('bet');
  const ownerRows = tab === 'Selected' && selectedSide === 'bet' ? [] : settleSide('carry');

  const table = (title: string, rows: ReturnType<typeof settleSide>) => {
    if (rows.length === 0) return null;
    const tAmount = rows.reduce((s, r) => s + r.amount, 0);
    const tWin = rows.reduce((s, r) => s + r.winAmt, 0);
    const tNet = rows.reduce((s, r) => s + r.netAmount, 0);
    return (
      <Card>
        <Sub>{title}</Sub>
        <View style={{ flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
          <Text style={{ flex: 1, fontWeight: '700' }}>No</Text>
          <Text style={{ flex: 1.4, fontWeight: '700', textAlign: 'right' }}>Amount</Text>
          <Text style={{ flex: 1, fontWeight: '700', textAlign: 'right' }}>Win</Text>
          <Text style={{ flex: 1.4, fontWeight: '700', textAlign: 'right' }}>Net</Text>
        </View>
        {rows.map((r) => (
          <View key={r.no} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
            <Text style={{ flex: 1, fontSize: 15 }}>
              {r.no}
              {r.name ? ` ${r.name}` : ''}
            </Text>
            <Text style={{ flex: 1.4, fontSize: 15, textAlign: 'right' }}>{money(r.amount)}</Text>
            <Text style={{ flex: 1, fontSize: 15, textAlign: 'right' }}>{money(r.winAmt)}</Text>
            <Text
              style={{
                flex: 1.4,
                fontSize: 15,
                textAlign: 'right',
                color: r.netAmount < 0 ? '#dc2626' : '#0f172a',
                fontWeight: '700',
              }}
            >
              {money(Math.round(r.netAmount))}
            </Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', paddingVertical: 6 }}>
          <Text style={{ flex: 1, fontWeight: '700' }}>Total</Text>
          <Text style={{ flex: 1.4, fontWeight: '700', textAlign: 'right' }}>{money(tAmount)}</Text>
          <Text style={{ flex: 1, fontWeight: '700', textAlign: 'right' }}>{money(tWin)}</Text>
          <Text style={{ flex: 1.4, fontWeight: '700', textAlign: 'right' }}>{money(Math.round(tNet))}</Text>
        </View>
        <Text style={{ color: '#475569', fontSize: 13 }}>
          Net = Amount − commission − Win × rate. Win counts the exact LuckyNo
          only; the reverse never wins.
        </Text>
      </Card>
    );
  };

  const scopeLabel =
    tab === 'Current'
      ? `${session.betDay} ${session.ampm}`
      : tab === 'Daily'
        ? `${session.betDay} (AM + PM)`
        : tab === 'Weekly'
          ? (() => {
              const w = weekRange(session.betDay);
              return `${w.from} – ${w.to} (Sun–Sat)`;
            })()
          : 'All dates';

  return (
    <Screen>
      <Title>Reports</Title>
      <Row>
        {(['Current', 'Daily', 'Weekly', 'Selected'] as Tab[]).map((t) => (
          <Chip key={t} label={t} selected={tab === t} onPress={() => setTab(t)} />
        ))}
      </Row>
      <Text style={{ color: '#475569', marginBottom: 8 }}>{scopeLabel}</Text>

      {tab === 'Selected' && (
        <Card>
          <Sub>Pick a person</Sub>
          <Row>
            <Chip label="Fighters" selected={selectedSide === 'bet'} onPress={() => { setSelectedSide('bet'); setSelectedPerson(null); }} />
            <Chip label="Owners" selected={selectedSide === 'carry'} onPress={() => { setSelectedSide('carry'); setSelectedPerson(null); }} />
          </Row>
          <Row>
            {(selectedSide === 'bet' ? (db?.fighters ?? []) : (db?.owners ?? [])).map((p) => (
              <Chip key={p.no} label={p.no} selected={selectedPerson === p.no} onPress={() => setSelectedPerson(p.no)} />
            ))}
          </Row>
          {selectedPerson === null && (
            <Text style={{ color: '#475569' }}>Pick a person to see their all-time settlement.</Text>
          )}
        </Card>
      )}

      {(tab !== 'Selected' || selectedPerson) && (
        <>
          {table('Fighters', fighterRows)}
          {table('Owners', ownerRows)}
          {fighterRows.length === 0 && ownerRows.length === 0 && (
            <Card>
              <Text style={{ color: '#475569' }}>No bets or carry in this scope yet.</Text>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
