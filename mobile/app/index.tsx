import { useCallback, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useStore } from '../src/store';
import type { EntryRow } from '../src/types';
import { Btn, Card, Chip, Field, Row, Screen, Sub, Title, money } from '../src/ui';
import {
  computeBoard,
  computeOverLimit,
  expandCode,
  expandEntryList,
  pad2,
  roundUpToTen,
  reverseNo,
} from '../src/shared';
import type { OverLimitRow, Session } from '../src/shared';

function SessionHeader() {
  const { session, setSession, db, setLimit } = useStore();
  const [limitText, setLimitText] = useState(String(db?.settings.limit ?? 40000));
  return (
    <Card>
      <Row>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Field
            value={session.betDay}
            onChangeText={(t) => setSession({ ...session, betDay: t })}
            placeholder="YYYY-MM-DD"
          />
        </View>
        <Chip
          label="AM"
          selected={session.ampm === 'AM'}
          onPress={() => setSession({ ...session, ampm: 'AM' as Session })}
        />
        <Chip
          label="PM"
          selected={session.ampm === 'PM'}
          onPress={() => setSession({ ...session, ampm: 'PM' as Session })}
        />
      </Row>
      <Row>
        <Btn
          title="Today"
          secondary
          onPress={() => {
            const d = new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            setSession({
              betDay: `${y}-${m}-${day}`,
              ampm: d.getHours() < 12 ? 'AM' : 'PM',
            });
          }}
        />
        <View style={{ width: 10 }} />
        <Text style={{ fontSize: 15, fontWeight: '700' }}>Limit </Text>
        <View style={{ width: 110 }}>
          <Field
            value={limitText}
            onChangeText={setLimitText}
            keyboardType="number-pad"
            placeholder="40000"
          />
        </View>
        <View style={{ width: 8 }} />
        <Btn
          title="Set"
          secondary
          onPress={() => {
            const v = Number(limitText);
            if (Number.isFinite(v) && v > 0) void setLimit(v);
          }}
        />
      </Row>
      <Text style={{ color: '#475569' }}>
        Session: {session.betDay} {session.ampm} — board = saved bets − saved
        carry + unsaved rows below.
      </Text>
    </Card>
  );
}

export default function BoardScreen() {
  const { db, session, saveEntry, consumeReplay } = useStore();
  const [fighterNo, setFighterNo] = useState('1');
  const [ownerNo, setOwnerNo] = useState('1');
  const [fCode, setFCode] = useState('');
  const [fAmt, setFAmt] = useState('');
  const [oCode, setOCode] = useState('');
  const [oAmt, setOAmt] = useState('');
  const [fRows, setFRows] = useState<EntryRow[]>([]);
  const [oRows, setORows] = useState<EntryRow[]>([]);
  const [hint, setHint] = useState('');
  const [lastCopy, setLastCopy] = useState('');

  // Group replay from the More tab: expand each pack row into the
  // Fighter entry grid (original Group.cmdCopy replays through xInput).
  useFocusEffect(
    useCallback(() => {
      const r = consumeReplay();
      if (!r) return;
      const expanded: EntryRow[] = [];
      for (const row of r.rows) {
        const amt = r.amountOverride.trim() || row.amount;
        const one = expandCode(row.code, amt);
        if (one) {
          expanded.push({
            displayCode: one.displayCode,
            codeNo: one.codeNo,
            amountText: amt,
            rowTotal: one.rowTotal,
            numbers: one.numbers,
          });
        }
      }
      if (expanded.length > 0) {
        if (r.side === 'bet') setFRows((prev) => [...prev, ...expanded]);
        else setORows((prev) => [...prev, ...expanded]);
        setHint(`Group replayed: ${expanded.length} rows added.`);
      }
    }, [consumeReplay]),
  );

  const savedBets = useMemo(
    () =>
      (db?.bets ?? []).filter(
        (b) => b.betDay === session.betDay && b.ampm === session.ampm,
      ),
    [db, session],
  );
  const savedCarries = useMemo(
    () =>
      (db?.carries ?? []).filter(
        (c) => c.betDay === session.betDay && c.ampm === session.ampm,
      ),
    [db, session],
  );

  const board = useMemo(() => {
    const betRows = [
      ...savedBets.map((b) => ({ no: b.no, amount: b.amount })),
      ...fRows.flatMap((r) => r.numbers),
    ];
    const carryRows = [
      ...savedCarries.map((c) => ({ no: c.no, amount: c.amount })),
      ...oRows.flatMap((r) => r.numbers),
    ];
    return computeBoard(betRows, carryRows);
  }, [savedBets, savedCarries, fRows, oRows]);

  const limit = db?.settings.limit ?? 40000;
  const over = useMemo(() => computeOverLimit(board, limit), [board, limit]);
  const betTotal =
    savedBets.reduce((s, b) => s + b.amount, 0) +
    fRows.reduce((s, r) => s + r.numbers.reduce((a, n) => a + n.amount, 0), 0);
  const carryTotal =
    savedCarries.reduce((s, c) => s + c.amount, 0) +
    oRows.reduce((s, r) => s + r.numbers.reduce((a, n) => a + n.amount, 0), 0);

  const addRow = (
    side: 'bet' | 'carry',
    code: string,
    amt: string,
  ): boolean => {
    const list = expandEntryList(code, amt);
    if (list.length === 0) {
      setHint('Invalid code or amount — nothing added.');
      return false;
    }
    const rows: EntryRow[] = list.map((e) => ({
      displayCode: e.displayCode,
      codeNo: e.codeNo,
      amountText: amt,
      rowTotal: e.rowTotal,
      numbers: e.numbers,
    }));
    if (side === 'bet') setFRows((p) => [...p, ...rows]);
    else setORows((p) => [...p, ...rows]);
    setHint('');
    return true;
  };

  const saveSide = (side: 'bet' | 'carry') => {
    const personNo = side === 'bet' ? fighterNo : ownerNo;
    const rows = side === 'bet' ? fRows : oRows;
    if (rows.length === 0) {
      setHint(`No ${side === 'bet' ? 'bet' : 'carry'} rows to save.`);
      return;
    }
    Alert.alert(
      `Save ${side === 'bet' ? 'Bet' : 'Carry'}?`,
      `${rows.length} code(s) for ${side === 'bet' ? 'Fighter' : 'Owner'} ${personNo}, session ${session.betDay} ${session.ampm}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async () => {
            const text = await saveEntry(side, personNo, rows);
            try {
              await Clipboard.setStringAsync(text);
            } catch {
              // Clipboard unavailable — the text is also shown below.
            }
            setLastCopy(text);
            if (side === 'bet') {
              setFRows([]);
              setFCode('');
              setFAmt('');
            } else {
              setORows([]);
              setOCode('');
              setOAmt('');
            }
            setHint(`Saved. Clipboard text copied${text ? '' : ' (copy failed — see below)'}.`);
          },
        },
      ],
    );
  };

  /** Turn one over-limit row into carry entry rows (cmdGo / cmdGo1). */
  const passRow = (row: OverLimitRow, tens: boolean): EntryRow[] => {
    const out: EntryRow[] = [];
    const push = (code: string, amt: number) => {
      const e = expandCode(code, String(amt));
      if (e) {
        out.push({
          displayCode: e.displayCode,
          codeNo: e.codeNo,
          amountText: String(amt),
          rowTotal: e.rowTotal,
          numbers: e.numbers,
        });
      }
    };
    if (typeof row.over === 'string' && row.over.includes('/')) {
      const [a, b] = row.over.split('/').map(Number);
      const ra = tens ? roundUpToTen(a) : a;
      const rb = tens ? roundUpToTen(b) : b;
      if (tens && ra === rb) {
        // Equal rounded parts collapse to a reverse row (cmdGoTens).
        push(`${row.no}+`, ra);
      } else {
        push(row.no, ra);
        push(reverseNo(row.no), rb);
      }
    } else if (row.no.endsWith(' R')) {
      const n = row.no.slice(0, 2);
      const amt = tens ? roundUpToTen(row.rowTotal / 2) : row.rowTotal / 2;
      push(`${n}+`, amt);
    } else {
      const amt = tens ? roundUpToTen(row.rowTotal) : row.rowTotal;
      push(row.no, amt);
    }
    return out;
  };

  const passAll = (tens: boolean) => {
    if (over.length === 0) return;
    const rows = over.flatMap((r) => passRow(r, tens));
    setORows((p) => [...p, ...rows]);
    setHint(
      `${tens ? 'Pass Tens' : 'Pass All'}: ${rows.length} carry row(s) added for Owner ${ownerNo}. Save Carry to confirm.`,
    );
  };

  const passOne = (row: OverLimitRow, tens: boolean) => {
    const rows = passRow(row, tens);
    setORows((p) => [...p, ...rows]);
    setHint(`Passed ${row.no} to Carry for Owner ${ownerNo}.`);
  };

  const fighter = db?.fighters.find((f) => f.no === fighterNo);
  const owner = db?.owners.find((o) => o.no === ownerNo);

  return (
    <Screen>
      <Title>EASY 2D</Title>
      <SessionHeader />

      {/* Fighter entry */}
      <Card>
        <Sub>Fighter entry</Sub>
        <Row>
          {(db?.fighters ?? []).map((f) => (
            <Chip
              key={f.no}
              label={f.no}
              selected={fighterNo === f.no}
              onPress={() => setFighterNo(f.no)}
            />
          ))}
        </Row>
        <Text style={{ color: '#475569', marginBottom: 6 }}>
          Fighter {fighterNo}
          {fighter ? ` — commission ${fighter.commission}% — rate ${fighter.rate}` : ''}
        </Text>
        <Field value={fCode} onChangeText={setFCode} placeholder="Code e.g. 43+  //  0+  12 34" autoCapitalize="characters" />
        <Field value={fAmt} onChangeText={setFAmt} placeholder="Amount e.g. 1000 or 500/1000" keyboardType="decimal-pad" />
        <Btn
          title="Add"
          onPress={() => {
            if (addRow('bet', fCode, fAmt)) {
              setFCode('');
              setFAmt('');
            }
          }}
        />
        {fRows.map((r, i) => (
          <View
            key={`${r.displayCode}-${i}`}
            style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}
          >
            <Text style={{ fontSize: 16 }}>
              {r.displayCode} = {money(Number(r.amountText) || r.rowTotal)}
              {'  '}({r.numbers.length} nos, total {money(r.rowTotal)})
            </Text>
            <Text
              onPress={() => setFRows((p) => p.filter((_, j) => j !== i))}
              style={{ color: '#dc2626', fontWeight: '700', fontSize: 16 }}
            >
              ✕
            </Text>
          </View>
        ))}
        <Text style={{ fontWeight: '700', marginTop: 6 }}>
          Unsaved total: {money(fRows.reduce((s, r) => s + r.rowTotal, 0))}
        </Text>
        <Btn title="Save Bet" onPress={() => saveSide('bet')} />
      </Card>

      {/* Owner / Carry entry */}
      <Card>
        <Sub>Owner / Carry entry</Sub>
        <Row>
          {(db?.owners ?? []).map((o) => (
            <Chip
              key={o.no}
              label={o.no}
              selected={ownerNo === o.no}
              onPress={() => setOwnerNo(o.no)}
            />
          ))}
        </Row>
        <Text style={{ color: '#475569', marginBottom: 6 }}>
          Owner {ownerNo}
          {owner ? ` — commission ${owner.commission}% — rate ${owner.rate}` : ''}
        </Text>
        <Field value={oCode} onChangeText={setOCode} placeholder="Code e.g. 43+  //  0+" autoCapitalize="characters" />
        <Field value={oAmt} onChangeText={setOAmt} placeholder="Amount e.g. 1000" keyboardType="decimal-pad" />
        <Btn
          title="Add"
          onPress={() => {
            if (addRow('carry', oCode, oAmt)) {
              setOCode('');
              setOAmt('');
            }
          }}
        />
        {oRows.map((r, i) => (
          <View
            key={`${r.displayCode}-${i}`}
            style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}
          >
            <Text style={{ fontSize: 16 }}>
              {r.displayCode} = {money(Number(r.amountText) || r.rowTotal)}
              {'  '}({r.numbers.length} nos, total {money(r.rowTotal)})
            </Text>
            <Text
              onPress={() => setORows((p) => p.filter((_, j) => j !== i))}
              style={{ color: '#dc2626', fontWeight: '700', fontSize: 16 }}
            >
              ✕
            </Text>
          </View>
        ))}
        <Text style={{ fontWeight: '700', marginTop: 6 }}>
          Unsaved total: {money(oRows.reduce((s, r) => s + r.rowTotal, 0))}
        </Text>
        <Btn title="Save Carry" onPress={() => saveSide('carry')} />
      </Card>

      {hint !== '' && (
        <Text style={{ color: '#b45309', marginBottom: 8 }}>{hint}</Text>
      )}
      {lastCopy !== '' && (
        <Card>
          <Sub>Last save — clipboard text (long-press to copy)</Sub>
          <Text selectable style={{ fontSize: 15, lineHeight: 22 }}>
            {lastCopy}
          </Text>
          <Btn
            title="Copy again"
            secondary
            onPress={() => void Clipboard.setStringAsync(lastCopy)}
          />
        </Card>
      )}

      {/* 00–99 board */}
      <Card>
        <Sub>
          00–99 board — Bet {money(betTotal)} · Carry {money(carryTotal)} ·
          Net {money(betTotal - carryTotal)}
        </Sub>
        {Array.from({ length: 10 }, (_, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {Array.from({ length: 10 }, (_, c) => {
              const i = r * 10 + c;
              const v = board[i] ?? 0;
              const overLimit = v > limit;
              return (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    backgroundColor: overLimit ? '#fde047' : v > 0 ? '#e0f2fe' : '#fff',
                    borderWidth: 0.5,
                    borderColor: '#e2e8f0',
                    paddingVertical: 4,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700' }}>{pad2(i)}</Text>
                  <Text style={{ fontSize: 9, color: '#334155' }}>
                    {v > 0 ? money(v) : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
        <Text style={{ color: '#475569', marginTop: 6 }}>
          Yellow = net over limit {money(limit)}.
        </Text>
      </Card>

      {/* Over-limit list */}
      <Card>
        <Sub>Over limit ({over.length})</Sub>
        {over.length === 0 && (
          <Text style={{ color: '#475569' }}>No number over the limit.</Text>
        )}
        {over.map((row) => (
          <View
            key={row.no}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700' }}>{row.no}</Text>
            <Text style={{ fontSize: 16 }}>
              over {money(Number(row.over) || 0)}
              {typeof row.over === 'string' ? ` (${row.over})` : ''} · total{' '}
              {money(row.rowTotal)}
            </Text>
            <Text
              onPress={() => passOne(row, false)}
              style={{ color: '#0f172a', fontWeight: '700', fontSize: 15 }}
            >
              Pass ›
            </Text>
          </View>
        ))}
        {over.length > 0 && (
          <>
            <Btn title="Pass All to Carry" onPress={() => passAll(false)} />
            <Btn title="Pass Tens (round up to 10s)" secondary onPress={() => passAll(true)} />
          </>
        )}
      </Card>
    </Screen>
  );
}
