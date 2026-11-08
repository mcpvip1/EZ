import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useStore } from '../src/store';
import { Btn, Card, Field, Screen, Sub, Title } from '../src/ui';
import { reverseNo } from '../src/shared';

export default function LuckyScreen() {
  const { db, session, upsertLucky, deleteLucky } = useStore();
  const [no, setNo] = useState('');
  const [msg, setMsg] = useState('');

  const current = db?.luckyNos.find(
    (l) => l.betDay === session.betDay && l.ampm === session.ampm,
  );
  const past = [...(db?.luckyNos ?? [])].sort((a, b) =>
    `${b.betDay}${b.ampm}`.localeCompare(`${a.betDay}${a.ampm}`),
  );

  const valid = /^\d{2}$/.test(no.trim());
  const rev = valid ? reverseNo(no.trim()) : '—';

  return (
    <Screen>
      <Title>Lucky No</Title>
      <Card>
        <Text style={{ fontSize: 16, marginBottom: 8 }}>
          Session: {session.betDay} {session.ampm}
          {current ? ` — saved draw: ${current.no} (reverse ${current.rev})` : ' — no draw saved yet'}
        </Text>
        <Field
          value={no}
          onChangeText={setNo}
          placeholder="Winning number, exactly 2 digits"
          keyboardType="number-pad"
          autoCapitalize="none"
        />
        <Text style={{ fontSize: 16, marginBottom: 8 }}>
          Reverse: {rev} (shown only — the reverse does NOT win, §7.1)
        </Text>
        <Btn
          title="Save Lucky No"
          disabled={!valid}
          onPress={async () => {
            await upsertLucky(no.trim());
            setMsg(`Saved ${no.trim()} (reverse ${rev}) for ${session.betDay} ${session.ampm}.`);
            setNo('');
          }}
        />
        {msg !== '' && <Text style={{ color: '#15803d' }}>{msg}</Text>}
      </Card>

      <Card>
        <Sub>Past draws</Sub>
        {past.length === 0 && (
          <Text style={{ color: '#475569' }}>No draws saved yet.</Text>
        )}
        {past.map((l) => (
          <View
            key={`${l.betDay}-${l.ampm}`}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}
          >
            <Text style={{ fontSize: 16 }}>
              {l.betDay} {l.ampm} — {l.no} (rev {l.rev})
            </Text>
            <Text
              onPress={() =>
                Alert.alert('Delete this draw?', `${l.betDay} ${l.ampm}: ${l.no}`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => void deleteLucky(l.betDay, l.ampm),
                  },
                ])
              }
              style={{ color: '#dc2626', fontWeight: '700', fontSize: 15 }}
            >
              Delete
            </Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
