import { useMemo, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy'; // SDK 58: legacy string API lives under /legacy
import * as Sharing from 'expo-sharing';
import { useStore } from '../src/store';
import { Btn, Card, Chip, Field, Row, Screen, Sub, Title, money } from '../src/ui';
import { dashboard } from '../src/shared';

export default function MoreScreen() {
  const { db, session, requestReplay, loadFixture, clearTransactions, importDb, exportJson } = useStore();
  const [replayAmount, setReplayAmount] = useState('1000');
  const [replaySide, setReplaySide] = useState<'bet' | 'carry'>('bet');
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');
  const [groupFilter, setGroupFilter] = useState('');

  const dash = useMemo(() => {
    if (!db) return null;
    const bets = db.bets.filter((b) => b.betDay === session.betDay && b.ampm === session.ampm);
    const carries = db.carries.filter((c) => c.betDay === session.betDay && c.ampm === session.ampm);
    const lucky = db.luckyNos.find((l) => l.betDay === session.betDay && l.ampm === session.ampm)?.no ?? null;
    const betTotal = bets.reduce((s, b) => s + b.amount, 0);
    const carryTotal = carries.reduce((s, c) => s + c.amount, 0);
    const luckyBetWin = lucky ? bets.filter((b) => b.no === lucky).reduce((s, b) => s + b.amount, 0) : 0;
    const luckyCarryWin = lucky ? carries.filter((c) => c.no === lucky).reduce((s, c) => s + c.amount, 0) : 0;
    return { d: dashboard(betTotal, carryTotal, luckyBetWin, luckyCarryWin, db.settings), lucky };
  }, [db, session]);

  const groups = (db?.groups ?? []).filter((g) =>
    groupFilter.trim() === '' || g.name.toLowerCase().includes(groupFilter.trim().toLowerCase()),
  );

  const exportBackup = async () => {
    const json = exportJson();
    if (!json) return;
    const fileName = `easy2d-backup-${session.betDay}.json`;
    try {
      const uri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(uri, json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/json' });
        setMsg(`Backup shared as ${fileName}.`);
        return;
      }
      throw new Error('Sharing unavailable');
    } catch {
      // Fallback: the OS share sheet with the JSON as text.
      try {
        await Share.share({ message: json, title: fileName });
        setMsg('Backup shared as text (file share unavailable on this device).');
      } catch {
        setMsg('Share failed. Copy the JSON from the box below instead.');
      }
    }
  };

  return (
    <Screen>
      <Title>More</Title>
      {msg !== '' && <Text style={{ color: '#15803d', marginBottom: 8 }}>{msg}</Text>}

      {/* §7.4 status dashboard */}
      <Card>
        <Sub>
          Status — {session.betDay} {session.ampm}
          {dash?.lucky ? ` · Lucky ${dash.lucky}` : ' · no draw yet'}
        </Sub>
        {dash && (
          <>
            {[
              ['Limit', money(dash.d.limit)],
              ['Times (Net Sales / Limit)', String(dash.d.times)],
              ['Sales', money(dash.d.sales)],
              ['Carry', money(dash.d.carry)],
              ['Net Sales', money(dash.d.netSales)],
              ['Commission %', money(dash.d.commissionAmt)],
              ['Gross Profit', money(dash.d.grossProfit)],
              ['Rate payout', money(dash.d.payout)],
            ].map(([k, v]) => (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                <Text style={{ fontSize: 15 }}>{k}</Text>
                <Text style={{ fontSize: 15, fontWeight: '700' }}>{v}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text style={{ fontSize: 15, fontWeight: '700' }}>Net P/L</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: dash.d.netPLRed ? '#dc2626' : '#0f172a' }}>
                {money(dash.d.netPL)}
              </Text>
            </View>
          </>
        )}
      </Card>

      {/* Templates — tap to copy */}
      <Card>
        <Sub>Templates — tap to copy</Sub>
        <Row>
          {(db?.templates ?? []).map((t) => (
            <Chip
              key={t.no}
              label={t.text.length > 18 ? `${t.text.slice(0, 18)}…` : t.text}
              selected={false}
              onPress={async () => {
                await Clipboard.setStringAsync(t.text);
                setMsg(`Copied template: ${t.text}`);
              }}
            />
          ))}
        </Row>
      </Card>

      {/* Groups — tap pack to replay into entry */}
      <Card>
        <Sub>Groups — tap a pack to replay into entry</Sub>
        <Field value={groupFilter} onChangeText={setGroupFilter} placeholder="Filter packs…" />
        <Field value={replayAmount} onChangeText={setReplayAmount} placeholder="Replay amount (blank = pack's own)" keyboardType="number-pad" />
        <Row>
          <Chip label="Into Fighter entry" selected={replaySide === 'bet'} onPress={() => setReplaySide('bet')} />
          <Chip label="Into Carry entry" selected={replaySide === 'carry'} onPress={() => setReplaySide('carry')} />
        </Row>
        {groups.slice(0, 61).map((g) => (
          <View key={g.name} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
            <Text style={{ fontSize: 16, fontWeight: '700' }}>{g.name}</Text>
            <Text
              style={{ color: '#0f172a', fontWeight: '700', fontSize: 15 }}
              onPress={() => {
                requestReplay({ side: replaySide, rows: g.rows, amountOverride: replayAmount });
                setMsg(`Pack "${g.name}" queued — opening Board to replay ${g.rows.length} row(s).`);
                router.push('/');
              }}
            >
              Replay › ({g.rows.length})
            </Text>
          </View>
        ))}
        <Text style={{ color: '#475569', marginTop: 6 }}>
          Pack rows are typed codes replayed through the same expansion as
          manual entry. Amounts in the pack file are 1 (as stored in the
          original DB); use the replay amount above to override them.
        </Text>
      </Card>

      {/* Backup */}
      <Card>
        <Sub>Backup — export / import JSON</Sub>
        <Text style={{ color: '#475569', marginBottom: 8 }}>
          Export writes a JSON file and opens the share sheet (expo-sharing);
          if sharing is unavailable it falls back to the OS share sheet with
          the JSON as text. Import pastes that JSON back.
        </Text>
        <Btn title="Export backup (share JSON file)" onPress={() => void exportBackup()} />
        <Btn
          title="Copy backup JSON to clipboard"
          secondary
          onPress={async () => {
            await Clipboard.setStringAsync(exportJson());
            setMsg('Backup JSON copied to clipboard.');
          }}
        />
        <Field value={importText} onChangeText={setImportText} placeholder="Paste backup JSON here to import…" multiline />
        <Btn
          title="Import backup JSON"
          secondary
          onPress={() => {
            Alert.alert('Import backup?', 'This replaces ALL current data (fighters, owners, bets, carry, draws).', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Import',
                onPress: async () => {
                  try {
                    await importDb(importText);
                    setImportText('');
                    setMsg('Backup imported.');
                  } catch {
                    setMsg('Import failed — not a valid EASY 2D backup.');
                  }
                },
              },
            ]);
          }}
        />
      </Card>

      {/* Test data */}
      <Card>
        <Sub>Test data</Sub>
        <Text style={{ color: '#475569', marginBottom: 8 }}>
          Fixture (§9.3 worked example only): Fighter 12, 2024-04-11 — AM
          55,000 no win (draw 62), PM 51,950 with 250 on 82 (draw 82).
          Check it in Reports → Current after switching the session date to
          2024-04-11. No transactional bets are seeded by default.
        </Text>
        <Btn title="Load §9.3 fixture (Fighter 12, 2024-04-11)" secondary onPress={() => void loadFixture().then(() => setMsg('Fixture loaded for 2024-04-11.'))} />
        <Btn
          title="Clear all bets / carry / draws"
          secondary
          onPress={() =>
            Alert.alert('Clear transactions?', 'Deletes all saved bets, carry and draws. People, templates and groups stay.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Clear',
                style: 'destructive',
                onPress: () => void clearTransactions().then(() => setMsg('Transactions cleared.')),
              },
            ])
          }
        />
      </Card>
    </Screen>
  );
}
