import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useStore } from '../src/store';
import type { Person } from '../src/types';
import { Btn, Card, Field, Screen, Sub, Title } from '../src/ui';

function PersonEditor({
  person,
  side,
  onSave,
  onDelete,
}: {
  person: Person;
  side: 'fighters' | 'owners';
  onSave: (p: Person) => void;
  onDelete: (p: Person) => void;
}) {
  const [name, setName] = useState(person.name);
  const [commission, setCommission] = useState(String(person.commission));
  const [rate, setRate] = useState(String(person.rate));
  return (
    <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
      <Text style={{ fontSize: 17, fontWeight: '700' }}>
        {person.no}
        {side === 'fighters' ? ' (Fighter)' : ' (Owner)'}
      </Text>
      <Field value={name} onChangeText={setName} placeholder="Name (empty in the original DB)" />
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, marginRight: 6 }}>
          <Field value={commission} onChangeText={setCommission} placeholder="Commission %" keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1, marginLeft: 6 }}>
          <Field value={rate} onChangeText={setRate} placeholder="Rate" keyboardType="number-pad" />
        </View>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, marginRight: 4 }}>
          <Btn
            title="Save"
            secondary
            onPress={() => {
              const c = Number(commission);
              const r = Number(rate);
              if (!Number.isFinite(c) || !Number.isFinite(r)) return;
              onSave({ ...person, name, commission: c, rate: r });
            }}
          />
        </View>
        <View style={{ flex: 1, marginLeft: 4 }}>
          <Btn
            title="Delete"
            secondary
            onPress={() =>
              Alert.alert('Delete person?', `${person.no} — saved bets keep their rows, but the person is gone from entry.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => onDelete(person) },
              ])
            }
          />
        </View>
      </View>
    </View>
  );
}

function AddPerson({ side, onAdd }: { side: 'fighters' | 'owners'; onAdd: (p: Person) => void }) {
  const [no, setNo] = useState('');
  const [commission, setCommission] = useState(side === 'fighters' ? '15' : '14');
  const [rate, setRate] = useState('80');
  return (
    <View>
      <Field value={no} onChangeText={setNo} placeholder="New No e.g. 13" />
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, marginRight: 6 }}>
          <Field value={commission} onChangeText={setCommission} placeholder="Commission %" keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1, marginLeft: 6 }}>
          <Field value={rate} onChangeText={setRate} placeholder="Rate" keyboardType="number-pad" />
        </View>
      </View>
      <Btn
        title={`Add ${side === 'fighters' ? 'Fighter' : 'Owner'}`}
        onPress={() => {
          if (no.trim() === '') return;
          onAdd({ sno: Date.now(), no: no.trim(), name: '', commission: Number(commission) || 0, rate: Number(rate) || 0 });
          setNo('');
        }}
      />
    </View>
  );
}

export default function PeopleScreen() {
  const { db, patchPeople } = useStore();
  const [msg, setMsg] = useState('');

  const savePerson = async (side: 'fighters' | 'owners', p: Person) => {
    if (!db) return;
    const list = db[side].map((x) => (x.sno === p.sno ? p : x));
    await patchPeople(side, list);
    setMsg(`Saved ${p.no}.`);
  };
  const deletePerson = async (side: 'fighters' | 'owners', p: Person) => {
    if (!db) return;
    await patchPeople(side, db[side].filter((x) => x.sno !== p.sno));
    setMsg(`Deleted ${p.no}.`);
  };
  const addPerson = async (side: 'fighters' | 'owners', p: Person) => {
    if (!db) return;
    if (db[side].some((x) => x.no === p.no)) {
      setMsg(`${p.no} already exists.`);
      return;
    }
    const sno = db[side].reduce((m, x) => Math.max(m, x.sno), 0) + 1;
    await patchPeople(side, [...db[side], { ...p, sno }]);
    setMsg(`Added ${p.no}.`);
  };

  return (
    <Screen>
      <Title>People</Title>
      {msg !== '' && <Text style={{ color: '#15803d', marginBottom: 8 }}>{msg}</Text>}
      <Card>
        <Sub>Fighters — commission 15%, rate 80 (seed)</Sub>
        {(db?.fighters ?? []).map((f) => (
          <PersonEditor
            key={f.sno}
            person={f}
            side="fighters"
            onSave={(p) => void savePerson('fighters', p)}
            onDelete={(p) => void deletePerson('fighters', p)}
          />
        ))}
        <AddPerson side="fighters" onAdd={(p) => void addPerson('fighters', p)} />
      </Card>
      <Card>
        <Sub>Owners — commission 14%, rate 80 (seed)</Sub>
        {(db?.owners ?? []).map((o) => (
          <PersonEditor
            key={o.sno}
            person={o}
            side="owners"
            onSave={(p) => void savePerson('owners', p)}
            onDelete={(p) => void deletePerson('owners', p)}
          />
        ))}
        <AddPerson side="owners" onAdd={(p) => void addPerson('owners', p)} />
      </Card>
      <Text style={{ color: '#475569' }}>
        Note: saving a bet uses the fighter/owner commission and rate stored
        here at save time (the original overwrote the master record from the
        entry screen instead).
      </Text>
    </Screen>
  );
}
